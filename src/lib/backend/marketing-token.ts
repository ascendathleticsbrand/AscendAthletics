import 'server-only';
/** Signs and verifies newsletter unsubscribe links with a server-only secret. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from './errors';
function secret() {
  const value = process.env.NEWSLETTER_TOKEN_SECRET;
  if (!value || value.length < 32)
    throw new AppError(
      'Configure a secure newsletter signing secret before sending campaigns.',
      503,
      'setup_required',
    );
  return value;
}
export function unsubscribeToken(id: string) {
  return id + '.' + createHmac('sha256', secret()).update(id).digest('base64url');
}
export function verifyUnsubscribeToken(token: string) {
  const [id, signature, extra] = token.split('.');
  if (extra || !/^[a-f0-9-]{36}$/.test(id || '') || !signature)
    throw new AppError('Invalid unsubscribe link.');
  const expected = createHmac('sha256', secret()).update(id).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new AppError('Invalid unsubscribe link.');
  return id;
}
