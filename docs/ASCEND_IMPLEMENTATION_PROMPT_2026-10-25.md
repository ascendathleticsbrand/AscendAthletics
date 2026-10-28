# Proposed ASCEND implementation prompt — 25 October 2026

Use with [the audit](ASCEND_AUDIT_2026-10-25.md) and [sanitized evidence](audit-evidence-2026-10-25.json). This is a reviewable scope, **not authorization to execute**. Begin only after the owner approves specific finding IDs.

## Objective and boundaries

Implement approved findings while preserving ASCEND's visual choices and business rules. Record approved IDs and keep a list of deferred work.

- Read `AGENTS.md`, applicable skills and the relevant installed `node_modules/next/dist/docs/` guides before code changes. Recheck current behavior; source line numbers may move.
- Identify the running app and backend. The audited server was http://localhost:3000 using shared remote Supabase. Localhost data is not disposable. Do not kill unrelated processes.
- Keep secrets private/server-only. Never print environment secrets, customer records or private order tokens, or prefix provider secrets with `NEXT_PUBLIC_`.
- Use isolated staging/database fixtures and provider stubs for write tests. No real signup, order, receipt, payment, stock change, upload or message as a test fixture.
- Prepare migration files and staging evidence before requesting any approved live application. Never reset the shared project. Live data reconciliation, staff provisioning, provider tests, sending flags and deployments need explicitly authorized scope.
- Preserve shirts ₦17,000, shorts ₦15,000 per pair, belts ₦70,000 and both coaching options ₦30,000 monthly unless the owner supplies changes. Invent no counts, sizes, delivery rates, testimonials, terms or policies.
- Preserve guest shopping, authenticated coaching, manual transfer verification, owner/assistant restrictions, private receipts, server prices and stock locking.
- Preserve logo placement/size, original hero photo treatment and fixed homepage category cards including supplements. New stock must not automatically replace that presentation. No redesign or image retouching under reliability-fix approval.
- **WhatsApp automation is paused.** Do not collect credentials, connect a provider, send tests, enable flags or run automated WhatsApp work. Keep existing manual WhatsApp preparation available. AUD-05 WhatsApp work, AUD-13 setup changes and G-04 are deferred unless separately resumed. Shared email reminder correctness can be scoped separately.

## A. Stock expiry and operational recovery

**AUD-01; dependencies G-01/G-05.** Inspect:

- `src/lib/catalog.ts`, `src/components/store/product-detail.tsx`
- `src/lib/notifications.ts`, `src/app/api/cron/route.ts`, `vercel.json`
- `supabase/migrations/202610130001_foundation.sql`, `202610130010_stock_resolution.sql`, `202610130014_retry_search_inventory.sql`

Agree how soon expired holds must stop blocking public ordering. Implement consistent public availability and authoritative checkout cleanup with a reliable worker. The audit observed three overdue holds reserving six units. Do not release them just because a fix is ready: first obtain approved treatment of physical counts, late credits and disputed orders.

Acceptance in staging: valid holds block their units; after expiry, orderability recovers within the agreed interval without initiating another checkout. Concurrent expiry/checkout/settlement/count operations preserve lock ordering, cannot oversell and cannot produce negative reserved stock. Preserve audit movements and late-payment conflict resolution. Make failed scheduling visible and prevent indefinite stale availability caching. Present any live reconciliation separately, without customer identifiers in logs.

## B. Account access, correct links and truthful error states

**AUD-02:** Review `src/components/store/account.tsx`, `src/app/(store)/account/page.tsx`, `src/app/api/auth/route.ts`, `src/app/auth/callback/route.ts`, `src/lib/backend/auth-next.ts` and Supabase SSR clients. Verify current official Supabase documentation. Add forgotten-password, password-update and confirmation-resend flows with same-origin protection, limits, enumeration-safe responses and safe callbacks. Preserve coaching package/next intent.

Acceptance: controlled staging accounts recover/resend; invalid/expired links offer a useful next action; no unauthenticated password change or external redirect. Real SMTP testing requires approval. Current local origin is correctly port 3000; do not restore the obsolete 3001 mismatch.

**AUD-03:** Review `src/lib/backend/notification-template.ts`, `src/lib/backend/completion.test.ts`, checkout completion and `src/app/(store)/order-status/[token]/page.tsx`. Make all private order links use the actual `/order-status/` route, preferably through one shared builder. Retain encryption/privacy boundaries and fix the test asserting the wrong route.

Acceptance: order-created/payment-verified templates use the correct route; valid staging tokens resolve; invalid tokens expose nothing. Never log private links. No actual customer email needed for this test.

**AUD-06:** Review `src/lib/catalog.ts`, `src/components/store/shop-catalog.tsx` and shop/collections/coaching pages. Distinguish successful empty results, real unknown slugs and temporary backend failure in loader types and UI. Provide retry/contact options with private diagnostics.

Acceptance: independent mocked empty/not-found/failure cases show distinct truthful states. Genuine missing products use Next's supported not-found flow. Do not classify streamed not-found HTTP 200 alone as a defect.

## C. Submission durability and atomic content saves

**AUD-04:** Review checkout/enroll/renew API routes, client guards, `src/lib/backend/business.ts` and current insert RPCs. Introduce durable per-intent idempotency with actor/guest protection, payload binding, atomic uniqueness, safe result replay and defined retention. A committed response lost in transit must not create another order/invoice/reservation/enrollment. Secure guest-token replay rather than exposing links through a guessable key.

Acceptance: concurrent/retried identical key/payload creates one operation; changed payload rejects; new deliberate key permits another purchase. Another actor cannot replay the result. Simulate response loss after commit and cover coaching renewal as well as merchandise.

**AUD-07:** Review saveProduct/saveCollection in `src/lib/backend/admin-actions.ts` and relationship constraints. Validate references first; atomically save metadata and replace memberships/attachments in an authorized database transaction. Keep external storage cleanup separately recoverable rather than pretending it can roll back with SQL.

Acceptance: invalid IDs, validation failure and final insert failure preserve original metadata, members and attachments. Successful saves commit completely. Owner/assistant rules and auditability remain intact. Use meaningful failure injection in staging.

## D. Admin navigation and growth

**AUD-08:** In `src/components/admin/admin-shell.tsx` and `admin.css`, define modal/nonmodal drawer behavior, then implement appropriate focus entry/scope, Escape and restoration. Preserve existing closed-sidebar `visibility:hidden` protection. Accept keyboard usability at 375/390 and desktop behavior at 1024/1440.

**AUD-09:** Replace capped global reference/history use in `src/lib/admin.ts` and `src/components/admin/admin-section.tsx`. Use authorized, ordered searchable relation endpoints and customer-scoped history pagination; label deliberate summary limits. Acceptance: target beyond 500 global records remains selectable with complete customer history and enforced permissions.

**AUD-10:** Align root layout skip target with admin main and appropriate focus behavior. Accept keyboard Skip on storefront/admin with no duplicate IDs.

**AUD-11:** Synchronize category/URL state in `src/components/store/shop-catalog.tsx` and shop page. Accept category links, general Shop navigation, refresh, back/forward and Clear with coherent results and no hydration mismatch.

**AUD-12:** Correct responsive open-menu behavior in `src/components/store/header.tsx` and `src/app/globals.css`. Accept 390 → 1024 → 1440 → 390 px transitions with coherent visibility, focus and expanded state.

**AUD-14:** Paginate email audience and renewal generation in `src/lib/backend/admin-actions.ts` and `src/lib/notifications.ts`. Use bounded stable traversal, eligibility checks, unique inserts and reconciled totals. Accept all eligible staging records beyond a small response cap, no duplicates and no ineligible audience. Do not send email or raise the live cap merely to test.

## E. Deferred reminder automation

**AUD-05/AUD-13/G-04 are recorded for later approval; do not start WhatsApp work now.** If explicitly resumed, review renewal RPCs, `src/lib/whatsapp.ts`, `src/lib/whatsapp/values.ts`, `src/lib/notifications.ts`, provider adapter and admin panel/docs.

Define renewal lineage and exactly when a successor supersedes the old plan. Recheck before enqueue and immediately before sending. Do not suppress a legitimate reminder because of an abandoned unpaid renewal request. Preserve exact-phone permission, channel switches, explicit selection, deduplication and no automatic resend of uncertain requests.

Later acceptance: qualifying paid/activated successor suppresses old reminder; abandoned request does not. Date edits, cancellation, changed days, changed phone, opt-out, disabled settings and delayed jobs skip appropriately in Africa/Lagos time. Provider acceptance remains distinct from delivery.

Current adapter supports Meta Cloud API body-only positional templates. Another provider may need an approved adapter. Later resumption must first identify provider, business/test sender, approved template/language/variable order, reply inbox and actual permission. Existing code has no incoming chat inbox or automatic STOP parser. No credential collection or test send is authorized by this prompt. Do not enable email as a side effect.

Update deployment/reminder status docs only in an approved scope; distinguish installed, connected, tested, enabled and paused states. Correct existing renewal-suppression claims only when actual behavior and tests match.

## F. Business inputs and release evidence

Resolve G-01/G-02/G-03/G-05/G-06/G-07/G-08: physical stock and reconciliation; approved policies; assistant identity/scope; hosted expiry interval; production R2 domain; quote versus approved rates; production origin/SMTP/discovery. G-04 remains deferred. Optional S-01–S-07 require their own scope choice and are not permission to redesign or replace assets.

Before presenting a release:

1. Run formatting/type checks and relevant unit tests. Expand checks only for new failures or unresolved risk. SQL fixture tests must use a confirmed disposable database.
2. Restore browser access and record 375, 390, 768, 1024 and 1440 px checks: keyboard/focus, touch, labels/errors, contrast, overflow, screenshots and console/requests. Measure production performance rather than inventing scores.
3. In staging, complete guest pickup/quoted delivery, signup/recovery, paid coaching activation/renewal and owner/assistant restrictions. Evidence upload must never verify payment.
4. Present changed files/migrations, test evidence, remaining limitations and a concrete live-service/deployment plan for approval.
5. Do not apply live changes merely because local code tests pass. Completion means the approved finding IDs meet acceptance and unresolved business decisions are explicit.
