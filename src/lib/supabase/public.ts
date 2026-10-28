import 'server-only';
/** Creates an anonymous server client for public catalog reads, independent of any signed-in staff session. */
import { createClient } from '@supabase/supabase-js';
import { hasSupabaseConfig, setupMessage } from '../env';
import { AppError } from '../backend/errors';
// The public catalog always uses anonymous policies, even when a staff member is signed in.
export function createPublicClient() {
  if (!hasSupabaseConfig()) throw new AppError(setupMessage, 503, 'setup_required');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
