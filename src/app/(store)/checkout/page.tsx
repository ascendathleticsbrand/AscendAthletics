/**
 * Checkout route: reads the public business settings before rendering the interactive form.
 * The form receives pickup details and whether the server has the required checkout configuration.
 */
import { getBusinessSettings } from '@/lib/catalog';
import { hasPaystackConfig, hasServiceConfig } from '@/lib/env';
import { CheckoutForm } from '@/components/store/checkout-form';
export const metadata = { title: 'Checkout', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function Checkout() {
  const settings = await getBusinessSettings();
  return (
    <>
      <div className="page-intro">
        <div className="container">
          <p className="eyebrow">ONE STEP CLOSER</p>
          <h1>CHECKOUT.</h1>
          <p>Guest checkout. Choose Paystack or bank transfer before continuing.</p>
        </div>
      </div>
      <div className="container page-body">
        <CheckoutForm
          settings={settings}
          configured={hasServiceConfig()}
          paystackEnabled={hasPaystackConfig()}
        />
      </div>
    </>
  );
}
