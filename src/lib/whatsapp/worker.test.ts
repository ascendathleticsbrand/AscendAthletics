import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ client: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.client }));
vi.mock('./provider', () => ({ sendWhatsAppTemplate: mocks.send }));
import { processWhatsAppQueue, whatsappConfigurationStatus } from '../whatsapp';
let message: any;
let customer: any;
let consent: any;
let enrollment: any;
let settings: any;
// Small query adapter models PostgreSQL conditional UPDATE: the claim must still be pending.
function client() {
  return {
    from(table: string) {
      let patch: any = null;
      const filters: [string, unknown][] = [];
      let stale = false;
      let single = false;
      let head = false;
      const query: any = {
        select: (_?: string, options?: any) => {
          head = options?.head || false;
          return query;
        },
        update: (p: any) => {
          patch = p;
          return query;
        },
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return query;
        },
        lt: () => {
          stale = true;
          return query;
        },
        order: () => query,
        limit: () => query,
        maybeSingle: () => {
          single = true;
          return query;
        },
        single: () => {
          single = true;
          return query;
        },
        then: (resolve: any) => {
          const row =
            table === 'whatsapp_messages'
              ? message
              : table === 'customers'
                ? customer
                : table === 'whatsapp_contacts'
                  ? consent
                  : table === 'coaching_enrollments'
                    ? enrollment
                    : table === 'whatsapp_settings'
                      ? settings
                      : { id: 1, timezone: 'Africa/Lagos' };
          const matches =
            !stale && filters.every(([key, value]) => String(row[key]) === String(value));
          if (patch && matches) Object.assign(row, patch);
          return Promise.resolve({
            data: single ? row : matches ? [{ ...row }] : [],
            error: null,
            count: head && matches ? 1 : 0,
          }).then(resolve);
        },
      };
      return query;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
  for (const [key, value] of Object.entries({
    WHATSAPP_ENABLED: 'true',
    WHATSAPP_PROVIDER_TESTED: 'true',
    WHATSAPP_ACCESS_TOKEN: 'fixture',
    WHATSAPP_PHONE_NUMBER_ID: '1234',
    WHATSAPP_GRAPH_VERSION: 'v99.0',
    WHATSAPP_TEMPLATE_LANGUAGE: 'en',
    WHATSAPP_UPDATE_TEMPLATE: 'fixture_update',
    WHATSAPP_RENEWAL_TEMPLATE: 'fixture_renewal',
  }))
    vi.stubEnv(key, value);
  customer = { id: 'c1', phone: '09130607719' };
  consent = {
    customer_id: 'c1',
    phone: '2349130607719',
    updates_opt_in: true,
    reminders_opt_in: true,
  };
  message = {
    id: 'm1',
    customer_id: 'c1',
    kind: 'broadcast',
    phone: consent.phone,
    status: 'pending',
  };
  enrollment = { id: 'e1', customer_id: 'c1', status: 'active', expiry_date: '2026-10-26' };
  settings = { id: 1, reminders_enabled: true, reminder_days: [7, 2, 0] };
  mocks.client.mockImplementation(client);
  mocks.send
    .mockReset()
    .mockResolvedValue({ status: 'accepted', provider_message_id: 'wamid.fixture' });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('WhatsApp durable worker', () => {
  it('lets only one of two concurrent workers send a claimed message', async () => {
    await Promise.all([processWhatsAppQueue(), processWhatsAppQueue()]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(message.status).toBe('accepted');
  });
  it.each(['withdrawn', 'phone changed'])('skips after permission is %s', async (kind) => {
    if (kind === 'withdrawn') consent.updates_opt_in = false;
    else customer.phone = '09130607718';
    await processWhatsAppQueue();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(message.status).toBe('skipped');
  });
  it.each(['renewed', 'cancelled', 'disabled'])(
    'drops a pending renewal after enrollment/settings are %s',
    async (kind) => {
      Object.assign(message, {
        kind: 'renewal',
        enrollment_id: 'e1',
        expiry_date: '2026-10-26',
        reminder_day: 7,
      });
      if (kind === 'renewed') enrollment.expiry_date = '2026-11-26';
      if (kind === 'cancelled') enrollment.status = 'cancelled';
      if (kind === 'disabled') settings.reminders_enabled = false;
      await processWhatsAppQueue();
      expect(mocks.send).not.toHaveBeenCalled();
      expect(message.status).toBe('skipped');
    },
  );
  it('never automatically retries a provider outcome marked uncertain', async () => {
    mocks.send.mockResolvedValue({ status: 'uncertain', last_error: 'No confirmation' });
    await processWhatsAppQueue();
    await processWhatsAppQueue();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(message.status).toBe('uncertain');
  });
  it('fails closed before reading the queue when sending is disabled', async () => {
    vi.stubEnv('WHATSAPP_ENABLED', 'false');
    mocks.client.mockClear();
    expect(whatsappConfigurationStatus().configured).toBe(false);
    await processWhatsAppQueue();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
