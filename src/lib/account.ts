import 'server-only';
/** Loads the signed-in customer profile, coaching invoices and payment history for the account page. */
import { createClient } from './supabase/server';
import { hasSupabaseConfig, hasServiceConfig, setupMessage } from './env';
import { createAdminClient } from './supabase/admin';
export async function getAccountData() {
  if (!hasSupabaseConfig())
    return {
      user: null,
      profile: null,
      customer: null,
      bank_details: null,
      enrollments: [],
      payments: [],
      setupRequired: true,
      error: setupMessage,
    };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return {
      user: null,
      profile: null,
      customer: null,
      bank_details: null,
      enrollments: [],
      payments: [],
      setupRequired: false,
    };
  if (hasServiceConfig()) await createAdminClient().rpc('expire_enrollments');
  // The authentication identity and the business customer record are linked by profile_id.
  const [{ data: profile }, { data: customer }] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    db.from('customers').select('*').eq('profile_id', user.id).maybeSingle(),
  ]);
  if (!customer)
    return {
      user,
      profile,
      customer: null,
      bank_details: null,
      enrollments: [],
      payments: [],
      setupRequired: false,
    };
  let bank_details: Record<string, unknown> | null = null;
  if (hasServiceConfig()) {
    const { data } = await createAdminClient()
      .from('business_settings')
      .select('bank_name,bank_account_number,bank_account_holder,payment_instructions')
      .eq('id', 1)
      .maybeSingle();
    if (data)
      bank_details = {
        ...data,
        account_number: data.bank_account_number,
        account_holder: data.bank_account_holder,
      };
  }
  // Customer-specific filters and database row policies keep other customers' records out of this response.
  const [{ data: enrollments, error: e1 }, { data: payments, error: e2 }] = await Promise.all([
    db
      .from('coaching_enrollments')
      .select('*,invoices(*)')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false }),
    db
      .from('payments')
      .select(
        'id,invoice_id,submitted_amount,amount_received,transfer_reference,bank_name,transferred_at,status,verified_at,created_at,invoices!inner(customer_id,enrollment_id,total_amount,outstanding_amount,payment_status)',
      )
      .eq('invoices.customer_id', customer.id)
      .order('created_at', { ascending: false }),
  ]);
  return {
    user,
    profile,
    customer,
    bank_details,
    enrollments: enrollments || [],
    payments: payments || [],
    setupRequired: Boolean(e1 || e2),
    error: e1 || e2 ? 'Your account records could not be loaded.' : undefined,
  };
}
