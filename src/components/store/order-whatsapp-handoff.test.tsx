// @vitest-environment happy-dom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderWhatsAppHandoff } from './order-whatsapp-handoff';
import type { OrderWhatsAppSnapshot } from './order-whatsapp';

const token = 'b'.repeat(64);
function snapshot(): OrderWhatsAppSnapshot {
  return {
    order: {
      order_number: 'ASC-TEST-001',
      customer_name: 'Test Athlete',
      customer_phone: '08001112222',
      fulfillment_method: 'pickup',
      delivery_status: 'approved',
      subtotal: 17000,
      delivery_fee: 0,
    },
    invoice: {
      id: '22222222-2222-4222-8222-222222222222',
      total_amount: 17000,
      payment_status: 'pending',
    },
    items: [
      {
        product_name: 'Compression Shirt',
        size: 'L',
        color: 'Black',
        quantity: 1,
        unit_price: 17000,
      },
    ],
    bank_details: { pickup_location: 'Test pickup location' },
  };
}
let container: HTMLDivElement;
let root: Root;
let navigate: ReturnType<typeof vi.spyOn>;
async function render(
  props: { autoOpen?: boolean; businessNumber?: string; snapshot?: OrderWhatsAppSnapshot } = {},
  strict = false,
) {
  await act(async () => {
    const element = createElement(OrderWhatsAppHandoff, {
      snapshot: props.snapshot ?? snapshot(),
      token,
      ...props,
    });
    root.render(strict ? createElement(StrictMode, null, element) : element);
  });
}
function link() {
  const anchor = container.querySelector<HTMLAnchorElement>('a');
  if (!anchor) throw new Error('Missing WhatsApp fallback');
  return anchor;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({ testing: true }, '', `/order-status/${token}?whatsapp=1`);
  navigate = vi.spyOn(window.location, 'assign').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('saved order WhatsApp handoff', () => {
  it('consumes the one-time intent before opening WhatsApp and survives Strict Mode and rerenders without another redirect', async () => {
    const replace = vi.spyOn(window.history, 'replaceState');
    await render({ autoOpen: true }, true);
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      { testing: true },
      '',
      `/order-status/${token}`,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(replace.mock.invocationCallOrder[0]).toBeLessThan(navigate.mock.invocationCallOrder[0]);
    expect(window.location.search).toBe('');
    const url = new URL(String(navigate.mock.calls[0][0]));
    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/2349130607719');
    const text = url.searchParams.get('text')!;
    expect(text).toContain('Order: ASC-TEST-001');
    expect(text).toContain('Invoice: 22222222-2222-4222-8222-222222222222');
    expect(text).toContain(`${window.location.origin}/order-status/${token}`);
    await render({ autoOpen: true }, true);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(link().href).toBe(url.href);
    expect(container.textContent).toContain('press Send');
  });
  it('keeps a manual WhatsApp link for existing orders without navigating automatically', async () => {
    await render({ businessNumber: '+234 812 345 6789' });
    expect(navigate).not.toHaveBeenCalled();
    expect(new URL(link().href).pathname).toBe('/2348123456789');
    expect(link().textContent).toContain('Send invoice on WhatsApp');
    expect(link().target).toBe('_blank');
    expect(link().rel).toContain('noopener');
  });
  it('retains the manual fallback when the browser cannot launch WhatsApp', async () => {
    navigate.mockImplementationOnce(() => {
      throw new Error('External navigation unavailable');
    });
    await render({ autoOpen: true });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Use the WhatsApp button below',
    );
    expect(link().href).toContain('https://wa.me/2349130607719?text=');
    expect(window.location.search).toBe('');
  });
  it('copies the private saved-order URL without opening or sending a WhatsApp message', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await render();
    const button = container.querySelector<HTMLButtonElement>('button')!;
    await act(async () => {
      button.click();
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      `${window.location.origin}/order-status/${token}`,
    );
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Secure order link copied',
    );
    expect(navigate).not.toHaveBeenCalled();
  });
});
