'use client';

/**
 * Private order views: accept a lookup link, load the saved invoice and show fulfillment updates.
 * Delivery quote approval and payment evidence call token-protected APIs, then reload the authoritative records.
 */
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { api } from './request';
import { EvidenceForm } from './evidence-form';
import { OrderWhatsAppHandoff } from './order-whatsapp-handoff';
import { secureOrderToken, deliveryQuoteTotal } from './client-values';
import { money, businessDate, label, whatsapp } from '@/lib/format';
/** Validate the entered private token before routing to the order page. */
export function OrderLookup() {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  return (
    <form
      className="panel login-box"
      onSubmit={(e) => {
        e.preventDefault();
        const last = secureOrderToken(token);
        if (!last) {
          setError(
            'Use the secure order link or token received at checkout. An order number alone cannot open private details.',
          );
          return;
        }
        router.push('/order-status/' + last);
      }}
    >
      <h2>Find your order</h2>
      <p>Paste your secure order link or lookup token. Keep this link private.</p>
      <label>
        <span className="field-label">Secure order link or token</span>
        <input
          className="field"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          autoComplete="off"
        />
      </label>
      <p role="alert" className="form-feedback error">
        {error}
      </p>
      <button className="button" style={{ width: '100%' }}>
        View order <ArrowUpRight size={16} />
      </button>
    </form>
  );
}
/** Reload the current token snapshot after quote approval or payment-evidence submission. */
export function OrderStatus({
  token,
  autoWhatsApp = false,
  businessNumber,
  paystackEnabled = false,
  paymentStatus,
}: {
  token: string;
  autoWhatsApp?: boolean;
  businessNumber?: string;
  paystackEnabled?: boolean;
  paymentStatus?: 'success' | 'not-completed';
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [paystackBusy, setPaystackBusy] = useState(false);
  const currentToken = useRef(token);
  currentToken.current = token;
  const load = async () => {
    try {
      const result = await api('/api/orders/' + token);
      if (currentToken.current === token) {
        setData(result);
        setError('');
      }
    } catch (err) {
      if (currentToken.current === token)
        setError(err instanceof Error ? err.message : 'Unable to load this order.');
    }
  };
  useEffect(() => {
    setData(null);
    setError('');
    load();
  }, [token]);
  if (!data)
    return (
      <div className="panel">
        <p role={error ? 'alert' : 'status'}>{error || 'Loading your secure order…'}</p>
        <Link href="/order-status" className="text-link">
          Enter another order link
        </Link>
      </div>
    );
  const { order, invoice, items = [], payments = [], bank_details: bank } = data;
  if (!order || !invoice)
    return (
      <div className="panel">
        <p role="alert">
          The order records are unavailable. Please refresh or contact ASCEND using your secure
          order link.
        </p>
        <button className="button secondary small" onClick={load}>
          Retry
        </button>
      </div>
    );
  const payable =
    invoice.total_amount != null &&
    order.delivery_status !== 'pending' &&
    order.delivery_status !== 'quoted' &&
    order.fulfillment_status !== 'cancelled';
  const needsQuote = order.fulfillment_method === 'delivery' && order.delivery_status === 'pending';
  const quoted = order.fulfillment_method === 'delivery' && order.delivery_status === 'quoted';
  const proposedTotal = quoted ? deliveryQuoteTotal(order.subtotal, order.delivery_fee) : null;
  const displayedTotal = quoted ? proposedTotal : invoice.total_amount;
  return (
    <>
      <div className="account-header">
        <div>
          <p className="eyebrow">SECURE ORDER LOOKUP</p>
          <h1>{order.order_number}</h1>
        </div>
        <span className="status-badge">{label(invoice.payment_status)}</span>
      </div>
      <div className="notice">
        Keep this secure link private and save it to check payment and fulfillment updates.
      </div>
      {paymentStatus === 'success' && (
        <div className="notice" role="status">
          Paystack confirmed your payment. The order status below has been refreshed.
        </div>
      )}
      {paymentStatus === 'not-completed' && (
        <div className="notice" role="status">
          Payment was not confirmed. You can retry Paystack or use the bank transfer option below.
        </div>
      )}
      <OrderWhatsAppHandoff
        snapshot={data}
        token={token}
        autoOpen={autoWhatsApp}
        businessNumber={businessNumber}
      />
      {error && (
        <p role="alert" className="form-feedback error">
          {error}
        </p>
      )}
      {order.resolution_required && (
        <div className="notice danger-notice">
          This order needs owner review because stock availability changed. Please contact ASCEND
          before arranging collection or delivery.
        </div>
      )}
      <div className="two-column">
        <div>
          <div className="panel">
            <h2>Your merchandise</h2>
            {items.map((i: any) => (
              <div className="summary-row" key={i.id}>
                <span>
                  {i.product_name}
                  <br />
                  <small>
                    {i.sku} · {i.size} {i.color} × {i.quantity}
                  </small>
                </span>
                <span>{money(i.unit_price * i.quantity)}</span>
              </div>
            ))}
            <div className="summary-row">
              <span>Delivery fee</span>
              <span>
                {order.delivery_fee == null ? 'To be confirmed' : money(order.delivery_fee)}
              </span>
            </div>
            <div className="summary-row total">
              <span>{quoted ? 'Proposed total' : 'Total'}</span>
              <span>
                {displayedTotal == null
                  ? quoted
                    ? 'Quote unavailable'
                    : 'Awaiting delivery quote'
                  : money(displayedTotal)}
              </span>
            </div>
            <div className="summary-row">
              <span>Verified amount received</span>
              <span>
                {invoice.amount_paid == null ? 'Not confirmed' : money(invoice.amount_paid)}
              </span>
            </div>
            <div className="summary-row">
              <span>Outstanding balance</span>
              <span>
                {invoice.outstanding_amount == null
                  ? 'Awaiting approved total'
                  : money(invoice.outstanding_amount)}
              </span>
            </div>
            {needsQuote && (
              <div className="notice" style={{ marginTop: 20 }}>
                Delivery fee to be confirmed. The owner will quote your delivery fee here. You must
                approve the final total before bank transfer instructions become available.
              </div>
            )}
            {quoted && (
              <div className="notice" style={{ marginTop: 20 }}>
                <p>
                  Delivery fee:{' '}
                  {order.delivery_fee == null ? 'Not confirmed' : money(order.delivery_fee)}.
                  Proposed total: {proposedTotal == null ? 'Not confirmed' : money(proposedTotal)}.
                </p>
                <p>Approve this total before making payment.</p>
                <button
                  className="button small"
                  disabled={busy || proposedTotal == null}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/api/orders/${token}/delivery-approval`, {});
                      await load();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Approval failed.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? 'Approving…' : 'Approve delivery fee & total'}
                </button>
              </div>
            )}
            <p style={{ marginTop: 24 }}>
              Fulfillment: <span className="status-badge">{label(order.fulfillment_status)}</span>
            </p>
            <p>
              Method: {label(order.fulfillment_method)}
              {order.courier_name ? ` · Courier: ${order.courier_name}` : ''}
              {order.tracking_reference ? ` · Tracking: ${order.tracking_reference}` : ''}
            </p>
            {order.delivery_details?.address && (
              <p>
                {[
                  order.delivery_details.address,
                  order.delivery_details.area,
                  order.delivery_details.city,
                  order.delivery_details.state,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
          </div>
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Payment history</h2>
            {payments.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Reference</th>
                      <th>Submitted</th>
                      <th>Verified received</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p: any) => (
                      <tr key={p.id}>
                        <td>{businessDate(p.created_at)}</td>
                        <td>{p.transfer_reference}</td>
                        <td>{money(p.submitted_amount)}</td>
                        <td>
                          {p.status === 'verified'
                            ? p.amount_received == null
                              ? 'Not confirmed'
                              : money(p.amount_received)
                            : 'Awaiting verification'}
                        </td>
                        <td>
                          <span className="status-badge">{label(p.status)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No payment submissions yet.</p>
            )}
          </div>
        </div>
        <aside>
          <div className="panel">
            {paystackEnabled && payable && Number(invoice.outstanding_amount) > 0 && (
              <div style={{ marginBottom: 26 }}>
                <h2>Pay online</h2>
                <p>Pay securely with Paystack using the payment methods available at checkout.</p>
                <button
                  className="button"
                  type="button"
                  disabled={paystackBusy}
                  onClick={async () => {
                    setPaystackBusy(true);
                    setError('');
                    try {
                      const result = await api<{ authorization_url: string }>(
                        '/api/paystack/initialize',
                        { token },
                      );
                      window.location.assign(result.authorization_url);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : 'Unable to start Paystack checkout.',
                      );
                      setPaystackBusy(false);
                    }
                  }}
                >
                  {paystackBusy ? 'Connecting to Paystack…' : 'Pay with Paystack'}
                </button>
              </div>
            )}
            <h2>Bank transfer instructions</h2>
            {payable && bank?.bank_account_number ? (
              <>
                <div className="summary-row">
                  <span>Bank</span>
                  <span>{bank.bank_name}</span>
                </div>
                <div className="summary-row">
                  <span>Account number</span>
                  <strong>{bank.bank_account_number}</strong>
                </div>
                <div className="summary-row">
                  <span>Account holder</span>
                  <span>{bank.bank_account_holder}</span>
                </div>
                <p style={{ marginTop: 18 }}>{bank.payment_instructions}</p>
                <p>
                  Use <strong>{order.order_number}</strong> as your transfer narration.{' '}
                  {invoice.payment_status === 'paid'
                    ? 'Your payment has been verified.'
                    : invoice.payment_status === 'refunded'
                      ? 'A refund has been recorded.'
                      : 'Payment pending — awaiting verification.'}
                </p>
                {Number(invoice.outstanding_amount) > 0 && (
                  <EvidenceForm
                    endpoint={`/api/orders/${token}/evidence`}
                    invoiceId={invoice.id}
                    guestToken={token}
                    onSuccess={load}
                  />
                )}
              </>
            ) : (
              <p>
                {needsQuote || quoted
                  ? 'Instructions will be shown after you approve the confirmed delivery total.'
                  : invoice.payment_status === 'paid'
                    ? 'Your payment has been verified.'
                    : 'Bank transfer instructions are awaiting configuration. Contact ASCEND before making a transfer.'}
              </p>
            )}
            {order.fulfillment_method === 'pickup' && bank?.pickup_location && (
              <div style={{ marginTop: 24 }}>
                <h3>Pickup details</h3>
                <p>{bank.pickup_location}</p>
                {bank.pickup_hours && <p>{bank.pickup_hours}</p>}
                {bank.pickup_instructions && <p>{bank.pickup_instructions}</p>}
                {bank.pickup_contact && <p>Collection contact: {bank.pickup_contact}</p>}
              </div>
            )}
            <div className="button-row">
              <a
                href={whatsapp(
                  `Hi ASCEND ATHLETICS, please help with order ${order.order_number}.`,
                  businessNumber,
                )}
                className="text-link"
                target="_blank"
                rel="noreferrer"
              >
                Ask about your order <ArrowUpRight size={15} />
              </a>
              <button className="button secondary small" onClick={load}>
                Refresh status
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
