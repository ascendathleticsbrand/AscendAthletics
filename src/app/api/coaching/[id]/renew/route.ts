/** Requests a new coaching renewal invoice for the signed-in customer through the database renewal workflow. */
import { route, jsonBody } from '@/lib/backend/http';
import { requireUser } from '@/lib/auth';
import { idSchema } from '@/lib/backend/validation';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError } from '@/lib/backend/errors';
import { rateLimit } from '@/lib/backend/rate-limit';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(async () => {
    await jsonBody(request);
    const { user } = await requireUser();
    await rateLimit(request, 'coaching-renewal', 8);
    const id = idSchema.parse((await params).id);
    const { data, error } = await createAdminClient().rpc('renew_enrollment', {
      p_enrollment_id: id,
      p_actor: user.id,
    });
    databaseError(error);
    return data;
  }, 201);
}
