import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ owner: vi.fn(), db: vi.fn(), queue: vi.fn(), process: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireOwner: mocks.owner }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.db }));
vi.mock('@/lib/backend/rate-limit', () => ({ rateLimit: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({
  whatsappConfigurationStatus: () => ({
    configured: false,
    updatesReady: false,
    remindersReady: false,
  }),
  normalizeWhatsAppPhone: () => null,
  queueWhatsAppBroadcast: mocks.queue,
  processWhatsAppQueue: mocks.process,
}));
import { GET, POST } from './route';
import { AppError } from '@/lib/backend/errors';
function request(body: unknown, origin = 'http://localhost:3001') {
  return new Request('http://localhost:3001/api/admin/whatsapp', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue({ user: { id: 'fixture-owner' } });
  mocks.db.mockReturnValue({});
});
describe('owner-only WhatsApp controls', () => {
  it('rejects anonymous reads before accessing private data', async () => {
    mocks.owner.mockRejectedValue(new AppError('Sign in', 401));
    expect((await GET(new Request('http://localhost:3001/api/admin/whatsapp'))).status).toBe(401);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it('rejects an assistant before any queue processing', async () => {
    mocks.owner.mockRejectedValue(new AppError('Owner required', 403));
    expect((await POST(request({ action: 'process' }))).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin mutation', async () => {
    expect((await POST(request({ action: 'process' }, 'https://invalid.example'))).status).toBe(
      403,
    );
    expect(mocks.owner).not.toHaveBeenCalled();
  });
  it('rejects empty recipients instead of messaging everyone', async () => {
    expect(
      (
        await POST(
          request({
            action: 'broadcast',
            customer_ids: [],
            message: 'Hello',
            request_id: '11111111-1111-4111-8111-111111111111',
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('keeps automatic reminders off without a connected provider', async () => {
    expect(
      (
        await POST(
          request({ action: 'settings', reminders_enabled: true, reminder_days: [7, 2, 0] }),
        )
      ).status,
    ).toBe(503);
  });
  it('rejects invalid reminder days', async () => {
    expect(
      (await POST(request({ action: 'settings', reminders_enabled: false, reminder_days: [-1] })))
        .status,
    ).toBe(422);
  });
});
