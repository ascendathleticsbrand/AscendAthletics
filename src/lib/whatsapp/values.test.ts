import { describe, it, expect } from 'vitest';
import { normalizeWhatsAppPhone, hasWhatsAppPermission, currentRenewal } from './values';
describe('WhatsApp recipient permission and expiry checks', () => {
  it('normalizes Nigeria local and international numbers without guessing foreign prefixes', () => {
    expect(normalizeWhatsAppPhone('0913 060 7719')).toBe('2349130607719');
    expect(normalizeWhatsAppPhone('+44 7700 900123')).toBe('447700900123');
    expect(normalizeWhatsAppPhone('123')).toBeNull();
  });
  it('requires the matching phone and the correct category of permission', () => {
    const c = { phone: '09130607719' };
    const p = { phone: '2349130607719', reminders_opt_in: true, updates_opt_in: false };
    expect(hasWhatsAppPermission(c, p, 'renewal')).toBe(true);
    expect(hasWhatsAppPermission(c, p, 'broadcast')).toBe(false);
    expect(hasWhatsAppPermission({ phone: '09130607718' }, p, 'renewal')).toBe(false);
    expect(hasWhatsAppPermission(c, null, 'renewal')).toBe(false);
  });
  const message = { customer_id: 'a', expiry_date: '2026-10-26', reminder_day: 7 };
  const enrollment = { customer_id: 'a', expiry_date: '2026-10-26', status: 'active' };
  it('allows only the correct customer, expiry and business day', () => {
    expect(currentRenewal(message, enrollment, true, '2026-10-19')).toBe(true);
    expect(
      currentRenewal(message, { ...enrollment, expiry_date: '2026-11-26' }, true, '2026-10-19'),
    ).toBe(false);
    expect(currentRenewal(message, enrollment, true, '2026-10-20')).toBe(false);
    expect(currentRenewal(message, { ...enrollment, customer_id: 'b' }, true, '2026-10-19')).toBe(
      false,
    );
  });
  it('withdraws pending reminders when disabled or cancelled', () => {
    expect(currentRenewal(message, enrollment, false, '2026-10-19')).toBe(false);
    expect(
      currentRenewal(message, { ...enrollment, status: 'cancelled' }, true, '2026-10-19'),
    ).toBe(false);
  });
});
