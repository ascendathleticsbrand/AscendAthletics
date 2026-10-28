/** Refreshes Supabase session cookies before matching page and API requests; protected handlers still check their own permissions. */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseConfig } from '@/lib/env';

// Server Components cannot persist refreshed tokens. Preserve both request and response cookies.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasSupabaseConfig()) return response;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Update the current request for server rendering and the response for the browser's next request.
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  // Authentication/role checks still run in every protected data function and mutation.
  await supabase.auth.getClaims();
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)$).*)',
  ],
};
