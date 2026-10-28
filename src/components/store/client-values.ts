/**
 * Small browser-safe helpers for values received from forms, URLs and API relations.
 * They normalize navigation targets, private lookup tokens, embedded invoices and proposed delivery totals.
 */
/** Reject external, protocol-relative and encoded redirect destinations. */
export function safeInternalPath(value: unknown, fallback = '/account') {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  )
    return fallback;
  try {
    let decoded = value;
    for (let i = 0; i < 2; i++) decoded = decodeURIComponent(decoded);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(decoded)) return fallback;
    const url = new URL(value, 'https://ascend.invalid');
    return url.origin === 'https://ascend.invalid'
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}
/** Accept a complete private link or token, rather than treating an order number as a credential. */
export function secureOrderToken(value: unknown) {
  if (typeof value !== 'string') return null;
  const token = value.trim().split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
  return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}
/** Normalize the object-or-array shape of an embedded invoice relation. */
export function embeddedInvoice(value: unknown): Record<string, any> | undefined {
  const invoice = Array.isArray(value) ? value[0] : value;
  return invoice && typeof invoice === 'object' ? (invoice as Record<string, any>) : undefined;
}
/** Add only finite, non-negative confirmed amounts; missing quote data stays unknown. */
export function deliveryQuoteTotal(subtotal: unknown, fee: unknown): number | null {
  if (subtotal == null || fee == null || subtotal === '' || fee === '') return null;
  const numeric = (value: unknown) =>
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  const values = [numeric(subtotal), numeric(fee)];
  const total = values[0] + values[1];
  return values.every((value) => Number.isFinite(value) && value >= 0) && Number.isFinite(total)
    ? total
    : null;
}
