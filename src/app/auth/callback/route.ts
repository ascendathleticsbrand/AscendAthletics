/** Exchanges an email-confirmation code for a Supabase session, then redirects to an allowed local page. */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requestBaseOrigin } from '@/lib/backend/http';
import { safeAuthNext } from '@/lib/backend/auth-next';
export async function GET(request: Request) {
  const url = new URL(request.url),
    base = process.env.NEXT_PUBLIC_SITE_URL || requestBaseOrigin(request),
    next = safeAuthNext(url.searchParams.get('next'));
  const code = url.searchParams.get('code');
  if (code) {
    try {
      const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, base));
    } catch {
      console.error('ASCEND email confirmation could not complete.');
    }
  }
  const failure = new URL('/account', base);
  failure.searchParams.set('auth_error', 'confirmation_failed');
  failure.searchParams.set('next', next);
  return NextResponse.redirect(failure);
}
