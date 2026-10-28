/** Handles signed-in account reads, profile updates and explicitly linking a private guest order to that account. */
import { z } from 'zod';
import { route, jsonBody } from '@/lib/backend/http';
import { requireUser } from '@/lib/auth';
import { getAccountData } from '@/lib/account';
import { databaseError, AppError } from '@/lib/backend/errors';
import { tokenSchema } from '@/lib/backend/validation';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit } from '@/lib/backend/rate-limit';
async function updateProfile(raw: Record<string, unknown>) {
  const input = z
    .object({
      full_name: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(7).max(30),
    })
    .parse({ ...raw, full_name: raw.full_name || raw.name });
  const { db, user } = await requireUser();
  const { data, error } = await db
    .from('profiles')
    .update(input)
    .eq('id', user.id)
    .select()
    .single();
  databaseError(error);
  return data;
}
export async function GET() {
  return route(async () => {
    await requireUser();
    return getAccountData();
  });
}
export async function PATCH(request: Request) {
  return route(async () => updateProfile(await jsonBody(request)));
}
export async function POST(request: Request) {
  return route(async () => {
    const input = await jsonBody(request);
    const { user } = await requireUser();
    await rateLimit(request, 'account-action', 20);
    if (input.action === 'updateProfile') return updateProfile(input);
    if (input.action === 'linkGuest') {
      const token = tokenSchema.parse(input.guest_token);
      const { data, error } = await createAdminClient().rpc('link_guest_customer', {
        p_actor: user.id,
        p_guest_token: token,
      });
      databaseError(error);
      return data;
    }
    throw new AppError('Unknown account action.');
  });
}
