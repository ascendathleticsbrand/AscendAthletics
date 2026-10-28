/** Pure calculations for calendar-based coaching expiry, business dates, balances and financial totals. */
export function calendarMonthExpiry(start: string, months: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isInteger(months) || months < 1)
    throw new Error('Invalid calendar-month enrollment.');
  const [year, month, day] = start.split('-').map(Number);
  const source = new Date(Date.UTC(year, month - 1, day));
  if (
    source.getUTCFullYear() !== year ||
    source.getUTCMonth() !== month - 1 ||
    source.getUTCDate() !== day
  )
    throw new Error('Invalid start date.');
  // Clamp month-end dates: a January 31 start must land on the last valid day of February.
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
export function businessDate(now: Date, timeZone = 'Africa/Lagos') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-');
}
export function dateDaysBetween(from: string, to: string) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}
// Payment submissions are claims; only verified bank receipts contribute to recorded receipts.
export function financialTotals(
  payments: { status: string; amount_received: number }[],
  refunds: { amount: number }[],
  expenses: { amount: number }[],
) {
  const receipts = payments
    .filter((p) => p.status === 'verified')
    .reduce((n, p) => n + Number(p.amount_received), 0);
  return {
    recordedReceipts: receipts,
    refunds: refunds.reduce((n, r) => n + Number(r.amount), 0),
    expenses: expenses.reduce((n, e) => n + Number(e.amount), 0),
  };
}
export function outstandingAmount(total: number, verifiedReceipts: number) {
  return Math.max(0, total - verifiedReceipts);
}
export function expiryReminderDue(today: string, expiry: string, days: number[]) {
  return days.includes(dateDaysBetween(today, expiry));
}
