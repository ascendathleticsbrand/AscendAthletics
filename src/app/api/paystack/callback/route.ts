/** Verifies a Paystack redirect server-side, then returns the customer to their private order. */
import { NextResponse } from 'next/server';
import { requestBaseOrigin } from '@/lib/backend/http';
import { guestOrder } from '@/lib/backend/guest';
import { rateLimit } from '@/lib/backend/rate-limit';
import { verifyAndRecordPaystackPayment } from '@/lib/backend/paystack';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get('reference') || '';
  const cookieName = 'ascend_paystack_' + reference;
  const token = request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + '='))
    ?.slice(cookieName.length + 1);
  let result = 'not-completed';
  if (token && /^[a-f0-9]{64}$/.test(token) && /^asc_[a-f0-9-]{36}$/.test(reference)) {
    try {
      await rateLimit(request, 'paystack-callback', 20);
      const snapshot = await guestOrder(token);
      await verifyAndRecordPaystackPayment(reference, snapshot.invoice.id);
      result = 'success';
    } catch (error) {
      console.error(
        'Paystack callback could not confirm payment:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }
  const path = token && /^[a-f0-9]{64}$/.test(token) ? '/order-status/' + token : '/order-status';
  const destination = new URL(path, requestBaseOrigin(request));
  destination.searchParams.set('payment', result);
  const response = NextResponse.redirect(destination);
  if (/^asc_[a-f0-9-]{36}$/.test(reference))
    response.cookies.set(cookieName, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/paystack/callback',
      maxAge: 0,
    });
  return response;
}
