import 'server-only';
/** Uploads public product photos to the configured provider and tracks safe cleanup if saving the gallery fails. */
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { AppError } from '../backend/errors';
import { createAdminClient } from '../supabase/admin';
import { getR2PublicBaseUrl, productImageReference } from './image-urls';

export type ProductImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';
export type UploadedProductImage = Readonly<{
  storagePath: string;
  url: string;
  provider: 'supabase' | 'r2';
  objectPath: string;
}>;

// Only successful uploads from this server request can be removed during rollback.
// Capture the original provider and bucket so a later configuration change cannot
// redirect cleanup to an unrelated object.
const uploadRollbacks = new WeakMap<UploadedProductImage, () => Promise<void>>();
const imagePathPattern =
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(jpg|png|webp)$/i;
const extensions: Record<ProductImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// The S3 endpoint accepts private authenticated uploads; the separate public origin serves customer images.
function r2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = getR2PublicBaseUrl();
  if (
    !accountId ||
    !/^[a-f0-9]{32}$/i.test(accountId) ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) ||
    !publicBaseUrl
  ) {
    throw new AppError(
      'R2 image storage is not configured. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_BASE_URL in the server environment. Use the public HTTPS image address, not the S3 endpoint.',
      503,
      'image_storage_setup_required',
    );
  }
  return {
    bucket,
    publicBaseUrl,
    client: {
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
    },
  };
}

export async function uploadProductImage(
  path: string,
  bytes: Uint8Array,
  contentType: ProductImageContentType,
): Promise<UploadedProductImage> {
  const match = imagePathPattern.exec(path);
  if (
    !match ||
    !Object.hasOwn(extensions, contentType) ||
    match[1].toLowerCase() !== extensions[contentType]
  ) {
    throw new AppError(
      'Use a valid product image path and a JPEG, PNG or WebP image.',
      400,
      'invalid_product_image',
    );
  }
  if (bytes.length < 1 || bytes.length > 5 * 1024 * 1024)
    throw new AppError('Choose an image smaller than 5 MB.', 413, 'invalid_product_image');
  // An explicitly chosen provider must be configured; upload failures never silently switch storage services.
  const provider = process.env.IMAGE_STORAGE_PROVIDER?.trim() || 'supabase';
  if (provider !== 'supabase' && provider !== 'r2')
    throw new AppError(
      'Set IMAGE_STORAGE_PROVIDER to supabase or r2 in the server environment.',
      503,
      'image_storage_setup_required',
    );

  if (provider === 'supabase') {
    const bucket = createAdminClient().storage.from('product-images');
    const { error } = await bucket.upload(path, bytes, { contentType, upsert: false });
    if (error)
      throw new AppError(
        'The image could not be uploaded to Supabase. Check storage configuration and try again.',
        503,
        'image_upload_failed',
      );
    const { data } = bucket.getPublicUrl(path);
    const result: UploadedProductImage = Object.freeze({
      storagePath: path,
      url: data.publicUrl,
      provider,
      objectPath: path,
    });
    uploadRollbacks.set(result, async () => {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError)
        throw new AppError(
          'The unlinked image could not be removed from Supabase storage.',
          503,
          'image_cleanup_failed',
        );
    });
    return result;
  }

  const config = r2Configuration();
  const objectPath = 'products/' + path;
  const client = new S3Client(config.client);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectPath,
        Body: bytes,
        ContentType: contentType,
        ContentLength: bytes.length,
        CacheControl: 'public, max-age=31536000, immutable',
        // A UUID collision must never replace an existing image.
        IfNoneMatch: '*',
      }),
    );
  } catch {
    throw new AppError(
      'The image could not be uploaded to Cloudflare R2. Check the bucket, its Object Read & Write credentials, and try again.',
      503,
      'image_upload_failed',
    );
  } finally {
    client.destroy();
  }
  // Absolute R2 URLs coexist with legacy Supabase object keys in the existing database column.
  const url = config.publicBaseUrl + '/' + objectPath;
  const result: UploadedProductImage = Object.freeze({
    storagePath: url,
    url,
    provider,
    objectPath,
  });
  uploadRollbacks.set(result, async () => {
    const cleanupClient = new S3Client(config.client);
    try {
      await cleanupClient.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectPath }));
    } catch {
      throw new AppError(
        'The unlinked image could not be removed from Cloudflare R2 storage.',
        503,
        'image_cleanup_failed',
      );
    } finally {
      cleanupClient.destroy();
    }
  });
  return result;
}

/** Roll back only an image just uploaded by uploadProductImage after its database insert fails. */
export async function cleanupUploadedProductImage(result: UploadedProductImage): Promise<void> {
  const rollback = uploadRollbacks.get(result);
  if (!rollback)
    throw new AppError(
      'This image was not uploaded by the current request.',
      400,
      'invalid_image_cleanup',
    );
  await rollback();
  uploadRollbacks.delete(result);
}

/** Removes gallery objects after the database has permanently deleted their product. */
export async function deleteProductImageObjects(
  productId: string,
  storagePaths: string[],
): Promise<void> {
  for (const storagePath of storagePaths) {
    const reference = productImageReference(storagePath, productId);
    if (!reference)
      throw new AppError('A product image path failed validation during storage cleanup.');

    if (/^https:\/\//i.test(reference)) {
      const config = r2Configuration();
      const url = new URL(reference);
      const objectPath = url.pathname.slice('/products/'.length);
      const client = new S3Client(config.client);
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: `products/${objectPath}` }),
        );
      } catch {
        throw new AppError(
          'The product was deleted, but an image could not be removed from Cloudflare R2.',
        );
      } finally {
        client.destroy();
      }
      continue;
    }

    const { error } = await createAdminClient().storage.from('product-images').remove([reference]);
    if (error)
      throw new AppError(
        'The product was deleted, but an image could not be removed from Supabase Storage.',
      );
  }
}
