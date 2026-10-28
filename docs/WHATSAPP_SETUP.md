# WhatsApp selected messages and automatic reminders

Current status: 19 October 2026. Code and private database tables are installed. Sending and automated WhatsApp reminders are disabled. The client will confirm their WhatsApp setup later. No outbound customer messages have been sent.

## What the owner can do

Open **Admin > Clients**, **Customers**, or **Marketing**. The owner sees a **WhatsApp messages & reminders** panel with contact search, selection across pages, permission recording, a message preview, expiry-reminder settings and recent activity.

Updates and coaching reminders have separate permission choices. Record the customer's actual agreement and how/when it was obtained. To stop messages, open **Permission**, untick the relevant choices and save an evidence note. Incoming STOP messages are not automatically parsed by this integration; the business must record opt-outs promptly.

A phone change requires permission for the new number. Existing saved customer records are not automatically opted in. Before each outgoing request, the server checks the current permission and phone again. Pending reminders are skipped if the plan was renewed, cancelled, the reminder day changed, or reminders were disabled. Outdated reminders are skipped after their intended business calendar day.

## Connect the client's sender

1. Ask whether the client has the WhatsApp Business app only, or already has a **WhatsApp Business Platform / Cloud API** account. Complete the relevant Meta onboarding for the chosen business phone number.
2. In the client's Meta app, obtain the **Phone Number ID**, a private access token with messaging access, and the supported **Graph API version** shown by Meta. A Phone Number ID is different from the telephone number. Keep tokens private.
3. Create and obtain approval for body-only, positional text templates matching the exact variable order below. Meta determines approval and message category; these examples are submissions, not pre-approved templates. [Meta's policy](https://whatsappbusiness.com/policy/?lang=en_US) requires recipient permission and approved templates for business-initiated messages.

| Purpose | Body variable order | Example text to submit |
| --- | --- | --- |
| Selected update | 1: customer name; 2: update message | Hi {{1}}, here is your ASCEND ATHLETICS update: {{2}}. Reply STOP to stop updates. |
| Coaching expiry | 1: customer name; 2: package name; 3: expiry date | Hi {{1}}, your ASCEND ATHLETICS {{2}} package expires on {{3}}. Contact us to discuss renewal. Reply STOP to stop reminders. |

The integration supports text parameters in the template body. Templates requiring dynamic header, button or media parameters need an adapter change. Use the precise language code approved by Meta, such as `en` or `en_US`.

Before enabling delivery, arrange how customer replies reach the business: a connected inbox/webhook or a Meta-supported app coexistence setup. This implementation handles outbound templates; it does not provide an incoming chat inbox or automatic STOP parsing. The business needs a working way to receive and act on replies.

4. Copy the WhatsApp section from `.env.example` into `.env.local` privately. Fill these fields, and use the same values in the hosting environment when deployed:

```dotenv
WHATSAPP_ENABLED=false
WHATSAPP_PROVIDER_TESTED=false
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_VERSION=
WHATSAPP_TEMPLATE_LANGUAGE=en
WHATSAPP_UPDATE_TEMPLATE=
WHATSAPP_RENEWAL_TEMPLATE=
```

Never add `NEXT_PUBLIC_` to a provider token or send it in chat. No access key is required from the customer using the website.

5. Use Meta's testing tools for a controlled test to the business owner's own opted-in number. Confirm the sender, actual approved template, variable order and recipient. After that test succeeds and the owner approves activation, set `WHATSAPP_PROVIDER_TESTED=true` and `WHATSAPP_ENABLED=true`, then restart the app or redeploy. Each channel also requires its own template field: updates and renewals can be connected separately.
6. Record permission for a controlled test contact in ASCEND. Review the selected audience and text before the owner sends a test through the new panel. Check the resulting request in WhatsApp Manager. Provider acceptance alone does not establish delivery.

API payload reference: [Meta's template request](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text).

## Enable the scheduler

Deploy ASCEND to a public HTTPS address. Configure the host to call **GET `/api/cron`** with **`Authorization: Bearer <CRON_SECRET>`**. Use the existing secret privately. The repository's `vercel.json` currently requests hourly execution; confirm that the chosen hosting plan supports the intended schedule. Nothing has been deployed or activated by this implementation.

A more frequent supported schedule will drain larger queues sooner. Owner-initiated bulk sending continues small batches while the WhatsApp panel stays open. If the panel closes, remaining queued work waits for the hosted scheduler or **Continue queued messages**.

Open the WhatsApp panel, choose reminder days such as **7, 2, 0**, enable automatic WhatsApp expiry reminders and save. Dates use the business timezone, currently Africa/Lagos. Each enrollment/expiry/day combination is queued once. New signup alone does not start a membership; the owner confirms activation and its start date first.

## Understand activity statuses

| Status | Meaning |
| --- | --- |
| Pending / queued | Waiting for a worker. |
| Sending | A worker claimed the request. |
| Accepted by WhatsApp | Meta returned a message identifier. Check WhatsApp Manager for delivery/read status. |
| Failed | Meta explicitly rejected the request; check its code, template, sender or recipient. |
| Needs review / uncertain | A timeout, interrupted worker or unclear response means it may already have been accepted. Do not resend until the business checks WhatsApp Manager. |
| Skipped | Current permission, phone, expiry date or settings no longer allows sending. |

The app never automatically retries accepted, failed or uncertain WhatsApp requests. A crashed claim is moved to Needs review. This avoids duplicate messages when the provider has no application idempotency guarantee. Resolve the cause and review provider records before creating a new message batch. The activity list shows the newest 20 requests; summary counts include the full queue history.

## Code and database map

- `src/components/admin/whatsapp-manager.tsx`: owner interface, selection and reviewed sending.
- `src/app/api/admin/whatsapp/route.ts`: owner authorization, same-origin mutation guards and input validation.
- `src/lib/whatsapp.ts`: selected-contact queue, due reminders and conditional worker claims.
- `src/lib/whatsapp/provider.ts`: one bounded Meta template request; never a browser token.
- `src/lib/whatsapp/values.ts`: phone, consent and renewal checks.
- `supabase/migrations/20261019103236_whatsapp_messaging.sql`: private queue, settings and atomic consent history. Apply it to any other environment before using the panel; it has already been applied to the connected ASCEND project.

All four WhatsApp tables have RLS enabled and deny direct anonymous/authenticated browser access. Their server APIs require the verified owner. Consent history is append-only and includes the actor; granting permission also verifies the current phone in the same database transaction.

The Supabase security advisor reports [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) for these server-only tables. This is intentional: browser roles have no table privileges, and only the protected service client accesses them.

The same project check also reports pre-existing notices on the public settings view, older helper functions and password protection. These were not changed by this feature. References: [view review](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view), [function search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous helper execution](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [signed-in helper execution](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Public read helpers and the sanitized settings projection require an access-policy review before changing grants; do not broadly revoke them just to remove a warning.
