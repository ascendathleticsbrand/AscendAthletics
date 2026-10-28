/** Owner-only WhatsApp controls. Private provider keys and message writes never reach the browser. */
import { z } from 'zod';
import { requireOwner } from '@/lib/auth';
import { route, jsonBody } from '@/lib/backend/http';
import { AppError, databaseError } from '@/lib/backend/errors';
import { rateLimit } from '@/lib/backend/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  whatsappConfigurationStatus,
  normalizeWhatsAppPhone,
  queueWhatsAppBroadcast,
  processWhatsAppQueue,
} from '@/lib/whatsapp';
export const maxDuration = 60;
export async function GET(request: Request) {
  return route(async () => {
    await requireOwner();
    const search = new URL(request.url).searchParams;
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(100000)
      .parse(search.get('page') || 1);
    const q = z
      .string()
      .max(100)
      .parse(search.get('q') || '')
      .replace(/[^\p{L}\p{N} +.@-]/gu, '');
    const db = createAdminClient();
    const pageSize = 25;
    let query = db
      .from('customers')
      .select('id,name,phone', { count: 'exact' })
      .order('name')
      .order('id');
    if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
    const [
      { data: customers, count, error: ce },
      { data: settings, error: se },
      { data: business, error: be },
      { data: messages, error: me },
    ] = await Promise.all([
      query.range((page - 1) * pageSize, page * pageSize - 1),
      db.from('whatsapp_settings').select('reminders_enabled,reminder_days').eq('id', 1).single(),
      db.from('business_settings').select('timezone').eq('id', 1).single(),
      db
        .from('whatsapp_messages')
        .select('id,kind,status,created_at,last_error,phone')
        .order('created_at', { ascending: false })
        .order('id')
        .limit(20),
    ]);
    for (const error of [ce, se, be, me]) databaseError(error);
    const ids = (customers || []).map((c) => c.id);
    const permissions = ids.length
      ? await db
          .from('whatsapp_contacts')
          .select('customer_id,phone,reminders_opt_in,updates_opt_in')
          .in('customer_id', ids)
      : { data: [], error: null };
    databaseError(permissions.error);
    const map = new Map((permissions.data || []).map((c) => [c.customer_id, c]));
    const totals: Record<string, number> = {};
    for (const status of ['pending', 'accepted', 'failed', 'uncertain']) {
      const { count, error } = await db
        .from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('status', status);
      databaseError(error);
      totals[status] = count || 0;
    }
    return {
      configuration: whatsappConfigurationStatus(),
      settings: { ...settings, timezone: business?.timezone },
      contacts: (customers || []).map((c) => {
        const p = map.get(c.id);
        return {
          ...c,
          reminders_opt_in: p?.reminders_opt_in || false,
          updates_opt_in: p?.updates_opt_in || false,
          consent_phone_matches: Boolean(
            normalizeWhatsAppPhone(c.phone) && p?.phone === normalizeWhatsAppPhone(c.phone),
          ),
        };
      }),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
      messages,
      totals,
    };
  });
}
const uuid = z.string().uuid();
const inputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('consent'),
    customer_id: uuid,
    reminders_opt_in: z.boolean(),
    updates_opt_in: z.boolean(),
    note: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal('broadcast'),
    customer_ids: z.array(uuid).min(1).max(500),
    message: z.string().trim().min(1).max(1000),
    request_id: uuid,
  }),
  z.object({
    action: z.literal('settings'),
    reminders_enabled: z.boolean(),
    reminder_days: z.array(z.number().int().min(0).max(90)).min(1).max(10),
  }),
  z.object({ action: z.literal('process') }),
]);
export async function POST(request: Request) {
  return route(async () => {
    const input = inputSchema.parse(await jsonBody(request));
    const { user } = await requireOwner();
    await rateLimit(request, 'admin-whatsapp', 60, 60);
    const db = createAdminClient();
    if (input.action === 'broadcast')
      return queueWhatsAppBroadcast({
        customerIds: input.customer_ids,
        message: input.message,
        actorId: user!.id,
        requestId: input.request_id,
      });
    if (input.action === 'process') return processWhatsAppQueue();
    if (input.action === 'settings') {
      if (input.reminders_enabled && !whatsappConfigurationStatus().remindersReady)
        throw new AppError(
          'Connect and test the renewal template before enabling automatic reminders.',
          503,
        );
      const { error } = await db
        .from('whatsapp_settings')
        .update({
          reminders_enabled: input.reminders_enabled,
          reminder_days: [...new Set(input.reminder_days)].sort((a, b) => b - a),
          updated_by: user!.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);
      databaseError(error);
      return { saved: true };
    }
    const { data: customer, error: ce } = await db
      .from('customers')
      .select('phone')
      .eq('id', input.customer_id)
      .maybeSingle();
    databaseError(ce);
    if (!customer) throw new AppError('Customer not found.', 404);
    let phone = normalizeWhatsAppPhone(customer.phone);
    if (!phone && !input.reminders_opt_in && !input.updates_opt_in) {
      const { data: previous, error } = await db
        .from('whatsapp_contacts')
        .select('phone')
        .eq('customer_id', input.customer_id)
        .maybeSingle();
      databaseError(error);
      phone = previous?.phone || null;
    }
    if (!phone) throw new AppError('Save a valid customer phone number first.');
    const { error } = await db.rpc('save_whatsapp_consent', {
      p_customer_id: input.customer_id,
      p_phone: phone,
      p_reminders_opt_in: input.reminders_opt_in,
      p_updates_opt_in: input.updates_opt_in,
      p_note: input.note,
      p_actor: user!.id,
    });
    databaseError(error);
    return { saved: true };
  });
}
