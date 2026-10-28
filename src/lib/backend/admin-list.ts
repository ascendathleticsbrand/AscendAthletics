/** Defines allowed dashboard filters and builds escaped search expressions before database pagination. */
import { z } from 'zod';

export const adminListOptionsSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(25),
  search: z.string().trim().max(120).catch(''),
  filter: z.string().max(80).catch('all'),
  paymentFilter: z
    .enum([
      'all',
      'outstanding',
      'pending',
      'evidence_submitted',
      'partially_paid',
      'paid',
      'rejected',
      'refunded',
    ])
    .catch('all'),
  stockFilter: z.enum(['all', 'unconfirmed', 'low_stock', 'available']).catch('all'),
});
export type AdminListOptions = {
  range?: string;
  from?: string;
  to?: string;
  page?: number | string;
  pageSize?: number | string;
  search?: string;
  filter?: string;
  paymentFilter?: string;
  stockFilter?: string;
};
export const adminFilters: Record<string, { column: string; values: string[] }> = {
  products: { column: 'status', values: ['draft', 'coming_soon', 'active', 'unavailable'] },
  orders: {
    column: 'fulfillment_status',
    values: [
      'pending',
      'processing',
      'ready_for_pickup',
      'shipped',
      'delivered',
      'picked_up',
      'cancelled',
    ],
  },
  clients: { column: 'status', values: ['requested', 'active', 'expired', 'cancelled'] },
  packages: { column: 'mode', values: ['physical', 'online'] },
  payments: { column: 'status', values: ['pending', 'evidence_submitted', 'verified', 'rejected'] },
  marketing: { column: 'status', values: ['draft', 'approved', 'sending', 'sent'] },
};
export const adminSearchColumns: Record<string, string[]> = {
  products: ['name', 'slug', 'description'],
  inventory: ['product_variant_search'],
  orders: ['order_number', 'customer_name', 'customer_email', 'customer_phone', 'source'],
  overview: ['order_number', 'customer_name', 'customer_email', 'customer_phone', 'source'],
  customers: ['name', 'email', 'phone'],
  clients: ['coaching_enrollment_search'],
  packages: ['name', 'description'],
  payments: ['transfer_reference', 'bank_name'],
  finances: ['transfer_reference', 'bank_name'],
  marketing: ['name', 'subject'],
  content: ['section', 'title', 'body'],
};
// Quoted PostgREST values keep punctuation from changing filter syntax.
export function adminSearchFilter(section: string, search: string) {
  const pattern = '%' + search.replace(/[%_\\]/g, '\\$&') + '%';
  const quoted = '"' + pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  return (adminSearchColumns[section] || []).map((column) => column + '.ilike.' + quoted).join(',');
}
