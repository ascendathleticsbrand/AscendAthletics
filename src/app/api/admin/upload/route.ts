/** Accepts staff product photos, verifies the image and product, then saves the new gallery reference. */
import { randomUUID } from 'node:crypto';
import { route, assertSameOrigin } from '@/lib/backend/http';
import { requireStaff } from '@/lib/auth';
import { AppError, databaseError } from '@/lib/backend/errors';
import { allowedImage } from '@/lib/backend/uploads';
import { rateLimit } from '@/lib/backend/rate-limit';
import { uploadProductImage, cleanupUploadedProductImage } from '@/lib/storage/product-images';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  return route(async () => {
    assertSameOrigin(request);
    const { db } = await requireStaff();
    await rateLimit(request, 'product-upload', 30);
    const declaredSize = Number(request.headers.get('content-length') || 0);
    if (declaredSize > 6 * 1024 * 1024)
      throw new AppError('Choose an image smaller than 5 MB.', 413);
    const form = await request.formData();
    const file = form.get('file');
    const productId = String(form.get('productId') || form.get('product_id') || '');
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(productId))
      throw new AppError('Save the product before uploading images.');
    const { data: product, error: productError } = await db
      .from('products')
      .select('id')
      .eq('id', productId)
      .maybeSingle();
    databaseError(productError);
    if (!product) throw new AppError('Product not found.', 404);
    if (!(file instanceof File) || file.size < 1 || file.size > 5 * 1024 * 1024)
      throw new AppError('Choose an image smaller than 5 MB.');
    // Detect the actual image format before creating a new storage object.
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = allowedImage(bytes);
    if (!mime) throw new AppError('Choose a JPEG, PNG or WebP image.');
    const sortOrder = Number(form.get('sort_order') || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1000)
      throw new AppError('Display order must be a whole number from 0 to 1000.');
    const path =
      productId +
      '/' +
      randomUUID() +
      '.' +
      (mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp');
    // Upload first, then link the image to its product; remove only this new object if the link cannot be saved.
    const uploaded = await uploadProductImage(path, bytes, mime);
    try {
      const { error } = await db.from('product_images').insert({
        product_id: productId,
        storage_path: uploaded.storagePath,
        alt: String(form.get('alt') || 'ASCEND merchandise')
          .trim()
          .slice(0, 300),
        sort_order: sortOrder,
      });
      databaseError(error);
    } catch (error) {
      try {
        await cleanupUploadedProductImage(uploaded);
      } catch {
        console.error(
          'ASCEND could not clean up a new product image after its database save failed.',
        );
      }
      throw error;
    }
    return {
      url: uploaded.url,
      objectPath: uploaded.objectPath,
      storagePath: uploaded.storagePath,
    };
  }, 201);
}
