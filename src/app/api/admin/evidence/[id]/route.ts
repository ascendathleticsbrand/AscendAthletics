/** Lets authorized staff request a short-lived viewing link for private payment evidence. */
import { route } from '@/lib/backend/http';
import { requireStaff } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { idSchema } from '@/lib/backend/validation';
import { AppError, databaseError } from '@/lib/backend/errors';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    const { db } = await requireStaff();
    const id = idSchema.parse((await params).id);
    const { data, error } = await db
      .from('payment_evidence')
      .select('storage_path')
      .eq('id', id)
      .maybeSingle();
    databaseError(error);
    if (!data) throw new AppError('Payment evidence not found.', 404);
    const { data: signed, error: se } = await createAdminClient()
      .storage.from('payment-proofs')
      .createSignedUrl(data.storage_path, 120);
    databaseError(se);
    return { url: signed!.signedUrl };
  });
}
