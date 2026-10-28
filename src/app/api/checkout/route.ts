/** Validates a guest checkout and asks the database to create its order, invoice and stock reservations together. */
import { route, jsonBody } from '@/lib/backend/http';
import { checkoutSchema } from '@/lib/backend/validation';
import { rateLimit } from '@/lib/backend/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { databaseError } from '@/lib/backend/errors';
import { attachOrderNotificationLink } from '@/lib/notifications';
export async function POST(request: Request) {
  return route(async () => {
    const input = checkoutSchema.parse(await jsonBody(request));
    await rateLimit(request, 'checkout', 8);
    // The database computes prices and reserves stock; browser-supplied totals are never accepted.
    const { data, error } = await createAdminClient().rpc('create_checkout', {
      p_items: input.items,
      p_customer: input.customer,
      p_fulfillment_method: input.fulfillment_method,
      p_delivery_details: input.delivery_details || input.delivery_address || {},
      p_source: 'website',
    });
    databaseError(error);
    return attachOrderNotificationLink(data);
  }, 201);
}
