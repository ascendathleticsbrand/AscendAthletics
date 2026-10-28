/** Selects retryable email work while keeping retries inside the original provider idempotency window. */
// A retry lock must not restart the original 23-hour safe resend window.
export function emailAttemptAllowed(firstAttemptAt: string | null | undefined, now = new Date()) {
  if (!firstAttemptAt) return true;
  const started = Date.parse(firstAttemptAt);
  return Number.isFinite(started) && now.getTime() - started < 23 * 3600000;
}
// Retry pending/failed rows or stale sending locks, while excluding attempts outside that window.
export function emailQueueFilter(now = new Date()) {
  const cutoff = new Date(now.getTime() - 23 * 3600000).toISOString();
  const stale = new Date(now.getTime() - 15 * 60000).toISOString();
  return (
    'and(status.in.(pending,failed),or(first_attempt_at.is.null,first_attempt_at.gt.' +
    cutoff +
    ')),and(status.eq.sending,locked_at.lt.' +
    stale +
    ',first_attempt_at.gt.' +
    cutoff +
    ')'
  );
}
