/**
 * Order lookup route: presents the form for a private order link or token.
 * The lookup component validates the token before navigating to its secure order page.
 */
import { OrderLookup } from '@/components/store/order-status';
export const metadata = { title: 'Order status', robots: { index: false, follow: false } };
export default function OrderStatusPage() {
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">FOLLOW YOUR NEXT CHAPTER</p>
          <h1>YOUR ORDER.</h1>
          <p>Check your order with the secure link generated at checkout.</p>
        </div>
      </div>
      <div className="container page-body">
        <OrderLookup />
      </div>
    </>
  );
}
