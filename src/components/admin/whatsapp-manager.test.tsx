// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { WhatsAppManager } from './whatsapp-manager';
let root: Root;
let container: HTMLDivElement;
let data: any;
const fetchMock = vi.fn();
async function render() {
  await act(async () => {
    root.render(createElement(WhatsAppManager));
    await vi.advanceTimersByTimeAsync(300);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}
function button(text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  data = {
    configuration: {
      configured: false,
      updatesReady: false,
      remindersReady: false,
      message: 'Connect WhatsApp Business Platform',
    },
    settings: { reminders_enabled: false, reminder_days: [7, 2, 0], timezone: 'Africa/Lagos' },
    contacts: [
      {
        id: 'a',
        name: 'Allowed contact',
        phone: '2349130607719',
        updates_opt_in: true,
        reminders_opt_in: false,
        consent_phone_matches: true,
      },
      {
        id: 'b',
        name: 'No permission',
        phone: '2349130607718',
        updates_opt_in: false,
        reminders_opt_in: false,
        consent_phone_matches: false,
      },
    ],
    pagination: { page: 1, total: 2, totalPages: 1 },
    messages: [],
    totals: { pending: 0, accepted: 0, failed: 0, uncertain: 0 },
  };
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ ok: true, data }) });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('WhatsApp owner controls', () => {
  it('keeps sending and automatic activation disabled before connection', async () => {
    await render();
    expect(button('Send to').disabled).toBe(true);
    const enabled = [...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(
      (i) => i.parentElement?.textContent?.includes('Enable automatic'),
    )!;
    expect(enabled.disabled).toBe(true);
    expect(container.textContent).toContain('Africa/Lagos');
    expect(fetchMock.mock.calls.every((c) => !c[1]?.method)).toBe(true);
  });
  it('allows only explicit contact selections with permission', async () => {
    await render();
    const allowed = container.querySelector<HTMLInputElement>(
      '[aria-label="Select Allowed contact 2349130607719"]',
    )!;
    const denied = container.querySelector<HTMLInputElement>(
      '[aria-label="Select No permission 2349130607718"]',
    )!;
    expect(denied.disabled).toBe(true);
    await act(async () => allowed.click());
    expect(container.textContent).toContain('1 selected');
    expect(container.textContent).toContain('Example for Allowed contact');
    await act(async () => button('Clear selection').click());
    expect(container.textContent).toContain('0 selected');
    expect(fetchMock.mock.calls.every((c) => !c[1]?.method)).toBe(true);
  });
  it('requires a note and never infers permission from a saved phone', async () => {
    await render();
    await act(async () => button('Permission').click());
    expect(button('Save permission').disabled).toBe(true);
    expect(container.textContent).toContain('Saving a phone number does not grant permission');
  });
});

it('queues only the explicitly selected people from one reviewed send action', async () => {
  data.configuration = {
    configured: true,
    updatesReady: true,
    remindersReady: true,
    message: 'Connected',
  };
  data.contacts[1].updates_opt_in = true;
  data.contacts[1].consent_phone_matches = true;
  data.contacts.push({
    ...data.contacts[0],
    id: 'c',
    name: 'Unselected contact',
    phone: '2349130607717',
  });
  fetchMock.mockImplementation(async (_url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    const result =
      body?.action === 'broadcast'
        ? { queued: 2, skipped: 0 }
        : body?.action === 'process'
          ? { accepted: 2, failed: 0, uncertain: 0, remaining: 0 }
          : data;
    return { ok: true, json: async () => ({ ok: true, data: result }) };
  });
  await render();
  await act(async () => {
    container
      .querySelector<HTMLInputElement>('[aria-label="Select Allowed contact 2349130607719"]')!
      .click();
    container
      .querySelector<HTMLInputElement>('[aria-label="Select No permission 2349130607718"]')!
      .click();
  });
  await act(async () => {
    const input = container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'Training starts at 6 pm.',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const confirm = [...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(
    (i) => i.parentElement?.textContent?.includes('I reviewed'),
  )!;
  await act(async () => confirm.click());
  expect(button('Send to 2 selected').disabled).toBe(false);
  await act(async () => button('Send to 2 selected').click());
  const writes = fetchMock.mock.calls
    .filter((c) => c[1]?.body)
    .map((c) => JSON.parse(String(c[1].body)));
  expect(writes.filter((w) => w.action === 'broadcast')).toHaveLength(1);
  expect(writes.find((w) => w.action === 'broadcast').customer_ids).toEqual(['a', 'b']);
  expect(writes.filter((w) => w.action === 'process')).toHaveLength(1);
  expect(container.textContent).toContain('WhatsApp accepted 2');
});
