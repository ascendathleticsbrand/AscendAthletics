/** Records guest approval of the quoted delivery fee for the order identified by the private link. */
import { route, jsonBody } from '@/lib/backend/http';
import { guestOrder } from '@/lib/backend/guest';
import { rateLimit } from '@/lib/backend/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError } from '@/lib/backend/errors';
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  return route(async () => {
    await jsonBody(request);
    await rateLimit(request, 'delivery-approval', 10);
    const token = (await params).token;
    const order = await guestOrder(token);
    const { data, error } = await createAdminClient().rpc('approve_delivery', {
      p_order_id: order.order.id,
      p_guest_token: token,
    });
    databaseError(error);
    return data;
  });
}
