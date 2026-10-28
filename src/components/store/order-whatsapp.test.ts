import { describe, expect, it } from 'vitest';
import { money } from '../../lib/format';
import {
  buildOrderWhatsApp,
  MAX_ORDER_WHATSAPP_URL_LENGTH,
  type OrderWhatsAppSnapshot,
} from './order-whatsapp';

const privateUrl = `https://ascend.example/order-status/${'a'.repeat(64)}`;
function snapshot(): OrderWhatsAppSnapshot {
  return {
    order: {
      order_number: 'ASC-000123',
      customer_name: 'Ada Athlete',
      customer_phone: '+234 800 111 2222',
      fulfillment_method: 'pickup',
      delivery_status: 'approved',
      subtotal: '34000',
      delivery_fee: '0',
    },
    invoice: {
      id: '11111111-1111-4111-8111-111111111111',
      total_amount: '34000',
      payment_status: 'pending',
      amount_paid: 0,
    },
    items: [
      {
        product_name: 'Red Graphic Compression Shirt',
        sku: 'ASC-COMP-RED-L',
        size: 'L',
        color: 'Black',
        quantity: 2,
        unit_price: '17000',
      },
    ],
    bank_details: { pickup_location: 'Owner-confirmed pickup location' },
  };
}

describe('WhatsApp order invoice handoff', () => {
  it('addresses the configured business and falls back to ASCEND for absent or invalid numbers', () => {
    const configured = buildOrderWhatsApp(snapshot(), privateUrl, '+234 812 345 6789');
    expect(new URL(configured.url).pathname).toBe('/2348123456789');
    for (const value of [undefined, null, '', 'bad-number', '0000000000'])
      expect(new URL(buildOrderWhatsApp(snapshot(), privateUrl, value).url).pathname).toBe(
        '/2349130607719',
      );
  });
  it('includes the saved invoice, customer, variant and actual saved line total', () => {
    const result = buildOrderWhatsApp(snapshot(), privateUrl);
    expect(result.message).toContain('Order: ASC-000123');
    expect(result.message).toContain('Invoice: 11111111-1111-4111-8111-111111111111');
    expect(result.message).toContain('Customer: Ada Athlete');
    expect(result.message).toContain('Phone: +234 800 111 2222');
    expect(result.message).toContain(
      `Red Graphic Compression Shirt · L / Black × 2 — ${money(34000)}`,
    );
    expect(result.message).toContain(`Merchandise subtotal: ${money(34000)}`);
    expect(result.message).toContain(`Total: ${money(34000)}`);
    expect(result.message).toContain('Pickup location: Owner-confirmed pickup location');
    expect(new URL(result.url).searchParams.get('text')).toBe(result.message);
    expect(result.message).toContain(privateUrl);
  });
  it('uses authoritative saved prices instead of an old bag price', () => {
    const saved = snapshot();
    saved.items![0].unit_price = 18500;
    saved.order.subtotal = 37000;
    saved.invoice.total_amount = 37000;
    const { message } = buildOrderWhatsApp(saved, privateUrl);
    expect(message).toContain(`× 2 — ${money(37000)}`);
    expect(message).toContain(`Total: ${money(37000)}`);
    expect(message).not.toContain(money(34000));
  });
  it('makes an unquoted delivery explicit without inventing a zero fee or payable total', () => {
    const saved = snapshot();
    saved.order = {
      ...saved.order,
      fulfillment_method: 'delivery',
      delivery_status: 'pending',
      delivery_fee: null,
      delivery_details: {
        recipient_name: 'Ada Athlete',
        phone: '08001112222',
        address: '10 Real Street',
        area: 'Ikeja',
        city: 'Lagos',
        state: 'Lagos',
        landmark: 'Near the square',
      },
    };
    saved.invoice.total_amount = null;
    const { message } = buildOrderWhatsApp(saved, privateUrl);
    expect(message).toContain('Receive order: Nationwide delivery');
    expect(message).toContain('Delivery address: 10 Real Street, Ikeja, Lagos, Lagos');
    expect(message).toContain('Landmark: Near the square');
    expect(message).toContain('Delivery fee: Awaiting delivery quote');
    expect(message).toContain('Total: Awaiting delivery quote');
    expect(message).not.toContain(`Delivery fee: ${money(0)}`);
    expect(message).not.toContain(`Total: ${money(34000)}`);
  });
  it('labels proposed delivery and keeps payment pending until owner verification', () => {
    const saved = snapshot();
    saved.order.fulfillment_method = 'delivery';
    saved.order.delivery_status = 'quoted';
    saved.order.delivery_fee = 4500;
    saved.invoice.total_amount = null;
    saved.invoice.payment_status = 'evidence_submitted';
    const { message } = buildOrderWhatsApp(saved, privateUrl);
    expect(message).toContain(`Delivery fee: ${money(4500)} (awaiting approval)`);
    expect(message).toContain('Total: Awaiting delivery quote approval');
    expect(message).toContain('Payment: Evidence submitted — awaiting owner verification');
    expect(message).not.toContain('Paid — owner verified');
    const pending = buildOrderWhatsApp(snapshot(), privateUrl).message;
    expect(pending).toContain('Payment: Pending — awaiting owner verification');
    const paid = snapshot();
    paid.invoice.payment_status = 'paid';
    expect(buildOrderWhatsApp(paid, privateUrl).message).toContain(
      'Payment: Paid — owner verified',
    );
  });
  it('requires a private absolute order link and allows loopback HTTP for local testing', () => {
    for (const url of [
      'javascript:alert(1)',
      '//evil.example/order-status/abc',
      'http://ascend.example/order-status/' + 'a'.repeat(64),
      'https://ascend.example/admin',
      'https://ascend.example/order-status/ASC-000123',
      'https://user:pass@ascend.example/order-status/' + 'a'.repeat(64),
    ])
      expect(() => buildOrderWhatsApp(snapshot(), url)).toThrow('secure order URL');
    const local = privateUrl.replace('https://ascend.example', 'http://localhost:3000');
    expect(buildOrderWhatsApp(snapshot(), local).message).toContain(local);
    expect(buildOrderWhatsApp(snapshot(), privateUrl + '?source=checkout#top').message).toContain(
      privateUrl,
    );
    expect(
      buildOrderWhatsApp(snapshot(), privateUrl + '?source=checkout#top').message,
    ).not.toContain('source=');
  });
  it('bounds a full large cart while retaining invoice totals, omitted count and private link', () => {
    const saved = snapshot();
    saved.items = Array.from({ length: 100 }, (_, i) => ({
      product_name: `Item ${i} ${'長'.repeat(140)}`,
      size: 'L',
      color: 'Black',
      quantity: 1,
      unit_price: 17000,
    }));
    saved.order.subtotal = 1700000;
    saved.invoice.total_amount = 1700000;
    const result = buildOrderWhatsApp(saved, privateUrl);
    expect(result.url.length).toBeLessThanOrEqual(MAX_ORDER_WHATSAPP_URL_LENGTH);
    const included = (result.message.match(/^• /gm) || []).length;
    expect(included).toBeGreaterThan(0);
    expect(included).toBeLessThan(100);
    expect(result.message).toContain(`+ ${100 - included} more item lines`);
    expect(result.message).toContain(`Total: ${money(1700000)}`);
    expect(result.message).toContain(privateUrl);
  });
  it('does not turn unavailable prices or totals into zero and prevents injected message lines', () => {
    const saved = snapshot();
    saved.order.customer_name = 'Ada\nPayment: Paid';
    saved.order.subtotal = null;
    saved.invoice.total_amount = null;
    saved.items![0].unit_price = null;
    const { message } = buildOrderWhatsApp(saved, privateUrl);
    expect(message).toContain('Customer: Ada Payment: Paid');
    expect(message).toContain('× 2 — Not confirmed');
    expect(message).toContain('Merchandise subtotal: Not confirmed');
    expect(message).toContain('Total: Not confirmed');
  });
});
