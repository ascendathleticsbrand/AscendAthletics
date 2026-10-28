/** Handles email-and-password sign-in, account creation and sign-out through Supabase Auth. */
import { z } from 'zod';
import { route, jsonBody, requestBaseOrigin } from '@/lib/backend/http';
import { createClient } from '@/lib/supabase/server';
import { rateLimit } from '@/lib/backend/rate-limit';
import { AppError } from '@/lib/backend/errors';
import { safeAuthNext } from '@/lib/backend/auth-next';
const schema = z.object({
  action: z.enum(['signIn', 'signUp', 'signOut']),
  email: z.email().optional(),
  password: z.string().min(8).max(128).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  next: z.string().max(2048).optional(),
});
export async function POST(request: Request) {
  return route(async () => {
    const input = schema.parse(await jsonBody(request));
    await rateLimit(request, 'auth', 12);
    const db = await createClient();
    if (input.action === 'signOut') {
      const { error } = await db.auth.signOut();
      if (error) throw new AppError('Could not sign out.', 400);
      return { signedOut: true };
    }
    if (!input.email || !input.password) throw new AppError('Enter your email and password.');
    if (input.action === 'signIn') {
      const { error } = await db.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error)
        throw new AppError(
          'Check your email and password, or confirm your email before signing in.',
          401,
        );
      return { signedIn: true, next: safeAuthNext(input.next) };
    }
    if (!input.name) throw new AppError('Enter your full name.');
    // Confirmation links return through our callback; the allowed next path is validated independently.
    const redirect = new URL(
      '/auth/callback',
      process.env.NEXT_PUBLIC_SITE_URL || requestBaseOrigin(request),
    );
    redirect.searchParams.set('next', safeAuthNext(input.next));
    const { data, error } = await db.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        emailRedirectTo: redirect.toString(),
        data: { full_name: input.name, phone: input.phone || '' },
      },
    });
    if (error)
      throw new AppError('Your account could not be created. Check your details and try again.');
    return {
      signedIn: Boolean(data.session),
      next: safeAuthNext(input.next),
      message: data.session
        ? 'Your account is ready.'
        : 'Check your email to confirm your coaching account.',
    };
  });
}
