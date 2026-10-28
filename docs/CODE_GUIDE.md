# ASCEND code guide

This guide explains where the code lives and how the parts work together. Source comments explain the main responsibilities and the less obvious steps in each workflow.

## Start with the screen you want to understand

| What you are looking for               | Start here                               | What it controls                                                               |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| Homepage                               | `src/app/(store)/page.tsx`               | Hero, slogan, fixed category cards and the main page sections.                 |
| Header and navigation                  | `src/components/store/header.tsx`        | Desktop/mobile navigation, left header icon and cart link.                     |
| Logo choices                           | `src/components/brand-logo.tsx`          | Maps horizontal, icon and monogram variants to approved artwork.               |
| Logo artwork                           | `public/brand/`                          | Public image files and generated SVG wrappers used by the logo component.      |
| Favicon and page metadata              | `src/app/layout.tsx`                     | Shared page title, icon configuration and the outer document.                  |
| Storefront appearance                  | `src/app/globals.css`                    | Colours, typography, hero image treatment, logo sizing and responsive layouts. |
| Admin appearance                       | `src/components/admin/admin.css`         | Sidebar, tables, cards, dialogs and mobile admin layouts.                      |
| Admin labels and form fields           | `src/components/admin/admin-config.ts`   | Action definitions, labels, input types and table columns.                     |
| Admin interactions                     | `src/components/admin/admin-section.tsx` | Search, filters, pagination, dialogs and form submission.                      |
| Admin data and totals                  | `src/lib/admin.ts`                       | Authorized queries, server-side filters, report ranges and safe response data. |
| Product and coaching data for visitors | `src/lib/catalog.ts`                     | Public catalog queries, content and display-ready image URLs.                  |

Use VS Code's **Ctrl + P** and paste a path from the table to open that file directly. Use **Ctrl + Shift + F** to search the project for the visible text or field name. This is often quicker than opening folders one by one.

The homepage category cards stay fixed when stock changes. Product availability and quantities belong in the shop and inventory flows. Keep those responsibilities separate when making future changes.

## What the main folders mean

- `src/app/`: pages, shared layouts and HTTP endpoints. Next.js builds URLs from these folders.
- `src/components/`: reusable screen pieces. `store/` serves customers; `admin/` serves staff.
- `src/lib/`: shared data access, business rules, permissions and helper functions.
- `src/lib/backend/`: request validation, authorized admin actions, private token handling and server-side safeguards.
- `src/lib/storage/`: the product-image upload adapter and image URL helpers.
- `public/`: files served directly to visitors, including approved logos and original product photos.
- `supabase/migrations/`: ordered database changes that define tables, permissions and transaction rules.
- `supabase/tests/`: local database checks using PGlite.
- `scripts/`: maintenance tools, connection checks and document/artwork builders.
- `tests/`: HTTP smoke checks against a running local site.
- `docs/`: setup instructions, the admin manual, test records and this guide.

A folder in parentheses, such as `(store)`, groups related pages without adding that folder name to the URL. A bracketed folder, such as `[slug]`, accepts a changing URL segment: `/shop/black-training-gloves` uses the product detail page at `src/app/(store)/shop/[slug]/page.tsx`.

A `page.tsx` file provides the screen for a route. A `layout.tsx` file wraps related pages. A `route.ts` file handles an HTTP request instead of drawing a page. A `.test.ts` or `.test.tsx` file verifies expected behaviour.

## How a page reaches the database

The usual flow is:

```text
Page or interactive component
  -> /api/... route
  -> server validation and permission check
  -> database query or database function
  -> safe response
  -> updated screen
```

Server pages can read data directly through server-only library functions. For example, an admin page calls `getAdminData()` before rendering the initial table; later searches request `/api/admin` from the browser.

A component with `"use client"` at the top can use interactive React features such as state, click handlers and browser APIs. It can still produce initial server-rendered HTML. Its first browser render therefore needs to match the server HTML. Avoid generating different first-render content from random numbers, local browser time, or browser-only branches.

A module importing `"server-only"` handles work that must stay on the server, including privileged credentials and protected data access. Do not import those modules into browser components.

## How the admin interface is assembled

1. `src/app/admin/layout.tsx` loads the signed-in staff context and redirects visitors who lack staff access.
2. `src/components/admin/admin-shell.tsx` draws the sidebar, breadcrumb and shared workspace frame.
3. `src/app/admin/page.tsx` loads Overview. `src/app/admin/[section]/page.tsx` loads other named sections and rejects unknown names.
4. `admin-config.ts` defines what each section displays and which actions it offers.
5. `admin-section.tsx` renders those definitions, opens dialogs and requests updated rows.
6. `src/app/api/admin/route.ts` handles list requests and submitted actions.
7. `src/lib/backend/admin-actions.ts` validates each write and applies staff/owner rules before saving it.

The controls on a page help the user choose valid actions. The API and database still check permissions independently. Hiding a button is not an access-control mechanism.

### Search, payment filters and reporting ranges

The table sends `search`, `filter`, `paymentFilter`, `stockFilter`, `page` and `pageSize` to `/api/admin`. `src/lib/backend/admin-list.ts` validates those options; `src/lib/admin.ts` applies supported filters before counting and paginating the results.

Overview's payment filter changes the **Recent orders** list. It does not turn its summary cards into totals for only the visible table rows. The reporting-period controls set the date range used for reporting.

Admin CSV export exports the **currently loaded page**. `src/components/admin/admin-values.ts` quotes cells and guards against spreadsheet formula interpretation.

### Example: follow a product's selling price from form to shop

To understand the existing field without changing its rules:

1. Search `admin-config.ts` for `Selling price (NGN)`. It belongs to the `saveProduct` action and uses the field key `price`.
2. In `admin-section.tsx`, `FormField()` renders the number input. `ActionDialog.submit()` turns it into a numeric value and posts the action to `/api/admin`.
3. `src/app/api/admin/route.ts` reads the request, checks staff access and calls `adminAction()`.
4. In `src/lib/backend/admin-actions.ts`, the `saveProduct` case parses the request with `productSchema` from `src/lib/backend/validation.ts`.
5. That schema checks that the price is positive and within the accepted limit. The save helper inserts a new product or updates the selected existing product through the signed-in database client.
6. Database permissions and publication guards still apply. Products need their real variants and confirmed physical opening stock before becoming purchasable.
7. The public catalog in `src/lib/catalog.ts` reads the published product data; the shop components display its selling price.

A product save uses a table write. Other operations need a database function because several records must change together. For example, `stockMovement` in `admin-actions.ts` calls `record_stock` with the selected variant, movement type, quantity, note and authenticated actor. The inventory transaction rules are defined in the SQL migration history.

## Authentication and staff roles

ASCEND uses Supabase Auth for customer and staff sign-in. `src/components/store/account.tsx` provides the account interface; `/api/auth` handles the supported authentication actions. `src/app/auth/callback/route.ts` completes supported authentication callbacks.

There are four database-client files, each with a different purpose:

| Client module                 | Where it runs | Purpose                                                                          |
| ----------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `src/lib/supabase/browser.ts` | Browser       | Uses the public project configuration for browser-side Supabase access.          |
| `src/lib/supabase/server.ts`  | Server        | Reads the current request's session cookies for signed-in access.                |
| `src/lib/supabase/public.ts`  | Server        | Reads the public catalog anonymously, even if the visitor is signed in as staff. |
| `src/lib/supabase/admin.ts`   | Server only   | Uses the private service key for tightly controlled privileged operations.       |

`src/proxy.ts` refreshes Supabase session cookies as requests pass through. `src/lib/auth.ts` verifies the user and reads staff roles, then exposes helpers such as `requireUser()`, `requireStaff()` and `requireOwner()`.

An ordinary customer account does not become an administrator by signing up. Staff authorization comes from `staff_roles`. Owner-only financial approvals, settings and access management are checked separately from normal staff access. The database also enforces row-level security (RLS), which limits the rows and actions each database role can access.

The public project URL and anonymous key are different from the service key. Anything named `NEXT_PUBLIC_...` may be included in browser code. Private service and storage credentials must remain in server-only configuration.

## Product images and Cloudflare R2

The admin **Upload photograph** action sends a file to `src/app/api/admin/upload/route.ts`.

1. The route checks origin, staff access, the selected product, file size and the detected image type.
2. `src/lib/storage/product-images.ts` chooses the configured storage provider.
3. The server uploads the image and creates the product gallery record.
4. If creating that record fails after upload, the route attempts to remove only the image it just uploaded.
5. `src/lib/storage/image-urls.ts` resolves saved image references for display.

New uploads use the provider selected by `IMAGE_STORAGE_PROVIDER`. Existing Supabase photo references can coexist with new R2 URLs. Changing providers does not move old photos automatically.

Product photographs are public. Customer payment evidence is private and follows the separate proof-upload and signed-link routes. Do not use the public product-image adapter for payment proofs.

Removing a photograph from the product gallery removes its attachment record; that is separate from purging an old storage object. See [R2_SETUP.md](R2_SETUP.md) for the bucket and upload setup.

## Checkout and the prepared WhatsApp message

`src/components/store/cart-context.tsx` shares the bag state; `cart-state.ts` contains its supporting data rules. `checkout-form.tsx` collects customer and fulfillment information and submits `/api/checkout`.

The API validates the request with `checkoutSchema` and calls the database's `create_checkout` function. That function checks real catalog prices and available stock, reserves units, and creates the order and invoice in one transaction. Browser-provided prices do not decide the invoice total.

A successful guest checkout receives a long random private token. The database stores its hash. `/order-status/[token]` and the order API use that token to retrieve the corresponding private order. Treat the full URL as private because it gives access to the order without a customer login.

`src/components/store/order-whatsapp.ts` builds a message from the saved order and invoice snapshot. `order-whatsapp-handoff.tsx` opens WhatsApp after checkout and keeps a manual button available on the order page. The customer still presses **Send** in WhatsApp; the site prepares the message.

The handoff consumes its automatic-open URL marker before leaving the site so returning from WhatsApp does not create a redirect loop. See [CHECKOUT_WHATSAPP.md](CHECKOUT_WHATSAPP.md) for the full flow.

## Inventory, invoices and coaching rules

Inventory is tracked per variant, identified by a unique SKU. One product can have several size/colour variants. Multiple identical units share that SKU.

- **Opening** and **reconciliation** use the total physically counted quantity.
- **Restock** adds the newly received quantity to confirmed stock.
- Damage, adjustments and inspected resellable returns have their own movement rules and audit entries.
- A reservation temporarily holds stock for an order. Available stock accounts for those reservations.
- Recording a customer's transfer claim or proof does not verify payment. An owner verifies the actual bank credit.
- Verified receipts update invoice balances and may settle the related order. Refunds and physical stock returns are separate actions.
- Coaching enrollment requests create an invoice. Activation and its start date follow the package and payment rules. Renewals create their own invoice and enrollment history.

The TypeScript backend validates incoming requests and passes the real staff actor to the database function. The SQL transaction performs the related writes together so stock, invoices and audit records agree.

## Reading the SQL migration history

Migration files are an ordered history, not a collection of independent queries to rerun. Existing deployments have already applied earlier files. Keep those files intact and introduce later corrections through a **new forward migration**.

| Migration topic              | Main responsibilities                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `001_foundation`             | Core tables and relationships for customers, merchandise, orders, coaching and business records.                             |
| `002_security`               | Signup profile/customer records, staff checks, access policies and row-level security.                                       |
| `003_inventory_checkout`     | Stock movements, reservations, expiration and order checkout transactions.                                                   |
| `004_orders_payments`        | Transfer claims, verified payment operations and order/payment state changes.                                                |
| `005_coaching_operations`    | Package terms, calendar-month expiry, enrollment and session operations.                                                     |
| `006_reporting_storage`      | Financial reporting helpers and storage configuration.                                                                       |
| `007_hardening`              | Additional database guards and integration corrections.                                                                      |
| `008_client_notes`           | Coaching-client notes with staff attribution.                                                                                |
| `009_enrollment_expiry`      | Coaching expiry based on the configured business calendar.                                                                   |
| `010_stock_resolution`       | Reservation locking and explicit handling of paid orders needing stock resolution.                                           |
| `011_browser_boundaries`     | Restrictions at browser/database access boundaries and protection of internal fields.                                        |
| `012_transactional_outbox`   | Durable queued transactional notification records. Sending happens outside business transactions.                            |
| `013_staff_permissions`      | Owner-assigned operational permissions for assistants.                                                                       |
| `014_retry_search_inventory` | Durable email retry timing, database-backed search and inventory aggregation, plus forward updates to transaction functions. |

The full filenames are in `supabase/migrations/`. Later definitions can replace functions from earlier migrations, so inspect the latest definition when following a database operation.

For a future schema change, use the Supabase CLI to create a migration (`supabase migration new <descriptive_name>`) and review/test the resulting forward change. Formatting this application is not a reason to rewrite or reapply deployed migrations. `supabase/seed.sql` is separate setup/catalog seed material and should not be used to overwrite live business records casually.

## Notifications and reminders

`src/lib/notifications.ts` processes transactional notifications, coaching reminders and approved email campaigns. `src/app/api/cron/route.ts` requires the configured cron secret before running scheduled work. A scheduler must be configured on the hosting platform; having the route in the project does not schedule it by itself.

Email delivery requires the configured email provider and verified sender. Marketing consent and owner approval are separate from ordinary order notifications. Prepared WhatsApp reminders remain a manual send action. See [REMINDERS_SETUP.md](REMINDERS_SETUP.md).

## Configuration without exposing secrets

Keep real configuration values in `.env.local` locally and in the hosting provider's environment settings when deploying. `.env.example` documents the expected names. Never paste secret values into source files, comments, screenshots or a public repository.

| Names                                                       | Purpose                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase project connection.                                       |
| `SUPABASE_SERVICE_ROLE_KEY`                                 | Private server-side database and authentication administration.           |
| `NEXT_PUBLIC_SITE_URL`                                      | The site's public/canonical origin for absolute links and request checks. |
| `IMAGE_STORAGE_PROVIDER`                                    | Selects Supabase or R2 for new product-photo uploads.                     |
| `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`     | R2 account/bucket routing and public image delivery origin.               |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`                  | Private credentials for server-side R2 uploads.                           |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                       | Private email-provider access and the configured sender.                  |
| `EMAIL_ENABLED`, `EMAIL_PROVIDER_TESTED`                    | Gates for enabling email sending after setup and verification.            |
| `CRON_SECRET`                                               | Protects the scheduled-work endpoint.                                     |
| `NEWSLETTER_TOKEN_SECRET`, `NOTIFICATION_LINK_SECRET`       | Protect unsubscribe tokens and stored private notification links.         |
| `LAUNCH_READY`                                              | Controls public indexing configuration.                                   |

No credential values belong in this guide. Restart the development server when configuration needs to be reloaded, and keep browser-facing and server-only settings distinct.

## Developer commands and checks

Run commands from the project folder in VS Code's terminal.

| Command                             | What it does                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                       | Starts the development site. Use the **Local** URL printed in the terminal; the port may vary.                        |
| `npm run format`                    | Applies the shared formatting rules to the supported project source and documentation files.                          |
| `npm run format:check`              | Checks formatting without rewriting files.                                                                            |
| `npm run typecheck`                 | Checks TypeScript types without producing application files.                                                          |
| `npm test`                          | Runs the Vitest tests, including pure helpers, mocked routes and component interactions.                              |
| `npm run test:db`                   | Runs migration and database-rule checks in a local PGlite test database.                                              |
| `npm run test:smoke`                | Checks routes and request boundaries against a running local site; defaults to port 3001.                             |
| `npm run build`                     | Creates a production build and checks Next.js compilation.                                                            |
| `npm start`                         | Serves a production build after the build has completed.                                                              |
| `npm run check:r2`                  | Checks the configured R2 connection without uploading a photo.                                                        |
| `npm run check:r2 -- --upload-test` | Uploads a temporary image, verifies public delivery and attempts cleanup.                                             |
| `npm run admin:password`            | Privately resets the verified ASCEND owner's password (`akgreat62@gmail.com`) through an interactive terminal prompt. |

For a different local smoke-test URL in PowerShell, set `$env:ASCEND_TEST_URL` to that local origin before running the command. Use the development terminal's actual address instead of assuming a fixed port.

`vitest.config.mts` configures the unit/component test environment and the `@/` source alias. `tsconfig.json` configures TypeScript. `next.config.ts` configures Next.js. `package.json` declares commands and dependencies; `package-lock.json` records resolved dependency versions.

Tests beside a module explain its important expectations. Read the relevant test before changing a rule, then run appropriate checks afterwards. A passing mocked test verifies its scenario; it does not prove a live bank payment, customer email or WhatsApp message was delivered.

The installed Next.js version includes its own documentation under `node_modules/next/dist/docs/`. Read the relevant installed guide before changing Next.js conventions because this project uses version-specific APIs.

## A practical reading order

1. Open the homepage and `src/app/(store)/page.tsx` together to connect visible sections with their markup.
2. Open `globals.css`, the header and `brand-logo.tsx` to understand layout and branding.
3. Open `admin-config.ts` and follow one action through `admin-section.tsx`, `/api/admin`, validation and the backend action.
4. Read `src/lib/auth.ts` and the four Supabase client modules to understand who can access each operation.
5. Follow checkout and one inventory/payment transaction into the migration history.
6. Read the matching tests and setup guides before extending that feature.

For operating the business interface, use [ASCEND_Admin_Guide.pdf](ASCEND_Admin_Guide.pdf). This file explains the code behind that interface.

## WhatsApp selection and automation

The owner WhatsApp panel is in `src/components/admin/whatsapp-manager.tsx`, displayed in Clients, Customers and Marketing. It calls the owner-only `/api/admin/whatsapp` route. `src/lib/whatsapp.ts` creates durable selected-recipient and expiry work; `src/lib/whatsapp/provider.ts` sends approved Meta templates with private server credentials. `/api/cron` continues eligible work. Permission evidence and the queue live in four private WhatsApp tables. Sending stays disabled until the business sender/templates are connected and tested. See [WHATSAPP_SETUP.md](WHATSAPP_SETUP.md).

The physical and online monthly coaching packages are each NGN30,000 in the connected database. The personal training mode cards read those published monthly package prices, so later owner price edits remain consistent with enrollment invoices.
