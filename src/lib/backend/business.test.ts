import { describe, it, expect } from 'vitest';
import {
  calendarMonthExpiry,
  businessDate,
  financialTotals,
  outstandingAmount,
  expiryReminderDue,
} from './business';
import { checkoutSchema, evidenceSchema, packageSchema } from './validation';
describe('coaching calendar months and Lagos reminders', () => {
  it('clamps month-end start dates without assuming thirty-day months', () => {
    expect(calendarMonthExpiry('2026-01-31', 1)).toBe('2026-02-28');
    expect(calendarMonthExpiry('2028-01-31', 1)).toBe('2028-02-29');
    expect(calendarMonthExpiry('2026-12-31', 2)).toBe('2027-02-28');
    expect(calendarMonthExpiry('2026-04-13', 1)).toBe('2026-05-13');
  });
  it('rejects malformed calendar dates', () => {
    expect(() => calendarMonthExpiry('2026-02-30', 1)).toThrow();
    expect(() => calendarMonthExpiry('2026-01-20', 0)).toThrow();
  });
  it('uses the Nigerian business day across UTC midnight', () => {
    expect(businessDate(new Date('2026-10-12T23:30:00Z'))).toBe('2026-10-13');
    expect(expiryReminderDue('2026-10-13', '2026-10-20', [7, 2, 0])).toBe(true);
    expect(expiryReminderDue('2026-10-13', '2026-10-19', [7, 2, 0])).toBe(false);
  });
});
describe('manual transfer accounting', () => {
  it('does not count an evidence submission as recorded receipts', () => {
    const totals = financialTotals(
      [
        { status: 'evidence_submitted', amount_received: 50000 },
        { status: 'verified', amount_received: 20000 },
      ],
      [{ amount: 5000 }],
      [{ amount: 3000 }],
    );
    expect(totals).toEqual({ recordedReceipts: 20000, refunds: 5000, expenses: 3000 });
    expect(outstandingAmount(50000, 20000)).toBe(30000);
  });
});
describe('checkout and enrollment boundaries', () => {
  const variant = '11111111-1111-4111-8111-111111111111';
  const base = {
    customer: { name: 'Test Buyer', email: 'test@example.com', phone: '+2349000000000' },
    items: [{ variant_id: variant, quantity: 2 }],
    fulfillment_method: 'pickup',
  };
  it('allows guests and rejects duplicated variants', () => {
    expect(checkoutSchema.safeParse(base).success).toBe(true);
    expect(
      checkoutSchema.safeParse({ ...base, items: [...base.items, ...base.items] }).success,
    ).toBe(false);
  });
  it('requires complete nationwide delivery details', () => {
    expect(checkoutSchema.safeParse({ ...base, fulfillment_method: 'delivery' }).success).toBe(
      false,
    );
  });
  it('cannot accept a negative or zero payment claim', () => {
    expect(evidenceSchema.safeParse({ amount: 0, transfer_reference: 'test-ref' }).success).toBe(
      false,
    );
  });
  it('requires session counts for paid bundles', () => {
    expect(
      packageSchema.safeParse({
        name: 'Test bundle',
        mode: 'online',
        price: 1000,
        billing_model: 'session_bundle',
      }).success,
    ).toBe(false);
  });
});
