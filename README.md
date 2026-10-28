# ASCEND ATHLETICS

A shared Next.js application for merchandise shopping, manual bank transfers, personal training, and business administration. Uses the supplied ASCEND logos and the actual WhatsApp number **+234 913 060 7719**. Slogan: **RISE. PUSH. BECOME.**

The workspace initially contained eight brand image files and no application. Original files are preserved. There are no fabricated live products, stock counts, customers, packages, transactions, addresses, or testimonials.

## Admin handbook

Use the [Admin Guide PDF](docs/ASCEND_Admin_Guide.pdf) for step-by-step dashboard instructions. The [editable guide source](docs/ASCEND_Admin_Guide.md) covers products, supplements, stock, orders, payment verification, customers, coaching, reminders and staff access.

## Understanding and formatting the code

Start with the [plain-English code guide](docs/CODE_GUIDE.md) for the folder map and explanations of shopping, admin, authentication, inventory, payments and image storage. Source files include comments explaining the main responsibilities and less obvious steps.

Run `npm run format` to apply consistent formatting, or `npm run format:check` to check it without writing files. These commands exclude private environment files, original images, generated assets and historical SQL migrations.

## Run and preview

Requires Node.js 22.12+ (verified with Node 24.18), npm, and an optional configured Supabase project. From this folder:

```powershell
npm ci
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm run dev
```

Open the Local URL printed by Next.js, normally **http://localhost:3000**. If that port is occupied, Next uses the next available port. During this build the preview used **http://localhost:3001**. Set NEXT_PUBLIC_SITE_URL to the actual origin, including its port, and restart after changing environment variables.

Without Supabase credentials, the public site renders an empty catalog and unpublished coaching packages; checkout/auth mutations fail closed. `/admin` renders an explicitly marked, disabled setup preview. After configuration, `/admin` requires a verified owner or assistant account; ordinary visitors/clients are redirected to secure sign-in. There is no default admin password or public demo account. If you forget the existing owner password, use the [private terminal recovery command](docs/OWNER_SETUP.md#recover-the-existing-owner-password-locally).

Public routes: `/`, `/shop`, `/shop/[slug]`, `/collections`, `/collections/[slug]`, `/coaching`, `/account`, `/cart`, `/checkout`, `/order-status`, `/order-status/[token]`, `/about`, `/contact`, `/faq`, `/privacy`, `/terms`, `/returns`.

Business routes: `/admin`, `/admin/products`, `/admin/inventory`, `/admin/orders`, `/admin/customers`, `/admin/clients`, `/admin/packages`, `/admin/payments`, `/admin/finances`, `/admin/marketing`, `/admin/content`, `/admin/settings`.

## Architecture

- Next.js App Router, TypeScript, React, Tailwind CSS and a shared black/silver/gold design system.
- Supabase PostgreSQL, Auth and Storage serve the public website, client account and admin together.
- Server handlers validate inputs and derive identity from verified Supabase authentication. Database RPCs independently enforce permissions and atomically update inventory and money. Row-level security protects individual customer records.
- Owner and assistant staff membership is stored separately from customer profiles. Signup metadata cannot create a privileged user.
- Prices and stock availability are authoritative on the server. Cart storage contains only the local shopping selection; it never acts as a business database.
- Financial, inventory, consent and staff changes retain audit/history records. Transfers are claims until the owner verifies actual bank credit.
- Resend handles optional transactional email, renewals and consent-based newsletters. The server scheduler uses the business timezone (default Africa/Lagos), durable claims and deduplication. Email sending is disabled until configured and tested.

```text
src/app/(store)/          Customer pages
src/app/admin/            Staff-only business pages
src/app/api/              Validated public, account, staff and scheduled APIs
src/components/store/     Reusable customer UI and cart
src/components/admin/     Shared staff tables, dialogs and navigation
src/lib/                  Supabase clients, auth, catalog and domain services
supabase/migrations/      Schema, transactions, RLS, storage and audit history
supabase/tests/           Real SQL acceptance and role-isolation tests
public/brand/             Unmodified official brand assets
public/images/            Clearly identified temporary editorial photos
```

[Database contract](docs/DATABASE_CONTRACT.md), [API contract](docs/API_CONTRACT.md), [database setup](supabase/README.md), [owner access](docs/OWNER_SETUP.md), [connected Supabase status](docs/SUPABASE_SETUP.md).

## Connect a new shared backend

The current project is already connected, and **akgreat62@gmail.com** has ASCEND application Owner access. Do not repeat its owner bootstrap. Migration 14 additions are visible and checked; project Auth URL/mail administration remains unverified; see [current setup status](docs/SUPABASE_SETUP.md). These steps apply to a different, new project.

1. Create a Supabase development project, or use Docker Desktop plus the Supabase CLI for a disposable local stack.
2. Apply every migration in filename order. See [Supabase instructions](supabase/README.md); never reset a production database.
3. Enter the Supabase URL, anon key and server-only service-role key in `.env.local`.
4. Configure Auth's site URL and `/auth/callback` redirect URLs for your actual origin. Enable email confirmation. For real signup email delivery, configure an approved sending provider in Supabase Auth; the application's Resend key does not automatically configure Auth mail.
5. Register and verify the real owner's account, then execute the guarded first-owner bootstrap SQL in `supabase/README.md`. Subsequent staff are managed by that owner.
6. Verify the product-images public bucket and payment-proofs private bucket policies using the real Storage service. Service credentials must never use the NEXT_PUBLIC_ prefix.

## Cloudflare R2 images

New product photographs can use Cloudflare R2 through the authenticated admin upload action. Follow [R2 setup](docs/R2_SETUP.md), fill the private fields in `.env.local`, and run `npm run check:r2`. Set `IMAGE_STORAGE_PROVIDER=r2` after the connection is verified. Existing Supabase images keep working, and payment evidence remains private in its current storage. No automatic image migration is performed.

## WhatsApp messages and coaching reminders

Physical and online monthly coaching are each NGN30,000 in the connected catalog. The owner WhatsApp panel is under Clients, Customers and Marketing. It provides explicit selected-contact messages, permission records and automated expiry-reminder settings. The private queue is installed, but delivery stays disabled until the client confirms their Business Platform sender and approved templates. See [WhatsApp setup](docs/WHATSAPP_SETUP.md) and [reminder instructions](docs/REMINDERS_SETUP.md).

## Operational workflows

[Checkout and WhatsApp invoice flow](docs/CHECKOUT_WHATSAPP.md) explains fulfillment selection, required pickup setup, the saved-invoice handoff and local testing.


**Merchandise:** add product/photos/price, define a unique SKU for each size/colour, enter physically counted opening quantities, confirm counts, then publish. Products with unconfirmed stock cannot be bought. Guest checkout snapshots prices, reserves stock and returns a non-guessable private order link. Pending cancellation releases reservations. Verified late payments require an explicit owner stock-resolution step if availability changed.

**Delivery:** choose a configured pickup location or a complete nationwide address. Configured rates are authoritative. An unknown delivery fee creates a quote workflow: staff quote, customer approves the final total, then bank instructions and evidence submission become available.

**Money:** customer/staff evidence stays pending and never counts as collected revenue. Only the owner verifies actual credit, using a unique normalized bank-credit reference. Partial payments retain the outstanding balance. Full payment is required for fulfillment/activation unless the owner authorizes pay-later. Refunds preserve original verified records and do not automatically return stock. Financial reports separate receipts, merchandise/coaching revenue, balances, refunds and expenses; supplied product costs enable gross-margin calculations.

**Coaching:** clients sign in, select physical/online packages, supply basic contact/preferences and request enrollment. Owner verification and confirmed start date activate a plan. Calendar-month expiry clamps to a valid day in the target month. Session bundles use their actual session allowance; durations are package-specific. Renewals create new invoices/history, not rewritten old payments. Guest purchases link only with both a private order token and a verified matching account email.

**Communication:** WhatsApp actions open prepared messages for a person to send. Newsletters require explicit consent and owner approval. Unsubscribe requests preserve consent history. Reminder defaults are seven days, two days and on expiry, with owner-configurable timing/disable. Sending needs a verified sender, scheduling secrets and an actual provider test; no real email was sent during development.

## Verification

```powershell
npm run typecheck
npm test
npm run test:db
npm run build
```

The SQL harness runs all migration files on PostgreSQL compiled to WASM with minimal Auth/Storage schemas, then executes transactional acceptance and impersonated-role RLS tests. Fixture data rolls back and is never seeded into the live application. This is meaningful SQL verification, but does not replace real Supabase Auth/Storage/API or multi-connection concurrency testing.

Detailed current evidence and limits: [test results](docs/TEST_RESULTS.md), [backend verification](docs/BACKEND_VERIFICATION.md). Launch/deployment steps: [DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Business information still needed

- Actual merchandise images, prices, costs when available, variants/SKUs and physical opening counts.
- Bank name, account number, account holder and owner-approved payment instructions.
- Pickup address, instructions and hours; supported delivery fees.
- Coach biography/photo, physical/online packages, prices, durations and session counts.
- Approved homepage content, real testimonials, contact email/social links, and final privacy/terms/returns policies.
- Auth URL/mail configuration, Resend sender credentials, a deployed scheduler and hosting target. Owner access and local scheduling/signing/encryption secrets are configured; hosted workflow testing and project Auth administration remain pending.

Normal launches and content updates use the admin, without code changes. Policy pages are visibly awaiting owner approval until approved content is published. Search indexing is disabled until LAUNCH_READY=true. Credentials and integration results are never fabricated.

## Brand and editorial assets

The supplied logo files were copied, unmodified, into public/brand. CSS displays them at their original aspect ratio while hiding empty surrounding margins; it does not recreate or recolour them. Original supplied files remain at the workspace root.

Temporary Unsplash photographs are labelled editorial and are never catalog products or presented as the ASCEND coach. Replace these with the owner's approved brand photography when available. See [asset notes](docs/ASSETS.md).

## Current handoff

The production build, 35 regression tests, all 14 local migration/SQL suites and 29 production HTTP page checks passed. The connected project now stores ASCEND application Owner access for **akgreat62@gmail.com**; connectivity, bucket settings and five anonymous private-table denials were verified. Local secrets were generated privately. Hosted migration 14 retry columns, computed search and the owner-authorized inventory aggregate are verified; this agent did not apply that upgrade. On 14 October 2026, both Supabase MCP and the connector were verified against ASCEND's project URL, and a read-only SQL query confirmed the customer table, chosen owner, all 36 public tables with RLS enabled, and expected event-snapshot fragments in four updated business RPCs. Project Auth URL/mail administration and live authenticated workflows remain unverified. Sending, reminders and launch remain disabled. See [setup status](docs/SUPABASE_SETUP.md) and [test results](docs/TEST_RESULTS.md).

## Quick customer entry

Admin > Customers and Coaching Clients now include a quick form requiring only name and phone, with email optional. After saving, assign a training package using the saved contact. See [saving customer details](docs/CUSTOMER_DETAILS.md). No new migration is required for this form.
