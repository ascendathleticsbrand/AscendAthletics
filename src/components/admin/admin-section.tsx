'use client';

// Interactive admin workspace: tables, server-side filters, action dialogs and record details.
// Screen definitions live in admin-config.ts; trusted reads and writes live behind /api/admin.

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Ellipsis,
  ExternalLink,
  Eye,
  FileClock,
  ImagePlus,
  Info,
  Layers3,
  Loader2,
  LockKeyhole,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Dumbbell,
  X,
} from 'lucide-react';
import { actions, sections, type Action, type AdminRecord, type Field } from './admin-config';

import { csvCell } from './admin-values';
import { CustomerQuickAdd } from './customer-quick-add';
import { WhatsAppManager } from './whatsapp-manager';
type AdminData = {
  page?: number;
  pageSize?: number;
  totalRecords?: number;
  totalPages?: number;
  permissions?: Record<string, boolean>;
  records?: AdminRecord[];
  summary?: Record<string, unknown>;
  references?: Record<string, AdminRecord[]>;
  role?: string | null;
  setupRequired?: boolean;
  error?: string;
  [key: string]: unknown;
};
// Display helpers normalize joined records and format money and dates for the workspace.
const money = (value: unknown) =>
  typeof value === 'number' || (typeof value === 'string' && value !== '')
    ? new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
      }).format(Number(value))
    : '—';
const human = (value: unknown) =>
  typeof value === 'string'
    ? value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : String(value ?? '—');
const dateLabel = (value: unknown) => {
  if (!value) return '—';
  const d = new Date(String(value));
  return Number.isNaN(d.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'Africa/Lagos',
      }).format(d);
};
function scalar(value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) return value.map(scalar).join(', ');
  if (typeof value === 'object') {
    const r = value as AdminRecord;
    return String(
      r.name ||
        r.full_name ||
        r.package_name ||
        r.order_number ||
        r.email ||
        r.sku ||
        Object.values(r)
          .filter((v) => typeof v === 'string')
          .slice(0, 2)
          .join(' · '),
    );
  }
  return String(value);
}
function recordValue(record: AdminRecord, key: string): unknown {
  if (record[key] !== undefined) return record[key];
  const invoice = Array.isArray(record.invoices)
    ? record.invoices[0]
    : record.invoices || record.invoice;
  if (key === 'payment_status') return (invoice as AdminRecord | undefined)?.payment_status;
  if (key === 'category') return record.categories || record.category_name;
  if (key === 'customer') return record.customers || record.customer_name;
  if (key === 'sessions_remaining')
    return record.session_count == null
      ? '—'
      : Math.max(0, Number(record.session_count) - Number(record.sessions_used || 0));
  if (key === 'description')
    return record.note || record.transfer_reference || record.action || record.name || record.event;
  if (key === 'amount') return record.amount_received || record.amount || record.submitted_amount;
  return undefined;
}
function selectLabel(r: AdminRecord) {
  return (
    String(
      r.name ||
        r.full_name ||
        r.order_number ||
        r.sku ||
        r.transfer_reference ||
        r.package_name ||
        r.subject ||
        r.email ||
        r.id,
    ) +
    (r.sku && r.name ? ` · ${r.sku}` : '') +
    (r.total_amount ? ` · ${money(r.total_amount)}` : '')
  );
}
// Reference lists populate related-record selectors without changing the saved record IDs.
function referencesFor(data: AdminData, section: string): Record<string, AdminRecord[]> {
  const refs = { ...(data.references || {}) };
  const rows = data.records || [];
  const mapping: Record<string, string> = {
    products: 'products',
    inventory: 'variants',
    orders: 'orders',
    customers: 'customers',
    clients: 'enrollments',
    packages: 'packages',
    payments: 'payments',
    marketing: 'campaigns',
  };
  if (mapping[section] && !refs[mapping[section]]) refs[mapping[section]] = rows;
  for (const name of [
    'products',
    'variants',
    'categories',
    'packages',
    'customers',
    'invoices',
    'orders',
    'enrollments',
    'payments',
    'campaigns',
    'subscribers',
    'profiles',
  ])
    if (Array.isArray(data[name])) refs[name] = data[name] as AdminRecord[];
  return refs;
}
const sectionFilterValues: Record<string, string[]> = {
  products: ['draft', 'coming_soon', 'active', 'unavailable'],
  orders: [
    'pending',
    'processing',
    'ready_for_pickup',
    'shipped',
    'delivered',
    'picked_up',
    'cancelled',
  ],
  clients: ['requested', 'active', 'expired', 'cancelled'],
  packages: ['physical', 'online'],
  payments: ['pending', 'evidence_submitted', 'verified', 'rejected'],
  marketing: ['draft', 'approved', 'sending', 'sent'],
};
// Empty optional inputs become null only for fields the corresponding server action accepts.
const nullableActionFields: Record<string, string[]> = {
  saveProduct: ['category_id', 'cost_price', 'size_guide'],
  saveCustomer: ['email'],
  savePackage: ['duration_days', 'session_count'],
  saveCollection: ['banner_path', 'launch_at'],
  saveContent: ['image_path'],
  saveDeliveryRate: ['city', 'area'],
};
const paymentStatuses = [
  'pending',
  'evidence_submitted',
  'partially_paid',
  'paid',
  'rejected',
  'refunded',
];
// This only enables or disables controls. Every write is authorized again on the server.
function actionAllowed(
  action: Action,
  owner: boolean,
  setupRequired: boolean,
  permissions: Record<string, boolean> = {},
) {
  return (
    setupRequired ||
    owner ||
    !action.owner ||
    Boolean(action.permission && permissions[action.permission] === true)
  );
}
const metricDefinitions: Record<
  string,
  { label: string; keys: string[]; money?: boolean; note: string }[]
> = {
  overview: [
    {
      label: 'Collected receipts',
      keys: [
        'verifiedReceipts',
        'total_receipts',
        'verified_receipts',
        'total_recorded_receipts',
        'collected_receipts',
      ],
      money: true,
      note: 'Verified bank credits only',
    },
    {
      label: 'Outstanding balance',
      keys: ['outstandingBalances', 'outstanding_balance', 'outstanding_balances'],
      money: true,
      note: 'Across merchandise & coaching',
    },
    {
      label: 'Orders to fulfill',
      keys: ['pendingOrders', 'pending_orders', 'orders_to_fulfill'],
      note: 'Awaiting your next step',
    },
    {
      label: 'Completed orders',
      keys: ['completedOrders', 'completed_orders'],
      note: 'Ready and handed over',
    },
    { label: 'Products', keys: ['totalProducts'], note: 'Catalog items' },
    { label: 'Published products', keys: ['publishedProducts'], note: 'Visible in the store' },
    { label: 'Draft products', keys: ['draftProducts'], note: 'Not shown to customers' },
    { label: 'Low-stock items', keys: ['low_stock'], note: 'Variants to review' },
    {
      label: 'Active coaching clients',
      keys: ['activeClients', 'active_clients', 'active_enrollments'],
      note: 'Physical & online training',
    },
    { label: 'Upcoming renewals', keys: ['upcomingRenewals'], note: 'Due within 7 days' },
  ],
  finances: [
    {
      label: 'Merchandise receipts',
      keys: ['merchandiseRevenue', 'merchandise_revenue', 'merchandise_receipts'],
      money: true,
      note: 'Verified collected merchandise payments',
    },
    {
      label: 'Coaching receipts',
      keys: ['coachingRevenue', 'coaching_revenue', 'coaching_receipts'],
      money: true,
      note: 'Verified collected coaching payments',
    },
    {
      label: 'Outstanding balance',
      keys: ['outstandingBalances', 'outstanding_balance', 'outstanding_balances'],
      money: true,
      note: 'Unpaid invoice balances',
    },
    {
      label: 'Recorded expenses',
      keys: ['expenses', 'recorded_expenses', 'total_expenses'],
      money: true,
      note: 'Separate from revenue',
    },
  ],
  inventory: [
    {
      label: 'Physical units',
      keys: ['physical_stock', 'total_stock', 'stock_on_hand'],
      note: 'Confirmed counts only',
    },
    {
      label: 'Reserved units',
      keys: ['reserved_stock', 'stock_reserved'],
      note: 'Temporary order reservations',
    },
    {
      label: 'Available units',
      keys: ['available_stock', 'stock_available'],
      note: 'Ready to order',
    },
    {
      label: 'Low-stock SKUs',
      keys: ['low_stock', 'low_stock_variants'],
      note: 'Review before the next drop',
    },
  ],
};

const overviewLinks = [
  {
    href: '/admin/orders',
    label: 'Orders',
    description: 'Review sales and prepare handover',
    icon: Package,
  },
  {
    href: '/admin/products',
    label: 'Products',
    description: 'Add products and update prices',
    icon: ShoppingBag,
  },
  {
    href: '/admin/inventory',
    label: 'Stock',
    description: 'Count units and record changes',
    icon: Boxes,
  },
  {
    href: '/admin/clients',
    label: 'Coaching clients',
    description: 'Manage plans and renewals',
    icon: Dumbbell,
  },
];
function summaryValue(summary: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (summary[key] !== undefined) return summary[key];
  return undefined;
}

// Initial records come from the server page; later searches and pagination request fresh data.
export function AdminSection({ section, data: initial }: { section: string; data: unknown }) {
  const [data, setData] = useState(initial as AdminData);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [categoryId, setCategoryId] = useState('');
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<{ action: Action; record?: AdminRecord } | null>(null);
  const [details, setDetails] = useState<AdminRecord | null>(null);
  const [page, setPage] = useState((initial as AdminData).page || 1);
  const [createdOrder, setCreatedOrder] = useState<{
    url: string;
    phone: string;
    name: string;
  } | null>(null);
  const [appliedRange, setAppliedRange] = useState({ range: 'month', from: '', to: '' });
  const requestVersion = useRef(0);
  const initialRequest = useRef(true);
  const config = sections[section];
  const setupRequired = Boolean(data.setupRequired);
  const owner = data.role === 'owner';
  const permissions = data.permissions || {};
  const refs = referencesFor(data, section);
  const records = data.records || [];
  const summary = data.summary || {};
  const reportingTimezone = String(refs.business_settings?.[0]?.timezone || 'Africa/Lagos');
  const totalRecords = data.totalRecords ?? records.length;
  const pageSize = data.pageSize || 10;
  const selectedRows = records;
  const shownRows = records;
  const filters = sectionFilterValues[section] || [];
  const pages = Math.max(1, data.totalPages || 1);
  // Version each request so an older search response cannot replace a newer result.
  // Filtering happens before server pagination, rather than hiding rows on the current page.
  const refresh = useCallback(
    async (showNotice = false) => {
      if (setupRequired) return;
      const version = ++requestVersion.current;
      setLoading(true);
      setError('');
      try {
        const query = new URLSearchParams({
          section,
          range: appliedRange.range,
          page: String(page),
          pageSize: String(pageSize),
          search,
          filter,
          paymentFilter,
          stockFilter,
          categoryId,
        });
        if (appliedRange.range === 'custom') {
          query.set('from', appliedRange.from);
          query.set('to', appliedRange.to);
        }
        const response = await fetch(`/api/admin?${query}`, { cache: 'no-store' });
        const next = await response.json();
        if (!response.ok) throw new Error(next.error || 'Unable to load these records.');
        if (version !== requestVersion.current) return;
        const nextData = (next.data || next) as AdminData;
        setData(nextData);
        if (nextData.page) setPage(nextData.page);
        if (showNotice) setNotice('Workspace records refreshed.');
      } catch (err) {
        if (version === requestVersion.current)
          setError(err instanceof Error ? err.message : 'Unable to refresh records.');
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    },
    [
      setupRequired,
      section,
      appliedRange,
      page,
      pageSize,
      search,
      filter,
      paymentFilter,
      stockFilter,
      categoryId,
    ],
  );
  // Reuse the server snapshot on first render and debounce typed searches afterwards.
  useEffect(() => {
    if (initialRequest.current) {
      initialRequest.current = false;
      return;
    }
    const timer = setTimeout(
      () => {
        void refresh();
      },
      search ? 300 : 0,
    );
    return () => {
      clearTimeout(timer);
      requestVersion.current++;
    };
  }, [refresh, search]);
  // Date inputs stay as a draft until Apply is pressed; applying restarts pagination.
  function applyReportingRange() {
    if (range === 'custom' && (!from || !to || from > to)) {
      setError('Choose a valid start and end date.');
      return;
    }
    setPage(1);
    setAppliedRange({ range, from, to });
  }
  function openAction(key: string, record?: AdminRecord) {
    const action = actions[key];
    if (!action) return;
    if (!actionAllowed(action, owner, setupRequired, permissions)) {
      setError('This action requires owner access or an explicit operational permission.');
      return;
    }
    setNotice('');
    setDialog({ action, record });
  }
  // Export the loaded page only, using the same column definitions as the visible table.
  function exportRecords() {
    const cols = config.columns;
    const safe = (v: unknown) => csvCell(scalar(v));
    const csv = [
      cols.map((c) => safe(c.label)).join(','),
      ...selectedRows.map((r) => cols.map((c) => safe(recordValue(r, c.key))).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascend-${section}-page-${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="admin-section">
      <div className="admin-heading">
        <div>
          <p className="admin-eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p className="admin-lead">{config.description}</p>
        </div>
        <div className="admin-heading-actions">
          <button
            className="admin-icon-button"
            onClick={() => refresh(true)}
            disabled={loading || setupRequired}
            aria-label="Refresh workspace records"
          >
            <RefreshCw size={17} className={loading ? 'admin-spinning' : ''} />
          </button>
          {config.actions[0] && (
            <button
              className="admin-button admin-button-gold"
              onClick={() => openAction(config.actions[0])}
              disabled={
                !actionAllowed(actions[config.actions[0]], owner, setupRequired, permissions)
              }
            >
              <Plus size={17} />
              {actions[config.actions[0]].label}
            </button>
          )}
        </div>
      </div>
      {setupRequired && (
        <div className="admin-setup-banner">
          <div className="admin-banner-icon">
            <LockKeyhole size={22} />
          </div>
          <div>
            <strong>Workspace preview — setup required</strong>
            <p>
              Connect Supabase, run the database migrations and assign the first owner to begin. No
              live customer, financial or inventory data is shown here. Save and send actions are
              disabled.
            </p>
          </div>
          <Link href="/admin/settings">
            View setup <ArrowRight size={16} />
          </Link>
        </div>
      )}
      {!setupRequired && !owner && (section === 'finances' || section === 'settings') && (
        <div className="admin-notice-card">
          <LockKeyhole size={21} />
          <div>
            <strong>Owner access required.</strong>
            <p>
              Financial reporting, bank configuration and staff permissions are reserved for the
              business owner.
            </p>
          </div>
        </div>
      )}
      {createdOrder && (
        <div className="admin-created-order">
          <div>
            <ShieldCheck size={20} />
            <strong>Manual order created. Share its secure link with the customer.</strong>
          </div>
          <p>
            This link provides private order lookup, delivery-fee approval and payment submission.
            Keep it private; it is shown here for this session.
          </p>
          <label className="admin-sr-only" htmlFor="new-order-link">
            New secure order link
          </label>
          <input
            id="new-order-link"
            readOnly
            value={createdOrder.url}
            onFocus={(e) => e.target.select()}
          />
          <div>
            <button
              className="admin-button admin-button-subtle"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(createdOrder.url);
                  setNotice('Secure order link copied.');
                } catch {
                  setError('Select and copy the secure link from the field above.');
                }
              }}
            >
              Copy secure link
            </button>
            <a
              className="admin-button admin-button-gold"
              href={createdOrder.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open customer view <ArrowUpRight size={15} />
            </a>
            {createdOrder.phone && (
              <a
                className="admin-button admin-button-subtle"
                href={`https://wa.me/${createdOrder.phone}?text=${encodeURIComponent(`Hi ${createdOrder.name}, your ASCEND ATHLETICS order is ready to review: ${createdOrder.url}. Please review any delivery quote and bank instructions before transferring. Payment is confirmed only after we verify the bank credit.`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Prepare WhatsApp link <ArrowUpRight size={15} />
              </a>
            )}
            <button
              className="admin-icon-button"
              onClick={() => setCreatedOrder(null)}
              aria-label="Dismiss new order link"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      {(error || data.error) && (
        <div className="admin-alert admin-alert-error" role="alert">
          <CircleAlert size={19} />
          {error || data.error}
        </div>
      )}
      {notice && (
        <div className="admin-alert admin-alert-success" role="status">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
      {section === 'overview' && (
        <section className="admin-home-links" aria-labelledby="admin-home-links-title">
          <div className="admin-home-links-heading">
            <div>
              <p className="admin-eyebrow">START HERE</p>
              <h2 id="admin-home-links-title">What do you need to do?</h2>
            </div>
          </div>
          <div className="admin-home-links-grid">
            {overviewLinks.map(({ href, label, description, icon: Icon }) => (
              <Link href={href} className="admin-home-link" key={href}>
                <span className="admin-home-link-icon">
                  <Icon size={20} />
                </span>
                <span className="admin-home-link-copy">
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <ArrowUpRight size={16} className="admin-home-link-arrow" />
              </Link>
            ))}
          </div>
        </section>
      )}
      {(section === 'overview' || section === 'finances') && (
        <div className="admin-range-row">
          <span>
            <CalendarDays size={16} /> Reporting period <small>· {reportingTimezone}</small>
          </span>
          <div>
            <label className="admin-sr-only" htmlFor="reporting-range">
              Reporting period
            </label>
            <select id="reporting-range" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="today">Today</option>
              <option value="7days">Last 7 days</option>
              <option value="month">This month</option>
              <option value="custom">Custom range</option>
            </select>
            {range === 'custom' && (
              <>
                <input
                  type="date"
                  aria-label="Start date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
                <span>to</span>
                <input
                  type="date"
                  aria-label="End date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </>
            )}
            <button
              className="admin-button admin-button-subtle"
              onClick={applyReportingRange}
              disabled={loading || setupRequired}
            >
              Apply
            </button>
          </div>
        </div>
      )}
      {metricDefinitions[section] && (
        <div className="admin-metric-grid">
          {metricDefinitions[section].map((metric, i) => {
            let value = summaryValue(summary, metric.keys);
            if (section === 'inventory' && value === undefined && !setupRequired && !data.error)
              value =
                i === 3
                  ? records.filter(
                      (r) =>
                        r.stock_confirmed_at &&
                        Number(r.stock_available) < Number(r.low_stock_threshold),
                    ).length
                  : records.reduce(
                      (sum, r) =>
                        sum +
                        Number(r[['stock_on_hand', 'stock_reserved', 'stock_available'][i]] || 0),
                      0,
                    );
            return (
              <div className="admin-metric" key={metric.label}>
                <div className="admin-metric-label">
                  {metric.label}
                  <span>
                    {i === 0 ? (
                      <WalletIcon />
                    ) : i === 1 ? (
                      <Clock3 size={17} />
                    ) : i === 2 ? (
                      <Package size={17} />
                    ) : (
                      <Layers3 size={17} />
                    )}
                  </span>
                </div>
                <strong>
                  {setupRequired || data.error
                    ? '—'
                    : value === undefined
                      ? '—'
                      : metric.money
                        ? money(value)
                        : scalar(value)}
                </strong>
                <p>
                  <span className={i === 0 ? 'admin-tiny-gold' : ''} />
                  {metric.note}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {(section === 'overview' || section === 'finances') && (
        <div
          className={`admin-insight-grid ${section === 'overview' ? 'admin-insight-grid-home' : ''}`}
        >
          {section === 'finances' && (
            <RevenueChart summary={summary} setupRequired={setupRequired} />
          )}
          <AttentionPanel section={section} summary={summary} data={data} onAction={openAction} />
        </div>
      )}
      {section === 'products' && (
        <div className="admin-onboarding">
          <div>
            <p className="admin-eyebrow">PRODUCT SETUP</p>
            <h2>Add product, stock and publish in one step.</h2>
            <p>Enter the size and colour you counted. ASCEND creates the SKU automatically.</p>
          </div>
          <ol>
            <li>
              <span>01</span>Product details
            </li>
            <li>
              <span>02</span>Count current stock
            </li>
            <li>
              <span>03</span>Publish to the shop
            </li>
          </ol>
          <Link href="/admin/inventory">
            Manage later stock changes <ArrowUpRight size={17} />
          </Link>
        </div>
      )}
      {section === 'payments' && (
        <div className="admin-notice-card">
          <ShieldCheck size={22} />
          <div>
            <strong>Bank credit is the source of truth.</strong>
            <p>
              Submitted evidence does not mark an invoice paid, activate coaching or increase
              collected revenue. Only an owner can verify payment.
            </p>
          </div>
        </div>
      )}
      {section === 'clients' && (
        <div className="admin-notice-card">
          <CalendarDays size={22} />
          <div>
            <strong>Renewals follow the actual package terms.</strong>
            <p>
              Monthly plans use calendar months. Renewals create a new pending invoice; an owner
              confirms activation and the start date.
            </p>
          </div>
        </div>
      )}
      {section === 'marketing' && (
        <div className="admin-notice-card">
          <ShieldCheck size={22} />
          <div>
            <strong>Consent first. Owner approval before sending.</strong>
            <p>
              Purchase details do not imply marketing consent. Sending stays unavailable until a
              real email provider and verified sender are configured.
            </p>
          </div>
        </div>
      )}
      {section === 'settings' && (
        <SettingsOverview
          data={data}
          setupRequired={setupRequired}
          onAction={openAction}
          owner={owner}
          permissions={permissions}
        />
      )}
      {(section === 'customers' || section === 'clients') && (
        <CustomerQuickAdd
          disabled={setupRequired || !['owner', 'assistant'].includes(data.role || '')}
          onSaved={async () => {
            if (section === 'customers' && (search || page !== 1)) {
              setSearch('');
              setPage(1);
            } else await refresh();
          }}
          onAssignTraining={(customer) => openAction('enrollClient', customer)}
        />
      )}
      {owner && !setupRequired && ['clients', 'customers', 'marketing'].includes(section) && (
        <WhatsAppManager />
      )}
      <div className="admin-data-panel" aria-busy={loading}>
        <div className="admin-panel-top">
          <div>
            <h2>
              {section === 'overview'
                ? 'Recent orders'
                : section === 'finances'
                  ? 'Financial transactions'
                  : config.eyebrow === 'MERCHANDISE'
                    ? 'Product catalog'
                    : config.eyebrow === 'INVENTORY CONTROL'
                      ? 'Stock by SKU'
                      : config.eyebrow === 'WORKSPACE SETTINGS'
                        ? 'Settings & configuration'
                        : config.eyebrow.charAt(0) + config.eyebrow.slice(1).toLowerCase()}
              <span className="admin-count">{totalRecords}</span>
            </h2>
            <p>
              {section === 'overview'
                ? 'Website and manual orders. Payment filters apply to this list; summary cards keep the reporting period.'
                : `${totalRecords} ${config.singular}${totalRecords === 1 ? '' : 's'} in your shared workspace.`}
            </p>
          </div>
          <div className="admin-panel-buttons">
            {config.actions.slice(1).map((key) => (
              <button
                className="admin-button admin-button-subtle"
                key={key}
                onClick={() => openAction(key)}
                disabled={!actionAllowed(actions[key], owner, setupRequired, permissions)}
              >
                <Plus size={15} />
                {section === 'products' && key === 'saveProduct' ? 'Edit' : actions[key].label}
              </button>
            ))}
            <button
              className="admin-icon-button"
              onClick={exportRecords}
              disabled={!selectedRows.length}
              aria-label="Export this page of filtered records"
              title="Export current page"
            >
              <ArrowDownToLine size={17} />
            </button>
          </div>
        </div>
        <div className="admin-table-toolbar">
          <div className="admin-search">
            <Search size={17} />
            <label className="admin-sr-only" htmlFor={`search-${section}`}>
              Search {config.singular}s
            </label>
            <input
              id={`search-${section}`}
              type="search"
              placeholder={`Search ${config.singular}s...`}
              value={search}
              maxLength={120}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {config.filter && (
            <div className="admin-filter">
              <SlidersHorizontal size={15} />
              <label className="admin-sr-only" htmlFor={`filter-${section}`}>
                Filter by {human(config.filter)}
              </label>
              <select
                id={`filter-${section}`}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All {human(config.filter).toLowerCase()}</option>
                {filters.map((v) => (
                  <option key={v} value={v}>
                    {human(v)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {section === 'products' && (
            <div className="admin-filter">
              <SlidersHorizontal size={15} />
              <label className="admin-sr-only" htmlFor="product-category-filter">
                Filter by category
              </label>
              <select
                id="product-category-filter"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {(refs.categories || []).map((category) => (
                  <option key={String(category.id)} value={String(category.id)}>
                    {scalar(category.name)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {section === 'overview' && (
            <div className="admin-filter">
              <ShieldCheck size={15} />
              <label htmlFor="overview-payment-filter">Payment status</label>
              <select
                id="overview-payment-filter"
                value={paymentFilter}
                onChange={(e) => {
                  setPaymentFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All payments</option>
                <option value="outstanding">Outstanding</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          )}
          {section === 'orders' && (
            <div className="admin-filter">
              <ShieldCheck size={15} />
              <label className="admin-sr-only" htmlFor="order-payment-filter">
                Payment status
              </label>
              <select
                id="order-payment-filter"
                value={paymentFilter}
                onChange={(e) => {
                  setPaymentFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All payment statuses</option>
                {paymentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {human(status)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {section === 'inventory' && (
            <div className="admin-filter">
              <SlidersHorizontal size={15} />
              <label className="admin-sr-only" htmlFor="stock-count-filter">
                Inventory availability
              </label>
              <select
                id="stock-count-filter"
                value={stockFilter}
                onChange={(e) => {
                  setStockFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All stock</option>
                <option value="unconfirmed">Count needed</option>
                <option value="low_stock">Low stock</option>
                <option value="available">Available stock</option>
              </select>
            </div>
          )}
          <span className="admin-result-count" role="status">
            {loading ? 'Loading…' : `${totalRecords} results`}
          </span>
        </div>
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {config.columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
                <th scope="col">
                  <span className="admin-sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shownRows.map((record, i) => (
                <tr key={String(record.id || i)}>
                  {config.columns.map((column) => (
                    <td key={column.key}>
                      <Cell record={record} column={column} />
                    </td>
                  ))}
                  <td>
                    {section === 'products' ? (
                      <div className="admin-product-row-actions">
                        <button
                          type="button"
                          className="admin-button admin-button-subtle"
                          onClick={() => openAction('saveProduct', record)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-button admin-button-subtle"
                          onClick={() => setDetails(record)}
                        >
                          Details
                        </button>
                        {record.status !== 'unavailable' && (
                          <button
                            type="button"
                            className="admin-button admin-button-danger"
                            onClick={() => openAction('archiveProduct', record)}
                            disabled={
                              !actionAllowed(actions.archiveProduct, owner, setupRequired, permissions)
                            }
                          >
                            Remove
                          </button>
                        )}
                        <button
                          type="button"
                          className="admin-button admin-button-danger"
                          onClick={() => openAction('deleteProduct', record)}
                          disabled={
                            !actionAllowed(actions.deleteProduct, owner, setupRequired, permissions)
                          }
                        >
                          Delete permanently
                        </button>
                      </div>
                    ) : (
                      <button
                        className="admin-row-open"
                        onClick={() => setDetails(record)}
                        aria-label={`Open ${config.singular} details`}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!selectedRows.length && (
          <div className="admin-empty">
            <div className="admin-empty-icon">
              <Package size={29} strokeWidth={1.25} />
            </div>
            <h3>
              {search || filter !== 'all' || paymentFilter !== 'all' || stockFilter !== 'all'
                ? 'No matching records'
                : `Your ${config.singular}s will appear here`}
            </h3>
            <p>
              {search || filter !== 'all' || paymentFilter !== 'all' || stockFilter !== 'all'
                ? 'Try another search or clear your filters.'
                : setupRequired
                  ? 'Complete workspace setup to start adding real business records.'
                  : `Add your first ${config.singular} to start managing it here.`}
            </p>
            {search || filter !== 'all' || paymentFilter !== 'all' || stockFilter !== 'all' ? (
              <button
                className="admin-button admin-button-subtle"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                  setPaymentFilter('all');
                  setStockFilter('all');
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            ) : (
              config.actions[0] && (
                <button
                  className="admin-button admin-button-subtle"
                  onClick={() => openAction(config.actions[0])}
                  disabled={
                    !actionAllowed(actions[config.actions[0]], owner, setupRequired, permissions)
                  }
                >
                  <Plus size={16} />
                  {setupRequired ? 'View workflow' : actions[config.actions[0]].label}
                </button>
              )
            )}
          </div>
        )}
        <div className="admin-table-pagination">
          <span>
            {selectedRows.length
              ? `${(page - 1) * pageSize + 1}–${Math.min((page - 1) * pageSize + records.length, totalRecords)} of ${totalRecords}`
              : 'No records'}
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={loading || page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <span>
              Page {page} of {pages}
            </span>
            <button
              aria-label="Next page"
              disabled={loading || page >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </div>
      {section === 'finances' && (
        <FinancialBreakdown summary={summary} setupRequired={setupRequired} />
      )}
      <RelatedRecords
        section={section}
        references={refs}
        owner={owner}
        permissions={permissions}
        setupRequired={setupRequired}
        onAction={openAction}
      />
      {(section === 'inventory' || section === 'settings' || section === 'payments') && (
        <AuditPanel data={data} section={section} />
      )}
      {dialog && (
        <ActionDialog
          action={dialog.action}
          record={dialog.record}
          references={refs}
          setupRequired={setupRequired}
          owner={owner}
          onClose={() => setDialog(null)}
          onSaved={async (message, result) => {
            if (result && typeof result.guest_token === 'string') {
              const order = (result.order || {}) as AdminRecord;
              let phone = String(order.customer_phone || '').replace(/\D/g, '');
              if (phone.startsWith('0') && phone.length === 11) phone = `234${phone.slice(1)}`;
              setCreatedOrder({
                url: `${window.location.origin}/order-status/${result.guest_token}`,
                phone,
                name: String(order.customer_name || 'there'),
              });
            }
            setDialog(null);
            await refresh();
            setNotice(message);
          }}
        />
      )}
      {details && (
        <RecordDetails
          record={details}
          references={refs}
          section={section}
          owner={owner}
          permissions={permissions}
          setupRequired={setupRequired}
          onClose={() => setDetails(null)}
          onAction={(key, record) => {
            setDetails(null);
            openAction(key, record);
          }}
        />
      )}
    </div>
  );
}
function WalletIcon() {
  return <TrendingUp size={17} />;
}
// Render a table cell according to the column type declared in admin-config.ts.
function Cell({ record, column }: { record: AdminRecord; column: { key: string; type?: string } }) {
  const value = recordValue(record, column.key);
  if (column.type === 'money') return <span className="admin-cell-money">{money(value)}</span>;
  if (column.type === 'date') return <span className="admin-cell-muted">{dateLabel(value)}</span>;
  if (
    column.type === 'status' &&
    column.key === 'status' &&
    Array.isArray(record.product_variants)
  ) {
    const available = (record.product_variants as AdminRecord[]).reduce(
      (total, variant) => total + Number(variant.stock_available || 0),
      0,
    );
    const label =
      value === 'active' ? (available > 0 ? 'Published' : 'Out of stock') : human(value);
    const status = value === 'active' && available < 1 ? 'unavailable' : String(value || 'unknown');
    return <span className={`admin-badge status-${status}`}>{label}</span>;
  }
  if (column.type === 'status')
    return (
      <span className={`admin-badge status-${String(value || 'unknown')}`}>{human(value)}</span>
    );
  if (column.type === 'active')
    return (
      <span className={`admin-badge ${value ? 'status-active' : 'status-draft'}`}>
        {value ? 'Published / active' : 'Draft / inactive'}
      </span>
    );
  if (column.type === 'confirmed')
    return value ? (
      <span className="admin-stock-confirmed">
        <Check size={13} />
        Confirmed
      </span>
    ) : (
      <span className="admin-badge status-pending">Count needed</span>
    );
  if (column.type === 'label') return human(value);
  if (column.type === 'product') {
    const imgs = record.images || record.product_images;
    const imageRecord = Array.isArray(imgs) ? imgs[0] : null;
    const image =
      record.image_url ||
      (typeof imageRecord === 'string'
        ? imageRecord
        : imageRecord && typeof imageRecord === 'object'
          ? (imageRecord as AdminRecord).url
          : null);
    return (
      <div className="admin-product-cell">
        {image ? (
          <img src={String(image)} alt="" />
        ) : (
          <span className="admin-product-placeholder">
            <ShoppingBagIcon />
          </span>
        )}
        <div>
          <strong>{scalar(value)}</strong>
          <small>{record.slug ? `/shop/${record.slug}` : 'Draft product'}</small>
        </div>
      </div>
    );
  }
  if (column.type === 'person')
    return (
      <div className="admin-person-cell">
        <span>{scalar(value).slice(0, 1).toUpperCase()}</span>
        <strong>{scalar(value)}</strong>
      </div>
    );
  if (column.type === 'variant')
    return (
      <div>
        <strong>{scalar(value)}</strong>
        <small className="admin-cell-subline">
          {[record.size, record.color].filter(Boolean).join(' · ')}
        </small>
      </div>
    );
  if (column.type === 'order')
    return (
      <div>
        <strong>#{scalar(value)}</strong>
        <small className="admin-cell-subline">{dateLabel(record.created_at)}</small>
        {Boolean(record.resolution_required) && (
          <small className="admin-cell-warning">Stock resolution needed</small>
        )}
      </div>
    );
  return <span>{scalar(value)}</span>;
}
function ShoppingBagIcon() {
  return <Package size={19} strokeWidth={1.5} />;
}
// These charts display verified receipts supplied by reporting queries, not submitted claims.
function RevenueChart({
  summary,
  setupRequired,
}: {
  summary: Record<string, unknown>;
  setupRequired: boolean;
}) {
  const candidate = summaryValue(summary, [
    'receiptSeries',
    'revenue_over_time',
    'receipt_series',
    'revenue_series',
    'daily_receipts',
  ]);
  const series = Array.isArray(candidate) ? (candidate as AdminRecord[]) : [];
  const max = Math.max(1, ...series.map((r) => Number(r.amount || r.total || r.receipts || 0)));
  const total = summaryValue(summary, [
    'verifiedReceipts',
    'total_receipts',
    'verified_receipts',
    'total_recorded_receipts',
    'collected_receipts',
  ]);
  return (
    <div className="admin-chart-panel">
      <div className="admin-panel-title">
        <div>
          <h2>Collected receipts</h2>
          <p>Verified bank credits over time</p>
        </div>
        <span className="admin-chart-legend">
          <span />
          Receipts (NGN)
        </span>
      </div>
      <div className="admin-chart-total">
        {setupRequired ? '—' : money(total)}
        <small>Recorded receipts · not net profit</small>
      </div>
      {series.length ? (
        <div className="admin-bars" role="img" aria-label="Verified collected receipts by date">
          {series.slice(-24).map((entry, i) => {
            const amount = Number(entry.amount || entry.total || entry.receipts || 0);
            return (
              <div className="admin-bar-column" key={i}>
                <div className="admin-bar-track">
                  <span
                    style={{ height: `${Math.max(amount ? 3 : 0, (amount / max) * 100)}%` }}
                    title={`${dateLabel(entry.date || entry.day)}: ${money(amount)}`}
                  />
                </div>
                <small>
                  {new Date(String(entry.date || entry.day)).getDate() || String(i + 1)}
                </small>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="admin-chart-empty">
          <div className="admin-chart-grid" />
          <div>
            <TrendingUp size={26} strokeWidth={1.25} />
            <strong>No verified receipt history yet</strong>
            <span>
              {setupRequired
                ? 'Your real data will populate this chart after setup.'
                : 'Verify actual bank credits to begin financial reporting.'}
            </span>
          </div>
        </div>
      )}
      <div className="admin-chart-foot">
        <ShieldCheck size={14} /> Unverified transfer claims are excluded.
      </div>
    </div>
  );
}
function AttentionPanel({
  section,
  summary,
  data,
  onAction,
}: {
  section: string;
  summary: Record<string, unknown>;
  data: AdminData;
  onAction: (key: string) => void;
}) {
  const items =
    section === 'finances'
      ? [
          {
            label: 'Refunds recorded',
            value: summaryValue(summary, ['refunds', 'total_refunds']),
            detail: 'Actual refunds, reported separately',
            action: 'refundPayment',
            currency: true,
          },
          {
            label: 'Unpaid invoices',
            value: summaryValue(summary, ['unpaidInvoices', 'unpaid_invoices']),
            detail: 'Pending or partially paid invoices',
            action: 'recordPayment',
          },
          {
            label: 'Total recorded receipts',
            value: summaryValue(summary, [
              'verifiedReceipts',
              'total_receipts',
              'verified_receipts',
              'total_recorded_receipts',
              'collected_receipts',
            ]),
            detail: 'Verified bank credits only',
            action: 'recordPayment',
            currency: true,
          },
        ]
      : [
          {
            label: 'Transfers awaiting verification',
            value: summaryValue(summary, [
              'pendingPayments',
              'pending_payments',
              'unverified_payments',
              'pending_claims',
            ]),
            detail: 'Confirm credit in your bank account',
            action: 'recordPayment',
          },
          {
            label: 'Clients renewing soon',
            value: summaryValue(summary, [
              'upcomingRenewals',
              'upcoming_renewals',
              'expiring_enrollments',
            ]),
            detail: 'Review expiry dates and prepare reminders',
            action: 'extendEnrollment',
          },
          {
            label: 'Stock counts to confirm',
            value: summaryValue(summary, [
              'unconfirmedStock',
              'unconfirmed_stock',
              'unconfirmed_variants',
            ]),
            detail: 'Count physical units before publishing',
            action: 'stockMovement',
          },
        ];
  return (
    <div className="admin-attention-panel">
      <div className="admin-panel-title">
        <div>
          <h2>{section === 'finances' ? 'Financial reconciliation' : 'Needs your attention'}</h2>
          <p>
            {section === 'finances'
              ? 'Keep each figure distinct.'
              : 'The right next step for your business.'}
          </p>
        </div>
        <CircleAlert size={19} />
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          className="admin-attention-item"
          onClick={() => onAction(item.action)}
        >
          <span className="admin-attention-icon">
            <FileClock size={19} />
          </span>
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          <b>
            {data.setupRequired
              ? '—'
              : item.value === undefined
                ? '—'
                : item.currency
                  ? money(item.value)
                  : scalar(item.value)}
          </b>
          <ArrowUpRight size={16} />
        </button>
      ))}
      <div className="admin-attention-footer">
        <ShieldCheck size={15} /> All important changes leave an audit record.
      </div>
    </div>
  );
}
function FinancialBreakdown({
  summary,
  setupRequired,
}: {
  summary: Record<string, unknown>;
  setupRequired: boolean;
}) {
  const groups = [
    {
      title: 'Sales by product',
      key: ['productSales', 'sales_by_product', 'product_sales'],
      label: 'product_name',
    },
    {
      title: 'Income by training package',
      key: ['packageIncome', 'income_by_package', 'package_income'],
      label: 'package_name',
    },
  ];
  return (
    <div className="admin-breakdown-grid">
      {groups.map((group) => {
        const value = summaryValue(summary, group.key);
        const rows = Array.isArray(value) ? (value as AdminRecord[]) : [];
        return (
          <div className="admin-data-panel admin-small-panel" key={group.title}>
            <h2>{group.title}</h2>
            {rows.length ? (
              <ul className="admin-breakdown-list">
                {rows.map((row, i) => (
                  <li key={i}>
                    <span>{scalar(row[group.label] || row.name)}</span>
                    <div className="admin-breakdown-value">
                      <strong>
                        {money(
                          row.amount || row.revenue || row.total || row.receipts || row.gross_sales,
                        )}
                      </strong>
                      {row.gross_profit !== undefined && row.gross_profit !== null && (
                        <small>
                          Gross profit {money(row.gross_profit)}
                          {row.gross_margin_percent !== undefined &&
                          row.gross_margin_percent !== null
                            ? ` · ${Number(row.gross_margin_percent).toFixed(1)}% margin`
                            : ''}
                        </small>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="admin-small-empty">
                {setupRequired
                  ? 'Available after workspace setup.'
                  : 'No verified receipts for this reporting period.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
function SettingsOverview({
  data,
  setupRequired,
  onAction,
  owner,
  permissions,
}: {
  data: AdminData;
  setupRequired: boolean;
  onAction: (key: string, record?: AdminRecord) => void;
  owner: boolean;
  permissions: Record<string, boolean>;
}) {
  const settings = (data.settings ||
    data.business_settings ||
    data.references?.business_settings?.[0] ||
    data.records?.find((r) => r.bank_name !== undefined) ||
    {}) as AdminRecord;
  const cards = [
    {
      title: 'Bank transfer & pickup',
      icon: ShieldCheck,
      body: "Use the business's real account and collection details. Owner changes are audited.",
      action: 'saveSettings',
      ready: Boolean(settings.bank_account_number && settings.pickup_location),
    },
    {
      title: 'Delivery fees',
      icon: Package,
      body: 'Configure known location fees. Other deliveries require a quote and customer approval.',
      action: 'saveDeliveryRate',
      ready: (data.references?.delivery_rates || []).length > 0,
    },
    {
      title: 'Staff permissions',
      icon: LockKeyhole,
      body: 'Owner and assistant access are enforced by the server and database.',
      action: 'setStaffRole',
      ready: !setupRequired,
    },
  ];
  return (
    <div className="admin-settings-grid">
      {cards.map(({ title, icon: Icon, body, action, ready }) => (
        <div className="admin-settings-card" key={title}>
          <Icon size={23} />
          <span className={`admin-badge ${ready ? 'status-active' : 'status-draft'}`}>
            {ready ? 'Configured' : 'Setup needed'}
          </span>
          <h2>{title}</h2>
          <p>{body}</p>
          <button
            className="admin-text-button"
            onClick={() => onAction(action, action === 'saveSettings' ? settings : undefined)}
            disabled={!actionAllowed(actions[action], owner, setupRequired, permissions)}
          >
            Manage <ArrowRight size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
function AuditPanel({ data, section }: { data: AdminData; section: string }) {
  const candidate =
    section === 'inventory'
      ? data.movements || data.stock_movements || data.references?.stock_movements
      : data.audit || data.audit_logs || data.references?.audit_logs;
  const rows = Array.isArray(candidate) ? (candidate as AdminRecord[]) : [];
  return (
    <details className="admin-audit-panel">
      <summary>
        <FileClock size={18} />
        <span>Audit & movement history</span>
        <small>{rows.length} recorded events</small>
        <ChevronDown size={16} />
      </summary>
      {rows.length ? (
        <div className="admin-audit-events">
          {rows.slice(0, 30).map((r, i) => (
            <div key={String(r.id || i)}>
              <span className="admin-audit-dot" />
              <div>
                <strong>{human(r.action || r.kind || r.event || 'Recorded change')}</strong>
                <p>
                  {scalar(r.note || r.description || r.entity_type)}
                  {r.quantity !== undefined ? ` · ${r.quantity} units` : ''}
                </p>
              </div>
              <small>{dateLabel(r.created_at)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="admin-small-empty">
          No recorded events available. Verified financial and stock history is preserved
          permanently.
        </p>
      )}
    </details>
  );
}

// Convert a selected record into editable input values and attach any related-record ID.
function modalValues(action: Action, record?: AdminRecord) {
  const values: Record<string, unknown> = {};
  for (const field of action.fields) {
    let value = record?.[field.key] ?? field.default ?? '';
    if (field.type === 'date' && value) value = String(value).slice(0, 10);
    if (field.type === 'datetime-local' && value) {
      const d = new Date(String(value));
      if (!Number.isNaN(d.getTime()))
        value = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Africa/Lagos',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
          .format(d)
          .replace(' ', 'T');
    }
    if ((field.type === 'json' || field.type === 'lines') && value && typeof value !== 'string')
      value =
        field.type === 'lines' && Array.isArray(value)
          ? value.join('\n')
          : JSON.stringify(value, null, 2);
    values[field.key] = value;
  }
  if (record && action.recordKey) {
    let id = record[action.recordKey] || record.id;
    if (action.recordKey === 'invoice_id') {
      const joined = Array.isArray(record.invoices)
        ? record.invoices[0]
        : record.invoices || record.invoice;
      id = record.invoice_id || (joined as AdminRecord | undefined)?.id || '';
    }
    values[action.recordKey] = id || '';
  }
  if (action.key === 'saveCollection' && record && Array.isArray(record.collection_products))
    values.product_ids = (record.collection_products as AdminRecord[]).map((item) =>
      String(item.product_id),
    );
  if (action.key === 'setStaffRole' && record) {
    const permissions = (record.permissions || {}) as AdminRecord;
    values.permission_manage_packages = permissions.manage_packages === true;
    values.permission_manage_delivery_rates = permissions.manage_delivery_rates === true;
  }
  if (action.key === 'stockMovement' && record)
    values.kind = record.stock_confirmed_at ? 'restock' : 'opening';
  if (action.key === 'saveVariant' && record && !record.sku) values.product_id = record.id;
  return values;
}
// One dialog renders configured forms, with special handling for uploads and manual orders.
function ActionDialog({
  action,
  record,
  references,
  setupRequired,
  owner,
  onClose,
  onSaved,
}: {
  action: Action;
  record?: AdminRecord;
  references: Record<string, AdminRecord[]>;
  setupRequired: boolean;
  owner: boolean;
  onClose: () => void;
  onSaved: (message: string, result?: AdminRecord) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const initialValues = modalValues(action, record);
  const [items, setItems] = useState([{ variant_id: '', quantity: 1 }]);
  const [selectedKind, setSelectedKind] = useState(String(initialValues.kind || 'opening'));
  const [selectedMethod, setSelectedMethod] = useState(
    String(initialValues.fulfillment_method || 'pickup'),
  );
  useEffect(() => {
    dialogRef.current?.showModal();
    const dialog = dialogRef.current;
    function cancel(event: Event) {
      event.preventDefault();
      if (!saving) onClose();
    }
    dialog?.addEventListener('cancel', cancel);
    return () => dialog?.removeEventListener('cancel', cancel);
  }, [onClose, saving]);
  const edit = Boolean(
    record &&
    ((action.key === 'saveProduct' &&
      record.price !== undefined &&
      typeof record.slug === 'string') ||
      (action.key === 'saveVariant' && record.sku) ||
      (action.key === 'saveCustomer' && record.email !== undefined) ||
      (action.key === 'savePackage' && record.billing_model) ||
      (action.key === 'saveCampaign' && record.subject) ||
      (action.key === 'saveContent' && record.section) ||
      (action.key === 'saveCollection' && record.slug) ||
      (action.key === 'saveCategory' && record.slug) ||
      (action.key === 'saveDeliveryRate' && record.fee !== undefined)),
  );
  // Serialize browser inputs into the action payload. The API validates these values again.
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || setupRequired) return;
    setError('');
    if (action.confirm && !confirmed) {
      setError('Review and confirm the statement before continuing.');
      return;
    }
    const fd = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const saveMode = submitter?.name === 'saveMode' ? submitter.value : 'draft';
    setSaving(true);
    try {
      let response: Response;
      if (action.special === 'upload') {
        const file = fd.get('file');
        if (!(file instanceof File) || !file.size)
          throw new Error('Select an actual product image.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
        response = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      } else {
        const payload: Record<string, unknown> = { action: action.key };
        if (edit) payload.id = record?.id;
        if (action.key === 'archiveProduct' || action.key === 'deleteProduct')
          payload.product_id = record?.id;
        for (const field of action.fields) {
          if (field.key === 'product_photos') continue;
          if (
            action.key === 'saveProduct' &&
            !edit &&
            ['status', 'featured', 'size_guide'].includes(field.key)
          )
            continue;
          if (
            action.key === 'saveProduct' &&
            edit &&
            ['opening_size', 'opening_color', 'opening_quantity', 'publish_to_store'].includes(
              field.key,
            )
          )
            continue;
          const value = fd.get(field.key);
          const nullable = nullableActionFields[action.key]?.includes(field.key);
          if (field.type === 'checkbox') payload[field.key] = value === 'on';
          else if (field.type === 'number') {
            if (value !== '' && value != null) payload[field.key] = Number(value);
            else if (nullable) payload[field.key] = null;
          } else if (field.type === 'multi-reference')
            payload[field.key] = fd.getAll(field.key).map(String);
          else if (field.type === 'json') {
            if (value) {
              try {
                payload[field.key] = JSON.parse(String(value));
              } catch {
                throw new Error(`${field.label} must contain valid JSON.`);
              }
            } else if (action.key === 'saveContent' && field.key === 'data')
              payload[field.key] = {};
          } else if (field.type === 'lines')
            payload[field.key] = String(value || '')
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean);
          else if (field.type === 'datetime-local') {
            if (value) payload[field.key] = new Date(`${value}:00+01:00`).toISOString();
            else if (nullable) payload[field.key] = null;
          } else if (value !== null) {
            const text =
              action.key === 'saveSettings' && field.key === 'whatsapp_number'
                ? String(value).replace(/[\s()+-]/g, '')
                : String(value).trim();
            if (text) payload[field.key] = text;
            else if (nullable) payload[field.key] = null;
            else if (!field.required && field.type !== 'reference') payload[field.key] = '';
          }
        }
        if (action.key === 'saveProduct' && !edit && !String(payload.slug || '').trim()) {
          const generatedSlug = String(payload.name || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 180)
            .replace(/-$/g, '');
          if (!generatedSlug)
            throw new Error('Enter a product name so we can create its shop link.');
          payload.slug = generatedSlug;
        }
        if (action.key === 'saveProduct' && !edit) payload.publish_to_store = false;
        if (action.special === 'order') {
          if (
            !items.length ||
            items.some(
              (item) => !item.variant_id || !Number.isInteger(item.quantity) || item.quantity < 1,
            )
          )
            throw new Error(
              'Select a real variant and a whole quantity of at least 1 for each item.',
            );
          if (new Set(items.map((item) => item.variant_id)).size !== items.length)
            throw new Error(
              'Use one item row per variant; increase its quantity instead of adding duplicates.',
            );
          payload.customer = {
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            ...(payload.customer_id ? { customer_id: payload.customer_id } : {}),
          };
          delete payload.customer_id;
          payload.items = items;
          if (selectedMethod === 'delivery')
            payload.delivery_details = {
              recipient_name: payload.recipient_name || payload.name,
              phone: payload.phone,
              state: payload.state,
              city: payload.city,
              area: payload.area,
              address: payload.address,
              landmark: payload.landmark,
            };
          if (
            selectedMethod === 'delivery' &&
            (!payload.state || !payload.city || !payload.area || !payload.address)
          )
            throw new Error(
              "Enter the recipient's state, city, delivery area and complete address.",
            );
          for (const key of [
            'name',
            'email',
            'phone',
            'recipient_name',
            'state',
            'city',
            'area',
            'address',
            'landmark',
          ])
            delete payload[key];
        }

        if (action.key === 'setStaffRole') {
          payload.permissions = {
            manage_packages: payload.permission_manage_packages === true,
            manage_delivery_rates: payload.permission_manage_delivery_rates === true,
          };
          delete payload.permission_manage_packages;
          delete payload.permission_manage_delivery_rates;
        }
        if (action.key === 'stockMovement' && selectedKind === 'return' && !payload.resellable)
          throw new Error(
            'Confirm the returned item has been inspected and is resellable before restoring stock.',
          );
        response = await fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      let result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'This operation could not be completed. Check the details and try again.',
        );
      if (action.key === 'saveProduct' && !edit) {
        const product = result.data?.product;
        const photos = fd
          .getAll('product_photos')
          .filter((file): file is File => file instanceof File && file.size > 0);
        if (!product?.id)
          throw new Error(
            'Product saved, but its new record ID was not returned. Refresh Products before trying again.',
          );
        if (photos.length > 5) {
          onSaved(
            'Draft saved. Choose no more than 5 photographs; you can upload them from the product details.',
            result.data,
          );
          return;
        }
        for (const [index, photo] of photos.entries()) {
          if (photo.size > 5 * 1024 * 1024) {
            onSaved(
              `Draft saved. Photograph ${index + 1} is over 5 MB; upload a smaller image from product details.`,
              result.data,
            );
            return;
          }
          const upload = new FormData();
          upload.set('product_id', String(product.id));
          upload.set('file', photo);
          upload.set('alt', String(fd.get('name') || 'ASCEND product'));
          upload.set('sort_order', String(index));
          const uploaded = await fetch('/api/admin/upload', { method: 'POST', body: upload });
          const uploadResult = await uploaded.json();
          if (!uploaded.ok) {
            onSaved(
              `Draft saved, but photograph ${index + 1} could not be uploaded: ${uploadResult.error || 'upload failed'}. You can retry from product details.`,
              result.data,
            );
            return;
          }
        }
        if (saveMode === 'publish') {
          if (Number(fd.get('opening_quantity')) < 1) {
            onSaved(
              'Draft saved. Count at least one unit before publishing from product details.',
              result.data,
            );
            return;
          }
          const published = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'publishProduct', product_id: product.id }),
          });
          const publishedResult = await published.json();
          if (!published.ok) {
            onSaved(
              `Product and photographs are saved as a draft, but publishing failed: ${publishedResult.error || 'try again from Products'}.`,
              result.data,
            );
            return;
          }
          result.data.product.status = publishedResult.data?.status || 'active';
        }
      }
      const message =
        result.message ||
        (action.key === 'deleteProduct'
          ? result.data?.image_cleanup_pending
            ? 'Product permanently deleted. An image file could not be removed from storage; its details are preserved in the audit log for cleanup.'
            : `“${result.data?.name || 'Product'}” was permanently deleted.`
          : action.key === 'saveProduct' && !edit
            ? result.data?.product?.status === 'active'
              ? 'Product published. Its opening stock is recorded and available in the web store.'
              : 'Product details, opening stock and photographs saved as a draft.'
            : action.key === 'verifyPayment' && result.data?.order?.resolution_required
              ? 'Bank credit verified. This order needs owner stock resolution before fulfillment.'
              : action.key === 'recordPayment'
                ? 'Transfer claim recorded. Payment remains pending verification.'
                : action.key === 'verifyPayment'
                  ? 'Bank credit verified. Review the invoice and any stock resolution flags.'
                  : action.key === 'extendEnrollment'
                    ? 'Renewal invoice created. Confirm payment before activating the new enrollment.'
                    : action.key === 'sendCampaign'
                      ? 'Campaign sending result recorded. Review delivery status.'
                      : 'Saved successfully. Your workspace has been updated.');
      onSaved(message, result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete this operation.');
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby="action-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="admin-dialog-content">
        <header className="admin-dialog-header">
          <div>
            <p className="admin-eyebrow">
              {action.owner && !action.permission ? 'OWNER ACTION' : 'WORKSPACE ACTION'}
            </p>
            <h2 id="action-dialog-title">
              {edit
                ? action.label.replace(/^Add /, 'Edit ').replace(/^Draft /, 'Edit ')
                : action.label}
            </h2>
          </div>
          <button
            className="admin-icon-button"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={saving}
          >
            <X size={20} />
          </button>
        </header>
        <p className="admin-dialog-description">{action.description}</p>
        {action.special === 'preview' ? (
          <>
            <div className="admin-email-preview">
              <div>
                <span>Subject</span>
                <strong>{scalar(record?.subject)}</strong>
              </div>
              <iframe
                title="Campaign email preview"
                sandbox=""
                referrerPolicy="no-referrer"
                srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,sans-serif;padding:28px;color:#111;line-height:1.6}img{max-width:100%}a{color:#806235}</style></head><body>${String(record?.body_html || '')}</body></html>`}
              />
              <p>
                <ShieldCheck size={14} /> The final email includes a secure unsubscribe link.
              </p>
            </div>
            <footer className="admin-dialog-footer">
              <button type="button" className="admin-button admin-button-gold" onClick={onClose}>
                Done
              </button>
            </footer>
          </>
        ) : (
          <form ref={formRef} onSubmit={submit}>
            {setupRequired && (
              <div className="admin-alert">
                <Info size={17} /> Workflow preview. Saving requires Supabase and an authenticated
                staff account.
              </div>
            )}
            {error && (
              <div className="admin-alert admin-alert-error" role="alert">
                <CircleAlert size={17} />
                {error}
              </div>
            )}
            <fieldset className="admin-form-fields" disabled={saving || setupRequired}>
              {action.fields.map((field) => {
                if (
                  action.key === 'saveProduct' &&
                  !edit &&
                  ['status', 'featured', 'size_guide'].includes(field.key)
                )
                  return null;
                if (action.key === 'saveProduct' && edit && field.key === 'product_photos')
                  return null;
                if (
                  action.key === 'saveProduct' &&
                  edit &&
                  [
                    'opening_size',
                    'opening_color',
                    'opening_quantity',
                    'publish_to_store',
                  ].includes(field.key)
                )
                  return null;
                const hideDelivery =
                  action.special === 'order' &&
                  selectedMethod === 'pickup' &&
                  ['recipient_name', 'state', 'city', 'area', 'address', 'landmark'].includes(
                    field.key,
                  );
                if (hideDelivery) return null;
                return (
                  <FormField
                    key={field.key}
                    field={field}
                    value={initialValues[field.key]}
                    references={references}
                    disabledOptions={
                      action.key === 'saveProduct' &&
                      field.key === 'status' &&
                      (!Array.isArray(record?.product_variants) ||
                        !(record.product_variants as AdminRecord[]).length ||
                        (record.product_variants as AdminRecord[]).some(
                          (variant) => !variant.stock_confirmed_at,
                        ))
                        ? ['active']
                        : []
                    }
                    onChange={(value) => {
                      if (field.key === 'kind') setSelectedKind(value);
                      if (field.key === 'fulfillment_method') setSelectedMethod(value);
                      if (field.key === 'customer_id' && action.special === 'order') {
                        const customer = references.customers?.find(
                          (row) => String(row.id) === value,
                        );
                        if (customer)
                          for (const key of ['name', 'email', 'phone']) {
                            const input = formRef.current?.elements.namedItem(
                              key,
                            ) as HTMLInputElement | null;
                            if (input) input.value = String(customer[key] || '');
                          }
                      }
                    }}
                  />
                );
              })}
              {action.special === 'order' && (
                <div className="admin-order-items">
                  <div>
                    <h3>Order items</h3>
                    <span>Catalog prices & stock are checked on the server.</span>
                  </div>
                  {items.map((item, index) => (
                    <div className="admin-order-item" key={index}>
                      <label>
                        <span>Variant / SKU</span>
                        <select
                          required
                          value={item.variant_id}
                          onChange={(e) =>
                            setItems(
                              items.map((row, i) =>
                                i === index ? { ...row, variant_id: e.target.value } : row,
                              ),
                            )
                          }
                        >
                          <option value="">Choose variant</option>
                          {(references.variants || []).map((variant) => (
                            <option key={String(variant.id)} value={String(variant.id)}>
                              {selectLabel(variant)}
                              {variant.stock_available !== undefined
                                ? ` · ${variant.stock_available} available`
                                : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Quantity</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          required
                          value={item.quantity}
                          onChange={(e) =>
                            setItems(
                              items.map((row, i) =>
                                i === index ? { ...row, quantity: Number(e.target.value) } : row,
                              ),
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="admin-icon-button"
                        aria-label={`Remove item ${index + 1}`}
                        disabled={items.length === 1}
                        onClick={() => setItems(items.filter((_, i) => i !== index))}
                      >
                        <X size={17} />
                      </button>
                    </div>
                  ))}
                  {!references.variants?.length && (
                    <p className="admin-field-help">
                      No purchasable variants available. Add and confirm real product stock first.
                    </p>
                  )}
                  <button
                    type="button"
                    className="admin-text-button"
                    onClick={() => setItems([...items, { variant_id: '', quantity: 1 }])}
                  >
                    <Plus size={16} />
                    Add another item
                  </button>
                </div>
              )}
              {action.confirm && (
                <label className="admin-confirmation">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    required
                  />
                  <span>{action.confirm}</span>
                </label>
              )}
            </fieldset>
            <footer className="admin-dialog-footer">
              <span>
                <ShieldCheck size={14} />
                {action.key === 'saveProduct'
                  ? 'Product, stock and store availability save together.'
                  : 'Server permissions apply'}
              </span>
              <button
                type="button"
                className="admin-button admin-button-subtle"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              {action.key === 'saveProduct' && !edit ? (
                <>
                  <button
                    className="admin-button admin-button-subtle"
                    type="submit"
                    name="saveMode"
                    value="draft"
                    disabled={saving || setupRequired}
                  >
                    {saving ? 'Saving...' : 'Save as Draft'}
                  </button>
                  <button
                    className="admin-button admin-button-gold"
                    type="submit"
                    name="saveMode"
                    value="publish"
                    disabled={saving || setupRequired}
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="admin-spinning" /> Saving...
                      </>
                    ) : (
                      'Save and Publish'
                    )}
                  </button>
                </>
              ) : (
                <button
                  className="admin-button admin-button-gold"
                  type="submit"
                  disabled={saving || setupRequired || Boolean(action.confirm && !confirmed)}
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="admin-spinning" /> Saving...
                    </>
                  ) : action.key === 'sendCampaign' ? (
                    'Send approved email'
                  ) : action.key === 'verifyPayment' ? (
                    'Confirm bank credit'
                  ) : (
                    'Save changes'
                  )}
                </button>
              )}
            </footer>
          </form>
        )}
      </div>
    </dialog>
  );
}
// Choose the input control from its field definition and resolve reference options by ID.
function FormField({
  field,
  value,
  references,
  disabledOptions = [],
  onChange,
}: {
  field: Field;
  value: unknown;
  references: Record<string, AdminRecord[]>;
  disabledOptions?: string[];
  onChange: (value: string) => void;
}) {
  const id = `admin-field-${field.key}`;
  const helpId = field.help ? `${id}-help` : undefined;
  const common = { id, name: field.key, required: field.required, 'aria-describedby': helpId };
  const options = (references[field.reference || ''] || []).filter(
    (option) => field.reference !== 'subscribers' || option.status === 'subscribed',
  );
  let control;
  if (field.type === 'checkbox')
    return (
      <label className="admin-checkbox-field">
        <input {...common} type="checkbox" defaultChecked={Boolean(value)} />
        <span>
          {field.label}
          {field.required && <b> *</b>}
        </span>
        {field.help && <small id={helpId}>{field.help}</small>}
      </label>
    );
  if (field.type === 'textarea' || field.type === 'json' || field.type === 'lines')
    control = (
      <textarea
        {...common}
        rows={field.type === 'json' ? 5 : 4}
        defaultValue={String(value || '')}
        placeholder={field.placeholder}
        className={field.type === 'json' ? 'admin-monospace' : ''}
      />
    );
  else if (field.type === 'select')
    control = (
      <select
        {...common}
        defaultValue={String(value || field.options?.[0] || '')}
        onChange={(e) => onChange(e.target.value)}
      >
        {!field.required && <option value="">Choose an option</option>}
        {field.options?.map((option) => (
          <option key={option} value={option} disabled={disabledOptions.includes(option)}>
            {field.optionLabels?.[option] || human(option)}
            {disabledOptions.includes(option) ? ' · confirm stock first' : ''}
          </option>
        ))}
      </select>
    );
  else if (field.type === 'reference')
    control = (
      <>
        <select
          {...common}
          defaultValue={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {options.length ? `Choose ${field.label.toLowerCase()}` : 'No records available'}
          </option>
          {options.map((option) => (
            <option
              key={String(option.id || option.user_id)}
              value={String(option.id || option.user_id)}
            >
              {selectLabel(option)}
            </option>
          ))}
          {Boolean(value) &&
            !options.some((option) => String(option.id || option.user_id) === String(value)) && (
              <option value={String(value)}>Selected record · {String(value).slice(0, 8)}</option>
            )}
        </select>
        {!options.length && !value && (
          <span className="admin-field-help">Add the related record first.</span>
        )}
      </>
    );
  else if (field.type === 'multi-reference') {
    const values = Array.isArray(value) ? value.map(String) : [];
    control = (
      <div className="admin-multi-select">
        {options.length ? (
          options.map((option) => (
            <label key={String(option.id)}>
              <input
                type="checkbox"
                name={field.key}
                value={String(option.id)}
                defaultChecked={values.includes(String(option.id))}
              />
              <span>{selectLabel(option)}</span>
            </label>
          ))
        ) : (
          <span className="admin-field-help">No records available to select.</span>
        )}
      </div>
    );
  } else if (field.type === 'file')
    control = (
      <input
        {...common}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={field.multiple}
      />
    );
  else
    control = (
      <input
        {...common}
        type={field.type || 'text'}
        min={field.min}
        step={field.step}
        defaultValue={typeof value === 'boolean' ? '' : String(value ?? '')}
        placeholder={field.placeholder}
      />
    );
  return (
    <div className={`admin-form-field ${field.full ? 'admin-form-full' : ''}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span> *</span>}
      </label>
      {control}
      {field.help && (
        <small className="admin-field-help" id={helpId}>
          {field.help}
        </small>
      )}
    </div>
  );
}
// Record details expose contextual actions while keeping raw tokens and storage keys out of the list.
function RecordDetails({
  record,
  references,
  section,
  owner,
  permissions,
  setupRequired,
  onClose,
  onAction,
}: {
  record: AdminRecord;
  references: Record<string, AdminRecord[]>;
  section: string;
  owner: boolean;
  permissions: Record<string, boolean>;
  setupRequired: boolean;
  onClose: () => void;
  onAction: (key: string, record: AdminRecord) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
    const el = dialogRef.current;
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    el?.addEventListener('cancel', cancel);
    return () => el?.removeEventListener('cancel', cancel);
  }, [onClose]);
  const customer = (
    Array.isArray(record.customers)
      ? record.customers[0]
      : record.customers || record.customer || {}
  ) as AdminRecord;
  let phone = String(record.customer_phone || record.phone || customer.phone || '').replace(
    /\D/g,
    '',
  );
  if (phone.startsWith('0') && phone.length === 11) phone = `234${phone.slice(1)}`;
  const name = scalar(record.name || record.customer_name || customer.name || 'there');
  const reminder =
    section === 'clients'
      ? `Hi ${name}, a reminder from ASCEND ATHLETICS: your ${record.package_name || 'training package'} renewal date is ${dateLabel(record.expiry_date)}. Please open your account to review renewal instructions. RISE. PUSH. BECOME.`
      : `Hi ${name}, regarding your ASCEND ATHLETICS order ${record.order_number || ''}. Please review your order's payment and fulfillment details. Let us know if you need help. RISE. PUSH. BECOME.`;
  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog admin-record-dialog"
      aria-labelledby="record-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-dialog-content">
        <header className="admin-dialog-header">
          <div>
            <p className="admin-eyebrow">{sections[section].singular.toUpperCase()} DETAILS</p>
            <h2 id="record-dialog-title">
              {scalar(
                record.name ||
                  record.order_number ||
                  record.sku ||
                  record.transfer_reference ||
                  record.package_name ||
                  record.title ||
                  'Record',
              )}
            </h2>
          </div>
          <button className="admin-icon-button" onClick={onClose} aria-label="Close record details">
            <X size={20} />
          </button>
        </header>
        <div className="admin-record-actions">
          {sections[section].rowActions
            .filter((key) => key !== 'resolveOrderStock' || Boolean(record.resolution_required))
            .map((key) => (
              <button
                className={`admin-button ${key === 'cancelOrder' || key === 'refundPayment' ? 'admin-button-danger' : 'admin-button-subtle'}`}
                key={key}
                onClick={() => onAction(key, record)}
                disabled={!actionAllowed(actions[key], owner, setupRequired, permissions)}
              >
                {actions[key].label}
                {actions[key].owner && !actions[key].permission && <LockKeyhole size={13} />}
              </button>
            ))}
          {phone && (section === 'orders' || section === 'clients' || section === 'customers') && (
            <a
              className="admin-button admin-button-subtle"
              href={`https://wa.me/${phone}?text=${encodeURIComponent(reminder)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Prepare WhatsApp message <ArrowUpRight size={15} />
            </a>
          )}
        </div>
        {Boolean(record.resolution_required) && (
          <div className="admin-alert admin-alert-error">
            <CircleAlert size={18} />
            Payment was received after a stock reservation expired. Check or restock physical
            inventory, then use the owner-only Resolve stock availability action. Cancel and record
            an actual refund if the order cannot be supplied.
          </div>
        )}
        {section === 'customers' && <CustomerHistory record={record} references={references} />}
        {section === 'payments' && <PaymentEvidencePanel record={record} />}
        {section === 'products' && <ProductPhotographs record={record} onAction={onAction} />}
        <dl className="admin-record-fields">
          {Object.entries(record)
            .filter(
              ([key]) =>
                !key.includes('token') &&
                !key.includes('hash') &&
                !key.includes('storage_path') &&
                key !== 'body_html',
            )
            .map(([key, value]) => (
              <div key={key}>
                <dt>{human(key)}</dt>
                <dd>
                  {typeof value === 'object' && value !== null ? (
                    <pre>{JSON.stringify(value, null, 2)}</pre>
                  ) : key.includes('amount') || key === 'price' || key === 'delivery_fee' ? (
                    money(value)
                  ) : key.endsWith('_at') || key.endsWith('_date') ? (
                    dateLabel(value)
                  ) : (
                    scalar(value)
                  )}
                </dd>
              </div>
            ))}
        </dl>
        <footer className="admin-dialog-footer">
          <span>
            <ShieldCheck size={14} /> Authorized staff view
          </span>
          <button className="admin-button admin-button-gold" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </dialog>
  );
}

// Payment evidence uses private, temporary links fetched only when staff request a proof.
function PaymentEvidencePanel({ record }: { record: AdminRecord }) {
  const proofs = Array.isArray(record.payment_evidence)
    ? (record.payment_evidence as AdminRecord[])
    : [];
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  async function view(id: string) {
    setLoading(id);
    setError('');
    try {
      const response = await fetch(`/api/admin/evidence/${encodeURIComponent(id)}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Evidence could not be opened.');
      const url = result.data?.url || result.data?.signedUrl || result.url;
      if (!url) throw new Error('A private evidence link could not be created.');
      setUrls((current) => ({ ...current, [id]: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open private evidence.');
    } finally {
      setLoading('');
    }
  }
  if (!proofs.length)
    return (
      <div className="admin-proof-empty">
        <Info size={16} />
        No proof image attached to this transfer claim.
      </div>
    );
  return (
    <section className="admin-evidence-panel" aria-label="Private payment evidence">
      <h3>Private payment evidence</h3>
      <p>
        A receipt is supporting evidence. Confirm the actual bank credit before verifying payment.
      </p>
      {error && (
        <div className="admin-alert admin-alert-error" role="alert">
          {error}
        </div>
      )}
      {proofs.map((proof, i) => (
        <div key={String(proof.id)}>
          {urls[String(proof.id)] ? (
            <a href={urls[String(proof.id)]} target="_blank" rel="noopener noreferrer">
              <img
                src={urls[String(proof.id)]}
                alt={`Customer-submitted transfer proof ${i + 1}`}
              />
              <span>
                Open full image <ExternalLink size={13} />
              </span>
            </a>
          ) : (
            <button
              className="admin-button admin-button-subtle"
              onClick={() => view(String(proof.id))}
              disabled={Boolean(loading)}
            >
              {loading === proof.id ? (
                <Loader2 size={15} className="admin-spinning" />
              ) : (
                <Eye size={15} />
              )}
              View proof {i + 1}
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
// Gallery images can use existing Supabase URLs or new R2 URLs resolved by the server.
function ProductPhotographs({
  record,
  onAction,
}: {
  record: AdminRecord;
  onAction: (key: string, record: AdminRecord) => void;
}) {
  const images = Array.isArray(record.product_images)
    ? (record.product_images as AdminRecord[])
    : [];
  if (!images.length)
    return (
      <div className="admin-proof-empty">
        <ImagePlus size={17} />
        No photographs uploaded yet. Use Upload photograph to add official product imagery.
      </div>
    );
  return (
    <section className="admin-photo-panel" aria-label="Product photograph gallery">
      <h3>Official product photographs</h3>
      <div>
        {images.map((photo, index) => {
          const photoUrl = photo.url || (Array.isArray(record.images) ? record.images[index] : '');
          return (
            <div key={String(photo.id)}>
              {photoUrl ? (
                <img
                  src={String(photoUrl)}
                  alt={String(photo.alt || record.name || 'Product photograph')}
                />
              ) : (
                <span className="admin-photo-placeholder">
                  <ImagePlus size={25} />
                </span>
              )}
              <small>{scalar(photo.alt || record.name)}</small>
              <button
                type="button"
                className="admin-text-button"
                onClick={() => onAction('deleteProductImage', photo)}
              >
                Remove photograph
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Secondary lists let a section manage related settings, categories and supporting records.
function RelatedRecords({
  section,
  references,
  owner,
  permissions,
  setupRequired,
  onAction,
}: {
  section: string;
  references: Record<string, AdminRecord[]>;
  owner: boolean;
  permissions: Record<string, boolean>;
  setupRequired: boolean;
  onAction: (key: string, record?: AdminRecord) => void;
}) {
  const groups =
    section === 'content'
      ? [
          {
            title: 'Collections & product drops',
            source: 'collections',
            action: 'saveCollection',
            subtitle: 'Schedule a launch or edit a published collection.',
          },
          {
            title: 'Shop categories',
            source: 'categories',
            action: 'saveCategory',
            subtitle: 'Organize your merchandise catalog.',
          },
        ]
      : section === 'marketing'
        ? [
            {
              title: 'Newsletter subscribers',
              source: 'subscribers',
              action: 'addSubscriber',
              subtitle: 'Only subscribers with explicit marketing consent may receive campaigns.',
            },
            {
              title: 'Upcoming collections',
              source: 'collections',
              action: 'saveCollection',
              subtitle: 'Edit launch dates, products and shareable collection URLs.',
            },
          ]
        : section === 'finances'
          ? [
              {
                title: 'Recorded expenses',
                source: 'expenses',
                action: 'saveExpense',
                subtitle: 'Actual business expenses, kept separate from revenue.',
              },
              {
                title: 'Recorded refunds',
                source: 'refunds',
                action: 'refundPayment',
                subtitle:
                  'Refunds paid outside the platform; original payment records are retained.',
              },
            ]
          : section === 'settings'
            ? [
                {
                  title: 'Delivery rates',
                  source: 'delivery_rates',
                  action: 'saveDeliveryRate',
                  subtitle:
                    'Known fees for supported locations. Other destinations require customer-approved quotes.',
                },
                {
                  title: 'Staff access',
                  source: 'staff',
                  action: 'setStaffRole',
                  subtitle: 'Owner-only role management. All access changes are audited.',
                },
              ]
            : [];
  if (!groups.length) return null;
  return (
    <div className="admin-related-grid">
      {groups.map((group) => {
        const rows = references[group.source] || [];
        return (
          <div className="admin-data-panel admin-related-panel" key={group.source}>
            <div className="admin-panel-title">
              <div>
                <h2>
                  {group.title}
                  <span className="admin-count">{rows.length}</span>
                </h2>
                <p>{group.subtitle}</p>
              </div>
              <button
                className="admin-icon-button"
                aria-label={actions[group.action].label}
                onClick={() => onAction(group.action)}
                disabled={!actionAllowed(actions[group.action], owner, setupRequired, permissions)}
              >
                <Plus size={15} />
              </button>
            </div>
            {rows.length ? (
              <ul>
                {rows.map((row) => {
                  const profile = (row.profiles || {}) as AdminRecord;
                  const label =
                    group.source === 'staff'
                      ? scalar(profile.full_name || profile.email || row.user_id)
                      : group.source === 'delivery_rates'
                        ? [row.state, row.city, row.area].filter(Boolean).join(' · ')
                        : scalar(row.name || row.email || row.description || row.reason);
                  return (
                    <li key={String(row.id || row.user_id)}>
                      <div>
                        <strong>{label}</strong>
                        <small>
                          {group.source === 'expenses' || group.source === 'refunds'
                            ? `${money(row.amount)} · ${dateLabel(row.spent_on || row.created_at)}`
                            : group.source === 'delivery_rates'
                              ? money(row.fee)
                              : row.email
                                ? scalar(row.email)
                                : row.launch_at
                                  ? `Launch: ${dateLabel(row.launch_at)}`
                                  : row.slug
                                    ? `/${group.source}/${row.slug}`
                                    : human(row.role || row.status || '')}
                        </small>
                      </div>
                      <span
                        className={`admin-badge status-${row.status || row.role || (row.active === false ? 'draft' : 'active')}`}
                      >
                        {human(
                          row.status || row.role || (row.active === false ? 'inactive' : 'active'),
                        )}
                      </span>
                      {!['subscribers', 'expenses', 'refunds'].includes(group.source) && (
                        <button
                          className="admin-row-open"
                          aria-label={`Edit ${label}`}
                          onClick={() => onAction(group.action, row)}
                          disabled={
                            !actionAllowed(actions[group.action], owner, setupRequired, permissions)
                          }
                        >
                          <ArrowUpRight size={16} />
                        </button>
                      )}
                      {group.source === 'staff' && (
                        <button
                          className="admin-row-open"
                          aria-label={`Revoke staff access for ${label}`}
                          title="Revoke staff access"
                          onClick={() => onAction('revokeStaffAccess', row)}
                          disabled={!owner && !setupRequired}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="admin-small-empty">
                {setupRequired ? 'Available after setup.' : 'No records added yet.'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Group the authorized reference records belonging to this customer for the detail view.
function CustomerHistory({
  record,
  references,
}: {
  record: AdminRecord;
  references: Record<string, AdminRecord[]>;
}) {
  const orders = (references.orders || []).filter((row) => row.customer_id === record.id);
  const enrollments = (references.enrollments || []).filter((row) => row.customer_id === record.id);
  const invoices = (references.invoices || []).filter((row) => row.customer_id === record.id);
  const invoiceIds = new Set(invoices.map((row) => row.id));
  const payments = (references.payments || []).filter((row) => invoiceIds.has(row.invoice_id));
  const groups = [
    {
      title: 'Merchandise orders',
      rows: orders,
      label: (row: AdminRecord) => String(row.order_number || row.id),
      detail: (row: AdminRecord) => `${human(row.source)} · ${human(row.fulfillment_status)}`,
      amount: (row: AdminRecord) => row.total_amount,
      href: '/admin/orders',
    },
    {
      title: 'Coaching history',
      rows: enrollments,
      label: (row: AdminRecord) => String(row.package_name),
      detail: (row: AdminRecord) =>
        `${human(row.mode)} · ${human(row.status)} · Renewal ${dateLabel(row.expiry_date)}`,
      amount: (row: AdminRecord) => row.price,
      href: '/admin/clients',
    },
    {
      title: 'Invoices & balances',
      rows: invoices,
      label: (row: AdminRecord) => `${human(row.payment_status)} invoice`,
      detail: (row: AdminRecord) =>
        `Verified paid ${money(row.amount_paid)} · Outstanding ${money(row.outstanding_amount)}`,
      amount: (row: AdminRecord) => row.total_amount,
      href: '/admin/payments',
    },
    {
      title: 'Transfer history',
      rows: payments,
      label: (row: AdminRecord) => String(row.transfer_reference),
      detail: (row: AdminRecord) => `${human(row.status)} · Claimed ${money(row.submitted_amount)}`,
      amount: (row: AdminRecord) => (row.status === 'verified' ? row.amount_received : null),
      href: '/admin/payments',
    },
  ];
  return (
    <section
      className="admin-customer-history"
      aria-label="Linked customer purchase and coaching history"
    >
      {groups.map((group) => (
        <details key={group.title}>
          <summary>
            {group.title}
            <span>{group.rows.length}</span>
            <ChevronDown size={14} />
          </summary>
          {group.rows.length ? (
            <ul>
              {group.rows.map((row) => (
                <li key={String(row.id)}>
                  <div>
                    <strong>{group.label(row)}</strong>
                    <small>{group.detail(row)}</small>
                  </div>
                  <b>{money(group.amount(row))}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>No linked records yet.</p>
          )}
          <Link href={group.href}>
            Open management section <ArrowRight size={13} />
          </Link>
        </details>
      ))}
    </section>
  );
}
