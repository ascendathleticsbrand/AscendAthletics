// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicSettings } from '../../lib/backend/types';

const mocks = vi.hoisted(() => ({ api: vi.fn(), clear: vi.fn(), replace: vi.fn() }));
vi.mock('./request', () => ({ api: mocks.api }));
vi.mock('./cart-context', () => ({
  useCart: () => ({
    ready: true,
    subtotal: 17000,
    clear: mocks.clear,
    items: [
      {
        variant_id: '11111111-1111-4111-8111-111111111111',
        name: 'Compression Shirt',
        price: 17000,
        quantity: 1,
        size: 'L',
        color: 'Black',
      },
    ],
  }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement('a', props, children),
}));
import { CheckoutForm } from './checkout-form';

const token = 'a'.repeat(64);
let container: HTMLDivElement;
let root: Root;
async function render(settings: PublicSettings = {}, configured = true) {
  await act(async () => {
    root.render(createElement(CheckoutForm, { settings, configured }));
  });
}
function field<T extends Element = HTMLInputElement>(selector: string) {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Missing field ${selector}`);
  return element;
}
async function choose(method: 'pickup' | 'delivery') {
  await act(async () => {
    field<HTMLInputElement>(`input[name="method"][value="${method}"]`).click();
  });
}
async function fill(name: string, value: string) {
  await act(async () => {
    const element = field<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      `[name="${name}"]`,
    );
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}
async function customer() {
  await fill('name', 'Test Athlete');
  await fill('email', 'athlete@example.test');
  await fill('phone', '08001112222');
  await act(async () => {
    field<HTMLInputElement>('input[type="checkbox"]').click();
  });
}
async function delivery() {
  for (const [name, value] of Object.entries({
    recipient_name: 'Test Athlete',
    recipient_phone: '08001112222',
    state: 'Lagos',
    city: 'Lagos',
    area: 'Ikeja',
    address: '10 Test Road',
    landmark: 'Test landmark',
  }))
    await fill(name, value);
}
async function submit() {
  await act(async () => {
    field<HTMLFormElement>('form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  });
}

beforeEach(() => {
  mocks.api.mockReset();
  mocks.clear.mockClear();
  mocks.replace.mockClear();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('checkout fulfillment choices', () => {
  it('starts without a selection and lets a customer switch both ways when pickup is not configured', async () => {
    await render();
    const pickup = field<HTMLInputElement>('input[value="pickup"]');
    const nationwide = field<HTMLInputElement>('input[value="delivery"]');
    expect(pickup.checked).toBe(false);
    expect(nationwide.checked).toBe(false);
    expect(pickup.disabled).toBe(false);
    expect(nationwide.disabled).toBe(false);
    await choose('delivery');
    expect(nationwide.checked).toBe(true);
    expect(pickup.checked).toBe(false);
    await choose('pickup');
    expect(pickup.checked).toBe(true);
    expect(nationwide.checked).toBe(false);
    await choose('delivery');
    expect(nationwide.checked).toBe(true);
  });
  it('requires an explicit delivery choice before calling checkout', async () => {
    await render({ pickup_location: 'Test pickup location' });
    await customer();
    await submit();
    expect(mocks.api).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Choose pickup or nationwide delivery.');
  });
  it('explains missing pickup setup and blocks order creation without forcing delivery', async () => {
    await render();
    await customer();
    await choose('pickup');
    await submit();
    expect(field<HTMLInputElement>('input[value="pickup"]').checked).toBe(true);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(field('[role="alert"]').textContent).toContain('Pickup needs a confirmed location');
    const arrange = field<HTMLAnchorElement>('a[href^="https://wa.me/"]');
    expect(arrange.textContent).toContain('Arrange pickup');
  });
  it('keeps a typed delivery address while switching to pickup and back', async () => {
    await render({ pickup_location: 'Test pickup location' });
    await choose('delivery');
    await delivery();
    await choose('pickup');
    expect(field<HTMLFieldSetElement>('.delivery-address').hidden).toBe(true);
    expect(field<HTMLFieldSetElement>('.delivery-address').disabled).toBe(true);
    await choose('delivery');
    expect(field<HTMLFieldSetElement>('.delivery-address').hidden).toBe(false);
    expect(field<HTMLInputElement>('[name="address"]').value).toBe('10 Test Road');
    expect(field<HTMLSelectElement>('[name="state"]').value).toBe('Lagos');
    expect(field<HTMLInputElement>('[name="landmark"]').value).toBe('Test landmark');
  });
  it('posts only pickup fields, clears the bag after success and replaces checkout with its secure WhatsApp handoff page', async () => {
    mocks.api.mockResolvedValueOnce({ guest_token: token });
    await render({ pickup_location: 'Test pickup location' });
    await customer();
    await choose('pickup');
    await submit();
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith('/api/checkout', {
      customer: { name: 'Test Athlete', phone: '08001112222', email: 'athlete@example.test' },
      items: [{ variant_id: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
      fulfillment_method: 'pickup',
    });
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(`/order-status/${token}?whatsapp=1`);
    expect(mocks.api.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clear.mock.invocationCallOrder[0],
    );
  });
  it('retains the bag and entered delivery details after an API error', async () => {
    mocks.api.mockRejectedValueOnce(new Error('Insufficient stock for this size'));
    await render();
    await customer();
    await choose('delivery');
    await delivery();
    await submit();
    expect(field('[role="alert"]').textContent).toContain('Insufficient stock for this size');
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(field<HTMLInputElement>('[name="address"]').value).toBe('10 Test Road');
    expect(field<HTMLButtonElement>('button').disabled).toBe(false);
  });
  it('makes only one order while repeated submit events arrive before the API response', async () => {
    let resolve!: (value: { guest_token: string }) => void;
    mocks.api.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await render();
    await customer();
    await choose('delivery');
    await delivery();
    await act(async () => {
      const form = field<HTMLFormElement>('form');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(field<HTMLButtonElement>('button').disabled).toBe(true);
    expect(mocks.api.mock.calls[0][1]).toMatchObject({
      fulfillment_method: 'delivery',
      delivery_details: {
        recipient_name: 'Test Athlete',
        phone: '08001112222',
        state: 'Lagos',
        city: 'Lagos',
        area: 'Ikeja',
        address: '10 Test Road',
        landmark: 'Test landmark',
      },
    });
    await act(async () => {
      resolve({ guest_token: token });
    });
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });
  it('does not resubmit an order saved without a valid private link', async () => {
    mocks.api.mockResolvedValueOnce({ guest_token: 'invalid' });
    await render({ pickup_location: 'Test pickup location' });
    await customer();
    await choose('pickup');
    await submit();
    expect(field('[role="alert"]').textContent).toContain('Your order was saved');
    expect(field<HTMLButtonElement>('button').disabled).toBe(true);
    await submit();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
