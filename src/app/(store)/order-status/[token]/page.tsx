/**
 * Private order route: passes the lookup token and public WhatsApp settings to OrderStatus.
 * The one-time whatsapp query flag requests a handoff after the saved order has loaded.
 */
import { OrderStatus } from '@/components/store/order-status';
import { getBusinessSettings } from '@/lib/catalog';
export const metadata = { title: 'Secure order status', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ whatsapp?: string }>;
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
        autoWhatsApp={query.whatsapp === '1'}
        businessNumber={
          typeof settings.whatsapp_number === 'string' ? settings.whatsapp_number : undefined
        }
      />
    </div>
  );
}
