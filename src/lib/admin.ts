import 'server-only';
/** Loads staff dashboard records, filters, reference lists and summary totals, then removes private fields before returning data. */
import { publicImageUrl } from './storage/image-urls';
import { z } from 'zod';
import { getAdminContext, requireStaff } from './auth';
import { createAdminClient } from './supabase/admin';
import { hasServiceConfig, setupMessage } from './env';
import { businessDate } from './backend/business';
import {
  adminListOptionsSchema,
  adminFilters,
  adminSearchFilter,
  type AdminListOptions,
} from './backend/admin-list';
const sections: Record<string, { table: string; select?: string }> = {
  products: {
    table: 'products',
    select: '*,categories(name),product_variants(*),product_images(*)',
  },
  inventory: { table: 'product_variants', select: '*,products(name)' },
  orders: { table: 'orders', select: '*,invoices(*),order_items(*),order_notes(*)' },
  customers: { table: 'customers' },
  clients: {
    table: 'coaching_enrollments',
    select: '*,customers(name,email,phone),invoices(*),coaching_enrollment_notes(*)',
  },
  packages: { table: 'coaching_packages' },
  payments: { table: 'payments', select: '*,invoices(*),payment_evidence(*)' },
  finances: { table: 'payments', select: '*,invoices(*)' },
  marketing: { table: 'campaigns', select: '*,campaign_recipients(subscriber_id,status)' },
  content: { table: 'site_content' },
  settings: { table: 'business_settings' },
  overview: { table: 'orders', select: '*,invoices(*)' },
};
// Never return private link secrets; purchasing costs are visible only to the owner.
function sanitize(value: any, owner: boolean): any {
  if (Array.isArray(value)) return value.map((v) => sanitize(v, owner));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !['guest_token_hash', 'unsubscribe_token_hash', 'guest_token_encrypted'].includes(
              key,
            ) &&
            (owner || !['cost_price', 'unit_cost'].includes(key)),
        )
        .map(([k, v]) => [k, sanitize(v, owner)]),
    );
  return value;
}
function decorate(row: any): any {
  if (Array.isArray(row)) return row.map(decorate);
  if (row && typeof row === 'object') {
    const next = Object.fromEntries(Object.entries(row).map(([k, v]) => [k, decorate(v)]));
    if (Array.isArray(next.product_images))
      next.images = next.product_images.map((i: any) => publicImageUrl(i.storage_path));
    if (Array.isArray(next.product_variants))
      next.stock_available = next.product_variants.reduce(
        (sum: number, variant: any) => sum + Number(variant.stock_available || 0),
        0,
      );
    if (Array.isArray(next.order_items))
      next.items_summary = next.order_items
        .map((item: any) => `${item.product_name || 'Item'} × ${item.quantity}`)
        .join(', ');
    if (Array.isArray(next.campaign_recipients))
      next.subscriber_ids = next.campaign_recipients.map((r: any) => r.subscriber_id);
    if (Array.isArray(next.collection_products))
      next.product_ids = next.collection_products.map((r: any) => r.product_id);
    return next;
  }
  return row;
}

// Prefer one database aggregation; older schemas fall back to reading every confirmed-stock page.
async function inventoryTotals(db: ReturnType<typeof createAdminClient>, actor: string) {
  const summary = await db.rpc('inventory_summary', { p_actor: actor });
  if (!summary.error && summary.data)
    return {
      physical: Number(summary.data.physical_stock),
      reserved: Number(summary.data.reserved_stock),
      available: Number(summary.data.available_stock),
      sold: Number(summary.data.sold_stock),
    };
  if (summary.error && !['PGRST202', '42883'].includes(summary.error.code))
    throw new Error('Inventory totals could not be loaded.');
  const totals = { physical: 0, reserved: 0, available: 0, sold: 0 };
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from('product_variants')
      .select('stock_on_hand,stock_reserved,stock_available,stock_sold')
      .not('stock_confirmed_at', 'is', null)
      .order('id')
      .range(offset, offset + 499);
    if (error) throw new Error('Inventory totals could not be loaded.');
    for (const row of data || []) {
      totals.physical += Number(row.stock_on_hand);
      totals.reserved += Number(row.stock_reserved);
      totals.available += Number(row.stock_available);
      totals.sold += Number(row.stock_sold);
    }
    if (!data || data.length < 500) return totals;
  }
}
export async function getAdminData(section = 'overview', options: AdminListOptions = {}) {
  const context = await getAdminContext();
  const paging = adminListOptionsSchema.parse(options);
  const empty = {
    records: [],
    summary: {},
    references: {},
    role: context.role,
    permissions: context.permissions,
    page: paging.page,
    pageSize: paging.pageSize,
    totalRecords: 0,
    totalPages: 1,
    setupRequired: context.setupRequired,
    error: context.error,
  };
  if (context.setupRequired || !context.user || !context.role) return empty;
  if (!hasServiceConfig()) return { ...empty, setupRequired: true, error: setupMessage };
  // Establish the staff role before using the service client, which can read beyond customer row policies.
  const { user, role } = await requireStaff();
  const db = createAdminClient();
  const owner = role === 'owner';
  const { error: expiryError } = await db.rpc('expire_enrollments');
  if (expiryError)
    return {
      ...empty,
      setupRequired: true,
      error: 'Apply the latest coaching expiry migration to load the dashboard.',
    };
  const config = sections[section] || sections.overview;
  const filterOrderPayments =
    ['overview', 'orders'].includes(section) && paging.paymentFilter !== 'all';
  const selection = filterOrderPayments
    ? (config.select || '*').replace('invoices(*)', 'invoices!inner(*)')
    : config.select || '*';
  let recordQuery = db.from(config.table).select(selection, { count: 'exact' });
  if (section === 'products' && paging.categoryId)
    recordQuery = recordQuery.eq('category_id', paging.categoryId);
  const filter = adminFilters[section];
  if (filter && filter.values.includes(paging.filter))
    recordQuery = recordQuery.eq(filter.column, paging.filter);
  const searchFilter = adminSearchFilter(section, paging.search);
  if (paging.search && searchFilter) recordQuery = recordQuery.or(searchFilter);
  if (filterOrderPayments) {
    // The inner invoice join filters parent orders before exact counting and pagination.
    if (paging.paymentFilter === 'outstanding')
      recordQuery = recordQuery
        .gt('invoices.outstanding_amount', 0)
        .neq('invoices.payment_status', 'refunded')
        .neq('fulfillment_status', 'cancelled');
    else if (section === 'overview' && paging.paymentFilter === 'pending')
      recordQuery = recordQuery.in('invoices.payment_status', ['pending', 'evidence_submitted']);
    else recordQuery = recordQuery.eq('invoices.payment_status', paging.paymentFilter);
  }
  if (section === 'inventory') {
    if (paging.stockFilter === 'unconfirmed')
      recordQuery = recordQuery.is('stock_confirmed_at', null);
    else if (paging.stockFilter === 'low_stock') recordQuery = recordQuery.eq('is_low_stock', true);
    else if (paging.stockFilter === 'available')
      recordQuery = recordQuery.not('stock_confirmed_at', 'is', null).gt('stock_available', 0);
  }
  const sort =
    config.table === 'business_settings'
      ? 'id'
      : config.table === 'site_content'
        ? 'updated_at'
        : 'created_at';
  recordQuery = recordQuery.order(sort, { ascending: false });
  if (sort !== 'id') recordQuery = recordQuery.order('id', { ascending: false });
  let page = paging.page;
  let recordResult =
    ['finances', 'settings'].includes(section) && !owner
      ? { data: [], error: null, count: 0 }
      : await recordQuery.range((page - 1) * paging.pageSize, page * paging.pageSize - 1);
  const totalRecords = recordResult.count || 0,
    totalPages = Math.max(1, Math.ceil(totalRecords / paging.pageSize));
  if (
    !recordResult.error &&
    page > totalPages &&
    !(['finances', 'settings'].includes(section) && !owner)
  ) {
    page = totalPages;
    recordResult = await recordQuery.range(
      (page - 1) * paging.pageSize,
      page * paging.pageSize - 1,
    );
  }
  if (recordResult.error)
    return {
      ...empty,
      error:
        'The dashboard data could not be loaded. Apply the migrations and check staff permissions.',
    };
  // Reference lists populate form choices; they have separate limits from the paginated main table.
  const refTables = [
    'products',
    'product_variants',
    'categories',
    'coaching_packages',
    'customers',
    'invoices',
    'collections',
    'newsletter_subscribers',
    'delivery_rates',
    'stock_movements',
    'coaching_enrollments',
    'orders',
    'payments',
    'campaigns',
  ] as const;
  const refResults = await Promise.all(
    refTables.map((t) =>
      db
        .from(t)
        .select(
          t === 'products'
            ? '*,product_images(*)'
            : t === 'collections'
              ? '*,collection_products(*)'
              : '*',
          { count: 'exact' },
        )
        .limit(t === 'stock_movements' ? 100 : 500),
    ),
  );
  const references: Record<string, any[]> = {};
  refResults.forEach((r, i) => {
    references[refTables[i]] = r.data || [];
  });
  references.variants = references.product_variants;
  references.packages = references.coaching_packages;
  references.subscribers = references.newsletter_subscribers;
  references.enrollments = references.coaching_enrollments;
  references.business_settings = [];
  references.audit_logs = [];
  references.staff = [];
  references.profiles = [];
  references.expenses = [];
  references.refunds = [];
  if (owner) {
    const [staff, settings, audits, profiles, expenses, refunds] = await Promise.all([
      db.from('staff_roles').select('*,profiles(*)'),
      db.from('business_settings').select('*'),
      db.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
      db.from('profiles').select('*').limit(500),
      db.from('expenses').select('*').order('spent_on', { ascending: false }).limit(250),
      db.from('refunds').select('*').limit(250),
    ]);
    references.staff = staff.data || [];
    references.business_settings = settings.data || [];
    references.audit_logs = audits.data || [];
    references.profiles = profiles.data || [];
    references.expenses = expenses.data || [];
    references.refunds = refunds.data || [];
  }
  // Reporting dates use the business timezone so a server in another region selects the same business day.
  const today = businessDate(
    new Date(),
    references.business_settings[0]?.timezone || 'Africa/Lagos',
  );
  const date = z.iso.date();
  let from: string | null = null,
    to: string | null = null;
  if (options.range === 'custom') {
    from = date.parse(options.from);
    to = date.parse(options.to);
    if (from > to) throw new Error('Choose a valid date range.');
  } else if (options.range === 'today') {
    from = today;
    to = today;
  } else if (options.range === '7days') {
    from = new Date(Date.parse(today + 'T00:00:00Z') - 6 * 86400000).toISOString().slice(0, 10);
    to = today;
  } else if (options.range === 'month' || !options.range) {
    from = today.slice(0, 7) + '-01';
    to = today;
  } else {
    if (options.from) from = date.parse(options.from);
    if (options.to) to = date.parse(options.to);
  }
  let summary: Record<string, unknown> = {};
  if (owner) {
    const { data, error: se } = await db.rpc('financial_summary', {
      p_actor: user.id,
      p_from: from,
      p_to: to,
    });
    if (!se && data) summary = data;
  }
  const inSevenDays = new Date(Date.parse(today + 'T00:00:00Z') + 7 * 86400000)
    .toISOString()
    .slice(0, 10);
  const [
    active,
    pendingOrders,
    pendingPayments,
    unconfirmed,
    stock,
    lowStock,
    renewals,
    publishedProducts,
    draftProducts,
    completedOrders,
  ] = await Promise.all([
    db
      .from('coaching_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active'),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('fulfillment_status', ['pending', 'processing', 'ready_for_pickup', 'shipped']),
    db
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'evidence_submitted']),
    db
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .is('stock_confirmed_at', null),
    inventoryTotals(db, user.id),
    db
      .from('product_variants')
      .select('id', { count: 'exact', head: true })
      .eq('is_low_stock', true),
    db
      .from('coaching_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .gte('expiry_date', today)
      .lte('expiry_date', inSevenDays),
    db.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('products').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    db
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('fulfillment_status', ['delivered', 'picked_up']),
  ]);

  summary = {
    ...summary,
    verifiedReceipts: summary.total_recorded_receipts,
    merchandiseRevenue: summary.merchandise_revenue,
    coachingRevenue: summary.coaching_revenue,
    outstandingBalances: summary.outstanding_balances,
    receiptSeries: summary.revenue_over_time,
    productSales: summary.sales_by_product,
    packageIncome: summary.income_by_package,
    totalProducts: refResults[0].count,
    publishedProducts: publishedProducts.count,
    draftProducts: draftProducts.count,
    completedOrders: completedOrders.count,
    totalCustomers: refResults[4].count,
    activeClients: active.count,
    pendingOrders: pendingOrders.count,
    pendingPayments: pendingPayments.count,
    unconfirmedStock: unconfirmed.count,
    physical_stock: stock.physical,
    reserved_stock: stock.reserved,
    available_stock: stock.available,
    sold_stock: stock.sold,
    lowStockVariants: lowStock.count,
    low_stock: lowStock.count,
    upcomingRenewals: renewals.count,
  };
  return sanitize(
    decorate({
      records: recordResult.data || [],
      summary,
      references,
      role,
      permissions: context.permissions,
      page,
      pageSize: paging.pageSize,
      totalRecords,
      totalPages,
      setupRequired: false,
      error: refResults.some((r) => r.error)
        ? 'Some supporting records could not be loaded.'
        : undefined,
      reportingPeriod: { from, to },
    }),
    owner,
  );
}
