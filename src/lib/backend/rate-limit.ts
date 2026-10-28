import 'server-only';
/** Uses a hashed request identity and a database counter to limit repeated actions across server instances. */
import { createHash } from 'node:crypto';
import { createAdminClient } from '../supabase/admin';
import { databaseError, AppError } from './errors';
export async function rateLimit(request: Request, scope: string, limit = 10, windowSeconds = 900) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const key = createHash('sha256')
    .update(scope + ':' + ip)
    .digest('hex');
  const { data, error } = await createAdminClient().rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  databaseError(error);
  if (!data)
    throw new AppError('Too many requests. Please wait before trying again.', 429, 'rate_limited');
}
