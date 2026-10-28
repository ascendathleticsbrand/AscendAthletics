/**
 * Pure shopping-bag rules shared by the provider and its tests.
 * Treat browser storage as untrusted: discard invalid rows, merge matching variants and cap quantities.
 */
export type CartItem = {
  variant_id: string;
  product_id: string;
  slug: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  image: string | null;
  price: number;
  quantity: number;
  available: number;
};
const MAX_ITEMS = 40;
const MAX_QUANTITY = 99;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function shortText(value: unknown, limit: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit
    ? value.trim()
    : null;
}
function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}
/** Convert one untrusted saved row into a validated, bounded cart item. */
function itemFrom(value: unknown): CartItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const name = shortText(item.name, 180),
    sku = shortText(item.sku, 80),
    slug = shortText(item.slug, 180);
  if (
    !name ||
    !sku ||
    !slug ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    typeof item.variant_id !== 'string' ||
    !uuid.test(item.variant_id) ||
    typeof item.product_id !== 'string' ||
    !uuid.test(item.product_id)
  )
    return null;
  if (
    typeof item.price !== 'number' ||
    !Number.isFinite(item.price) ||
    item.price <= 0 ||
    item.price > 100000000 ||
    typeof item.quantity !== 'number' ||
    !Number.isInteger(item.quantity) ||
    item.quantity < 1 ||
    typeof item.available !== 'number' ||
    !Number.isInteger(item.available) ||
    item.available < 1 ||
    item.available > 1000000
  )
    return null;
  return {
    variant_id: item.variant_id,
    product_id: item.product_id,
    name,
    sku,
    slug,
    price: item.price,
    quantity: Math.min(item.quantity, item.available, MAX_QUANTITY),
    available: item.available,
    size: shortText(item.size, 50),
    color: shortText(item.color, 60),
    image: imageUrl(item.image),
  };
}
/** Merge duplicate variant rows without exceeding the per-item or bag limits. */
export function normalizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const rows = new Map<string, CartItem>();
  for (const candidate of value.slice(0, 1000)) {
    const item = itemFrom(candidate);
    if (!item) continue;
    const previous = rows.get(item.variant_id);
    if (!previous && rows.size >= MAX_ITEMS) continue;
    rows.set(item.variant_id, {
      ...item,
      quantity: Math.min((previous?.quantity || 0) + item.quantity, item.available, MAX_QUANTITY),
    });
  }
  return [...rows.values()];
}
export function addCartItem(current: CartItem[], item: CartItem) {
  return normalizeCart([...current, item]);
}
/** Keep edits within whole-unit, currently available and per-item quantity limits. */
export function changeCartQuantity(current: CartItem[], id: string, quantity: number) {
  if (!Number.isFinite(quantity)) return current;
  return current.map((item) =>
    item.variant_id === id
      ? {
          ...item,
          quantity: Math.max(1, Math.min(Math.trunc(quantity), item.available, MAX_QUANTITY)),
        }
      : item,
  );
}
