/** Encrypts private order tokens for email delivery and detects tampering when they are decrypted. */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
function key(secret: string) {
  if (secret.length < 32)
    throw new Error('Use a notification encryption secret of at least 32 characters.');
  return createHash('sha256').update(secret).digest();
}
// Each encrypted value receives a fresh nonce; the authentication tag detects modified ciphertext.
export function encryptPrivateToken(token: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}
export function decryptPrivateToken(value: string, secret: string) {
  const [version, iv, tag, ciphertext, extra] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !ciphertext || extra)
    throw new Error('Invalid encrypted notification link.');
  const nonce = Buffer.from(iv, 'base64url'),
    auth = Buffer.from(tag, 'base64url');
  if (nonce.length !== 12 || auth.length !== 16)
    throw new Error('Invalid encrypted notification link.');
  const decipher = createDecipheriv('aes-256-gcm', key(secret), nonce);
  decipher.setAuthTag(auth);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
