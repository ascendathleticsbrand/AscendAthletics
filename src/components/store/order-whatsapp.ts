/**
 * Builds the WhatsApp invoice text from saved order, invoice and item snapshots.
 * Keeps unconfirmed delivery totals explicit and limits the encoded URL while preserving the private invoice link.
 */
import { money, whatsapp, whatsappNumber } from '../../lib/format';

type Amount = number | string | null | undefined;
export type OrderWhatsAppSnapshot = {
  order: {
    order_number: string;
    customer_name?: string | null;
    customer_phone?: string | null;
    fulfillment_method?: string | null;
    delivery_status?: string | null;
    delivery_details?: Record<string, unknown> | null;
    subtotal?: Amount;
    delivery_fee?: Amount;
  };
  invoice: {
    id: string;
    invoice_number?: string | null;
    total_amount?: Amount;
    payment_status?: string | null;
    amount_paid?: Amount;
  };
  items?: {
    product_name?: string | null;
    sku?: string | null;
    size?: string | null;
    color?: string | null;
    quantity: Amount;
    unit_price: Amount;
  }[];
  bank_details?: {
    pickup_location?: string | null;
    bank_name?: string | null;
    bank_account_number?: string | null;
    bank_account_holder?: string | null;
    payment_instructions?: string | null;
  } | null;
};

// Keep the handoff usable for large carts and messaging/browser URL limits.
export const MAX_ORDER_WHATSAPP_URL_LENGTH = 7500;

/** Normalize user-entered text and cap its encoded length without splitting Unicode characters. */
function text(value: unknown, budget = 240) {
  const source = String(value ?? '')
    .toWellFormed()
    .replace(/\s+/g, ' ')
    .trim();
  if (encodeURIComponent(source).length <= budget) return source;
  let clipped = '';
  for (const character of source) {
    if (encodeURIComponent(clipped + character + '…').length > budget) break;
    clipped += character;
  }
  return clipped + '…';
}
function numeric(value: Amount) {
  if (value == null || (typeof value === 'string' && !value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
function amount(value: Amount) {
  const parsed = numeric(value);
  return parsed == null ? 'Not confirmed' : money(parsed);
}
/** Restrict invoice links to the private order route over HTTPS, with HTTP allowed for local testing. */
function orderLink(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('A complete secure order URL is required.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    value.length > 512 ||
    url.username ||
    url.password ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && local)) ||
    !/^\/order-status\/[A-Za-z0-9_-]{32,128}$/.test(url.pathname)
  )
    throw new Error('A complete secure order URL is required.');
  url.search = '';
  url.hash = '';
  return url.href;
}
/** Describe saved verification status without implying that a submitted receipt is confirmed payment. */
function paymentStatus(status: string | null | undefined) {
  switch (status) {
    case 'paid':
      return 'Paid — owner verified';
    case 'partially_paid':
      return 'Partially paid — owner verification recorded';
    case 'refunded':
      return 'Refund recorded';
    case 'evidence_submitted':
      return 'Evidence submitted — awaiting owner verification';
    case 'rejected':
      return 'Evidence rejected — payment not verified';
    default:
      return 'Pending — awaiting owner verification';
  }
}

/** Uses saved order/invoice records, never prices or quantities from the local bag. */
export function buildOrderWhatsApp(
  snapshot: OrderWhatsAppSnapshot,
  secureAbsoluteOrderUrl: string,
  businessNumber?: string | null,
) {
  const privateLink = orderLink(secureAbsoluteOrderUrl);
  const digits = (businessNumber || '').replace(/\D/g, '');
  const recipient = /^[1-9]\d{6,14}$/.test(digits) ? digits : whatsappNumber;
  const { order, invoice, items = [], bank_details: bank } = snapshot;
  const delivery = order.fulfillment_method === 'delivery';
  const needsQuote =
    delivery && (order.delivery_status === 'pending' || numeric(order.delivery_fee) == null);
  const needsApproval = delivery && order.delivery_status === 'quoted';
  const details = order.delivery_details || {};
  const before = [
    'ASCEND ATHLETICS — Order invoice (NGN)',
    `Order: ${text(order.order_number, 100)}`,
    `Invoice: ${text(invoice.invoice_number || invoice.id, 160)}`,
    `Customer: ${text(order.customer_name, 240)}`,
    `Phone: ${text(order.customer_phone, 100)}`,
    '',
    `Items (${items.length} ${items.length === 1 ? 'line' : 'lines'}):`,
  ];
  const fulfillment = delivery
    ? [
        'Receive order: Nationwide delivery',
        `Recipient: ${text(details.recipient_name, 200)}${details.phone ? ` · ${text(details.phone, 100)}` : ''}`,
        `Delivery address: ${text([details.address, details.area, details.city, details.state].filter(Boolean).join(', '), 700)}`,
        ...(details.landmark ? [`Landmark: ${text(details.landmark, 200)}`] : []),
      ]
    : [
        'Receive order: Pickup',
        `Pickup location: ${text(bank?.pickup_location, 700) || 'To be confirmed with ASCEND'}`,
      ];
  const after = [
    '',
    ...fulfillment,
    '',
    `Merchandise subtotal: ${amount(order.subtotal)}`,
    `Delivery fee: ${needsQuote ? 'Awaiting delivery quote' : needsApproval ? `${amount(order.delivery_fee)} (awaiting approval)` : amount(order.delivery_fee)}`,
    `Total: ${needsQuote ? 'Awaiting delivery quote' : needsApproval ? 'Awaiting delivery quote approval' : amount(invoice.total_amount)}`,
    `Payment: ${paymentStatus(invoice.payment_status)}`,
    ...(bank?.bank_account_number
      ? [
          '',
          'Bank transfer details:',
          `Bank: ${text(bank.bank_name, 120)}`,
          `Account number: ${text(bank.bank_account_number, 80)}`,
          `Account name: ${text(bank.bank_account_holder, 180)}`,
          `Transfer narration: ${text(order.order_number, 100)}`,
          ...(bank.payment_instructions ? [text(bank.payment_instructions, 500)] : []),
        ]
      : []),
    '',
    'Private order / complete invoice link (share only with ASCEND):',
    privateLink,
  ];
  // Keep complete totals and the private link; shorten only the item list when the URL reaches its budget.
  const itemLines: string[] = [];
  const compose = (lines: string[], omitted: number) =>
    [
      ...before,
      ...lines,
      ...(omitted
        ? [
            `+ ${omitted} more item ${omitted === 1 ? 'line' : 'lines'}; see the complete invoice link below.`,
          ]
        : []),
      ...after,
    ].join('\n');
  for (const item of items) {
    const quantity = numeric(item.quantity);
    const price = numeric(item.unit_price);
    const total =
      quantity != null && Number.isInteger(quantity) && quantity > 0 && price != null
        ? quantity * price
        : null;
    const variant = [text(item.size, 90), text(item.color, 100)].filter(Boolean).join(' / ');
    const line = `• ${text(item.product_name || item.sku || 'Merchandise', 240)}${variant ? ` · ${variant}` : ''} × ${quantity != null && Number.isInteger(quantity) && quantity > 0 ? quantity : '?'} — ${amount(total)}`;
    const candidate = [...itemLines, line];
    if (
      whatsapp(compose(candidate, items.length - candidate.length), recipient).length >
      MAX_ORDER_WHATSAPP_URL_LENGTH
    )
      break;
    itemLines.push(line);
  }
  const message = compose(itemLines, items.length - itemLines.length);
  return { message, url: whatsapp(message, recipient) };
}
