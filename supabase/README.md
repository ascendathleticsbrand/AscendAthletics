# Supabase database and verification

Apply migrations in filename order with the Supabase CLI. They define 36 relational tables, two sanitized public views, service-only transactional RPCs, row-level security, immutable money/stock/audit history and public/private Storage buckets. The initial migrations seed the six original categories, safe settings and the actual supplied WhatsApp number. The additional Supplements category is in [seed.sql](seed.sql), which the Supabase CLI runs after migrations for local setup and reset. It creates no products or stock. The SQL test fixtures are wrapped in transactions and always roll back.

## Local database

Install Docker Desktop and the Supabase CLI, then run from the project root:

```powershell
npx supabase start
npx supabase db reset
```

`db reset` destroys the LOCAL development database and replays migrations; use only against disposable development data. Put the local API URL and keys printed by Supabase into `.env.local`. Never place the service-role key in a `NEXT_PUBLIC_` variable. The initial bank and pickup address fields are blank until the owner configures actual details.

Run the SQL suites against a disposable local database:

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/acceptance.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
```

These tests insert Auth fixture users using SQL, exercise real RPCs, impersonate PostgreSQL roles and roll back. The WASM harness also rehearses the forward upgrade from the deployed thirteen-migration schema before applying migration 14. Never run fixture tests against a production database.

## Database tests without Docker

PGlite executes the complete migration SQL and both test suites on a real PostgreSQL engine compiled to WASM. The harness supplies minimal Supabase Auth and Storage schemas/roles; it does not test the hosted HTTP API, actual signup emails or object uploads/signing.

```powershell
npm install --prefix supabase/.test-runtime --no-save --package-lock=false @electric-sql/pglite@0.5.9
node supabase/tests/run-pglite.mjs
```

The project includes `@electric-sql/pglite` as a dev dependency, so `npm run test:db` uses that package. On Windows the runner automatically re-executes with `--wasm-num-compilation-tasks=1` to limit WASM compilation memory. See the official [PGlite PostgreSQL runtime documentation](https://pglite.dev/docs/about) and [pgcrypto extension instructions](https://pglite.dev/extensions/).

Verified on 13 October 2026: all fourteen migrations applied successfully and both SQL suites passed on PostgreSQL 18.6 / PGlite 0.5.9. The configured local Supabase target is PostgreSQL 15. Hosted Supabase API, actual Auth signup/email verification and Storage upload/signing have not been verified by this harness. Run the suites against a disposable local or staging database before launch. Hosted read-only checks now confirm migration 14 retry columns, both computed search fields and the owner-authorized inventory aggregate. This agent did not apply the hosted upgrade. Refreshed checkout/payment/enrollment RPC bodies could not be inspected with the application key; hosted transactional workflows remain untested. Do not rerun migration 14 based on the earlier pending status. A real multi-connection PostgreSQL concurrency run is still required for launch confidence; the WASM harness has one backend connection.

The tests cover physically counted opening inventory, row-locked reservations, reservation expiry, authoritative prices, exact inventory aggregates with over 1,000 variants, private cross-record search, secure guest tokens, payment evidence that does not count as money, NGN 20,000 / NGN 50,000 partial payment balances, idempotent verification and duplicate bank-credit prevention, pickup, quoted delivery with final customer approval, late-payment stock conflicts, manual WhatsApp sales, end-of-month/leap-year coaching expiry, physical/online enrollment snapshots, minimal preferences, finite session bundles, explicit owner exceptions, role escalation prevention, bounded assistant package/delivery permissions, staff access revocation with last-owner protection, client/document isolation, cost/bank privacy, private Storage policies, separate receipts/refunds/expenses, immutable logs, transactional notification snapshots/deduplication, marketing opt-outs and durable rate limits.

## First owner bootstrap for a new project

The connected ASCEND project already stores application Owner access for **akgreat62@gmail.com**. Do not rerun bootstrap SQL for it. See [owner access](../docs/OWNER_SETUP.md) and [current setup status](../docs/SUPABASE_SETUP.md). The example below applies only to a different project without an owner.

First create and verify the actual owner's secure account through the website. Then run the following in the Supabase SQL editor, replacing the example with that exact verified account email:

```sql
begin;
do $$
declare owner_user uuid;
begin
  select id into owner_user from auth.users
  where lower(email)=lower('REPLACE_WITH_VERIFIED_OWNER_EMAIL')
    and email_confirmed_at is not null;
  if owner_user is null then
    raise exception 'Create and verify the owner account first';
  end if;
  if exists(select 1 from public.staff_roles where role='owner') then
    raise exception 'An owner already exists; use the owner staff-management workflow';
  end if;
  perform set_config('app.actor',owner_user::text,true);
  insert into public.staff_roles(user_id,role,permissions)
  values(owner_user,'owner','{}');
end $$;
commit;
```

Do not put roles in signup/user metadata. Only an existing owner can create/demote subsequent staff through `set_staff_role` or revoke access with `revoke_staff_access` and a required reason; the last owner cannot be removed. Roles accept only boolean `manage_packages` and `manage_delivery_rates` optional assistant permissions. Revocation preserves the account, customer identity and transaction history. Assistants may prepare merchandise/stock/orders/clients/campaigns, while actual money verification, refunds, bank configuration and exceptions remain owner actions.

## Important rules

- Store money as decimal NGN naira; finite-value constraints reject PostgreSQL numeric `NaN`/infinities. Collected receipts come only from verified payments, not claims or invoice totals.
- Actual bank-credit references are normalized and unique across all payments. Repeating verification with the same amount/reference returns the existing result. Correct mistaken verified money using a documented refund/financial history; do not rewrite it.
- `stock_on_hand` is unsold physical stock; `stock_reserved` belongs to active pending orders; available stock is their difference. Verification consumes the order's own reservation once. Expired reservations are released and late verified receipts either consume available stock atomically or set `resolution_required`.
- Resolve a paid stock conflict through physically counted restocking followed by owner stock resolution and fulfillment, or an owner refund/cancellation. Fulfillment never silently oversells. Returns add inventory only through `record_stock(kind='return',resellable=true)` after physical inspection.
- Monthly expiry is the confirmed start plus the configured calendar-month count, clamped to month end. The expiry date is the renewal boundary; session dates must precede it. Session bundles without a duration have no fabricated expiry date.
- Delivery fees without a matching configured rate stay unknown. Staff may quote the fee, but only the customer with their secure token/account can approve the final amount. Bank instructions/payment evidence remain blocked until approval.
- Customers are UUID identities. A supplied email alone never links guest records. Linking requires both the original non-guessable token and a verified matching account email.
- Private proof paths are `proofs/<invoice UUID>/<random UUID>.jpg|png|webp`. Uploads are authorized by server handlers. Direct authenticated reads require ownership of the linked payment or staff access; guest reads need a token-validated signed URL.
- App APIs use the service-role key only on the server, derive `p_actor` from verified authentication and validate inputs. All transactional RPCs also check actors independently; browser roles cannot execute them or grant themselves roles.
- Transactional notifications are inserted by business RPCs in the same transaction as the order, enrollment or verified payment. Delivery happens later through the retryable server outbox. A durable first-attempt timestamp prevents retries from extending beyond the provider idempotency window. Plaintext guest access tokens, bank-credit references and staff notes do not enter notification payloads. Notifications are staff-readable only.
- Marketing contacts receive explicit append-only consent records. Purchases do not subscribe anyone. Campaigns need owner approval; signed unsubscribe requests use service-only `unsubscribe_subscriber` with durable opt-out history.

Full shared table/RPC shape: [DATABASE_CONTRACT](../docs/DATABASE_CONTRACT.md).
