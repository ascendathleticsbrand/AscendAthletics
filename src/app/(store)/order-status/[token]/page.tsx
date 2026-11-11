/**
 * Private order route: passes the lookup token and public WhatsApp settings to OrderStatus.
 * Payment completion status is shown after the provider callback returns.
 */
import { OrderStatus } from '@/components/store/order-status';
import { getBusinessSettings } from '@/lib/catalog';
import { hasPaystackConfig } from '@/lib/env';
export const metadata = { title: 'Secure order status', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const [{ token }, query, settings] = await Promise.all([
    params,
    searchParams,
    getBusinessSettings(),
  ]);
  return (
    <div className="container page-body">
      <OrderStatus
        token={token}
        paystackEnabled={hasPaystackConfig()}
        paymentStatus={
          query.payment === 'success'
            ? 'success'
            : query.payment === 'not-completed'
              ? 'not-completed'
              : undefined
        }
        businessNumber={
          typeof settings.whatsapp_number === 'string' ? settings.whatsapp_number : undefined
        }
      />
    </div>
  );
}
