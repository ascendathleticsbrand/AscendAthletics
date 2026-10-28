/** Creates a coaching request for the signed-in customer after confirming their contact details. */
import { z } from 'zod';
import { route, jsonBody } from '@/lib/backend/http';
import { requireUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError, AppError } from '@/lib/backend/errors';
import { rateLimit } from '@/lib/backend/rate-limit';
const schema = z.object({
  package_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(7).max(30).optional(),
  preferences: z
    .object({
      goal: z.enum(['strength', 'general_fitness', 'conditioning']).optional(),
      schedule: z.string().trim().max(200).optional(),
    })
    .optional(),
});
export async function POST(request: Request) {
  return route(async () => {
    const input = schema.parse(await jsonBody(request));
    const { db, user } = await requireUser();
    await rateLimit(request, 'enrollment', 10);
    const { data: profile, error: pe } = await db
      .from('profiles')
      .select('full_name,phone')
      .eq('id', user.id)
      .maybeSingle();
    databaseError(pe);
    const full_name = input.name || profile?.full_name;
    const phone = input.phone || profile?.phone;
    if (!full_name || !phone)
      throw new AppError('Confirm your name and phone number before requesting coaching.');
    if (input.name || input.phone) {
      const { error } = await db.from('profiles').update({ full_name, phone }).eq('id', user.id);
      databaseError(error);
    }
    const { data, error } = await createAdminClient().rpc('request_enrollment', {
      p_package_id: input.package_id,
      p_actor: user.id,
      p_preferences: input.preferences || {},
    });
    databaseError(error);
    return data;
  }, 201);
}
