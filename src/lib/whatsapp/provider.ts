import 'server-only';
/** One Meta request only. An ambiguous response is held for review rather than retried. */
export type WhatsAppTransport = { token: string; phoneId: string; version: string };
export type WhatsAppOutcome = {
  status: 'accepted' | 'failed' | 'uncertain';
  provider_message_id?: string;
  last_error?: string;
};
export async function sendWhatsAppTemplate(
  config: WhatsAppTransport,
  message: any,
): Promise<WhatsAppOutcome> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${config.version}/${config.phoneId}/messages`,
      {
        method: 'POST',
        redirect: 'error',
        cache: 'no-store',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: message.phone,
          type: 'template',
          template: {
            name: message.template_name,
            language: { code: message.language_code },
            components: [
              {
                type: 'body',
                parameters: message.parameters.map((text: string) => ({ type: 'text', text })),
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(4000),
      },
    );
    const body = await response.json().catch(() => null);
    const id = body?.messages?.[0]?.id;
    if (response.ok && typeof id === 'string' && id.length > 0)
      return { status: 'accepted', provider_message_id: id };
    if (response.status >= 400 && response.status < 500 && body?.error)
      return {
        status: 'failed',
        last_error: `WhatsApp rejected the request (HTTP ${response.status}, code ${Number(body.error.code) || 0}). Check the sender, template and recipient.`,
      };
    return {
      status: 'uncertain',
      last_error:
        'WhatsApp did not confirm the outcome. Check WhatsApp Manager before sending again.',
    };
  } catch {
    return {
      status: 'uncertain',
      last_error:
        'Connection ended without confirmation. Check WhatsApp Manager before sending again.',
    };
  }
}
