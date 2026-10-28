/**
 * Terms route: supplies the fallback service terms to the shared PolicyPage.
 * The shared component prefers the published terms configured by the owner.
 */
import { PolicyPage } from '@/components/store/policy-page';
export const metadata = { title: 'Terms of service' };
export const dynamic = 'force-dynamic';
export default function Terms() {
  return (
    <PolicyPage section="terms" title="Terms of service">
      <h2>Merchandise orders</h2>
      <p>
        Prices and stock are checked when an order is created. Orders awaiting bank transfer reserve
        stock for a configurable period. Delivery fees must be confirmed, with customer approval of
        a custom quote before payment.
      </p>
      <h2>Payment verification</h2>
      <p>
        Transfer receipts and references do not confirm payment. The owner verifies the actual
        receipt of funds. Merchandise fulfillment and coaching activation require full payment
        unless the owner explicitly authorizes an exception.
      </p>
      <h2>Coaching memberships</h2>
      <p>
        Packages specify mode, price, duration and any session count. The coach confirms the start
        date. Monthly plans use calendar-month expiry rules; other plans use their configured
        duration or paid-session rules.
      </p>
      <h2>Final terms awaiting approval</h2>
      <p>
        The owner must confirm the final business details, cancellation and returns terms, delivery
        conditions and coaching-service conditions before launch.
      </p>
    </PolicyPage>
  );
}
