import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  destroy: vi.fn(),
  configurations: [] as unknown[],
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  from: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    constructor(config: unknown) {
      mocks.configurations.push(config);
    }
    send = mocks.send;
    destroy = mocks.destroy;
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock('../supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
import { cleanupUploadedProductImage, uploadProductImage } from './product-images';

const path = '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg';
const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
const r2Url = 'https://pub-test.r2.dev';
const setR2 = () => {
  vi.stubEnv('IMAGE_STORAGE_PROVIDER', 'r2');
  vi.stubEnv('R2_ACCOUNT_ID', 'a'.repeat(32));
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-access-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret-access-key');
  vi.stubEnv('R2_BUCKET_NAME', 'ascend-product-images');
  vi.stubEnv('R2_PUBLIC_BASE_URL', r2Url);
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configurations.length = 0;
  for (const key of [
    'IMAGE_STORAGE_PROVIDER',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
  ])
    vi.stubEnv(key, '');
  mocks.send.mockResolvedValue({});
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({
    data: {
      publicUrl: 'https://project.supabase.co/storage/v1/object/public/product-images/' + path,
    },
  });
  mocks.from.mockReturnValue({
    upload: mocks.upload,
    remove: mocks.remove,
    getPublicUrl: mocks.getPublicUrl,
  });
  mocks.createAdminClient.mockReturnValue({ storage: { from: mocks.from } });
});
afterEach(() => vi.unstubAllEnvs());

describe('product image storage provider', () => {
  it('keeps legacy Supabase references by default and uploads without overwriting', async () => {
    const result = await uploadProductImage(path, bytes, 'image/jpeg');
    expect(result).toMatchObject({ provider: 'supabase', storagePath: path, objectPath: path });
    expect(mocks.from).toHaveBeenCalledWith('product-images');
    expect(mocks.upload).toHaveBeenCalledWith(path, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(mocks.send).not.toHaveBeenCalled();
    await cleanupUploadedProductImage(result);
    expect(mocks.remove).toHaveBeenCalledWith([path]);
  });

  it('uploads R2 images privately with a durable public HTTPS reference', async () => {
    setR2();
    const result = await uploadProductImage(path, bytes, 'image/jpeg');
    expect(result).toEqual({
      provider: 'r2',
      storagePath: `${r2Url}/products/${path}`,
      url: `${r2Url}/products/${path}`,
      objectPath: 'products/' + path,
    });
    expect(mocks.configurations[0]).toMatchObject({
      region: 'auto',
      endpoint: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-access-key' },
    });
    expect(mocks.send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'ascend-product-images',
      Key: 'products/' + path,
      Body: bytes,
      ContentType: 'image/jpeg',
      IfNoneMatch: '*',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });

  it('uses the original bucket for rollback even after the configuration changes', async () => {
    setR2();
    const result = await uploadProductImage(path, bytes, 'image/jpeg');
    vi.stubEnv('IMAGE_STORAGE_PROVIDER', 'supabase');
    vi.stubEnv('R2_BUCKET_NAME', 'another-bucket');
    await cleanupUploadedProductImage(result);
    expect(mocks.send.mock.calls[1][0].input).toEqual({
      Bucket: 'ascend-product-images',
      Key: 'products/' + path,
    });
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects attempts to manufacture a cleanup reference', async () => {
    setR2();
    const result = await uploadProductImage(path, bytes, 'image/jpeg');
    await expect(cleanupUploadedProductImage({ ...result })).rejects.toMatchObject({
      code: 'invalid_image_cleanup',
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each([
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET_NAME',
    'R2_PUBLIC_BASE_URL',
  ])('fails closed when %s is missing', async (key) => {
    setR2();
    vi.stubEnv(key, '');
    await expect(uploadProductImage(path, bytes, 'image/jpeg')).rejects.toMatchObject({
      status: 503,
      code: 'image_storage_setup_required',
    });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    'http://pub-test.r2.dev',
    'https://example.com/images',
    'https://example.com?token=secret',
    'https://secret@example.com',
    `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`,
  ])('rejects an invalid R2 public address %s', async (address) => {
    setR2();
    vi.stubEnv('R2_PUBLIC_BASE_URL', address);
    await expect(uploadProductImage(path, bytes, 'image/jpeg')).rejects.toMatchObject({
      status: 503,
      code: 'image_storage_setup_required',
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('returns an actionable storage failure without leaking provider errors or falling back', async () => {
    setR2();
    mocks.send.mockRejectedValue(new Error('provider error containing test-secret-access-key'));
    const failure = await uploadProductImage(path, bytes, 'image/jpeg').catch((error) => error);
    expect(failure).toMatchObject({ status: 503, code: 'image_upload_failed' });
    expect(failure.message).not.toContain('test-secret-access-key');
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe paths and extension/type mismatches before storage calls', async () => {
    await expect(uploadProductImage('../private.jpg', bytes, 'image/jpeg')).rejects.toMatchObject({
      code: 'invalid_product_image',
    });
    await expect(uploadProductImage(path, bytes, 'image/png')).rejects.toMatchObject({
      code: 'invalid_product_image',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not silently accept an unknown provider', async () => {
    vi.stubEnv('IMAGE_STORAGE_PROVIDER', 'cloudflare');
    await expect(uploadProductImage(path, bytes, 'image/jpeg')).rejects.toMatchObject({
      status: 503,
      code: 'image_storage_setup_required',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
