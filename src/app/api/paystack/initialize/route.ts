/** Creates or reuses a Paystack checkout for the outstanding balance on a guest order. */
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { route, jsonBody, requestBaseOrigin } from '@/lib/backend/http';
import { AppError, databaseError } from '@/lib/backend/errors';
import { rateLimit } from '@/lib/backend/rate-limit';
import { guestOrder } from '@/lib/backend/guest';
import { hasPaystackConfig, initializePaystackCheckout } from '@/lib/backend/paystack';
import { createAdminClient } from '@/lib/supabase/admin';
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) });

export async function POST(request: Request) {
  let callbackToken: string | undefined;
  let callbackReference: string | undefined;
  const response = await route(async () => {
    const { token } = schema.parse(await jsonBody(request));
    if (!hasPaystackConfig())
      throw new AppError(
        'Paystack test credentials are not configured yet.',
        503,
        'paystack_setup',
      );
    await rateLimit(request, 'paystack-initialize', 8);
    const snapshot = await guestOrder(token);
    const order = snapshot.order;
    const invoice = snapshot.invoice;
    const amount = Number(invoice?.outstanding_amount);
    const email = typeof order?.customer_email === 'string' ? order.customer_email.trim() : '';
    if (
      !invoice?.id ||
      !email ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      invoice.total_amount == null ||
      order.delivery_status !== 'approved' ||
      order.fulfillment_status === 'cancelled' ||
      order.resolution_required
    )
      throw new AppError('This order is not ready for online payment.', 409, 'invoice_not_payable');

    const reference = 'asc_' + randomUUID();
    const db = createAdminClient();
    const { data: pending, error } = await db.rpc('begin_paystack_payment', {
      p_invoice_id: invoice.id,
      p_guest_token: token,
      p_reference: reference,
      p_amount: amount,
    });
    databaseError(error);
    if (!pending?.reference) throw new AppError('Could not prepare this payment.', 503);
    if (Number(pending.amount) !== amount)
      throw new AppError(
        'An earlier Paystack checkout is still open for a different invoice balance. Complete or cancel it before starting another payment.',
        409,
        'paystack_checkout_open',
      );
    callbackToken = token;
    callbackReference = pending.reference;
    if (pending.authorization_url) return { authorization_url: pending.authorization_url };

    const callback = new URL('/api/paystack/callback', requestBaseOrigin(request));
    const authorizationUrl = await initializePaystackCheckout({
      email,
      amountNaira: Number(pending.amount),
      reference: pending.reference,
      callbackUrl: callback.toString(),
      invoiceId: invoice.id,
      orderNumber: String(order.order_number || ''),
    });
    const { error: saveError } = await db.rpc('set_paystack_checkout_url', {
      p_reference: pending.reference,
      p_url: authorizationUrl,
    });
    databaseError(saveError);
    return { authorization_url: authorizationUrl };
  });
  if (callbackToken && callbackReference && response instanceof NextResponse) {
    response.cookies.set('ascend_paystack_' + callbackReference, callbackToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/paystack/callback',
      maxAge: 30 * 60,
    });
  }
  return response;
}
