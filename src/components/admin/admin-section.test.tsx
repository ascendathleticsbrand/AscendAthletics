// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminRecord } from './admin-config';

vi.mock('next/link', () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    createElement('a', props, children),
}));
import { AdminSection } from './admin-section';

const fetchMock = vi.fn();
let container: HTMLDivElement;
let root: Root;
const summary = {
  verifiedReceipts: 17000,
  outstandingBalances: 15000,
  pendingOrders: 2,
  activeClients: 1,
};
function order(id: string, paymentStatus: string): AdminRecord {
  return {
    id,
    order_number: id,
    customer_name: 'Test Athlete',
    created_at: '2026-10-18T10:00:00Z',
    fulfillment_status: 'pending',
    total_amount: 17000,
    invoices: [{ payment_status: paymentStatus }],
  };
}
function response(
  page: number,
  records: AdminRecord[] = [order('ASC-100', 'pending')],
  totalRecords = 30,
) {
  return {
    role: 'owner',
    page,
    pageSize: 10,
    totalRecords,
    totalPages: Math.max(1, Math.ceil(totalRecords / 10)),
    records,
    summary,
    references: {},
  };
}
async function render(section = 'overview', page = 1) {
  await act(async () => {
    root.render(createElement(AdminSection, { section, data: response(page) }));
  });
}
function element<T extends Element = HTMLSelectElement>(selector: string): T {
  const found = container.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });
}
async function select(selector: string, value: string) {
  await act(async () => {
    const selectElement = element<HTMLSelectElement>(selector);
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
      selectElement,
      value,
    );
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}
async function click(selector: string) {
  await act(async () => {
    element<HTMLButtonElement>(selector).click();
  });
  await settle();
}
function lastQuery() {
  return new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'http://localhost').searchParams;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const query = new URL(url, 'http://localhost').searchParams;
    return { ok: true, json: async () => ({ data: response(Number(query.get('page'))) }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('overview payment status filter', () => {
  it('offers the requested options next to recent orders with a visible accessible label', async () => {
    await render();
    const filter = element<HTMLSelectElement>('#overview-payment-filter');
    const label = element<HTMLLabelElement>('label[for="overview-payment-filter"]');
    expect(label.textContent).toBe('Payment status');
    expect(label.className).not.toContain('admin-sr-only');
    expect(filter.value).toBe('all');
    expect([...filter.options].map((option) => [option.value, option.textContent])).toEqual([
      ['all', 'All payments'],
      ['outstanding', 'Outstanding'],
      ['paid', 'Paid'],
      ['pending', 'Pending'],
    ]);
    expect(filter.closest('.admin-data-panel')?.querySelector('h2')?.textContent).toContain(
      'Recent orders',
    );
    expect(container.textContent).toContain(
      'Payment filters apply to this list; summary cards keep the reporting period.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['outstanding', 'paid', 'pending'])(
    'requests the full %s result set from page one',
    async (paymentFilter) => {
      await render('overview', 3);
      await select('#overview-payment-filter', paymentFilter);
      expect(lastQuery().get('section')).toBe('overview');
      expect(lastQuery().get('paymentFilter')).toBe(paymentFilter);
      expect(lastQuery().get('page')).toBe('1');
      expect(lastQuery().get('pageSize')).toBe('10');
      expect(container.textContent).toContain('Page 1 of 3');
    },
  );

  it('shows all server-selected pending and evidence-submitted rows with the server count', async () => {
    await render();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: response(
          1,
          [order('ASC-PENDING', 'pending'), order('ASC-EVIDENCE', 'evidence_submitted')],
          27,
        ),
      }),
    });
    await select('#overview-payment-filter', 'pending');
    expect(element('tbody').textContent).toContain('ASC-PENDING');
    expect(element('tbody').textContent).toContain('ASC-EVIDENCE');
    expect(element('.admin-result-count').textContent).toBe('27 results');
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(element('.admin-metric-grid').textContent).toContain('17,000');
  });

  it('keeps payment status when searching, changing the reporting period, refreshing and paging', async () => {
    await render();
    await select('#overview-payment-filter', 'paid');
    await act(async () => {
      const input = element<HTMLInputElement>('#search-overview');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Ada');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    await select('#reporting-range', '7days');
    const apply = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Apply',
    );
    if (!apply) throw new Error('Missing reporting apply button');
    await act(async () => {
      apply.click();
    });
    await settle();
    await click('button[aria-label="Refresh workspace records"]');
    expect(lastQuery().get('paymentFilter')).toBe('paid');
    expect(lastQuery().get('search')).toBe('Ada');
    expect(lastQuery().get('range')).toBe('7days');
    await click('button[aria-label="Next page"]');
    expect(lastQuery().get('paymentFilter')).toBe('paid');
    expect(lastQuery().get('search')).toBe('Ada');
    expect(lastQuery().get('range')).toBe('7days');
    expect(lastQuery().get('page')).toBe('2');
  });

  it('clears an empty filtered result back to all payments on page one', async () => {
    await render('overview', 3);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: response(1, [], 0) }) });
    await select('#overview-payment-filter', 'outstanding');
    expect(container.textContent).toContain('No matching records');
    const clear = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Clear filters',
    );
    if (!clear) throw new Error('Missing clear filters button');
    await act(async () => {
      clear.click();
    });
    await settle();
    expect(lastQuery().get('paymentFilter')).toBe('all');
    expect(lastQuery().get('page')).toBe('1');
    expect(element<HTMLSelectElement>('#overview-payment-filter').value).toBe('all');
    expect(container.textContent).not.toContain('No matching records');
  });

  it('preserves the existing detailed payment status choices in Orders', async () => {
    await render('orders', 2);
    expect(container.querySelector('#overview-payment-filter')).toBeNull();
    const filter = element<HTMLSelectElement>('#order-payment-filter');
    expect([...filter.options].map((option) => option.value)).toEqual([
      'all',
      'pending',
      'evidence_submitted',
      'partially_paid',
      'paid',
      'rejected',
      'refunded',
    ]);
    await select('#order-payment-filter', 'partially_paid');
    expect(lastQuery().get('section')).toBe('orders');
    expect(lastQuery().get('paymentFilter')).toBe('partially_paid');
    expect(lastQuery().get('page')).toBe('1');
  });
});
