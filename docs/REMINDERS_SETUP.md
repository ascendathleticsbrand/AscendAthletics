# Email and WhatsApp reminders

Updated 19 October 2026. WhatsApp is the chosen channel for selected-contact messages and automated coaching reminders. The selection panel and private queue are installed; outbound sending is disabled while the client confirms their WhatsApp Business Platform account.

## Selected-contact WhatsApp messages and automation

Open **Admin > Clients**, **Customers**, or **Marketing** as the owner. The **WhatsApp messages & reminders** panel is available above the main table.

1. Find the contacts you want. Use **Permission** to record their actual agreement to updates, expiry reminders, or both, with a short evidence note. Saving a customer's phone does not opt them in.
2. Tick the contacts who should receive an update. Selection is explicit and can span contact pages; an empty selection never means everyone. Shared phone numbers receive one update per batch.
3. Write the message, check its preview, confirm that you reviewed the audience, then choose **Send to N selected**. Once connected, this single action creates private messages and processes them in batches. Keep the panel open until processing finishes; the hosted scheduler can continue the queue after it closes.
4. For automatic expiry reminders, enable the switch in this WhatsApp panel and save days **7, 2, 0**. These mean seven days before expiry, two days before, and on the expiry date in **Africa/Lagos**. A client needs reminder permission and a confirmed coaching expiry date. Renewal dates are calculated after owner activation, not just when a customer signs up.
5. Check **Recent WhatsApp activity**. **Accepted** means Meta accepted a request; delivery/read status must be checked in WhatsApp Manager. **Needs review** messages are never resent automatically because their first request may already have succeeded.

Sending buttons and the reminder-enable switch remain disabled until the approved sender/templates have been connected and tested. A local computer cannot run a schedule while it is switched off. Follow [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md) when the client confirms their account. No real WhatsApp messages were sent during implementation.

The existing **Admin > Settings > coaching expiry reminders** switch controls email. WhatsApp has its own switch in the new panel.

## Individual WhatsApp messages: use these now

1. Sign in to ASCEND as the owner and open **Admin > Clients**.
2. Open the client's details. Their saved record needs a phone number; a renewal reminder also needs the confirmed package expiry date.
3. Click **Prepare WhatsApp message**.
4. WhatsApp opens with the client's number and renewal message. Review the name, date and text, then press **Send** in WhatsApp.

This option uses your normal WhatsApp session and needs no WhatsApp API account or sender credentials. You choose which client to contact and when. The website prepares the message; you send it.

## Email: what is ready

The app already has an email queue, reminder templates, duplicate prevention and a protected scheduled endpoint. Current settings are **7 days before expiry, 2 days before expiry, and on expiry**, using **Africa/Lagos** dates. Email sending and automatic reminders are currently disabled.

Email reminders apply to clients with a saved email address, an enrollment expiry date, and a qualifying enrollment. Saving only a name and phone is enough for contact entry and prepared WhatsApp messages; add an email to receive email reminders.

## Email: finish setup

1. Create a [Resend account](https://resend.com). Its test sender can send to the account's own email before domain setup; [it cannot email your customers](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
2. Obtain a domain you own. In Resend, open **Domains > Add Domain**, enter the domain or a sending subdomain, and add the exact DNS records Resend supplies at your domain provider. Wait for **Verified**. See [domain verification](https://resend.com/docs/add-a-domain).
3. Open **API Keys > Create API Key**, name it `ASCEND reminders`, and choose **Sending access** for the verified domain. Put the key privately in `.env.local` as `RESEND_API_KEY`. Set `RESEND_FROM_EMAIL` to an address on the verified domain. Share only the domain name in chat, not the key. See [API-key setup](https://resend.com/docs/create-an-api-key).
4. Deploy the website to a public HTTPS address and set `NEXT_PUBLIC_SITE_URL` to that actual address. Copy the existing server secrets and provider settings to the hosting environment.
5. Review a test email addressed to you, then run that controlled test. Enable `EMAIL_ENABLED` and `EMAIL_PROVIDER_TESTED` only after provider acceptance is verified. A successful provider response is not proof that it reached the inbox.
6. Configure the hosting scheduler to call `/api/cron` with the existing `CRON_SECRET`. The repository requests hourly execution. [Vercel's plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) determine whether that schedule is supported; no scheduler is operating while the website only runs locally.
7. Open **Admin > Settings > Edit business settings**, enable **coaching expiry reminders**, and retain `[7,2,0]` or choose your preferred reminder days. Run a controlled hosted check before sending customer reminders.

Do not enable sending yet: the sender, domain, provider test and hosting schedule still need setup. Existing private secrets have already been generated and should be preserved.

## Signup emails are a separate setting

The website's reminder API key does not configure Supabase's account-confirmation emails. For customer signup delivery, configure **Authentication > Email > SMTP Settings** with a verified sender and these Resend details: host `smtp.resend.com`, port `465`, username `resend`, password a private Resend sending API key. Sender name: **ASCEND ATHLETICS**. See [Resend's exact Supabase SMTP steps](https://resend.com/docs/send-with-supabase-smtp).