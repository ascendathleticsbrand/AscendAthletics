/** Records guest payment evidence after checking the private order link and delivery-fee approval. */
import { route, jsonBody } from '@/lib/backend/http';
import { guestOrder } from '@/lib/backend/guest';
import { evidenceSchema } from '@/lib/backend/validation';
import { rateLimit } from '@/lib/backend/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError, AppError } from '@/lib/backend/errors';
import { validateProof } from '@/lib/backend/uploads';
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return route(async () => {
    const input = evidenceSchema.parse(await jsonBody(request));
    await rateLimit(request, 'guest-evidence', 8);
    const token = (await params).token;
    const order = await guestOrder(token);
    // Do not accept a payment claim while the final delivery amount still needs confirmation or approval.
    if (
      !order.invoice ||
      (order.order.delivery_status === 'pending' &&
        order.order.fulfillment_method === 'delivery') ||
      order.order.delivery_status === 'quoted'
    )
      throw new AppError('Approve the final delivery fee before submitting payment.');
    if (input.proof_path) await validateProof(input.proof_path, order.invoice.id);
    const { data, error } = await createAdminClient().rpc('submit_payment', {
      p_invoice_id: order.invoice.id,
      p_amount: input.amount,
      p_transfer_reference: input.transfer_reference,
      p_bank_name: input.bank_name || null,
      p_transferred_at: input.transferred_at || null,
      p_proof_path: input.proof_path || null,
      p_guest_token: token,
    });
    databaseError(error);
    return { payment: data, message: 'Payment pending — awaiting verification.' };
  }, 201);
}
