import { describe, expect, it } from 'vitest';
import { normalizeCart, addCartItem, changeCartQuantity, type CartItem } from './cart-state';
import {
  safeInternalPath,
  secureOrderToken,
  embeddedInvoice,
  deliveryQuoteTotal,
} from './client-values';
const item: CartItem = {
  variant_id: '11111111-1111-4111-8111-111111111111',
  product_id: '22222222-2222-4222-8222-222222222222',
  slug: 'training-shirt',
  name: 'Training shirt',
  sku: 'TS-M-BLK',
  size: 'M',
  color: 'Black',
  image: 'https://example.com/shirt.jpg',
  price: 12000,
  quantity: 2,
  available: 10,
};
describe('persistent cart boundaries', () => {
  it('rejects malformed local records without losing valid entries', () => {
    expect(
      normalizeCart([
        null,
        item,
        { ...item, variant_id: 'not-a-variant' },
        { ...item, price: -5 },
        { ...item, quantity: NaN },
      ]),
    ).toEqual([item]);
  });
  it('merges duplicate SKUs and caps quantities to the latest known stock', () => {
    expect(
      normalizeCart([
        { ...item, quantity: 7 },
        { ...item, quantity: 2, available: 3 },
      ]),
    ).toEqual([{ ...item, quantity: 3, available: 3 }]);
  });
  it('prevents nonfinite totals and removes unsafe image schemes', () => {
    expect(normalizeCart([{ ...item, price: Infinity }])).toEqual([]);
    expect(normalizeCart([{ ...item, image: 'javascript:alert(1)' }])[0].image).toBeNull();
  });
  it('repeated adds respect stock and whole quantity limits', () => {
    expect(addCartItem([{ ...item, quantity: 9 }], item)[0].quantity).toBe(10);
    expect(changeCartQuantity([item], item.variant_id, 3.8)[0].quantity).toBe(3);
    expect(changeCartQuantity([item], item.variant_id, NaN)).toEqual([item]);
  });
});
describe('account and guest navigation boundaries', () => {
  it('preserves package selection while rejecting redirect escapes', () => {
    expect(safeInternalPath('/account?package=abc')).toBe('/account?package=abc');
    for (const value of [
      '//evil.test',
      '/\\evil.test',
      '/%5c%5cevil.test',
      'https://evil.test',
      '/%252f%252fevil.test',
    ])
      expect(safeInternalPath(value)).toBe('/account');
  });
  it('accepts secure links without treating order numbers as private tokens', () => {
    const token = 'a'.repeat(64);
    expect(secureOrderToken(`https://ascend.test/order-status/${token}?source=whatsapp`)).toBe(
      token,
    );
    expect(secureOrderToken('ASC-000001')).toBeNull();
  });
  it('supports actual one-to-one invoice objects and older array responses', () => {
    const invoice = { id: 'invoice', outstanding_amount: 30000 };
    expect(embeddedInvoice(invoice)).toBe(invoice);
    expect(embeddedInvoice([invoice])).toBe(invoice);
    expect(embeddedInvoice(null)).toBeUndefined();
  });
});
describe('delivery quote review', () => {
  it('shows the proposed merchandise plus delivery total before the invoice is payable', () => {
    expect(deliveryQuoteTotal('30000', '4500')).toBe(34500);
    expect(deliveryQuoteTotal(30000, 0)).toBe(30000);
  });
  it('does not invent a zero total when quote fields are absent or invalid', () => {
    for (const fee of [null, undefined, '', ' ', true, NaN, Infinity, -1])
      expect(deliveryQuoteTotal(30000, fee)).toBeNull();
    expect(deliveryQuoteTotal(null, 4500)).toBeNull();
  });
});
