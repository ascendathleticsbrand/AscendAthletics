/** Records a signed-in customer payment claim against a coaching invoice they are allowed to access. */
import { route, jsonBody } from '@/lib/backend/http';
import { evidenceSchema, idSchema } from '@/lib/backend/validation';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError, AppError } from '@/lib/backend/errors';
import { rateLimit } from '@/lib/backend/rate-limit';
import { validateProof } from '@/lib/backend/uploads';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const input = evidenceSchema.parse(await jsonBody(request));
    const { db, user } = await requireUser();
    const id = idSchema.parse((await params).id);
    await rateLimit(request, 'client-evidence', 10);
    // The signed-in client can see only permitted invoices before the privileged payment function is called.
    const { data: invoice, error: ie } = await db
      .from('invoices')
      .select('id')
      .eq('enrollment_id', id)
      .maybeSingle();
    databaseError(ie);
    if (!invoice) throw new AppError('Enrollment not found.', 404);
    if (input.proof_path) await validateProof(input.proof_path, invoice.id);
    const { data, error } = await createAdminClient().rpc('submit_payment', {
      p_invoice_id: invoice.id,
      p_amount: input.amount,
      p_transfer_reference: input.transfer_reference,
      p_bank_name: input.bank_name || null,
      p_transferred_at: input.transferred_at || null,
      p_proof_path: input.proof_path || null,
      p_actor: user.id,
    });
    databaseError(error);
    return { payment: data, message: 'Payment pending — awaiting verification.' };
  }, 201);
}
