'use client';

/**
 * Guest checkout: collects customer details and an explicit pickup or delivery choice.
 * Creates the order through the server API, then continues to the selected payment method.
 */

import { useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useCart } from './cart-context';
import { api } from './request';
import { money, whatsapp } from '@/lib/format';
import { buildOrderWhatsApp, type OrderWhatsAppSnapshot } from './order-whatsapp';
import type { PublicSettings } from '@/lib/backend/types';

const states = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
];

export function CheckoutForm({
  settings,
  configured,
  paystackEnabled = false,
}: {
  settings: PublicSettings;
  configured: boolean;
  paystackEnabled?: boolean;
}) {
  const { items, ready, subtotal, clear } = useCart();
  const router = useRouter();
  const id = useId();
  const submitting = useRef(false);
  const [method, setMethod] = useState<'pickup' | 'delivery' | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'paystack' | ''>(
    paystackEnabled ? '' : 'bank_transfer',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedWithoutLink, setSavedWithoutLink] = useState(false);
  const [savedOrderUrl, setSavedOrderUrl] = useState<string | null>(null);
  const pickupLocation =
    typeof settings.pickup_location === 'string' ? settings.pickup_location.trim() : '';
  const businessNumber =
    typeof settings.whatsapp_number === 'string' ? settings.whatsapp_number : undefined;

  function selectMethod(next: 'pickup' | 'delivery') {
    setMethod(next);
    setError('');
  }
  function selectPaymentMethod(next: 'bank_transfer' | 'paystack') {
    setPaymentMethod(next);
    setError('');
  }
  // A ref blocks duplicate submissions before React has rendered the busy state.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || savedWithoutLink || !configured) return;
    if (!method) {
      setError('Choose pickup or nationwide delivery.');
      return;
    }
    if (method === 'pickup' && !pickupLocation) {
      setError(
        'Pickup needs a confirmed location. Choose nationwide delivery, or contact ASCEND to arrange pickup.',
      );
      return;
    }
    const selectedPayment = paystackEnabled ? paymentMethod : 'bank_transfer';
    if (!selectedPayment) {
      setError('Choose Paystack or bank transfer.');
      return;
    }
    const form = new FormData(event.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      // Send variant IDs and quantities; the server chooses trusted prices and reserves available stock.
      const data = await api('/api/checkout', {
        customer: { name: form.get('name'), phone: form.get('phone'), email: form.get('email') },
        items: items.map((item) => ({ variant_id: item.variant_id, quantity: item.quantity })),
        fulfillment_method: method,
        ...(method === 'delivery'
          ? {
              delivery_details: {
                recipient_name: form.get('recipient_name'),
                phone: form.get('recipient_phone'),
                state: form.get('state'),
                city: form.get('city'),
                area: form.get('area'),
                address: form.get('address'),
                landmark: form.get('landmark') || '',
              },
            }
          : {}),
      });
      // A saved order with a missing link must not be submitted again and create a duplicate order.
      if (typeof data?.guest_token !== 'string' || !/^[a-f0-9]{64}$/.test(data.guest_token)) {
        setSavedWithoutLink(true);
        setError(
          'Your order was saved, but its secure link could not be opened. Contact ASCEND before placing another order.',
        );
        return;
      }
      // Clear the local bag only after receiving the private link for the saved order.
      clear();
      const orderUrl = `/order-status/${data.guest_token}`;
      if (selectedPayment === 'bank_transfer') {
        try {
          const snapshot = await api<OrderWhatsAppSnapshot>(`/api/orders/${data.guest_token}`);
          const prepared = buildOrderWhatsApp(
            snapshot,
            new URL(orderUrl, window.location.origin).href,
            businessNumber,
          );
          window.location.assign(prepared.url);
        } catch {
          // The order is already saved; keep its private page as a fallback if WhatsApp cannot open.
          router.replace(orderUrl);
        }
        return;
      }
      if (selectedPayment === 'paystack') {
        // Delivery orders with an unconfirmed quote must wait for approval before checkout.
        if (data.order?.delivery_status !== 'approved' || data.invoice?.total_amount == null) {
          router.replace(orderUrl);
          return;
        }
        try {
          const payment = await api<{ authorization_url: string }>('/api/paystack/initialize', {
            token: data.guest_token,
          });
          if (
            typeof payment?.authorization_url !== 'string' ||
            !payment.authorization_url.startsWith('https://checkout.paystack.com/')
          )
            throw new Error('Paystack did not return a valid checkout link.');
          window.location.assign(payment.authorization_url);
        } catch (err) {
          setSavedWithoutLink(true);
          setSavedOrderUrl(orderUrl);
          setError(
            err instanceof Error
              ? `Your order is saved, but Paystack could not start. Open your saved order to retry or use bank transfer. ${err.message}`
              : 'Your order is saved, but Paystack could not start. Open your saved order to retry or use bank transfer.',
          );
        }
        return;
      }
      router.replace(orderUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout is unavailable. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (!ready) return <p role="status">Loading your bag...</p>;
  if (!items.length)
    return (
      <div className="empty-state">
        <h2>Your bag is empty.</h2>
        <p>Add merchandise before starting checkout.</p>
        <Link href="/shop" className="button">
          Explore the shop
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} aria-busy={busy}>
      <div className="two-column">
        <div>
          {!configured && (
            <div className="notice">
              Checkout is unavailable while the business finishes its secure payment and database
              setup.
            </div>
          )}
          <div className="panel form-group">
            <h2>Your details</h2>
            <p>No account needed for merchandise orders.</p>
            <div className="form-grid">
              <label className="full">
                <span className="field-label">Full name</span>
                <input
                  className="field"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                />
              </label>
              <label>
                <span className="field-label">Email address</span>
                <input
                  className="field"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <label>
                <span className="field-label">Phone number</span>
                <input
                  className="field"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  minLength={7}
                  maxLength={30}
                />
              </label>
            </div>
          </div>
          <div className="panel form-group">
            <fieldset disabled={busy}>
              <legend>How would you like to receive your order?</legend>
              <p id={`${id}-method-help`}>Choose pickup or nationwide delivery to continue.</p>
              <div className="fulfillment-options">
                <label className="radio-card fulfillment-option" htmlFor={`${id}-pickup`}>
                  <input
                    id={`${id}-pickup`}
                    type="radio"
                    name="method"
                    value="pickup"
                    required
                    checked={method === 'pickup'}
                    aria-describedby={`${id}-method-help`}
                    onChange={() => selectMethod('pickup')}
                  />
                  <span>
                    <strong className="fulfillment-title">Pickup</strong>
                    <span className="fulfillment-description">
                      {pickupLocation || 'Contact ASCEND to confirm the pickup location.'}
                    </span>
                  </span>
                </label>
                <label className="radio-card fulfillment-option" htmlFor={`${id}-delivery`}>
                  <input
                    id={`${id}-delivery`}
                    type="radio"
                    name="method"
                    value="delivery"
                    required
                    checked={method === 'delivery'}
                    aria-describedby={`${id}-method-help`}
                    onChange={() => selectMethod('delivery')}
                  />
                  <span>
                    <strong className="fulfillment-title">Nationwide delivery</strong>
                    <span className="fulfillment-description">
                      If your location has no configured fee, we'll confirm a quote for your
                      approval before payment.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
            {method === 'pickup' &&
              (pickupLocation ? (
                <p style={{ marginTop: 20 }}>
                  {settings.pickup_instructions}
                  {settings.pickup_hours ? ` - ${settings.pickup_hours}` : ''}
                </p>
              ) : (
                <div className="notice" style={{ marginTop: 20 }}>
                  <p>
                    Pickup is selected. ASCEND needs to confirm the pickup location before this
                    order can be placed. You can choose nationwide delivery instead.
                  </p>
                  <a
                    className="text-link"
                    href={whatsapp(
                      'Hi ASCEND ATHLETICS, please confirm the pickup location so I can place my order.',
                      businessNumber,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Arrange pickup on WhatsApp <ArrowRight size={15} />
                  </a>
                </div>
              ))}
            <fieldset
              className="delivery-address"
              hidden={method !== 'delivery'}
              disabled={method !== 'delivery' || busy}
              style={{ marginTop: 25 }}
            >
              <legend>Delivery details</legend>
              <div className="form-grid">
                <label>
                  <span className="field-label">Recipient name</span>
                  <input
                    className="field"
                    name="recipient_name"
                    required
                    minLength={2}
                    maxLength={120}
                    autoComplete="shipping name"
                  />
                </label>
                <label>
                  <span className="field-label">Recipient phone</span>
                  <input
                    className="field"
                    type="tel"
                    name="recipient_phone"
                    required
                    minLength={7}
                    maxLength={30}
                    autoComplete="shipping tel"
                  />
                </label>
                <label>
                  <span className="field-label">State</span>
                  <select className="field" name="state" required defaultValue="">
                    <option value="" disabled>
                      Select state
                    </option>
                    {states.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">City</span>
                  <input
                    className="field"
                    name="city"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="shipping address-level2"
                  />
                </label>
                <label className="full">
                  <span className="field-label">Delivery area</span>
                  <input className="field" name="area" required minLength={2} maxLength={150} />
                </label>
                <label className="full">
                  <span className="field-label">Full delivery address</span>
                  <textarea
                    className="field"
                    name="address"
                    rows={3}
                    required
                    minLength={5}
                    maxLength={600}
                    autoComplete="shipping street-address"
                  />
                </label>
                <label className="full">
                  <span className="field-label">Landmark (optional)</span>
                  <input className="field" name="landmark" maxLength={200} />
                </label>
              </div>
            </fieldset>
          </div>
          <div className="panel form-group">
            <fieldset disabled={busy}>
              <legend>How would you like to pay?</legend>
              <p id={`${id}-payment-help`}>Choose your payment method before placing the order.</p>
              <div className="fulfillment-options">
                {paystackEnabled && (
                  <label className="radio-card fulfillment-option" htmlFor={`${id}-paystack`}>
                    <input
                      id={`${id}-paystack`}
                      type="radio"
                      name="payment_method"
                      value="paystack"
                      required
                      checked={paymentMethod === 'paystack'}
                      aria-describedby={`${id}-payment-help`}
                      onChange={() => selectPaymentMethod('paystack')}
                    />
                    <span>
                      <strong className="fulfillment-title">Pay with Paystack</strong>
                      <span className="fulfillment-description">
                        Pay online now. After confirmation, you can send the receipt details to ASCEND on WhatsApp.
                      </span>
                    </span>
                  </label>
                )}
                <label className="radio-card fulfillment-option" htmlFor={`${id}-bank-transfer`}>
                  <input
                    id={`${id}-bank-transfer`}
                    type="radio"
                    name="payment_method"
                    value="bank_transfer"
                    required={paystackEnabled}
                    checked={paymentMethod === 'bank_transfer'}
                    aria-describedby={`${id}-payment-help`}
                    onChange={() => selectPaymentMethod('bank_transfer')}
                  />
                  <span>
                    <strong className="fulfillment-title">Bank transfer</strong>
                    <span className="fulfillment-description">
                        WhatsApp opens with your invoice and ASCEND's account details. Review it and
                        press Send.
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
        </div>
        <aside>
          <div className="panel">
            <h2>Review your order</h2>
            {items.map((item) => (
              <div className="summary-row" key={item.variant_id}>
                <span>
                  {item.name}
                  <br />
                  <small>
                    {item.size} {item.color} x {item.quantity}
                  </small>
                </span>
                <span>{money(item.price * item.quantity)}</span>
              </div>
            ))}
            <div className="summary-row">
              <span>Delivery fee</span>
              <span>
                {method === 'pickup'
                  ? 'No delivery fee'
                  : method === 'delivery'
                    ? 'To be confirmed'
                    : 'Choose a method'}
              </span>
            </div>
            <div className="summary-row total">
              <span>Merchandise subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <p>
              {paymentMethod === 'paystack'
                ? 'You’ll go to Paystack after your order is saved. Once payment is confirmed, you can send the receipt details to ASCEND on WhatsApp.'
                : 'Your order is saved before payment. Bank transfer instructions and an optional WhatsApp invoice link appear on your secure order page.'}
            </p>
            <p>
              Your secure order page keeps your invoice and order status available if you need it
              later.
            </p>
            <label className="check-label">
              <input type="checkbox" required />I agree to the <Link href="/terms">terms</Link> and
              acknowledge the <Link href="/privacy">privacy notice</Link>.
            </label>
            <p role="alert" className="form-feedback error">
              {error}
            </p>
            <button
              className="button"
              disabled={busy || !configured || savedWithoutLink}
              style={{ width: '100%' }}
            >
              {busy
                ? 'Saving your order...'
                : paymentMethod === 'paystack'
                  ? 'Create order & pay with Paystack'
                  : 'Create order & continue to WhatsApp'}
              <ArrowRight size={16} />
            </button>
            {savedOrderUrl && (
              <p>
                <Link className="text-link" href={savedOrderUrl}>
                  Open your saved order to continue
                </Link>
              </p>
            )}
            <p
              style={{
                margin: '18px 0 0',
                fontSize: 10,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <ShieldCheck size={15} />
              {paymentMethod === 'paystack'
                ? 'Paystack online payment | Server-verified'
                : 'Bank transfer | ASCEND verifies your payment'}
            </p>
          </div>
        </aside>
      </div>
    </form>
  );
}
