/** Records a newsletter subscription only after validating the email address and explicit consent. */
import { route, jsonBody } from '@/lib/backend/http';
import { subscriberSchema } from '@/lib/backend/validation';
import { rateLimit } from '@/lib/backend/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError } from '@/lib/backend/errors';
export async function POST(request: Request) {
  return route(async () => {
    const input = subscriberSchema.parse(await jsonBody(request));
    await rateLimit(request, 'newsletter', 6);
    const { data, error } = await createAdminClient().rpc('subscribe_newsletter', {
      p_email: input.email,
      p_name: input.name || null,
      p_source: 'website',
      p_policy_version: '1.0',
    });
    databaseError(error);
    return { subscribed: true, message: 'You are subscribed to ASCEND updates.' };
  }, 201);
}
