# Deployment and launch

The application is a standard Next.js server application, compatible with Vercel. It cannot be published as a static export: secure checkout, authentication, transactional inventory, private files and scheduled jobs need a server and Supabase. No production deployment was made during this build.

## Prepare the database

Use a separate staging Supabase project first. Install the official CLI, authenticate locally and link the intended project:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_ACTUAL_PROJECT_REF
npx supabase db push
```

Apply all migrations. Never run `db reset` against production. Keep the production database URL/service key out of logs and browser code. Official references: [Supabase migration workflow](https://supabase.com/docs/guides/deployment/database-migrations), [local development](https://supabase.com/docs/guides/local-development/cli-workflows).

Configure Auth redirect URLs and email confirmation. Run the owner bootstrap only for the real verified owner account. Test assistant and client isolation against the actual API, not just SQL. Verify private proof images require identity/token authorization. Run SQL acceptance tests only on disposable development data; their fixtures roll back but should still never be introduced into a live business database.

## Deploy the application

1. Import this source into your Vercel project, or deploy it with the Vercel CLI from the intended checkout. The framework preset is Next.js and the build command is npm run build.
2. Add the variables from .env.example to Vercel's environment settings. The service-role key, Resend key and all secrets are server-only. Set NEXT_PUBLIC_SITE_URL to the actual HTTPS origin.
3. Configure Supabase Auth's site URL and allowlist `/auth/callback` on the staging/production origins. Secure guest order URLs must stay private; avoid analytics that capture URL tokens.
4. Deploy staging, then perform the real acceptance flow below. A successful local build is not a deployment result.
5. Publish approved business information and policies. Set LAUNCH_READY=true only once launch requirements pass and the canonical origin is correct.

## Scheduling and email

For the current business choices and beginner steps, see [email and WhatsApp reminder setup](REMINDERS_SETUP.md).

`vercel.json` requests `/api/cron` hourly, on the hour (UTC); the job calculates reminder dates in the configured business timezone, default Africa/Lagos. Hourly processing releases expired reservations, expires coaching and processes queued email. Confirm that your hosting plan supports this cadence, or configure an authorized external scheduler at the desired interval. No scheduler is operational simply because this file exists.

Set a long random CRON_SECRET. Vercel sends it as an Authorization Bearer header. Official references: [securing cron jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

For sending, configure RESEND_API_KEY and a verified RESEND_FROM_EMAIL. Test a controlled email on staging before setting EMAIL_ENABLED=true and EMAIL_PROVIDER_TESTED=true. Supabase Auth mail needs its own approved configuration. Newsletter unsubscribe signing requires NEWSLETTER_TOKEN_SECRET. NOTIFICATION_LINK_SECRET (at least 32 random characters) is required for email activation and encrypts private guest order links in queued transactional notifications; do not rotate it casually while pending encrypted links remain.

Enable reminders in the owner settings after checking scheduler authentication and provider acceptance. Confirm default offsets 7/2/0, a Lagos date boundary, retry deduplication, and owner disable. Provider acceptance is not proof of inbox delivery. Marketing campaigns require consent and owner approval; send buttons never bypass provider readiness.

## Real launch acceptance

Use a disposable staging project and controlled staff/client accounts:

- Upload real test product images, count 10 units, confirm opening stock and publish. Guest-order two units, submit evidence, verify no collected receipts before actual verification, then verify and check available stock eight.
- Confirm a NGN20,000 credit against a NGN50,000 invoice, with NGN30,000 outstanding. Repeated submissions/credit verification must not double-count. Assistant cannot verify, alter bank details, revoke owner privileges or grant itself access.
- Cancel a pending order, verify released reservations. Expire a reservation and test a paid stock conflict with owner resolution before fulfillment. Inspect returns before recording resellable stock.
- Test configured pickup, configured delivery, and unknown-fee delivery requiring customer approval. Check that quoted total and bank instructions are correct before the transfer.
- Test private guest lookup/evidence uploads and account linking. A different client cannot see another customer's orders, invoices, coaching or private files. Guest tokens cannot be guessed from order numbers.
- Enroll physical and online clients, verify payment, activate from confirmed dates, and test month end/leap-year expiry. Renewals keep history, and finite bundles prevent excess usage.
- Record a WhatsApp sale against an existing customer and verify it appears once in stock/financial reports. Reconcile merchandise/coaching receipts, refunds, balances and expenses separately.
- Test signup confirmation, sign-in/sign-out, profile changes, recovery through your configured Auth provider, valid/invalid redirect handling and staff revocation.
- Confirm consent-based newsletters, unsubscribe confirmation, controlled reminder email, retry/provider reconciliation and no automated WhatsApp sending.
- Visually review desktop/mobile layouts and keyboard interaction. This build's browser automation was unavailable because of Windows sandbox startup failure; HTTP checks do not establish visual usability.

The provided SQL tests exercise core rules on PostgreSQL, but production uses a hosted PostgreSQL/Auth/Storage environment and needs these checks before being called launch-ready.
