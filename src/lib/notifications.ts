import 'server-only';
/** Processes saved order and coaching notifications, scheduled expiry reminders and owner-approved email campaigns. */
import { Resend } from 'resend';
import { createAdminClient } from './supabase/admin';
import { AppError, databaseError } from './backend/errors';
import { businessDate, dateDaysBetween } from './backend/business';
import { unsubscribeToken } from './backend/marketing-token';
import { randomUUID } from 'node:crypto';
import { encryptPrivateToken } from './backend/secure-token';
import { composeNotification } from './backend/notification-template';
import { emailAttemptAllowed, emailQueueFilter } from './backend/email-attempt';
type Row = Record<string, any>;
function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function emailConfigurationStatus() {
  const configured = Boolean(
    process.env.RESEND_API_KEY &&
    process.env.RESEND_FROM_EMAIL &&
    process.env.NEXT_PUBLIC_SITE_URL &&
    process.env.EMAIL_ENABLED === 'true' &&
    process.env.EMAIL_PROVIDER_TESTED === 'true' &&
    (process.env.NOTIFICATION_LINK_SECRET?.length || 0) >= 32,
  );
  return {
    configured,
    message: configured
      ? 'Email sending is configured.'
      : 'Email sending is disabled until Resend, a verified sender, site URL, private-link encryption secret and provider testing are configured.',
  };
}
function emailProvider() {
  if (!emailConfigurationStatus().configured)
    throw new AppError(emailConfigurationStatus().message, 503, 'email_not_configured');
  return new Resend(process.env.RESEND_API_KEY!);
}
async function sendEmail(
  to: string,
  subject: string,
  html: string,
  key: string,
  unsubscribe?: string,
) {
  const provider = emailProvider();
  const { data, error } = await provider.emails.send(
    {
      from: process.env.RESEND_FROM_EMAIL!,
      to,
      subject,
      html,
      ...(unsubscribe ? { headers: { 'List-Unsubscribe': '<' + unsubscribe + '>' } } : {}),
    },
    { idempotencyKey: key },
  );
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error('The email provider did not confirm acceptance.');
  return data.id;
}
// Claim work only if its saved status/lock is unchanged, preventing concurrent workers from sending the same row.
async function claim(table: string, row: Row) {
  const db = createAdminClient();
  const now = new Date();
  if (!emailAttemptAllowed(row.first_attempt_at, now)) return false;
  let query = db
    .from(table)
    .update({
      status: 'sending',
      locked_at: now.toISOString(),
      first_attempt_at: row.first_attempt_at || now.toISOString(),
      last_error: null,
    })
    .eq('id', row.id)
    .eq('status', row.status);
  if (row.status === 'sending')
    query = row.locked_at ? query.eq('locked_at', row.locked_at) : query.is('locked_at', null);
  const { data, error } = await query.select('id');
  databaseError(error);
  return Boolean(data?.length);
}
async function result(table: string, id: string, providerId: string | null, error?: unknown) {
  const { error: writeError } = await createAdminClient()
    .from(table)
    .update(
      providerId
        ? {
            status: 'sent',
            provider_message_id: providerId,
            sent_at: new Date().toISOString(),
            last_error: null,
            locked_at: null,
          }
        : {
            status: 'failed',
            last_error:
              error instanceof Error ? error.message.slice(0, 1000) : 'Email provider failed',
            locked_at: null,
          },
    )
    .eq('id', id);
  databaseError(writeError);
}
// The database stores only token hashes. The private email link is encrypted with a separate server secret.
export async function persistOrderNotificationLink(checkout: Row) {
  const secret = process.env.NOTIFICATION_LINK_SECRET;
  if (!secret || secret.length < 32 || !checkout?.order?.id || !checkout?.guest_token) return false;
  const db = createAdminClient();
  const { data: notification, error: readError } = await db
    .from('notifications')
    .select('id,payload,status')
    .eq('dedup_key', 'order_created:' + checkout.order.id)
    .maybeSingle();
  databaseError(readError);
  if (!notification || !['pending', 'failed'].includes(notification.status)) return false;
  const encrypted = encryptPrivateToken(checkout.guest_token, secret);
  const { data, error } = await db
    .from('notifications')
    .update({ payload: { ...(notification.payload || {}), guest_token_encrypted: encrypted } })
    .eq('id', notification.id)
    .in('status', ['pending', 'failed'])
    .select('id');
  databaseError(error);
  return Boolean(data?.length);
}
// A completed checkout must remain successful even if saving its optional encrypted email link fails.
export async function attachOrderNotificationLink(checkout: Row) {
  try {
    return { ...checkout, notificationLinkSaved: await persistOrderNotificationLink(checkout) };
  } catch {
    console.error(
      'ASCEND checkout succeeded, but its encrypted email link could not be persisted. Keep the private checkout link.',
    );
    return { ...checkout, notificationLinkSaved: false };
  }
}
// Expire stock reservations and coaching first, then queue and send only eligible notifications in bounded batches.
export async function runScheduledJobs() {
  const db = createAdminClient();
  const { data: released, error: re } = await db.rpc('expire_reservations');
  databaseError(re);
  const { data: expired, error: expiryError } = await db.rpc('expire_enrollments');
  databaseError(expiryError);
  const { data: settings, error: se } = await db
    .from('business_settings')
    .select('*')
    .eq('id', 1)
    .single();
  databaseError(se);
  const today = businessDate(new Date(), settings.timezone || 'Africa/Lagos');
  if (settings.reminders_enabled) {
    const days = Array.isArray(settings.reminder_days) ? settings.reminder_days : [7, 2, 0];
    const { data: enrollments, error: ee } = await db
      .from('coaching_enrollments')
      .select('*,customers(id,name,email)')
      .in('status', ['active', 'expired'])
      .not('expiry_date', 'is', null);
    databaseError(ee);
    for (const e of enrollments || []) {
      const remaining = dateDaysBetween(today, e.expiry_date);
      if (!days.includes(remaining) || !e.customers?.email) continue;
      // The unique key prevents repeated scheduler runs from creating the same expiry reminder twice.
      const dedup = 'renewal:' + e.id + ':' + e.expiry_date + ':' + remaining;
      const { error } = await db.from('notifications').insert({
        enrollment_id: e.id,
        customer_id: e.customer_id,
        kind: 'renewal_' + remaining,
        scheduled_for: new Date().toISOString(),
        dedup_key: dedup,
      });
      if (error && error.code !== '23505') databaseError(error);
    }
  }
  const base = {
    releasedReservations: released,
    expiredEnrollments: expired,
    email: emailConfigurationStatus(),
  };
  if (!base.email.configured)
    return {
      ...base,
      notificationsSent: 0,
      notificationsFailed: 0,
      remindersSent: 0,
      remindersFailed: 0,
    };
  const stale = new Date(Date.now() - 15 * 60000).toISOString();
  let query = db
    .from('notifications')
    .select(
      '*,orders(order_number,fulfillment_method,delivery_status),invoices(id,total_amount,outstanding_amount,payment_status),coaching_enrollments(package_name,start_date,expiry_date),customers!inner(name,email)',
    )
    .not('customers.email', 'is', null)
    .neq('customers.email', '')
    .lte('scheduled_for', new Date().toISOString())
    .or(emailQueueFilter())
    .order('scheduled_for', { ascending: true })
    .limit(40);
  if (!settings.reminders_enabled) query = query.not('kind', 'like', 'renewal_%');
  const { data: queue, error: qe } = await query;
  databaseError(qe);
  let sent = 0,
    failed = 0,
    remindersSent = 0,
    remindersFailed = 0,
    skipped = 0;
  const tokenCache = new Map<string, string | undefined>();
  for (const n of queue || []) {
    if (!n.customers?.email || !(await claim('notifications', n))) {
      skipped++;
      continue;
    }
    try {
      let encrypted: string | undefined;
      if (n.order_id && n.kind !== 'order_created') {
        if (!tokenCache.has(n.order_id)) {
          const { data: outbox, error } = await db
            .from('notifications')
            .select('payload')
            .eq('dedup_key', 'order_created:' + n.order_id)
            .maybeSingle();
          databaseError(error);
          tokenCache.set(n.order_id, outbox?.payload?.guest_token_encrypted);
        }
        encrypted = tokenCache.get(n.order_id);
      }
      // Legacy outbox rows predate the numeric snapshots; use the verified database payment only.
      if (
        n.kind === 'payment_verified' &&
        n.payload?.amount_received == null &&
        n.payload?.payment_id
      ) {
        const { data: payment, error } = await db
          .from('payments')
          .select('amount_received,status')
          .eq('id', n.payload.payment_id)
          .eq('invoice_id', n.invoice_id)
          .maybeSingle();
        databaseError(error);
        if (!payment || payment.status !== 'verified')
          throw new Error('Verified bank credit unavailable for this notification.');
        n.payload = { ...n.payload, amount_received: payment.amount_received };
      }
      const message = composeNotification(
        n,
        settings,
        process.env.NEXT_PUBLIC_SITE_URL!,
        process.env.NOTIFICATION_LINK_SECRET!,
        encrypted,
      );
      const id = await sendEmail(n.customers.email, message.subject, message.html, n.dedup_key);
      await result('notifications', n.id, id);
      sent++;
      if (n.kind.startsWith('renewal_')) remindersSent++;
    } catch (error) {
      await result('notifications', n.id, null, error);
      failed++;
      if (n.kind.startsWith('renewal_')) remindersFailed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return {
    ...base,
    notificationsSent: sent,
    notificationsFailed: failed,
    notificationsSkipped: skipped,
    remindersSent,
    remindersFailed,
  };
}
// Each send processes a small batch and uses a stable per-recipient provider key for safe retries.
export async function sendCampaign(campaignId: string, actor: string) {
  emailProvider();
  unsubscribeToken(randomUUID());
  const db = createAdminClient();
  const { data: staff, error: se } = await db
    .from('staff_roles')
    .select('role')
    .eq('user_id', actor)
    .single();
  databaseError(se);
  if (staff?.role !== 'owner') throw new AppError('Only the owner may send newsletters.', 403);
  const { data: campaign, error: ce } = await db
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();
  databaseError(ce);
  if (campaign.status === 'sent')
    return { sent: 0, complete: true, message: 'This campaign has already been sent.' };
  if (!['approved', 'sending'].includes(campaign.status) || !campaign.approved_by)
    throw new AppError('The owner must approve this campaign before sending.');
  const { error: ue } = await db
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId);
  databaseError(ue);
  const stale = new Date(Date.now() - 15 * 60000).toISOString();
  const { data: queue, error: qe } = await db
    .from('campaign_recipients')
    .select('*,newsletter_subscribers(id,name,email,status)')
    .eq('campaign_id', campaignId)
    .or(emailQueueFilter())
    .limit(30);
  databaseError(qe);
  let sent = 0,
    failed = 0,
    skipped = 0;
  for (const recipient of queue || []) {
    if (recipient.newsletter_subscribers?.status !== 'subscribed') {
      await db.from('campaign_recipients').update({ status: 'skipped' }).eq('id', recipient.id);
      skipped++;
      continue;
    }
    if (!(await claim('campaign_recipients', recipient))) continue;
    const unsubscribe = new URL('/api/newsletter/unsubscribe', process.env.NEXT_PUBLIC_SITE_URL!);
    unsubscribe.searchParams.set('token', unsubscribeToken(recipient.subscriber_id));
    const html =
      campaign.body_html +
      '<hr><p>You receive ASCEND updates because you opted in. <a href="' +
      escape(unsubscribe.toString()) +
      '">Unsubscribe</a>.</p>';
    try {
      const id = await sendEmail(
        recipient.newsletter_subscribers.email,
        campaign.subject,
        html,
        'campaign:' + campaignId + ':' + recipient.subscriber_id,
        unsubscribe.toString(),
      );
      await result('campaign_recipients', recipient.id, id);
      sent++;
    } catch (error) {
      await result('campaign_recipients', recipient.id, null, error);
      failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 550));
  }
  const { count, error: pe } = await db
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'sending', 'failed']);
  databaseError(pe);
  const complete = !count;
  if (complete) {
    const { error } = await db.from('campaigns').update({ status: 'sent' }).eq('id', campaignId);
    databaseError(error);
  }
  return {
    sent,
    failed,
    skipped,
    remaining: count || 0,
    complete,
    message: complete
      ? 'Campaign delivery is complete.'
      : 'Run send again to process the next batch or retry failed recipients.',
  };
}
