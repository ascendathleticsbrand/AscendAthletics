import 'server-only';
/** Server-only Paystack calls. Never import this module into a Client Component. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError, databaseError } from './errors';
import { createAdminClient } from '../supabase/admin';

type PaystackTransaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  domain: string;
};

function secretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key || !/^sk_(test|live)_[A-Za-z0-9]+$/.test(key))
    throw new AppError(
      'Paystack is not configured. Add its server secret key first.',
      503,
      'paystack_setup',
    );
  return key;
}

export function hasPaystackConfig() {
  return /^sk_(test|live)_[A-Za-z0-9]+$/.test(process.env.PAYSTACK_SECRET_KEY?.trim() || '');
}

function expectedDomain(key: string) {
  return key.startsWith('sk_test_') ? 'test' : 'live';
}

async function paystackFetch(path: string, init: RequestInit) {
  const key = secretKey();
  let response: Response;
  try {
    response = await fetch('https://api.paystack.co' + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      'Paystack could not be reached. Please try again.',
      502,
      'paystack_unavailable',
    );
  }
  const body = (await response.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: any;
  } | null;
  if (!response.ok || !body?.status)
    throw new AppError(
      'Paystack could not process this request. Please try again.',
      502,
      'paystack_error',
    );
  return { body, key };
}

export async function initializePaystackCheckout(input: {
  email: string;
  amountNaira: number;
  reference: string;
  callbackUrl: string;
  invoiceId: string;
  orderNumber: string;
}) {
  const amountKobo = Math.round(input.amountNaira * 100);
  if (!Number.isSafeInteger(amountKobo) || amountKobo < 1)
    throw new AppError('This invoice has an invalid amount.', 400, 'invalid_amount');
  const { body } = await paystackFetch('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: amountKobo,
      currency: 'NGN',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: { invoice_id: input.invoiceId, order_number: input.orderNumber },
    }),
  });
  const authorizationUrl = body.data?.authorization_url;
  if (typeof authorizationUrl !== 'string')
    throw new AppError('Paystack did not return a checkout link.', 502, 'paystack_error');
  const parsed = new URL(authorizationUrl);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'checkout.paystack.com')
    throw new AppError('Paystack returned an unexpected checkout link.', 502, 'paystack_error');
  return authorizationUrl;
}

export async function verifyAndRecordPaystackPayment(reference: string, invoiceId?: string) {
  if (!/^asc_[a-f0-9-]{36}$/.test(reference))
    throw new AppError('Invalid Paystack reference.', 400, 'invalid_reference');
  const { body, key } = await paystackFetch(
    '/transaction/verify/' + encodeURIComponent(reference),
    { method: 'GET' },
  );
  const transaction = body.data as PaystackTransaction | undefined;
  if (
    !transaction ||
    transaction.status !== 'success' ||
    transaction.reference?.toLowerCase() !== reference.toLowerCase() ||
    transaction.currency !== 'NGN' ||
    transaction.domain !== expectedDomain(key) ||
    !Number.isSafeInteger(transaction.amount) ||
    transaction.amount <= 0
  )
    throw new AppError('Paystack has not confirmed this payment.', 409, 'payment_not_confirmed');

  const { data, error } = await createAdminClient().rpc('verify_paystack_payment', {
    p_reference: reference,
    p_amount: transaction.amount / 100,
    p_invoice_id: invoiceId || null,
  });
  databaseError(error);
  return data;
}

function safeEqualHex(expected: Buffer, receivedHex: string) {
  if (!/^[a-f0-9]{128}$/i.test(receivedHex)) return false;
  const received = Buffer.from(receivedHex, 'hex');
  return received.length === expected.length && timingSafeEqual(expected, received);
}

/** Supports Paystack's timestamped webhook signature and its legacy header during migration. */
export function verifyPaystackWebhookSignature(rawBody: Buffer, headers: Headers) {
  const signedHeader = headers.get('paystack-signature');
  const signingSecrets = (process.env.PAYSTACK_WEBHOOK_SECRET || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (signedHeader && signingSecrets.length) {
    let timestamp: string | undefined;
    const candidates: string[] = [];
    for (const field of signedHeader.split(',')) {
      const separator = field.indexOf('=');
      if (separator < 0) continue;
      const name = field.slice(0, separator).trim();
      const value = field.slice(separator + 1).trim();
      if (name === 't') {
        if (timestamp) return false;
        timestamp = value;
      } else if (name === 'v1') {
        const colon = value.indexOf(':');
        if (colon > -1) candidates.push(value.slice(colon + 1));
      }
    }
    if (!timestamp || !/^\d+$/.test(timestamp)) return false;
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isSafeInteger(age) || age > 300) return false;
    return signingSecrets.some((secret) => {
      const expected = createHmac('sha512', secret)
        .update(timestamp + '.')
        .update(rawBody)
        .digest();
      return candidates.some((candidate) => safeEqualHex(expected, candidate));
    });
  }

  const legacySignature = headers.get('x-paystack-signature');
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!legacySignature || !key) return false;
  const expected = createHmac('sha512', key).update(rawBody).digest();
  return safeEqualHex(expected, legacySignature);
}
