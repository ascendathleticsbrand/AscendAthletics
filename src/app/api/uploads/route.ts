/** Issues a signed upload URL for private payment evidence after verifying access to the invoice. */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { route, jsonBody } from '@/lib/backend/http';
import { guestOrder } from '@/lib/backend/guest';
import { requireUser, getAdminContext } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError, AppError } from '@/lib/backend/errors';
import { rateLimit } from '@/lib/backend/rate-limit';
const schema = z.object({
  invoice_id: z.string().uuid(),
  guest_token: z.string().optional(),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  size: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export async function POST(request: Request) {
  return route(async () => {
    const input = schema.parse(await jsonBody(request));
    await rateLimit(request, 'proof-upload', 12);
    // Guests prove access with their private order token; signed-in users rely on invoice row policies.
    if (input.guest_token) {
      const order = await guestOrder(input.guest_token);
      if (order.invoice?.id !== input.invoice_id) throw new AppError('Invoice not found.', 404);
    } else {
      const { db } = await requireUser();
      const { data, error } = await db
        .from('invoices')
        .select('id')
        .eq('id', input.invoice_id)
        .maybeSingle();
      databaseError(error);
      if (!data) throw new AppError('Invoice not found.', 404);
    }
    const extension =
      input.mime === 'image/jpeg' ? 'jpg' : input.mime === 'image/png' ? 'png' : 'webp';
    // Proofs stay in private Supabase storage, separate from public product photos in R2.
    const path = 'proofs/' + input.invoice_id + '/' + randomUUID() + '.' + extension;
    const { data, error } = await createAdminClient()
      .storage.from('payment-proofs')
      .createSignedUploadUrl(path, { upsert: false });
    databaseError(error);
    return { path, token: data!.token, signedUploadUrl: data!.signedUrl };
  });
}
