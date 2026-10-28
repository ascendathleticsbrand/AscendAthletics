# ASCEND verification results

Local build and regression verification completed on **13 October 2026**; additional read-only hosted MCP checks completed on **14 October 2026**. No fabricated records were added to the connected business database, no real emails were sent, and no deployment is claimed.

| Check | Result | Scope |
| --- | --- | --- |
| npm run typecheck | PASS | Final public, client, admin and backend TypeScript |
| npm test | PASS: 35 tests in 5 files | Calendar expiry, Lagos reminders, claims/balances, checkout validation, cart safety, redirects, invoice shape, delivery quotes, CSV safety, list filtering and private-token encryption |
| npm run test:db | PASS | All 14 migrations, upgrade from 13 to 14, SQL acceptance and role-isolation suites on PostgreSQL 18.6/PGlite 0.5.9 |
| npm run build | PASS | Next.js 16.4 optimized production build, including its TypeScript check |
| npm run test:smoke | PASS: 29 page checks, 12 protected admin routes, 8 request-boundary checks | Local production server at http://localhost:3100, using the configured canonical origin http://localhost:3000 for mutating-request headers |
| Connected Supabase checks | PASS | Catalog/categories, existing RPCs, Auth admin API, buckets; five private-table anonymous reads returned 401 |
| Hosted owner setup | PASS | Confirmed account/profile checked, initial role assigned with service credential, automatic INSERT audit verified |
| Hosted migration 14 additions | PASS | Both retry columns, both computed search fields and owner-authorized inventory summary checked; MCP SQL also confirmed expected notification event-snapshot fragments in all four updated RPCs; this agent did not apply the upgrade |
| Supabase MCP/connector connection | PASS | Both project-URL calls matched ASCEND; read-only MCP SQL succeeded, confirmed the customer table and chosen owner, and found all 36 public tables with RLS enabled |
| Hosted privileged RPC grants | PASS | Anonymous and authenticated browser roles cannot execute inventory_summary or verify_payment; checked through read-only MCP SQL |
| Browser automation | UNAVAILABLE | Windows sandbox startup failure prevents browser connection; no visual/browser interaction result is claimed |
| Live authenticated order/coaching flow | NOT RUN | No business product/stock fixtures were invented in the connected project |
| Resend/email/scheduler | NOT ACTIVE | Local secrets generated; provider credentials, verified sender, controlled test and deployed scheduler pending |
| Production deployment | NOT DONE | Deployment guide supplied; no hosting result invented |

## Acceptance scenarios tested

| Requested scenario | Evidence |
| --- | --- |
| Opening10, paid order2, correct availability | Real SQL count/reservation/payment transaction assertions |
| Evidence without bank credit does not count as revenue | SQL invoices/payment state and verified-only finance; TypeScript accounting tests |
| Authorized NGN20,000 toward NGN50,000 leaves NGN30,000 | Real SQL partial-payment and balance assertions |
| Physical and online coaching | SQL package/enrollment snapshots, owner activation and finite sessions |
| Monthly expiry, including month end and leap year | SQL calendar-expiry and TypeScript tests |
| Guest checkout and secure lookup | SQL hashed-token lookup and isolation; source API validation |
| Manual WhatsApp sale | SQL order source, stock and financial reporting assertions |
| Owner/assistant restrictions | Impersonated PostgreSQL roles; grants, bank/money/staff restrictions, last-owner protection |
| Pickup and unknown-fee delivery | SQL quotation/approval/payment gating; customer quote regression tests |
| One client cannot read another client's records/files | SQL RLS impersonation tests and private Storage policy assertions |
| Pending cancellation releases reservations | Real SQL cancellation/expiry assertions |
| Late payment stock conflict | SQL owner resolution, pay-later exception and no double consumption |
| Reconciliation | Verified receipts, outstanding balances, refunds and expenses reported separately |
| Immutable financial/stock/consent history | SQL write-denial/audit assertions |
| Inventory totals beyond1,000 variants | SQL exact aggregate test with1,001 temporary variant fixtures |
| Transactional notifications/retry privacy | SQL event/dedup/snapshot/upgrade assertions; authenticated encryption tests |

All SQL fixtures run in a disposable WASM database and roll back. The harness supplies minimal Auth/Storage schemas; it does not execute the hosted Supabase HTTP API, actual signup email delivery or signed file transfers. Multi-connection PostgreSQL concurrency and authenticated hosted workflows still need a staging run before launch.

## Build and HTTP details

An initial production build hit a Windows host-memory allocation failure in the native TypeScript compiler. Stopping the owned preview and limiting Go compiler concurrency resolved it; type checking remained enabled:

```powershell
$env:GOMAXPROCS = '2'
$env:GOMEMLIMIT = '512MiB'
npm run build
```

The PostgreSQL harness automatically limits WASM compilation concurrency on Windows to avoid the earlier host-memory failure.

For a local production smoke run:

```powershell
npm run start -- --port 3100
```

In another terminal:

```powershell
$env:ASCEND_TEST_URL = 'http://localhost:3100'
$env:ASCEND_TEST_REQUEST_ORIGIN = 'http://localhost:3000'
npm run test:smoke
```

Use the actual origin configured when the production build was made for ASCEND_TEST_REQUEST_ORIGIN. Explicit Host/Origin test headers model a reverse proxy with a public canonical origin different from the internal listen port. The suite never sends a valid checkout, campaign or financial mutation. Missing products are checked using Next.js's not-found boundary and noindex metadata: streamed notFound responses may retain HTTP200, as documented in the installed Next.js guide.

## Connected project status

**akgreat62@gmail.com** now has ASCEND application Owner access. Setup checked the exact confirmed account/profile and absence of an existing owner before inserting the role with the service credential. The automatic INSERT audit was verified; its actor is null for this service-credential operation. Do not rerun first-owner bootstrap SQL for this project. See [owner access](OWNER_SETUP.md).

Hosted [migration 14](../supabase/migrations/202610130014_retry_search_inventory.sql) additions are now visible: both first_attempt_at columns and computed search fields returned 200, and inventory_summary returned 200 with the six expected aggregate keys for the verified owner. This agent did not apply the hosted upgrade. On 14 October 2026, both Supabase MCP and connector project-URL calls succeeded and matched ASCEND; MCP SQL confirmed the retry columns, inventory/search helpers, confirmed chosen owner, customer table and all 36 public tables with RLS enabled. The expected notification event-snapshot fragments were found in all four updated business RPC bodies. These read-only checks made no business writes and sent no emails. Transactional hosted workflows remain untested. Do not rerun the migration. The connection is verified; Auth URL/SMTP administration remains unverified.

Anonymous REST SELECT requests to customers, payments, payment_evidence, staff_roles and audit_logs returned 401; public catalog returned 200. Buckets retain correct public/private settings, 10 MiB limits and configured image/PDF restrictions. Actual authenticated uploads/downloads and complete client isolation still need controlled testing.

WhatsApp and Africa/Lagos settings match; email confirmation is enabled. Missing CRON_SECRET, NEWSLETTER_TOKEN_SECRET and NOTIFICATION_LINK_SECRET values were generated privately in .env.local; existing values were preserved. Reminders, sending and launch remain disabled. No real email was sent or deployment made. Bank/pickup fields are blank and no catalog products are published. See [Supabase setup status](SUPABASE_SETUP.md).

## Quick customer-entry verification

The simple name/phone form with optional email passed the final TypeScript check and production build. Four contact-validation tests cover blank optional email, formatted phone numbers, malformed details and excluded account-link/privilege fields. Total regression tests: 35 passed. A real unauthenticated POST to the existing saveCustomer action returned 401; no business record was created. No database migration was added. Build parallelism is limited to 2 workers to avoid this host's page-generation memory failure; type checking remains enabled.


## 16 October 2026 - R2 product image integration

- 84 tests passed across 11 files, including storage provider configuration, legacy Supabase URLs, R2 public URLs, staff-only upload access, byte validation and rollback after a failed gallery save.
- TypeScript and the production build passed. HTTP checks confirmed the shop and an existing product still display Supabase image URLs; anonymous product uploads returned 401.
- R2 storage tests used mocked S3/Supabase transports. No real R2 uploads or deletions were performed by those tests.
- A separate live check on 16 October 2026 authenticated to the configured ascend-images bucket, uploaded a temporary original product photo, verified identical bytes through the public image URL, and removed the temporary object successfully. No business records were created. IMAGE_STORAGE_PROVIDER=r2 is now enabled locally for new product photo uploads; existing Supabase images remain available.

## 16 October 2026 - Local owner password recovery

- Read-only Supabase checks confirmed that the existing ASCEND owner is email-confirmed, has a password, is not banned/deleted, and retains its owner membership and profile. Current Auth logs reported invalid_credentials for the failed local sign-in attempts; the app key and Auth settings endpoint were working.
- Added `npm run admin:password`, a local interactive recovery command that lets the user privately set the existing owner's website password. It has no public route and accepts no password through command arguments or piped input.
- All 12 focused recovery tests passed with mocked clients and terminal streams. Coverage includes exact owner identity/status, password-only mutation, rejected/mismatched input, provider errors, hidden input, correction, cancellation and terminal cleanup.
- The live `npm run admin:password -- --check` verified the configured project and confirmed owner without changing account data. A process check verified that redirected input is refused, and the local admin sign-in page returned HTTP 200. No real password was changed and a successful owner sign-in still requires the user's private password choice.

## 16 October 2026 - Product publishing permissions fix

- Confirmed that the existing, email-verified owner retained its role. Hosted Postgres logs reported permission denied for table products when saving publication. A read-only EXPLAIN reproduced the failure: INSERT ON CONFLICT DO UPDATE references the excluded cost_price column, whose SELECT permission is intentionally withheld from authenticated clients. A filtered UPDATE with the same permitted return columns planned successfully.
- Existing admin records now use authenticated UPDATE with an exact ID filter and an update patch excluding the ID. New records use INSERT; site-content creation keeps its section-conflict upsert. RLS, private-cost grants and stock publication guards are unchanged.
- All 105 unit/interaction tests passed across 13 files, including 9 new admin-save regression tests; TypeScript passed. The database suite passed all 14 migrations, the forward-upgrade checks, acceptance.sql and rls.sql. New RLS checks verify owner publication with a cost change, hidden-cost read denial, customer/anonymous mutation denial and rejection of unconfirmed stock.
- A separate hosted verification performed an authenticated owner product update inside a transaction and rolled it back. No product, price or audit change persisted. The local server restarted at http://localhost:3000; the shop returned 200, unauthenticated admin navigation redirected to sign-in, and anonymous product mutation returned 401. The user's new product should be published by retrying Save changes in their signed-in admin session. No database migration or permission change is required.

## 18 October 2026 - Storefront branding and overview payment filters

- Replaced the requested storefront wording in the homepage, shop and about page. The shorter homepage line is "Performance wear. Purposeful coaching." Read-only hosted checks found no saved hero override or affected product/category/package/collection wording requiring a database update.
- The shared BrandLogo component displays the original official horizontal and monogram images with SVG view boxes around their artwork, preserving the supplied bytes and proportions. Header, footer, homepage monogram and desktop/mobile admin navigation use the corrected presentation. The four fixed homepage category cards remain unchanged.
- Added an Overview > Recent orders payment selector: All payments, Outstanding, Paid and Pending. Outstanding includes positive invoice balances, including partial payments, and excludes cancelled/refunded orders. Pending includes invoices awaiting payment or evidence verification; Paid uses the invoice paid status. Filtering happens before database counts and pagination, retains search, resets to page one, and does not change the financial summary period.
- All 122 tests passed across 15 files; TypeScript passed. New tests cover the actual PostgREST query shape and filtered counts/paging, access checks, existing Orders filter semantics, and UI filter/search/range/refresh interactions. Read-only live REST queries for all four overview choices passed against the configured project. No business records or permissions were changed.
- The active ASCEND server is http://localhost:3001; port 3000 belongs to a different project and was left running. HTTP checks on ASCEND confirmed homepage/shop/about 200, revised text, official logo markup, four category cards, PNG asset responses and anonymous overview denial (401). Browser preview could not initialize because of the host's Windows sandbox helper failure, so a full visual browser review was unavailable.

## 18 October 2026 - Bolder ASCEND wordmark

The shared horizontal logo now uses a subtle SVG dilation and larger responsive widths in the storefront and admin navigation. Original image files, colours, logo proportions and the homepage monogram are preserved. Unique React IDs prevent header/footer filter collisions. TypeScript passed; the active ASCEND homepage returned 200 with both distinct bold filter references, the requested dilation and the original PNG asset returning 200. Full browser preview remains unavailable because of the Windows sandbox helper issue recorded above.

## 18 October 2026 - Logo hydration correction

- The reported header mismatch showed old client logo markup against the newer server filter definitions. Replaced inline SVG definitions and generated React filter IDs with a plain image element that references self-contained static SVG assets. The wrappers retain the supplied PNG bytes, crop presentation margins and preserve the heavier wordmark and responsive sizes.
- Restarted only the verified ASCEND Next.js process on port 3001 and regenerated its development cache after validating that the cache path was inside this workspace. The unrelated application on port 3000 was left running.
- All 125 tests passed across 16 files, including actual renderToString-to-hydrateRoot regression coverage for five mixed logo placements without recoverable errors, console warnings or replaced DOM image nodes. Asset tests verify original PNG bytes, self-contained image references and the horizontal-only bold effect. TypeScript passed.
- Fresh HTTP checks confirmed that both server HTML and its referenced client component bundle use the same static logo URLs with no old inline filter code. The homepage and both SVG assets returned 200 with correct image MIME types. A browser hard refresh is needed if an already-open tab retains the earlier client code; full browser preview remains unavailable because of the host sandbox helper issue.

## 18 October 2026 - Requested logo placements and favicon

- Verified the three requested original files match their public PNG copies byte-for-byte. Added the supplied 11.45.14 AM icon to the stable BrandLogo variants and placed it at the header's far right. Desktop navigation and mobile account/cart/menu access remain available.
- Placed the horizontal 11.43.47 AM artwork immediately above BUILT FOR YOUR NEXT LEVEL. Configured the 11.45.13 AM monogram as the favicon with a cropped self-contained SVG and original PNG fallback. Original images remain untouched; all display variants remain plain hydrated image elements.
- All 126 tests passed across 16 files; TypeScript passed. Hydration coverage includes the requested icon, and all three SVG asset tests verify embedded PNG byte identity. Live HTTP checks confirmed rightmost header placement, horizontal logo order, both monogram favicon links, unchanged four category cards, correct asset MIME types and original PNG delivery. ASCEND remains available at http://localhost:3001. Full browser preview remains unavailable as previously recorded.

## 18 October 2026 - Left header icon and dominant hero logo

Moved the supplied icon to the header's left, with navigation centred and account/cart/mobile menu on the right. The horizontal hero logo now fills its available column up to 720px; the supporting slogan is smaller on desktop and mobile so the logo takes visual priority. TypeScript and all four focused logo hydration/artwork tests passed. Live page and served CSS checks confirmed the left-first header order, logo before the tagline, enlarged logo rule, smaller slogan rule and mobile width constraint.

## 18 October 2026 - Balanced hero refinement

Reduced the horizontal wordmark to 420px on desktop and at most 280px on mobile, below its native artwork width. Made the supporting slogan a compact wrapping line, refined vertical spacing, and increased the hero photo's visibility with lighter desaturation and softer desktop overlays; the mobile overlay remains stronger behind text. Only CSS changed. Live page and compiled stylesheet checks passed, and the original photo/logo assets returned 200. Header icon stays left, favicon artwork is unchanged, and all four fixed category cards remain present. Browser preview remains unavailable as previously recorded.

## 18 October 2026 - Original background and code readability

Restored the original homepage photo treatment: grayscale 100%, opacity 0.74 and the previous desktop/mobile dark overlays. Kept the accepted logo artwork, left header placement, compact hero logo/slogan and fixed category cards. Original image files were not edited.

Formatted application source, styles, tests and supported configuration files with a pinned development-only Prettier version. Added plain-English module and workflow comments plus `docs/CODE_GUIDE.md`. Added `npm run format` and `npm run format:check`; private environment files, original/generated assets and historical SQL migrations are excluded. The Python PDF builder was already structured and remains unchanged.

A parsed before/after comparison passed across 152 baseline files: 124 script syntax trees, two stylesheet rule sets, four JSON files and 22 unchanged remaining files. The comparison ignores comments and formatting, normalizes JSX rendered text, and permits only the two formatter scripts and pinned Prettier development dependency in package metadata. Existing dependencies, application logic, visible text, runtime configuration and SQL contents match the baseline captured after the requested photo-style restoration.

Validation passed: all 126 tests across 16 files, TypeScript, formatter check, all 14 local migrations plus upgrade/acceptance/RLS suites, and the optimized production build. The database harness is disposable and did not change hosted Supabase. Browser visual preview remains unavailable as previously recorded.

The restarted local preview passed 29 page checks (including 12 protected admin routes) and eight request-boundary checks without creating business records. Live HTML/CSS checks confirmed the original background treatment, desktop/mobile overlays, left header icon, hero-logo order, both favicon links, all four fixed category cards and successful original photo/logo asset responses. Preview: http://localhost:3001.

## 19 October 2026 - Monthly coaching and selected WhatsApp reminders

Published two real coaching packages in the connected ASCEND database: Physical Coaching - Monthly and Online Coaching - Monthly, each NGN30,000 for one calendar month. Package creation was attributed to the verified ASCEND owner in audit history. The personal-training mode cards read the published monthly price so enrollment and display use the same data. No existing enrollment or invoice was repriced.

Added an owner-only WhatsApp panel to Clients, Customers and Marketing. It supports searchable paginated contacts, explicit selection across pages, separate update/reminder permissions with evidence, reviewed selected-recipient sending, automatic expiry settings and recent queue activity. One send action queues the chosen people and continues bounded batches while the panel remains open; the protected scheduler can continue when it closes. Phone duplicates receive one update per batch. No empty selection can target all customers.

The server uses Meta-approved body templates, rechecks current permission/phone after claiming work, skips stale/renewed/cancelled expiry reminders, and records provider acceptance separately from delivery. Concurrent workers use conditional claims. Ambiguous network/provider/crash outcomes are held for review and never automatically resent. Reads for large audiences and reminder enrollment scans are paginated.

Migration `20261019103236_whatsapp_messaging.sql` is installed on the connected project. Four new private tables have RLS enabled and no direct anonymous/authenticated table privileges. Consent writes and append-only evidence are atomic, and browser roles cannot execute the privileged consent function. Live verification confirmed both prices, disabled default reminder settings, zero queued WhatsApp messages and no inferred customer opt-ins. Existing security-advisor notices and the intentional server-only table policies are documented in `WHATSAPP_SETUP.md`.

All 153 tests passed across 21 files, including mocked selected-recipient sending, permission withdrawal/phone changes, concurrent worker claims, disabled provider gates, unsafe outcome handling and owner/origin guards. All 15 migrations plus upgrade, acceptance, RLS and new WhatsApp SQL checks passed in disposable PostgreSQL. TypeScript and formatting checks passed. No real WhatsApp or email message was sent. The client is confirming their Business Platform account; provider keys/templates, a controlled provider test and hosted scheduling remain necessary before activation.

The optimized production build passed. Live HTTP/DOM checks confirmed both mode cards display NGN30,000 per month, both published package cards show the same price, anonymous access to the WhatsApp API returns 401, customer pages serve successfully and all four homepage category cards remain present. The local development preview was restarted at http://localhost:3001. Actual Meta delivery and live authenticated owner sends remain untested while provider activation is pending.
