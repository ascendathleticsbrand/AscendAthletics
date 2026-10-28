import 'server-only';
/** Creates a server-only privileged database client; callers must enforce authentication and permission checks first. */
import { createClient } from '@supabase/supabase-js';
import { hasServiceConfig, setupMessage } from '../env';
import { AppError } from '../backend/errors';
export function createAdminClient() {
  if (!hasServiceConfig()) throw new AppError(setupMessage, 503, 'setup_required');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
