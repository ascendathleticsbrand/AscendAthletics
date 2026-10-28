/** Checks whether the server or browser has the required Supabase configuration without exposing private values. */
export function hasSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    return ['https:', 'http:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
export function hasServiceConfig() {
  return hasSupabaseConfig() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export const setupMessage =
  'Connect Supabase and apply the database migrations to enable this feature.';
