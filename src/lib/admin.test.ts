import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  staff: vi.fn(),
  createAdmin: vi.fn(),
  configured: vi.fn(),
}));
vi.mock('./auth', () => ({ getAdminContext: mocks.context, requireStaff: mocks.staff }));
vi.mock('./supabase/admin', () => ({ createAdminClient: mocks.createAdmin }));
vi.mock('./env', () => ({
  hasServiceConfig: mocks.configured,
  setupMessage: 'Database setup required.',
}));

import { getAdminData } from './admin';

const ownerId = '22222222-2222-4222-8222-222222222222';
const staffContext = {
  user: { id: ownerId },
  role: 'owner',
  permissions: {},
  setupRequired: false,
};
type CapturedRequest = { url: URL; headers: Headers; method: string; body: unknown };
const requests: CapturedRequest[] = [];
const responses: { rows: Record<string, unknown>[]; count: number }[] = [];
const globalFinancials = { total_recorded_receipts: 200000, outstanding_balances: 75000 };

function order(id: string, paymentStatus: string, outstanding: number) {
  return {
    id,
    order_number: 'ASC-' + id,
    customer_name: 'Customer ' + id,
    fulfillment_status: 'pending',
    guest_token_hash: 'private-hash',
    invoices: [
      { id: 'invoice-' + id, payment_status: paymentStatus, outstanding_amount: outstanding },
    ],
  };
}
function recordRequests() {
  return requests.filter(
    (request) =>
      request.url.pathname.endsWith('/orders') &&
      request.url.searchParams.get('select')?.includes('invoices'),
  );
}
// Tests use the real Supabase/PostgREST builder. Only transport is mocked, so the
// join, database filters, pagination, exact count, and parent response shape are verified together.
async function databaseFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : input.toString());
  const headers = new Headers(init?.headers);
  const method = init?.method || 'GET';
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
  requests.push({ url, headers, method, body });
  let data: unknown = [];
  let count = 0;
  if (url.pathname.endsWith('/rpc/inventory_summary'))
    data = { physical_stock: 15, reserved_stock: 0, available_stock: 15, sold_stock: 0 };
  else if (url.pathname.endsWith('/rpc/financial_summary')) data = globalFinancials;
  else if (url.pathname.endsWith('/rpc/expire_enrollments')) data = null;
  else if (
    url.pathname.endsWith('/orders') &&
    url.searchParams.get('select')?.includes('invoices')
  ) {
    const response = responses.shift() || { rows: [], count: 0 };
    data = response.rows;
    count = response.count;
  }
  return new Response(method === 'HEAD' ? null : JSON.stringify(data), {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-range': `0-0/${count}` },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  requests.length = 0;
  responses.length = 0;
  mocks.context.mockResolvedValue(staffContext);
  mocks.staff.mockResolvedValue(staffContext);
  mocks.configured.mockReturnValue(true);
  const db = createClient('https://example.supabase.co', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: databaseFetch },
  });
  mocks.createAdmin.mockReturnValue(db);
});

describe('admin overview payment filters', () => {
  it('requests outstanding parent orders and exact counts before paging, while retaining global financial totals', async () => {
    responses.push({ rows: [order('partial', 'partially_paid', 5000)], count: 2 });
    const result = await getAdminData('overview', {
      paymentFilter: 'outstanding',
      page: 2,
      pageSize: 1,
      search: 'Customer',
    });
    const request = recordRequests()[0];
    const params = request.url.searchParams;
    expect(params.get('select')).toBe('*,invoices!inner(*)');
    expect(params.get('invoices.outstanding_amount')).toBe('gt.0');
    expect(params.get('invoices.payment_status')).toBe('neq.refunded');
    expect(params.get('fulfillment_status')).toBe('neq.cancelled');
    expect(params.get('or')).toContain('customer_name.ilike');
    expect(params.get('offset')).toBe('1');
    expect(params.get('limit')).toBe('1');
    expect(request.headers.get('prefer')).toContain('count=exact');
    expect(result.records.map((row: any) => row.id)).toEqual(['partial']);
    expect(result.records[0]).not.toHaveProperty('guest_token_hash');
    expect(result).toMatchObject({ page: 2, totalRecords: 2, totalPages: 2 });
    expect(result.summary).toMatchObject({ verifiedReceipts: 200000, outstandingBalances: 75000 });
    const financialRequest = requests.find((request) =>
      request.url.pathname.endsWith('/rpc/financial_summary'),
    );
    expect(financialRequest?.body).toMatchObject({ p_actor: ownerId });
    expect(financialRequest?.body).not.toHaveProperty('paymentFilter');
  });

  it('groups unpaid and submitted-evidence invoices under Pending without admitting unrelated parent orders', async () => {
    responses.push({
      rows: [order('unpaid', 'pending', 17000), order('proof', 'evidence_submitted', 15000)],
      count: 2,
    });
    const result = await getAdminData('overview', { paymentFilter: 'pending' });
    const params = recordRequests()[0].url.searchParams;
    expect(params.get('select')).toBe('*,invoices!inner(*)');
    expect(params.get('invoices.payment_status')).toBe('in.(pending,evidence_submitted)');
    expect(result.records.map((row: any) => row.id)).toEqual(['unpaid', 'proof']);
    expect(result.totalRecords).toBe(2);
  });

  it('filters Paid using the authoritative invoice status', async () => {
    responses.push({ rows: [order('paid', 'paid', 0)], count: 1 });
    const result = await getAdminData('overview', { paymentFilter: 'paid' });
    const params = recordRequests()[0].url.searchParams;
    expect(params.get('select')).toBe('*,invoices!inner(*)');
    expect(params.get('invoices.payment_status')).toBe('eq.paid');
    expect(params.has('invoices.outstanding_amount')).toBe(false);
    expect(result.records[0].invoices[0].payment_status).toBe('paid');
  });

  it.each(['all', 'unknown-status'])(
    'keeps %s unfiltered, including orders without invoices',
    async (paymentFilter) => {
      responses.push({ rows: [{ id: 'no-invoice', invoices: [] }], count: 8 });
      const result = await getAdminData('overview', { paymentFilter });
      const params = recordRequests()[0].url.searchParams;
      expect(params.get('select')).toBe('*,invoices(*)');
      expect(params.has('invoices.payment_status')).toBe(false);
      expect(params.has('invoices.outstanding_amount')).toBe(false);
      expect(params.has('fulfillment_status')).toBe(false);
      expect(result.records).toEqual([{ id: 'no-invoice', invoices: [] }]);
      expect(result.totalRecords).toBe(8);
    },
  );

  it("preserves the Orders section's exact Pending status and its independent fulfillment/search filters", async () => {
    responses.push({ rows: [order('pending', 'pending', 17000)], count: 1 });
    await getAdminData('orders', {
      paymentFilter: 'pending',
      filter: 'processing',
      search: 'Customer',
    });
    const request = requests.find(
      (request) =>
        request.url.pathname.endsWith('/orders') &&
        request.url.searchParams.get('select')?.includes('order_items'),
    )!;
    const params = request.url.searchParams;
    expect(params.get('select')).toContain('invoices!inner(*)');
    expect(params.get('invoices.payment_status')).toBe('eq.pending');
    expect(params.get('fulfillment_status')).toBe('eq.processing');
    expect(params.get('or')).toContain('customer_name.ilike');
  });

  it('returns an empty page when no orders match the selected payment filter', async () => {
    responses.push({ rows: [], count: 0 });
    await expect(getAdminData('overview', { paymentFilter: 'paid' })).resolves.toMatchObject({
      records: [],
      page: 1,
      totalRecords: 0,
      totalPages: 1,
      setupRequired: false,
    });
  });

  it('retains the selected payment filter when clamping an out-of-range page', async () => {
    responses.push({ rows: [], count: 1 }, { rows: [order('paid', 'paid', 0)], count: 1 });
    const result = await getAdminData('overview', { paymentFilter: 'paid', page: 5, pageSize: 25 });
    const matched = requests.filter(
      (request) =>
        request.url.pathname.endsWith('/orders') &&
        request.url.searchParams.get('select') === '*,invoices!inner(*)',
    );
    expect(matched).toHaveLength(2);
    expect(matched.map((request) => request.url.searchParams.get('offset'))).toEqual(['100', '0']);
    for (const request of matched)
      expect(request.url.searchParams.get('invoices.payment_status')).toBe('eq.paid');
    expect(result).toMatchObject({ page: 1, totalRecords: 1, totalPages: 1 });
    expect(result.records[0].id).toBe('paid');
  });

  it('requires staff access before making privileged overview requests', async () => {
    mocks.context.mockResolvedValueOnce({ ...staffContext, user: null, role: null });
    const result = await getAdminData('overview', { paymentFilter: 'outstanding' });
    expect(result.records).toEqual([]);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
    mocks.staff.mockRejectedValueOnce(new Error('Staff access required.'));
    await expect(getAdminData('overview', { paymentFilter: 'paid' })).rejects.toThrow(
      'Staff access required.',
    );
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });
});
