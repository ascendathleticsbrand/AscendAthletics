import 'server-only';
/** Checks the current Supabase identity and database staff role before protected server operations. */
import { createClient } from './supabase/server';
import { hasSupabaseConfig, setupMessage } from './env';
import { AppError } from './backend/errors';
import type { StaffRole } from './backend/types';
// Staff roles come from the database, not user-editable signup metadata.
export async function getAdminContext() {
  if (!hasSupabaseConfig())
    return {
      user: null,
      profile: null,
      role: null,
      permissions: {},
      setupRequired: true,
      error: setupMessage,
    };
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return { user: null, profile: null, role: null, permissions: {}, setupRequired: false };
  const [{ data: profile, error: pError }, { data: staff, error: sError }] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    db.from('staff_roles').select('role,permissions').eq('user_id', user.id).maybeSingle(),
  ]);
  const role: StaffRole | null =
    staff?.role === 'owner' || staff?.role === 'assistant' ? staff.role : null;
  return {
    user,
    profile,
    role,
    permissions: staff?.permissions || {},
    setupRequired: Boolean(pError || sError),
    error:
      pError || sError
        ? 'The staff profile could not be loaded. Check the database migration and access policies.'
        : undefined,
  };
}
// Validate the user with Supabase before returning a client for customer-owned records.
export async function requireUser() {
  if (!hasSupabaseConfig()) throw new AppError(setupMessage, 503, 'setup_required');
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new AppError('Please sign in to continue.', 401, 'unauthorized');
  return { db, user };
}
// A valid login alone does not grant access to the staff dashboard.
export async function requireStaff() {
  const context = await getAdminContext();
  if (context.setupRequired)
    throw new AppError(context.error || setupMessage, 503, 'setup_required');
  if (!context.user)
    throw new AppError('Please sign in to the staff dashboard.', 401, 'unauthorized');
  if (!context.role) throw new AppError('A staff account is required.', 403, 'forbidden');
  return { ...context, db: await createClient() };
}
export async function requireOwner() {
  const context = await requireStaff();
  if (context.role !== 'owner')
    throw new AppError('Only the owner may approve this action.', 403, 'forbidden');
  return context;
}

export async function requirePermission(permission: 'manage_packages' | 'manage_delivery_rates') {
  const context = await requireStaff();
  if (context.role !== 'owner' && context.permissions?.[permission] !== true)
    throw new AppError('The owner has not granted this operational permission.', 403, 'forbidden');
  return context;
}
