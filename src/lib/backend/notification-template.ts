/** Builds escaped transactional email content from recorded order, invoice and coaching information. */
import { decryptPrivateToken } from './secure-token';

type Row = Record<string, any>;
export function escapeEmail(value: unknown) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
function ngn(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Notification amount unavailable.');
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(amount);
}
function link(path: string, siteUrl: string) {
  const site = new URL(siteUrl);
  if (!['https:', 'http:'].includes(site.protocol)) throw new Error('Invalid email site URL.');
  return new URL(path, site).toString();
}
function invoiceDetails(invoice: Row) {
  if (invoice.total_amount == null)
    return '<p>The final delivery fee is awaiting confirmation and your approval. Wait for the confirmed total before making a bank transfer.</p>';
  return (
    '<p>Invoice total: <strong>' +
    escapeEmail(ngn(invoice.total_amount)) +
    '</strong><br>Outstanding balance: ' +
    escapeEmail(ngn(invoice.outstanding_amount)) +
    '</p>'
  );
}
function bankInstructions(settings: Row) {
  if (!settings.bank_name || !settings.bank_account_number || !settings.bank_account_holder)
    return '<p>Bank transfer instructions will be available after the owner confirms the business bank details.</p>';
  return (
    '<p>Bank: ' +
    escapeEmail(settings.bank_name) +
    '<br>Account: ' +
    escapeEmail(settings.bank_account_number) +
    '<br>Account holder: ' +
    escapeEmail(settings.bank_account_holder) +
    '</p>' +
    (settings.payment_instructions
      ? '<p>' + escapeEmail(settings.payment_instructions) + '</p>'
      : '') +
    '<p>Submit your transfer reference and optional receipt through your private link. A receipt is a transfer claim; the owner confirms payment after checking the actual bank credit.</p>'
  );
}
function button(url: string, label: string) {
  return (
    '<p><a href="' +
    escapeEmail(url) +
    '" style="display:inline-block;padding:14px 20px;background:#91d62f;color:#101510;text-decoration:none;font-weight:700">' +
    escapeEmail(label) +
    '</a></p>'
  );
}
// Render payment and activation states as recorded, keeping a submitted receipt distinct from verified payment.
export function composeNotification(
  row: Row,
  settings: Row,
  siteUrl: string,
  secret: string,
  encryptedOrderToken?: string,
) {
  const payload = row.payload || {},
    customer = row.customers || {},
    enrollment = row.coaching_enrollments || {},
    invoice = row.invoices || {},
    order = row.orders || {};
  let subject: string, body: string;
  const account = link('/account', siteUrl);
  if (row.kind === 'order_created') {
    const ciphertext = payload.guest_token_encrypted || encryptedOrderToken;
    if (!ciphertext)
      throw new Error(
        'Private checkout link is unavailable; preserve the checkout link and reconcile this notification.',
      );
    const token = decryptPrivateToken(ciphertext, secret);
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid private checkout link.');
    const number = payload.order_number || order.order_number;
    subject = 'Your ASCEND order ' + String(number || '');
    body =
      '<h1>Your order is recorded.</h1><p>Order reference: <strong>' +
      escapeEmail(number) +
      '</strong></p>' +
      invoiceDetails(invoice);
    if (order.delivery_status === 'approved' && invoice.total_amount != null)
      body += bankInstructions(settings);
    else
      body +=
        '<p>Payment instructions will appear in your private order page once the final delivery amount is approved.</p>';
    body +=
      '<p>Your items are reserved temporarily. Payment verification and available stock are required before fulfillment.</p>' +
      button(link('/orders/' + token, siteUrl), 'View private order and payment instructions') +
      '<p>Keep this link private. Anyone with it can view your order.</p>';
  } else if (row.kind === 'enrollment_requested') {
    subject = 'Your ASCEND coaching request';
    body =
      '<h1>Your training request is recorded.</h1><p>Requested package: <strong>' +
      escapeEmail(payload.package_name || enrollment.package_name) +
      '</strong></p>' +
      invoiceDetails(invoice) +
      bankInstructions(settings) +
      '<p>Training starts after payment verification and owner activation with a confirmed start date.</p>' +
      button(account, 'View coaching invoice and submit a transfer claim');
  } else if (row.kind === 'payment_verified') {
    subject = 'ASCEND bank transfer confirmed';
    body =
      '<h1>Your bank credit is confirmed.</h1><p>The owner verified a bank credit of <strong>' +
      escapeEmail(ngn(payload.amount_received)) +
      '</strong> against your invoice.</p>' +
      invoiceDetails(payload.total_amount != null ? payload : invoice) +
      '<p>A partial payment leaves the remaining balance payable. Fulfillment and coaching activation are confirmed separately.</p>';
    if (encryptedOrderToken) {
      const token = decryptPrivateToken(encryptedOrderToken, secret);
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid private checkout link.');
      body += button(link('/orders/' + token, siteUrl), 'View your private order');
    } else if (row.enrollment_id) body += button(account, 'View your coaching account');
    else
      body +=
        '<p>Use the private order link saved at checkout to view your order status. Contact ASCEND with your order reference if you need assistance.</p>';
  } else if (row.kind === 'enrollment_activated') {
    if (!payload.start_date && !enrollment.start_date)
      throw new Error('Confirmed coaching start date unavailable.');
    subject = 'Your ASCEND coaching is active';
    body =
      '<h1>Your training is active.</h1><p>Package: <strong>' +
      escapeEmail(payload.package_name || enrollment.package_name) +
      '</strong><br>Confirmed start: ' +
      escapeEmail(payload.start_date || enrollment.start_date) +
      (payload.expiry_date || enrollment.expiry_date
        ? '<br>Renewal date: ' + escapeEmail(payload.expiry_date || enrollment.expiry_date)
        : '') +
      '</p>' +
      button(account, 'Manage your training');
  } else if (/^renewal_\d+$/.test(row.kind)) {
    if (!enrollment.expiry_date) throw new Error('Renewal date unavailable.');
    subject = 'ASCEND training renewal reminder';
    body =
      '<h1>Your training renewal.</h1><p>Your ' +
      escapeEmail(enrollment.package_name) +
      ' plan expires on ' +
      escapeEmail(enrollment.expiry_date) +
      '.</p><p>Sign in to request renewal and view the bank transfer instructions. Your renewal starts after payment verification and coach approval.</p>' +
      button(account, 'Manage your coaching account');
  } else throw new Error('Unsupported notification kind.');
  const html =
    '<html><body style="margin:0;background:#f4f3ed;color:#172016;font-family:Arial,sans-serif"><main style="max-width:600px;margin:0 auto;padding:32px 24px"><p style="font-weight:800;letter-spacing:3px">ASCEND ATHLETICS</p><p>Hello ' +
    escapeEmail(customer.name || 'there') +
    ',</p>' +
    body +
    '<hr><p>ASCEND ATHLETICS · BUILT FOR YOUR NEXT LEVEL.</p></main></body></html>';
  return { subject, html };
}
