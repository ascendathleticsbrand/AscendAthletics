/** Confirms Paystack charge events using the signature and a fresh provider verification call. */
import { route } from '@/lib/backend/http';
import { AppError } from '@/lib/backend/errors';
import {
  verifyAndRecordPaystackPayment,
  verifyPaystackWebhookSignature,
} from '@/lib/backend/paystack';

export async function POST(request: Request) {
  return route(async () => {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 128_000) throw new AppError('Webhook request is too large.', 413);
    const rawBody = Buffer.from(await request.arrayBuffer());
    if (rawBody.length > 128_000) throw new AppError('Webhook request is too large.', 413);
    if (!verifyPaystackWebhookSignature(rawBody, request.headers))
      throw new AppError('Invalid Paystack webhook signature.', 401, 'invalid_signature');
    let event: any;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new AppError('Invalid webhook payload.', 400);
    }
    if (event?.event === 'charge.success') {
      const reference = event?.data?.reference;
      if (typeof reference !== 'string') throw new AppError('Missing Paystack reference.', 400);
      await verifyAndRecordPaystackPayment(reference);
    }
    return { received: true };
  });
}
