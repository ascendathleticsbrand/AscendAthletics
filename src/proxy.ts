/** Refreshes Supabase session cookies before matching page and API requests; protected handlers still check their own permissions. */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { hasSupabaseConfig } from '@/lib/env';

function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === 'development';
  const origin = (value?: string) => {
    if (!value) return '';
    try {
      return new URL(value).origin;
    } catch {
      return '';
    }
  };
  const supabaseOrigin = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const r2Origin = origin(process.env.R2_PUBLIC_BASE_URL);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // The storefront uses React style attributes; script execution remains nonce-only.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: https://*.supabase.co${r2Origin ? ` ${r2Origin}` : ''}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')}` : ''}${isDev ? ' ws://localhost:* ws://127.0.0.1:*' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

// Server Components cannot persist refreshed tokens. Preserve both request and response cookies.
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const next = () => {
    const result = NextResponse.next({ request: { headers: requestHeaders } });
    result.headers.set('Content-Security-Policy', csp);
    return result;
  };
  let response = next();
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
          requestHeaders.set('cookie', request.cookies.toString());
          response = next();
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
