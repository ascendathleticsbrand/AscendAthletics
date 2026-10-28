import 'server-only';
/** Looks up a single guest order through its private checkout token rather than a customer login. */
import { createAdminClient } from '../supabase/admin';
import { AppError, databaseError } from './errors';
import { tokenSchema } from './validation';
export async function guestOrder(token: string) {
  tokenSchema.parse(token);
  const { data, error } = await createAdminClient().rpc('guest_order', { p_token: token });
  databaseError(error);
  if (!data)
    throw new AppError(
      'Order not found. Use the complete private link from checkout.',
      404,
      'not_found',
    );
  return data as {
    order: Record<string, any>;
    invoice: Record<string, any>;
    items: Record<string, any>[];
    payments: Record<string, any>[];
    bank_details: Record<string, any> | null;
  };
}
