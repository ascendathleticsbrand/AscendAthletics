import { describe, it, expect } from 'vitest';
import { encryptPrivateToken, decryptPrivateToken } from './secure-token';
import { safeAuthNext } from './auth-next';
import { composeNotification } from './notification-template';
import { adminListOptionsSchema, adminSearchFilter } from './admin-list';
import { emailAttemptAllowed, emailQueueFilter } from './email-attempt';
const secret = 'private-encryption-key-with-at-least-32-characters';
const token = 'a'.repeat(48);
const encrypted = encryptPrivateToken(token, secret);
const settings = {
  bank_name: 'Real bank',
  bank_account_number: '1234567890',
  bank_account_holder: 'ASCEND',
};
const customer = { name: 'Buyer <script>alert(1)</script>' };
const invoice = { total_amount: 50000, outstanding_amount: 50000, payment_status: 'pending' };
describe('private notification links', () => {
  it('encrypts tokens with random nonces and authenticates ciphertext', () => {
    expect(encrypted).not.toContain(token);
    expect(decryptPrivateToken(encrypted, secret)).toBe(token);
    expect(encryptPrivateToken(token, secret)).not.toBe(encrypted);
    expect(() => decryptPrivateToken(encrypted, secret + 'wrong')).toThrow();
    const parts = encrypted.split('.');
    parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
    expect(() => decryptPrivateToken(parts.join('.'), secret)).toThrow();
  });
  it('rejects missing versions, malformed nonces and short secrets', () => {
    expect(() => encryptPrivateToken(token, 'short')).toThrow();
    expect(() => decryptPrivateToken('v1.a.b.c', secret)).toThrow();
    expect(() => decryptPrivateToken(encrypted + '.extra', secret)).toThrow();
  });
});
describe('safe authentication continuation', () => {
  it('retains local staff and coaching destinations', () => {
    expect(safeAuthNext('/admin/payments?filter=pending')).toBe('/admin/payments?filter=pending');
    expect(safeAuthNext('/account?enroll=abc')).toBe('/account?enroll=abc');
  });
  it('rejects external, malformed and unrelated redirect destinations', () => {
    for (const value of [
      '//evil.example',
      'https://evil.example',
      '/admin\\evil',
      '/admin\n',
      '/shop',
      '/admin/../../shop',
      null,
    ])
      expect(safeAuthNext(value)).toBe('/account');
  });
});
describe('transactional email composition', () => {
  it('renders a private guest confirmation with escaped customer names', () => {
    const message = composeNotification(
      {
        kind: 'order_created',
        payload: { order_number: 'ASC-REAL', guest_token_encrypted: encrypted },
        customers: customer,
        orders: { delivery_status: 'approved' },
        invoices: invoice,
      },
      settings,
      'https://ascend.example',
      secret,
    );
    expect(message.subject).toContain('ASC-REAL');
    expect(message.html).toContain('https://ascend.example/orders/' + token);
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain(settings.bank_account_number);
  });
  it('withholds bank instructions until the final delivery fee is approved', () => {
    const message = composeNotification(
      {
        kind: 'order_created',
        payload: { guest_token_encrypted: encrypted },
        orders: { delivery_status: 'quoted' },
        invoices: { total_amount: null, outstanding_amount: null },
      },
      settings,
      'https://ascend.example',
      secret,
    );
    expect(message.html).toContain('awaiting confirmation');
    expect(message.html).not.toContain(settings.bank_account_number);
  });
  it('does not invent a guest link when token persistence failed', () => {
    expect(() =>
      composeNotification(
        { kind: 'order_created', payload: {}, invoices: invoice },
        settings,
        'https://ascend.example',
        secret,
      ),
    ).toThrow('Private checkout link');
  });
  it('distinguishes coaching requests from activated coaching', () => {
    const request = composeNotification(
      { kind: 'enrollment_requested', payload: { package_name: 'Strength' }, invoices: invoice },
      settings,
      'https://ascend.example',
      secret,
    );
    expect(request.html).toContain('owner activation');
    expect(request.html).toContain('https://ascend.example/account');
    const active = composeNotification(
      {
        kind: 'enrollment_activated',
        payload: { package_name: 'Strength', start_date: '2026-10-13', expiry_date: '2026-11-13' },
      },
      settings,
      'https://ascend.example',
      secret,
    );
    expect(active.html).toContain('Your training is active');
    expect(active.html).toContain('2026-11-13');
  });
  it('confirms only the verified bank amount and retains a partial balance', () => {
    const message = composeNotification(
      {
        kind: 'payment_verified',
        payload: { amount_received: 20000, total_amount: 50000, outstanding_amount: 30000 },
        invoices: invoice,
        enrollment_id: 'real',
      },
      settings,
      'https://ascend.example',
      secret,
    );
    expect(message.html).toContain('20,000');
    expect(message.html).toContain('30,000');
    expect(message.html).toContain('confirmed separately');
    expect(() =>
      composeNotification(
        { kind: 'payment_verified', payload: {}, invoices: invoice },
        settings,
        'https://ascend.example',
        secret,
      ),
    ).toThrow();
  });
  it('renders reminders and fails closed for unknown notification types', () => {
    expect(
      composeNotification(
        {
          kind: 'renewal_7',
          coaching_enrollments: { package_name: 'Strength', expiry_date: '2026-11-13' },
        },
        settings,
        'https://ascend.example',
        secret,
      ).subject,
    ).toContain('reminder');
    expect(() =>
      composeNotification({ kind: 'unknown' }, settings, 'https://ascend.example', secret),
    ).toThrow();
  });
});
describe('durable email attempt windows and admin list boundaries', () => {
  it('allows new and recent attempts but prevents ambiguous retries after the provider window', () => {
    const now = new Date('2026-10-13T12:00:00Z');
    expect(emailAttemptAllowed(null, now)).toBe(true);
    expect(emailAttemptAllowed('2026-10-13T11:00:00Z', now)).toBe(true);
    expect(emailAttemptAllowed('2026-10-12T13:00:00Z', now)).toBe(false);
    expect(emailAttemptAllowed('invalid', now)).toBe(false);
    expect(emailQueueFilter(now)).toContain('first_attempt_at.gt.2026-10-12T13:00:00.000Z');
  });
  it('bounds paging and quotes search filter values', () => {
    expect(adminListOptionsSchema.parse({ page: '2', pageSize: '10' }).page).toBe(2);
    expect(adminListOptionsSchema.parse({ page: -2, pageSize: 100000 }).pageSize).toBe(25);
    const search = adminSearchFilter('customers', 'buyer,phone.eq.secret');
    expect(search).toContain('name.ilike."%buyer,phone.eq.secret%"');
    expect(adminSearchFilter('clients', 'Buyer')).toContain('coaching_enrollment_search.ilike');
  });
});
