import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('server-only', () => ({}));
import { sendWhatsAppTemplate } from './provider';
const config = { token: 'fixture-secret', phoneId: '12345', version: 'v99.0' };
const message = {
  phone: '2349130607719',
  template_name: 'fixture_update',
  language_code: 'en',
  parameters: ['Fixture', 'Hello'],
};
afterEach(() => vi.unstubAllGlobals());
describe('WhatsApp template transport', () => {
  it('sends an individual approved-template request and records acceptance only', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.fixture' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendWhatsAppTemplate(config, message)).toEqual({
      status: 'accepted',
      provider_message_id: 'wamid.fixture',
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v99.0/12345/messages');
    expect(JSON.parse(options.body)).toMatchObject({
      to: message.phone,
      type: 'template',
      template: {
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Fixture' },
              { type: 'text', text: 'Hello' },
            ],
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('records a definite provider rejection without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 132000 } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect((await sendWhatsAppTemplate(config, message)).status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'server', 'malformed'])(
    'holds %s outcomes for review without retrying',
    async (kind) => {
      const fetchMock = vi.fn();
      if (kind === 'network') fetchMock.mockRejectedValue(new Error('disconnected'));
      else
        fetchMock.mockResolvedValue({
          ok: kind === 'malformed',
          status: kind === 'server' ? 500 : 200,
          json: async () => ({}),
        });
      vi.stubGlobal('fetch', fetchMock);
      expect((await sendWhatsAppTemplate(config, message)).status).toBe('uncertain');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
