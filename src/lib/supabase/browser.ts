'use client';
/** Creates the browser Supabase client using public configuration and the shared cookie-based session. */
import { createBrowserClient } from '@supabase/ssr';
import { hasSupabaseConfig, setupMessage } from '../env';
export function createClient() {
  if (!hasSupabaseConfig()) throw new Error(setupMessage);
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
