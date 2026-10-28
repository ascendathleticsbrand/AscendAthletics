import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  lookup: vi.fn(),
  insert: vi.fn(),
  upload: vi.fn(),
  cleanup: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireStaff: mocks.staff }));
vi.mock('@/lib/backend/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/storage/product-images', () => ({
  uploadProductImage: mocks.upload,
  cleanupUploadedProductImage: mocks.cleanup,
}));
import { POST } from './route';
import { AppError } from '@/lib/backend/errors';
const product = '11111111-1111-4111-8111-111111111111';
const key = product + '/22222222-2222-4222-8222-222222222222.jpg';
const uploaded = {
  provider: 'r2',
  objectPath: 'products/' + key,
  storagePath: 'https://pub-example.r2.dev/products/' + key,
  url: 'https://pub-example.r2.dev/products/' + key,
};
const db = {
  from: (table: string) =>
    table === 'products'
      ? { select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }
      : { insert: mocks.insert },
};
function request(
  options: {
    origin?: string;
    bytes?: Uint8Array;
    productId?: string;
    sortOrder?: string;
    declaredSize?: string;
  } = {},
) {
  const form = new FormData();
  form.set('product_id', options.productId ?? product);
  form.set('alt', 'Actual product photo');
  form.set('sort_order', options.sortOrder ?? '2');
  form.set(
    'file',
    new File([new Uint8Array(options.bytes ?? [255, 216, 255, 224])], 'photo.jpg', {
      type: 'image/jpeg',
    }),
  );
  return new Request('http://localhost:3000/api/admin/upload', {
    method: 'POST',
    headers: {
      Origin: options.origin ?? 'http://localhost:3000',
      ...(options.declaredSize ? { 'Content-Length': options.declaredSize } : {}),
    },
    body: form,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockReset().mockResolvedValue({ db });
  mocks.lookup.mockReset().mockResolvedValue({ data: { id: product }, error: null });
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  mocks.upload.mockReset().mockResolvedValue(uploaded);
  mocks.cleanup.mockReset().mockResolvedValue(undefined);
});

describe('staff image uploads with mixed storage providers', () => {
  it('stores the public R2 reference only after the image upload succeeds', async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][0]).toMatch(
      new RegExp('^' + product + '/[a-f0-9-]{36}\\.jpg$'),
    );
    expect(mocks.upload.mock.calls[0][2]).toBe('image/jpeg');
    expect(mocks.insert).toHaveBeenCalledExactlyOnceWith({
      product_id: product,
      storage_path: uploaded.storagePath,
      alt: 'Actual product photo',
      sort_order: 2,
    });
    expect((await response.json()).data).toEqual({
      url: uploaded.url,
      objectPath: uploaded.objectPath,
      storagePath: uploaded.storagePath,
    });
    expect(mocks.upload.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0],
    );
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('preserves legacy Supabase object references when that provider is selected', async () => {
    const legacy = {
      provider: 'supabase',
      objectPath: key,
      storagePath: key,
      url: 'https://project.supabase.co/storage/v1/object/public/product-images/' + key,
    };
    mocks.upload.mockResolvedValueOnce(legacy);
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(mocks.insert.mock.calls[0][0].storage_path).toBe(key);
    expect((await response.json()).data.url).toBe(legacy.url);
  });
  it('rejects anonymous users before reading a product or creating an object', async () => {
    mocks.staff.mockRejectedValueOnce(new AppError('Sign in first', 401, 'unauthorized'));
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin request before staff or storage operations', async () => {
    const response = await POST(request({ origin: 'https://untrusted.example' }));
    expect(response.status).toBe(403);
    expect(mocks.staff).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rejects spoofed image bytes and oversized request bodies without writing an object', async () => {
    const invalid = await POST(
      request({ bytes: new TextEncoder().encode('<svg>not a photograph</svg>') }),
    );
    expect(invalid.status).toBe(400);
    const oversized = await POST(request({ declaredSize: String(7 * 1024 * 1024) }));
    expect(oversized.status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('requires a real product and a valid display order before uploading', async () => {
    const badOrder = await POST(request({ sortOrder: '-1' }));
    expect(badOrder.status).toBe(400);
    mocks.lookup.mockResolvedValueOnce({ data: null, error: null });
    const missing = await POST(request());
    expect(missing.status).toBe(404);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('rolls back only the newly uploaded object when its gallery record fails to save', async () => {
    mocks.insert.mockResolvedValueOnce({ error: { message: 'Gallery unavailable' } });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(mocks.cleanup).toHaveBeenCalledExactlyOnceWith(uploaded);
    expect((await response.json()).error).toBe('Gallery unavailable');
  });
  it('does not save a record or attempt cleanup when the storage upload failed', async () => {
    mocks.upload.mockRejectedValueOnce(
      new AppError('Storage unavailable', 503, 'image_upload_failed'),
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
