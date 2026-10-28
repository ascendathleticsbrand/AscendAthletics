/** Runs scheduled reservation, coaching-expiry and notification work only for requests carrying the private cron secret. */
import { timingSafeEqual } from 'node:crypto';
import { route } from '@/lib/backend/http';
import { AppError } from '@/lib/backend/errors';
import { runScheduledJobs } from '@/lib/notifications';
import { runWhatsAppScheduledJobs } from '@/lib/whatsapp';
export const maxDuration = 60;
export async function GET(request: Request) {
  return route(async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 24)
      throw new AppError('Scheduled jobs are not configured.', 503, 'setup_required');
    const expected = Buffer.from('Bearer ' + secret);
    const actual = Buffer.from(request.headers.get('authorization') || '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new AppError('Unauthorized.', 401);
    const [jobs, whatsapp] = await Promise.all([runScheduledJobs(), runWhatsAppScheduledJobs()]);
    return { ...jobs, whatsapp };
  });
}
