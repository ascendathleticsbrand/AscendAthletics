import 'server-only';
/** Creates a request-scoped Supabase client that reads and writes the current user session through cookies. */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { hasSupabaseConfig, setupMessage } from '../env';
import { AppError } from '../backend/errors';
export async function createClient() {
  if (!hasSupabaseConfig()) throw new AppError(setupMessage, 503, 'setup_required');
  // Read cookies for this request rather than sharing a signed-in client between visitors.
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(values) {
          try {
            values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            /* Server Components cannot write cookies; the Next.js proxy refreshes them. */
          }
        },
      },
    },
  );
}
