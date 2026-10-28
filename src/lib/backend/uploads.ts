import 'server-only';
/** Recognizes supported image bytes and checks that uploaded payment evidence belongs to the selected invoice. */
import { createAdminClient } from '../supabase/admin';
import { AppError } from './errors';
// File signatures are checked instead of trusting a filename extension or a browser-provided MIME type.
export function allowedImage(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' &&
    new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return null;
}
// Re-read the stored proof so an unverified or cross-invoice path cannot be submitted as evidence.
export async function validateProof(path: string, invoiceId: string) {
  if (!path.startsWith('proofs/' + invoiceId + '/'))
    throw new AppError('This proof file does not belong to the invoice.', 403);
  const { data, error } = await createAdminClient().storage.from('payment-proofs').download(path);
  if (error || !data) throw new AppError('Upload the proof image before submitting payment.');
  if (data.size > 5 * 1024 * 1024) throw new AppError('Payment proof must be smaller than 5 MB.');
  const mime = allowedImage(new Uint8Array(await data.arrayBuffer()));
  if (!mime || mime !== data.type)
    throw new AppError('Upload a valid JPEG, PNG or WebP payment proof image.');
}
