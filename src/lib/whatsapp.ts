import 'server-only';
/** Private WhatsApp message queue. Owner actions create work; the scheduler continues bounded batches. */
import { createHash } from 'node:crypto';
import { createAdminClient } from './supabase/admin';
import { AppError, databaseError } from './backend/errors';
import { businessDate, dateDaysBetween } from './backend/business';
import { hasWhatsAppPermission, normalizeWhatsAppPhone, currentRenewal } from './whatsapp/values';
import { sendWhatsAppTemplate } from './whatsapp/provider';
export { normalizeWhatsAppPhone } from './whatsapp/values';
const validTemplate = (value: string | undefined) =>
  Boolean(value && /^[a-z0-9_]{1,512}$/.test(value));
export function whatsappConfigurationStatus() {
  const ready =
    process.env.WHATSAPP_ENABLED === 'true' &&
    process.env.WHATSAPP_PROVIDER_TESTED === 'true' &&
    Boolean(process.env.WHATSAPP_ACCESS_TOKEN) &&
    /^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID || '') &&
    /^v\d+\.\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION || '') &&
    /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en');
  const updatesReady = ready && validTemplate(process.env.WHATSAPP_UPDATE_TEMPLATE);
  const remindersReady = ready && validTemplate(process.env.WHATSAPP_RENEWAL_TEMPLATE);
  return {
    configured: updatesReady && remindersReady,
    updatesReady,
    remindersReady,
    message:
      updatesReady || remindersReady
        ? 'Connected templates are available. Accepted means WhatsApp accepted the request, not confirmed delivery.'
        : 'Connect and test WhatsApp Business Platform and approved templates to enable sending. Manual WhatsApp links still work.',
  };
}
function requireUpdates() {
  if (!whatsappConfigurationStatus().updatesReady)
    throw new AppError(
      'Connect and test the WhatsApp update template before sending.',
      503,
      'whatsapp_not_configured',
    );
}
async function settings(db: any) {
  const { data, error } = await db.from('whatsapp_settings').select('*').eq('id', 1).single();
  databaseError(error);
  return data;
}
async function one(db: any, table: string, id: string, column = 'id') {
  const { data, error } = await db.from(table).select('*').eq(column, id).maybeSingle();
  databaseError(error);
  return data;
}
export async function queueWhatsAppBroadcast(input: {
  customerIds: string[];
  message: string;
  actorId: string;
  requestId: string;
}) {
  requireUpdates();
  const db = createAdminClient();
  const ids = [...new Set(input.customerIds)].sort();
  const hash = createHash('sha256')
    .update(JSON.stringify([ids, input.message]))
    .digest('hex');
  const { data: existing, error: readError } = await db
    .from('whatsapp_messages')
    .select('dedup_key')
    .eq('batch_id', input.requestId)
    .limit(500);
  databaseError(readError);
  if (existing?.length) {
    if (existing.some((r: any) => !r.dedup_key.startsWith(`broadcast:${input.requestId}:${hash}:`)))
      throw new AppError('Start a new message after changing the recipients or text.');
    return {
      batchId: input.requestId,
      queued: existing.length,
      skipped: ids.length - existing.length,
      reused: true,
    };
  }
  // Keep IN filters below proxy URL limits even for a large selected audience.
  const customers: any[] = [],
    contacts: any[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const subset = ids.slice(offset, offset + 100);
    const [people, permissions] = await Promise.all([
      db.from('customers').select('id,name,phone').in('id', subset),
      db.from('whatsapp_contacts').select('*').in('customer_id', subset),
    ]);
    databaseError(people.error);
    databaseError(permissions.error);
    customers.push(...(people.data || []));
    contacts.push(...(permissions.data || []));
  }
  const permissions = new Map((contacts || []).map((c: any) => [c.customer_id, c]));
  const phones = new Set<string>();
  const rows: any[] = [];
  for (const c of customers || []) {
    const phone = normalizeWhatsAppPhone(c.phone);
    if (
      !phone ||
      phones.has(phone) ||
      !hasWhatsAppPermission(c, permissions.get(c.id), 'broadcast')
    )
      continue;
    phones.add(phone);
    rows.push({
      customer_id: c.id,
      kind: 'broadcast',
      phone,
      template_name: process.env.WHATSAPP_UPDATE_TEMPLATE!,
      language_code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
      parameters: [c.name, input.message],
      dedup_key: `broadcast:${input.requestId}:${hash}:${phone}`,
      batch_id: input.requestId,
      created_by: input.actorId,
    });
  }
  if (!rows.length)
    throw new AppError('Select contacts with current permission for WhatsApp updates.');
  const { data, error } = await db
    .from('whatsapp_messages')
    .upsert(rows, { onConflict: 'dedup_key', ignoreDuplicates: true })
    .select('id');
  databaseError(error);
  return { batchId: input.requestId, queued: data?.length || 0, skipped: ids.length - rows.length };
}
export async function queueWhatsAppReminders(now = new Date()) {
  if (!whatsappConfigurationStatus().remindersReady) return { queued: 0 };
  const db = createAdminClient();
  const config = await settings(db);
  if (!config.reminders_enabled) return { queued: 0 };
  const { data: business, error: be } = await db
    .from('business_settings')
    .select('timezone')
    .eq('id', 1)
    .single();
  databaseError(be);
  const today = businessDate(now, business?.timezone || 'Africa/Lagos');
  let queued = 0;
  // Keyset pagination keeps every eligible enrollment visible beyond PostgREST's response cap.
  let cursor = '';
  for (;;) {
    let query = db
      .from('coaching_enrollments')
      .select('id,customer_id,package_name,status,expiry_date,customers(id,name,phone)')
      .in('status', ['active', 'expired'])
      .in(
        'expiry_date',
        config.reminder_days.map((day: number) =>
          new Date(Date.parse(today + 'T00:00:00Z') + day * 86400000).toISOString().slice(0, 10),
        ),
      )
      .order('id')
      .limit(100);
    if (cursor) query = query.gt('id', cursor);
    const { data: enrollments, error } = await query;
    databaseError(error);
    if (!enrollments?.length) break;
    const due = enrollments.filter((e: any) =>
      config.reminder_days.includes(dateDaysBetween(today, e.expiry_date)),
    );
    if (due.length) {
      const { data: contacts, error: ce } = await db
        .from('whatsapp_contacts')
        .select('*')
        .in('customer_id', [...new Set(due.map((e: any) => e.customer_id))]);
      databaseError(ce);
      const permissions = new Map((contacts || []).map((c: any) => [c.customer_id, c]));
      const rows = due
        .filter((e: any) =>
          hasWhatsAppPermission(e.customers, permissions.get(e.customer_id), 'renewal'),
        )
        .map((e: any) => {
          const day = dateDaysBetween(today, e.expiry_date);
          return {
            customer_id: e.customer_id,
            enrollment_id: e.id,
            kind: 'renewal',
            phone: normalizeWhatsAppPhone(e.customers.phone),
            template_name: process.env.WHATSAPP_RENEWAL_TEMPLATE!,
            language_code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en',
            parameters: [e.customers.name, e.package_name, e.expiry_date],
            expiry_date: e.expiry_date,
            reminder_day: day,
            dedup_key: `renewal:${e.id}:${e.expiry_date}:${day}`,
          };
        });
      if (rows.length) {
        const { data: inserted, error: ie } = await db
          .from('whatsapp_messages')
          .upsert(rows, { onConflict: 'dedup_key', ignoreDuplicates: true })
          .select('id');
        databaseError(ie);
        queued += inserted?.length || 0;
      }
    }
    cursor = enrollments.at(-1)!.id;
  }
  return { queued };
}
export async function processWhatsAppQueue(now = new Date()) {
  const config = whatsappConfigurationStatus();
  const totals = { accepted: 0, failed: 0, uncertain: 0, skipped: 0 };
  if (!config.updatesReady && !config.remindersReady)
    return { ...totals, remaining: 0, disabled: true };
  const db = createAdminClient();
  // A crashed worker might have reached Meta. Never reclaim it as a new send.
  const { error: staleError } = await db
    .from('whatsapp_messages')
    .update({
      status: 'uncertain',
      last_error:
        'Worker stopped without confirmation. Check WhatsApp Manager before sending again.',
    })
    .eq('status', 'sending')
    .lt('locked_at', new Date(now.getTime() - 15 * 60000).toISOString());
  databaseError(staleError);
  let query = db
    .from('whatsapp_messages')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
    .order('id')
    .limit(25);
  if (!config.updatesReady) query = query.eq('kind', 'renewal');
  if (!config.remindersReady) query = query.eq('kind', 'broadcast');
  const { data: messages, error } = await query;
  databaseError(error);
  const started = Date.now();
  for (const message of messages || []) {
    if (Date.now() - started > 16000) break;
    const { data: claim, error: claimError } = await db
      .from('whatsapp_messages')
      .update({ status: 'sending', locked_at: new Date().toISOString() })
      .eq('id', message.id)
      .eq('status', 'pending')
      .select('id');
    databaseError(claimError);
    if (!claim?.length) continue;
    let outcome: any;
    try {
      // Re-read permission and the current phone AFTER claiming, immediately before any network send.
      const [customer, consent] = await Promise.all([
        one(db, 'customers', message.customer_id),
        one(db, 'whatsapp_contacts', message.customer_id, 'customer_id'),
      ]);
      let allowed =
        hasWhatsAppPermission(customer, consent, message.kind) &&
        normalizeWhatsAppPhone(customer?.phone) === message.phone;
      if (message.kind === 'renewal') {
        const [enrollment, configNow, business] = await Promise.all([
          one(db, 'coaching_enrollments', message.enrollment_id),
          settings(db),
          one(db, 'business_settings', '1'),
        ]);
        allowed =
          allowed &&
          currentRenewal(
            message,
            enrollment,
            configNow.reminders_enabled && configNow.reminder_days.includes(message.reminder_day),
            businessDate(new Date(), business?.timezone || 'Africa/Lagos'),
          );
      }
      const active = whatsappConfigurationStatus();
      allowed =
        allowed && (message.kind === 'renewal' ? active.remindersReady : active.updatesReady);
      if (!allowed)
        outcome = {
          status: 'skipped',
          last_error: 'Permission, phone, reminder date or sending settings changed.',
        };
      else
        outcome = await sendWhatsAppTemplate(
          {
            token: process.env.WHATSAPP_ACCESS_TOKEN!,
            phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
            version: process.env.WHATSAPP_GRAPH_VERSION!,
          },
          message,
        );
    } catch {
      outcome = {
        status: 'uncertain',
        last_error: 'Worker could not confirm the outcome. Review before sending again.',
      };
    }
    const { error: writeError } = await db
      .from('whatsapp_messages')
      .update({ ...outcome, locked_at: null })
      .eq('id', message.id)
      .eq('status', 'sending');
    databaseError(writeError);
    totals[outcome.status as keyof typeof totals]++;
  }
  const { count, error: countError } = await db
    .from('whatsapp_messages')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');
  databaseError(countError);
  return { ...totals, remaining: count || 0 };
}
export async function runWhatsAppScheduledJobs() {
  const queued = await queueWhatsAppReminders();
  const processed = await processWhatsAppQueue();
  return { ...queued, ...processed, configuration: whatsappConfigurationStatus() };
}
