# Supabase setup status

Updated **14 October 2026**. Earlier application-key checks were performed on 13 October; the connected MCP checks below were verified on 14 October. Credentials remain private in `.env.local`.

## Completed

- REST, Auth administration and Storage connectivity verified.
- Supabase MCP and the Supabase connector are connected to the ASCEND project `cjridqffhafmxeiiboru`: both project-URL calls succeeded and matched the application project; a read-only MCP SQL query succeeded.
- MCP SQL confirmed the existing customer table, the confirmed chosen owner, and RLS enabled on all 36 public tables. Anonymous and authenticated browser roles cannot execute `inventory_summary` or `verify_payment`. These checks do not cover every live user workflow.
- Confirmed account **akgreat62@gmail.com** now has ASCEND application Owner access. Setup checked its profile and absence of an existing owner before the service-credential insert. The automatic INSERT audit was verified; its actor is null for this service operation.
- Anonymous REST reads of customers, payments, payment evidence, staff roles and audit logs returned **401**; public catalog returned **200**.
- `product-images` is public and `payment-proofs` private, with 10 MiB limits and configured image/PDF restrictions.
- WhatsApp **+234 913 060 7719**, **Africa/Lagos** timezone and enabled email confirmation verified.
- Missing `CRON_SECRET`, `NEWSLETTER_TOKEN_SECRET` and `NOTIFICATION_LINK_SECRET` values generated privately; existing values preserved.
- Hosted migration 14 additions checked: both retry columns and computed search fields returned 200; owner-authorized inventory summary returned its six expected aggregate keys. MCP SQL also confirmed the additions and the expected notification event-snapshot fragments in all four updated business RPC bodies. This agent did not apply the hosted upgrade.

## Remaining

The Supabase connection is verified; no installation or authentication step needs repeating. See [the connection guide](SUPABASE_CONNECTION.md) for reference. Project Auth URLs and SMTP configuration remain unverified: the available MCP tools do not configure them, so those settings need the Dashboard or separate appropriately scoped Management API access. Hosted business workflows still need controlled verification. Do not paste secrets into chat.

**Do not rerun migration 14 or owner bootstrap:** the checked additions and initial owner are already present. Local migration/upgrade tests also passed; remote transactional behavior has not yet been tested.

Before launch, configure the actual site origin and Auth callback allowlist, approved Auth mail delivery, a verified Resend sender with a controlled provider test, and the deployed scheduler. Enter real bank/pickup details, products/physical stock, coaching packages and approved policies. Complete hosted sign-in, role isolation, checkout/coaching and private-file tests.

Reminders, application sending and launch remain disabled. No real email was sent, business fixtures invented or website deployed. Keep `LAUNCH_READY=false` until launch checks pass. Preserve the private-link encryption secret while pending encrypted links exist.

For daily work, sign in at `/account`, open `/admin`, and use [the simple customer form](CUSTOMER_DETAILS.md). No Supabase dashboard or SQL is needed for customer entry. See [owner access](OWNER_SETUP.md).
