# ASCEND ATHLETICS audit — 25 October 2026

Read-only audit. Companion files: [implementation prompt](ASCEND_IMPLEMENTATION_PROMPT_2026-10-25.md) and [sanitized runtime evidence](audit-evidence-2026-10-25.json).

## Overall assessment

The main shopping and coaching flows are substantially implemented, but the site still needs launch preparation and reliability fixes. Expired stock reservations currently block the red compression shirt from being ordered. Several conditional failures also need correction before real customer transactions and automated notifications are relied upon.

What works well: public pages and all five active product pages respond; physical and online coaching each show ₦30,000 per month; bank and pickup details are configured; guest shopping is separate from account-based coaching. Server code checks prices, stock and staff roles. Payment evidence does not verify payment: owner verification records actual bank credit with a unique reference. Deterministic stock locks, private receipt access, safe internal redirects and conservative handling of uncertain provider requests are useful safeguards.

These strengths are supported by source, public responses and existing tests, not completed live transactions or a penetration test. No Critical failure was demonstrated within the audit boundary.

**Owner update:** WhatsApp automation is paused at the owner's request. Provider connection, automated sending and test messages are outside the current scope. The existing manual “Prepare WhatsApp message” option remains available. Obtaining API access was reported, but no provider or sender was verified and no credentials were added in this workspace.

## Evidence, environment and limits

- Framework: Next.js 16.4.0, React 19.3.0, TypeScript, Supabase Auth/Postgres/Storage, optional R2 images and provider-backed notifications.
- Confirmed current URL: **http://localhost:3000**. Next.js reported an existing ASCEND server and its homepage title confirmed identity. A second start on 3001 exited after detecting that server; no process was stopped.
- Localhost uses a shared remote Supabase project, not a disposable database. Refreshed database checks used SELECT only, without customer records in the report.
- On 25 October: **42 anonymous page probes, one callback probe without an auth code, and 10 image HEAD requests**. Two package-specific account query links were discovered and reviewed in source but not separately requested.
- Browser initialization failed because the Windows sandbox could not start its kernel. HTTP verification establishes responses and served assets, not completed browser interactions.
- On 19 October, `npm run format:check`, `npm run typecheck` and `npm test -- --maxWorkers=2` passed: **153 tests in 21 files**. The protected source/configuration hashes still matched on 25 October. Mocked unit tests do not establish live transaction success.
- No account creation/login, order, payment, upload, message or cron execution was attempted. `test:smoke` and `test:db` were not run during this audit. Authenticated account/admin reads can invoke expiry updates; private order API reads update rate-limit records. Those routes were therefore reviewed without authenticated runtime access.
- No usable Git status was available: the workspace has no `.git` directory and Git was unavailable. A SHA-256 baseline covers 183 source/configuration/test/asset files, including private environment files without logging their values.
- No application code, dependency, environment value, database record, migration or deployment was changed. Only audit documentation/evidence artifacts were written.

| Evidence type | Meaning |
| --- | --- |
| Runtime verified | Observed through anonymous HTTP, served image inspection or read-only database queries; does not imply browser interaction. |
| Code verified | Established through source inspection; failure conditions were not enacted against live data. |
| Suggestion | Optional refinement, not a demonstrated functional failure. |
| Not tested | Limited by tools/access, service setup or the no-write boundary. |

## Current configuration snapshot

| Area | Observation | Interpretation |
| --- | --- | --- |
| Catalog | Five active products, one coming soon; eight variant rows | Coming-soon inventory is included in the total, not all publicly orderable. |
| Recorded stock | Eight rows marked counted; 20 on-hand units; six reserved units, all overdue | Book values only. The required physical count remains pending. |
| Coaching | Both monthly modes active at ₦30,000 | Activation and renewal writes were not tested. |
| Staff | One owner; no assistant role | Assistant identity and scope still need approval. |
| Transfers/pickup | Bank fields and pickup address configured | No real transfer or pickup booking tested. |
| Delivery | No active rate rows | Existing quote/approval path is valid; no automatic rate was invented or assumed required. |
| Policies | No published content sections; all three policy pages show awaiting-approval notices | Owner approval needed before public launch. |
| Discovery | `LAUNCH_READY=false` | Intentional prelaunch indexing restriction. |
| WhatsApp | Sender fields absent, sending/test flags false, reminder setting false | Automation now explicitly paused. |
| Email | Sending/test flags and reminder setting false | No customer email or inbox delivery tested. |
| Scheduler | Hourly `/api/cron` entry in `vercel.json` | No hosted execution verified. Stock expiry needs scheduling independently of WhatsApp. |
| Images | All 10 referenced resources returned 200; current product URLs use Supabase | R2 configuration does not mean existing photos have moved. |

## Page and journey coverage

| Page/journey | Runtime verification | Source review and untested behavior |
| --- | --- | --- |
| Home `/`, navigation/footer | 200; links and image resources inspected | Fixed category cards including supplements, logo components and calls to action reviewed. No rendered layout or menu clicks. |
| Shop and four category queries | All 200 | Search/filter logic reviewed; typing, back/forward and selection not browser tested. No sort feature assumed mandatory. |
| Five active product detail pages | All 200; red sold-out text observed | Variant/quantity/Add controls reviewed; no cart interaction. |
| Collections | Index 200; dummy detail slug inspected | Source handles detail/empty states. No published detail fixture available. |
| Coaching | 200; both modes and monthly prices present | Selection, account intent, request/activation/expiry/renewal reviewed; no enrollment created. |
| About, contact, FAQ | All 200 | Copy and links inspected; outbound contact actions not executed. |
| Privacy, terms, returns | All 200; approval notices present | No terms invented or approved. |
| Cart | Anonymous empty state | Populated cart, arithmetic, removal and storage logic reviewed in code/tests; browser refresh persistence not tested. |
| Checkout | Empty-cart guard | Populated pickup/delivery fields, quote approval, totals and client double-click guard reviewed; no submission. |
| Guest order lookup | Anonymous lookup form | Private page/evidence flow reviewed in source; no real token or private order API requested. |
| Account and admin-intent account | Anonymous forms | Auth, package intent and customer records reviewed; no signup/login. |
| Auth callback without code | 307 to ASCEND account on port 3000 | Valid-code exchange and email delivery not tested. Current configured/local origins match. |
| Admin overview, products, inventory, orders, customers, clients, packages, payments, finances, marketing, content, settings | All 12 anonymous requests redirected to account | Role checks, forms, filters, pagination and operations reviewed. No owner/assistant browser session. |
| Loading/errors/unknown routes | Generic unknown and obsolete email route 404; invalid product/collection slugs streamed 200 with noindex | `notFound()` source reviewed. Streamed 200 alone is not classified as a defect. Final browser fallback/console/outage handling not exercised. |
| Robots/sitemap/metadata | Responses inspected; prelaunch restrictions present | Production crawling and social previews not tested. |
| Stock/payment security | Read-only availability/overdue holds | RPCs, locks, receipt separation and role checks reviewed. No adversarial writes or live settlement. |
| Notifications/automation | Configuration read only | Queue/consent/provider/eligibility source reviewed; no cron, provider call, webhook or message. WhatsApp automation paused. |

| Requested viewport | Actual browser test |
| --- | --- |
| 375 px | Not tested |
| 390 px | Not tested |
| 768 px | Not tested |
| 1024 px | Not tested |
| 1440 px | Not tested |

No measured contrast, keyboard walkthrough, touch/overflow test, browser console scan, Lighthouse, layout shift or Core Web Vitals result is available. CSS and semantics were inspected without claiming visual conformance. Three product photos were inspected as served image assets, not page screenshots.

Sampled HTML document bodies were approximately 14.6–53.4 kB, including development markup. Referenced image lengths ranged from 22,284 to 494,024 bytes; `gym-editorial.jpg` was largest. These are resource-size observations, not compressed wire totals or proof of slow LCP. Development timings are not production benchmarks.

## Provisional score: 6.4/10

This is a weighted judgment of functional and launch readiness, not a completion percentage. Visual quality, browser responsiveness, accessibility conformance and production performance scores are withheld.

| Category | Weight | Score /10 | Rationale |
| --- | --- | --- | --- |
| Shopping/fulfillment | 25% | 6.0 | Broad flow exists, but stale holds demonstrably block one product; full checkout untested. |
| Coaching/accounts | 20% | 7.0 | Both monthly modes and activation controls exist; recovery and reminder lineage incomplete. |
| Authorization/integrity controls | 15% | 8.0 | Good server role, credit and locking safeguards in source/tests; not a live security certification. |
| Admin operations | 15% | 6.5 | Broad operational features; history caps, partial saves and mobile focus issues remain. |
| Reliability/discovery | 15% | 6.0 | Responses/assets succeed; email URL, retry durability and error states need work. |
| Launch operations | 10% | 4.5 | Physical count, policies, assistant and hosted service verification outstanding. |

Weighted result 6.425, rounded to 6.4. Missing browser/transaction coverage makes the score provisional. Paused WhatsApp is a scope decision, not a required feature that must be enabled to improve the score.

## Prioritized verified findings

Source paths below are relative to the project root. Each finding states all requested fields. Critical means demonstrated serious unauthorized access or money/data failure; none was demonstrated.

### AUD-01: expired holds keep a published product sold out

- **Priority / evidence:** High; Runtime verified + Code verified.
- **Page/route:** `/shop/red-graphic-compression-shirt`, catalog and scheduled expiry.
- **Reproduction/code:** Public response says `L / Black · Sold out`. SELECT shows red on-hand 3, reserved 3, available 0, with three overdue units. Three overdue reservation rows across red/white/belt hold six units. See `src/components/store/product-detail.tsx:61`, `src/lib/catalog.ts:35`, `src/lib/notifications.ts:139`, `supabase/migrations/202610130010_stock_resolution.sql:2`, `202610130014_retry_search_inventory.sql:80`.
- **Expected vs actual:** Expired temporary holds should stop blocking orderability within a defined interval. Public reads retain the reserved counter until cleanup; disabled Add prevents the normal shopper from reaching checkout's per-SKU cleanup.
- **Impact:** Lost ordering availability and misleading book availability. Physical units are not independently verified.
- **Fix:** Establish reliable expiry processing and consistent public orderability; reconcile live holds only with owner approval. Preserve locks, active holds, audit records and late-payment stock-conflict resolution.
- **Acceptance:** In staging reserve all units, advance beyond expiry, then recover orderability without a new checkout within the agreed interval. Concurrent expiry/checkout cannot oversell; unexpired holds remain protected. Count physical inventory separately.

### AUD-02: account recovery and confirmation resend are absent

- **Priority / evidence:** Medium; Code verified; anonymous auth interface observed.
- **Page/route:** `/account`, `/api/auth`, `/auth/callback`.
- **Reproduction/code:** `src/components/store/account.tsx:25` only offers signup/sign-in; `src/app/api/auth/route.ts:9` only supports signIn/signUp/signOut. Confirmation error guidance has no resend action. Owner reset scripts do not provide customer self-service.
- **Expected vs actual:** Returning coaching customers should recover access or request a fresh confirmation within the site; neither action exists.
- **Impact:** Lost passwords/expired links require manual support and impede renewal.
- **Fix:** Add provider-backed recovery, password update and confirmation resend with safe callbacks, limits and enumeration-safe responses.
- **Acceptance:** Controlled staging accounts recover/resend; invalid/expired links are actionable; no unauthenticated password update or external redirect; safe package/next intent preserved.

### AUD-03: email order links target a nonexistent page

- **Priority / evidence:** Medium; Code verified + Runtime verified with dummy obsolete URL. Emails remain disabled.
- **Page/route:** Email `/orders/[token]` versus actual `/order-status/[token]`.
- **Reproduction/code:** `src/lib/backend/notification-template.ts:99` and `:122` build `/orders/`; `src/lib/backend/completion.test.ts:66` asserts that incorrect path. Dummy `/orders/<64 characters>` returns 404. Actual page: `src/app/(store)/order-status/[token]/page.tsx`.
- **Expected vs actual:** Private email buttons should open the implemented order page; current composed route does not exist.
- **Impact:** Payment/order instructions will be unreachable through these emails when enabled.
- **Fix:** Share the correct URL builder and correct the test assertion.
- **Acceptance:** Both email kinds use `/order-status/`; a controlled staging private link resolves its order; invalid tokens expose no data. Never log real tokens.

### AUD-04: uncertain retries can create duplicate business records

- **Priority / evidence:** Medium; Code verified; no duplicate live requests made.
- **Page/route:** Checkout, coaching request and renewal.
- **Reproduction/code:** `src/components/store/checkout-form.tsx:84` has a client in-flight guard. Checkout/enroll/renew API routes and insert RPCs have no durable per-intent request key; migration `202610130014_retry_search_inventory.sql` inserts a new order/enrollment per accepted call.
- **Expected vs actual:** Retry after a committed response is lost should recover its original result; a fresh request can create another invoice, order/reservation or enrollment.
- **Impact:** Duplicate balances, blocked stock and administrative confusion. No double charge demonstrated.
- **Fix:** Add atomic actor/guest-bound request idempotency with payload binding, safe result replay and bounded retention.
- **Acceptance:** Concurrent/retried same-key same-payload requests create one operation; changed payload is rejected; a new intentional key works; another actor cannot recover a private result.

### AUD-05: reminder eligibility does not recognize a successor plan

- **Priority / evidence:** Medium; Code verified; no reminder sent. WhatsApp work paused.
- **Page/route:** Coaching renewal, WhatsApp/email workers.
- **Reproduction/code:** `supabase/migrations/202610130005_coaching_operations.sql:42` renews through a new enrollment without lineage. `src/lib/whatsapp.ts:142` and `src/lib/whatsapp/values.ts:15` inspect the old enrollment/date, not a successful successor. `src/lib/notifications.ts:188` also sends queued email renewals without current date/status revalidation.
- **Expected vs actual:** Successful replacement should suppress obsolete reminders; delayed work should not send past-day reminders. Old records can remain independently eligible and email work can become stale.
- **Impact:** Renewed customers may be asked to renew again if automation is later enabled; current docs overstate renewal suppression.
- **Fix:** Define renewal lineage and replacement conditions; recheck both channels immediately before sending and record skip reasons. Defer WhatsApp implementation/activation until resumed.
- **Acceptance:** Paid/activated successors suppress predecessors; abandoned unpaid requests do not suppress legitimate reminders. Date changes, cancellation, permission revocation, changed phones, disabled settings and delayed jobs are covered without weakening deduplication or uncertain-send protection.

### AUD-06: service errors look like empty or missing content

- **Priority / evidence:** Medium; Code verified; no outage induced.
- **Page/route:** Shop, products, collections and coaching.
- **Reproduction/code:** `src/lib/catalog.ts:54` returns empty arrays plus error; consumers such as `src/components/store/shop-catalog.tsx:131` do not distinguish that state. Product loader `:73` collapses query error to null; package loader `:82` collapses failure to empty.
- **Expected vs actual:** Successful empty, unknown slug and unavailable service should differ; failures can look like unpublished/missing products or packages.
- **Impact:** Misleading customer availability and wrong staff troubleshooting.
- **Fix:** Carry typed success/empty/unavailable states into route/UI boundaries with retry/contact options and private diagnostics.
- **Acceptance:** Mock empty data, missing slug and failed query independently. Genuine missing products use not-found; service failures show temporary unavailability without internal details.

### AUD-07: collection/gallery replacement can partially commit

- **Priority / evidence:** Medium; Code verified; no content changed.
- **Page/route:** Admin collection/product saves.
- **Reproduction/code:** `src/lib/backend/admin-actions.ts:323` separately saves metadata, deletes collection memberships, then inserts replacements; stale/invalid product IDs can fail after deletion committed. Gallery replacement at `:78` has a similar boundary. Invalid image references can fail after product metadata was saved.
- **Expected vs actual:** Failed save should retain original data/relationships; earlier steps can commit despite a later error.
- **Impact:** Reported failed saves can remove memberships/images or leave partial metadata changes.
- **Fix:** Validate references first, then perform each authorized logical save in one DB transaction; handle storage cleanup as separately recoverable work.
- **Acceptance:** Staging invalid-ID/final-insert failure tests retain original metadata and relationships; valid replacement commits completely with role restrictions intact.

### AUD-08: open mobile admin navigation lacks focus management

- **Priority / evidence:** Medium; Code verified; keyboard impact not browser reproduced.
- **Page/route:** Mobile `/admin/*` navigation.
- **Reproduction/code:** `src/components/admin/admin-shell.tsx:62` opens overlay/sidebar without focus transfer, Escape or restoration. `src/components/admin/admin.css:2566` already gives the closed sidebar `visibility:hidden`: closed offscreen links are NOT alleged to be tabbable.
- **Expected vs actual:** A blocking drawer should have intentional focus scope and return focus on close; current behavior relies on DOM tab order and clicks.
- **Impact:** Keyboard focus may move behind the visible overlay or lose its place.
- **Fix:** Define modal/nonmodal semantics and corresponding focus behavior, Escape and restoration.
- **Acceptance:** At 375/390 px, keyboard open/traverse/Escape/close/navigation works; closed controls stay outside focus order; desktop at 1024/1440 remains usable.

### AUD-09: related choices and customer history silently truncate

- **Priority / evidence:** Medium; Code verified, conditional on growth; no current omission demonstrated.
- **Page/route:** Admin relation selectors/manual order/customer history.
- **Reproduction/code:** `src/lib/admin.ts:189` loads global reference tables capped at 500 (100 stock movements). `src/components/admin/admin-section.tsx:2045` uses these choices; `:2627` constructs history by filtering capped global arrays.
- **Expected vs actual:** Any authorized record/history should remain reachable; records beyond the global cap can vanish or appear to have no history.
- **Impact:** Incomplete operational information and unselectable valid records as data grows.
- **Fix:** Authorized server search for relations and ordered customer-scoped history pagination; label deliberate summaries.
- **Acceptance:** With more than 500 staging records, a target beyond the first page is selectable and its complete paginated history appears; every query enforces permissions.

### AUD-10: admin skip link has no matching target

- **Priority / evidence:** Low; Code verified.
- **Page/route:** Shared layout on admin pages.
- **Reproduction/code:** `src/app/layout.tsx:39` targets `#main-content`; `src/components/admin/admin-shell.tsx:152` supplies `admin-main`.
- **Expected vs actual:** Skip should reach main content; admin lacks the shared target.
- **Impact:** Keyboard shortcut fails on admin.
- **Fix:** Align the target and appropriate focus behavior.
- **Acceptance:** Keyboard Skip works on storefront/admin with exactly one intended target per page.

### AUD-11: shop category can diverge from its URL

- **Priority / evidence:** Low; Code verified; client navigation not reproduced.
- **Page/route:** `/shop?category=` and `/shop`.
- **Reproduction/code:** `src/components/store/shop-catalog.tsx:29` initializes local category once; `:78` changes it without updating the URL. Preserved components can retain old state when props change.
- **Expected vs actual:** URL and visible category should agree; local state can diverge.
- **Impact:** Confusing return/share/back behavior and hidden products until clearing.
- **Fix:** Choose and synchronize one category source of truth.
- **Acceptance:** Category/general-shop links, refresh, back/forward and Clear agree without hydration mismatch.

### AUD-12: open mobile storefront menu persists at desktop size

- **Priority / evidence:** Low; Code verified; resizing not reproduced.
- **Page/route:** Shared storefront header.
- **Reproduction/code:** `src/components/store/header.tsx:63` renders open menu at all widths; `src/app/globals.css:242` lacks a desktop hiding rule while desktop navigation reappears above 760 px.
- **Expected vs actual:** One appropriate navigation should remain after resize; both may show.
- **Impact:** Duplicate navigation/layout clutter.
- **Fix:** Responsive visibility and coherent open-state reset.
- **Acceptance:** Open at 390 px, resize 1024/1440 then return; visibility, expanded state and focus stay coherent.

### AUD-13: deployment/reminder documentation conflicts

- **Priority / evidence:** Low; Code verified.
- **Page/route:** Operational docs.
- **Reproduction/code:** `docs/DEPLOYMENT.md:51` says no automated WhatsApp sending, while `docs/WHATSAPP_SETUP.md` and `docs/REMINDERS_SETUP.md` describe gated automation; account status text is outdated. Owner now explicitly paused automation.
- **Expected vs actual:** Installed, connected, tested and enabled states should be distinct and consistent; current instructions disagree/lag events.
- **Impact:** Incorrect setup expectations or accidental activation.
- **Fix:** Update status/checklist only in an approved documentation scope; record pause and correct renewal claims alongside AUD-05.
- **Acceptance:** Guides agree that automation is paused/disabled and no connection/test/send is implied. Later resumption requires explicit scope and provider verification.

### AUD-14: email audiences are not traversed beyond response caps

- **Priority / evidence:** Low; Code verified, conditional on growth; email disabled.
- **Page/route:** Campaign audience and email reminder generation.
- **Reproduction/code:** `src/lib/backend/admin-actions.ts:489` and `src/lib/notifications.ts:154` make unpaginated selections. `supabase/config.toml:8` specifies a local cap of 1,000; the live cap was not verified. WhatsApp reminder generation already uses keyset traversal.
- **Expected vs actual:** Approved/eligible audiences should all be considered; only the first API response is traversed.
- **Impact:** At larger volumes, incomplete queues and misleading counts. No actual missed recipient demonstrated.
- **Fix:** Deterministic bounded traversal and count reconciliation with eligibility/dedup checks.
- **Acceptance:** Staging records beyond an artificially small response cap queue once, ineligible records are excluded and totals reconcile.

## Separate design and conversion suggestions

These are not required missing features or proven launch defects.

| ID / priority / evidence | Route/evidence | Expected refinement vs current state; impact | Suggested change / acceptance |
| --- | --- | --- | --- |
| S-01 / Low / Suggestion, served assets inspected | Shirt/short product photos; public L variants | Photos embed M/XL and shorts “3pieces”; actual variants are L and shorts per pair. The title/size guide already clarify this, so residual visual ambiguity is qualified. | Owner-approved representative photos or approved removal of supplier labels. Preserve actual prices/sizes/background styling. Photo and per-pair text agree at desktop/mobile. |
| S-02 / Low / Suggestion, Code verified | Gallery controls, `product-detail.tsx` | Selected image can be clearer to assistive technology. | Appropriate pressed/current state and meaningful labels; keyboard/screen-reader check. |
| S-03 / Low / Suggestion, Code verified | Admin invoice/relation fields | Human-readable reference/name/balance would reduce reliance on UUIDs. | Coordinate with AUD-09; similar names remain distinguishable without exposing restricted values. |
| S-04 / Low / Suggestion, Not tested visually | Small CSS labels/credits | Font sizes warrant actual mobile/zoom/contrast review; unreadability is not established by CSS alone. | Review all five viewports before changing typography; preserve brand hierarchy. |
| S-05 / Low / Suggestion, resource lengths measured | Editorial/brand images | Responsive sources may reduce bytes; no slow benchmark demonstrated. | Measure production first; consider stable dimensions/formats while preserving approved imagery, grayscale and overlay. Compare visual output and LCP/CLS. |
| S-06 / Low / Suggestion, Code verified | Homepage category names | “Compression & tops”/“Shorts & joggers” target existing single categories; no currently sold omitted product proved. | Decide inclusive taxonomy if those categories expand. Sorting is optional when useful, not a current defect. |
| S-07 / Low / Suggestion, Code verified | Reminder settings | Generic coaching-reminder switch means email; WhatsApp has a separate switch. | Explicit channel/status labels; owner can understand active channels without source. WhatsApp remains paused. |

## Launch decisions and dependencies

| ID / priority / evidence | Area: expected vs current | Impact, next action and acceptance |
| --- | --- | --- |
| G-01 / High / Runtime verified + business requirement | Physical stock count pending despite counted timestamps | Owner counts/reconciles sizes, colors, holds and late transfers. Do not zero or release live stock in the audit. Accept when signed-off book/physical figures reconcile. |
| G-02 / High / Runtime verified | Policy pages await owner-approved terms | Owner approves actual delivery, refund, cancellation/coaching terms. Publish approved text and verify checkout links. No legal compliance conclusion or invented policy. |
| G-03 / Medium / Runtime verified + Not tested | Assistant role absent | Obtain verified identity and authorized scope; provision only when approved, then stage owner/assistant permission checks. Do not share owner login. |
| G-04 / Deferred / owner decision + Runtime verified disabled state | WhatsApp automation paused | No provider connection, credential collection, test sending or activation now. Keep manual preparation available. Reassess provider/templates/reply path and AUD-05 only when owner resumes. |
| G-05 / Medium / Code verified + Not tested | Hosted expiry scheduler unverified | Choose interval/host, protect and monitor worker. Required for stock expiry independently of WhatsApp. Accept recorded approved hosted execution/failure visibility; never invoke live cron as an audit test. |
| G-06 / Medium / configuration + provider docs | R2 public development domain configured; existing photos use Supabase | Before relying on R2 for production, arrange an approved production image domain. Cloudflare documents development access and rate limits for r2.dev; no present asset failure attributed to it. [Cloudflare guidance](https://developers.cloudflare.com/r2/buckets/public-buckets/). Accept domain/image access tests. |
| G-07 / Medium / Runtime verified | Delivery has no automatic rates; quote approval exists | Owner chooses quotes or supplies real approved rates. Accept clear pending/final totals and payment only after final-fee approval; invent no rates. |
| G-08 / Medium / Not tested | Deployed origin, SMTP, sender and discovery | Verify HTTPS origin/Supabase redirect settings and approved email tests. Keep email disabled until tested; lift prelaunch indexing only after launch gates pass. |

## Proposed implementation order

1. AUD-01 with G-01/G-05: staging expiry fix and worker reliability, then separately approved physical/live reconciliation.
2. AUD-02/AUD-03/AUD-06: access recovery, correct private email links and truthful failure states; production origin/SMTP depend on G-08.
3. AUD-04/AUD-07: durable submissions and transactional content saves, with reviewed migrations and isolated failure tests.
4. AUD-08–AUD-12/AUD-14: admin navigation, scoped history/lookups, category/menu behavior and growth coverage.
5. G-02/G-03/G-06/G-07/G-08: approved launch content, staff, domain, delivery and hosted checks; optional suggestions only if selected.
6. AUD-05/AUD-13/G-04: retain WhatsApp automation work on hold. When explicitly resumed, resolve reminder correctness before any provider test/enablement. Shared email reminder correctness may be approved separately.

**No fixes have begun. Approve specific IDs before application, database, provider or deployment changes.** The companion prompt provides concrete files, behavior, safeguards and checks for that follow-up.

## Revalidation note

The 19 October session used port 3001 while configuration referenced 3000. On 25 October, the running ASCEND server, configured origin, callback error redirect and social image origins all use 3000. That earlier mismatch is not an active finding. Real signup confirmation/deployed-origin behavior remains untested.
