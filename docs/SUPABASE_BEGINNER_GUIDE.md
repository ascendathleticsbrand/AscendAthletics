# Using ASCEND and Supabase

Supabase keeps your website's records online. A table is like a spreadsheet: each customer has a row, with columns for their name, phone and optional email. Your website's forms write those records for you. See [Supabase's table guide](https://supabase.com/docs/guides/database/tables).

## Add a customer

1. Open the running ASCEND website and go to `/account`.
2. Sign in as **akgreat62@gmail.com**, using your existing password.
3. Open `/admin/customers`.
4. Under **Quick add customer**, enter **Full name** and **Phone number**.
5. Use **Add email (optional)** when you have an email address.
6. Click **Save customer** and wait for the saved confirmation.

The customer appears in the list. Search before adding an existing person again. Use the customer's edit action to update their details later. A contact can be saved without a website login; client dashboard access requires a registered account.

For training, use **Assign training package** after saving and choose a package you have configured. This prepares the enrollment and invoice; verifying actual payment and activating training are separate owner actions.

## View records in Supabase

Open your project in the [Supabase Dashboard](https://supabase.com/dashboard), choose **Table Editor**, select the `public` schema and open `customers`. Each row represents a saved customer. Normal business changes can be made through ASCEND's admin forms, which apply the business rules for payments and stock.

**Authentication > Users** shows website login accounts. A customer contact and a login account serve different purposes. Supabase documents account management in its [User Management guide](https://supabase.com/docs/guides/auth/managing-user-data).

**Storage** holds files. `product-images` contains public product photographs; `payment-proofs` holds private transfer evidence.

## Business details and extra staff

Open **Admin > Settings > Edit business settings** to enter your actual bank, pickup and contact details. Products, inventory and training packages have their own admin sections.

For an extra staff member, have them register and verify their account, then use **Admin > Settings > Manage staff access**. Choose Assistant or Owner and the appropriate permissions. These are ASCEND application roles.

## Current setup

Your ASCEND owner access is enabled, private app secrets are present, and hosted migration 14 search/retry/inventory additions are checked. **Supabase is connected to Codex**, verified on 14 October 2026 using the project URL and a read-only database query. No need to reinstall, authorize again, or rerun the migration or first-owner script. Keep [the connection guide](SUPABASE_CONNECTION.md) for reference. Auth URL/SMTP settings remain unverified and need the Dashboard or separate Management API access; the available MCP tools do not configure them.

The project's email sender, deployed website/scheduler, actual business information and hosted workflow checks still need completion. See [the exact setup status](SUPABASE_SETUP.md). Initial ASCEND owner assignment is already complete for this project.