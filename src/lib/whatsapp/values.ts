/** Shared WhatsApp checks; saved permission belongs to the exact phone that was agreed to. */
export function normalizeWhatsAppPhone(value: unknown): string | null {
  let phone = String(value || '').replace(/[^0-9]/g, '');
  if (/^0[0-9]{10}$/.test(phone)) phone = '234' + phone.slice(1);
  return /^[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}
export function hasWhatsAppPermission(customer: any, consent: any, kind: 'broadcast' | 'renewal') {
  const phone = normalizeWhatsAppPhone(customer?.phone);
  return Boolean(
    phone &&
    consent?.phone === phone &&
    (kind === 'renewal' ? consent.reminders_opt_in : consent.updates_opt_in),
  );
}
export function currentRenewal(message: any, enrollment: any, enabled: boolean, today: string) {
  return Boolean(
    enabled &&
    enrollment &&
    ['active', 'expired'].includes(enrollment.status) &&
    enrollment.customer_id === message.customer_id &&
    enrollment.expiry_date === message.expiry_date &&
    // Never deliver an old reminder after its intended Lagos calendar day has passed.
    Math.round(
      (Date.parse(enrollment.expiry_date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) /
        86400000,
    ) === message.reminder_day,
  );
}
