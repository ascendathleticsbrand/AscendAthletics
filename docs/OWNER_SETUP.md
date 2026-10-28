# Owner access

**akgreat62@gmail.com** now has **Owner access in the ASCEND application**, stored in the connected Supabase database. This did not change Supabase platform project membership. On 13 October 2026, setup verified that the exact account was email-confirmed, its profile existed, and no owner was assigned before creating the owner membership with the server service credential. The database's automatic INSERT audit record was verified. Its actor is null because this was a service-credential operation, not an authenticated owner action.

**Do not run the first-owner bootstrap script for this project: an owner already exists.** [bootstrap-owner.sql](../supabase/bootstrap-owner.sql) is a guarded fallback for a different, new project without an owner. It is not required for ordinary customer entry or later staff changes.

Sign in at `/account` with your existing account password and open `/admin`. The password was not changed during setup. Hosted [migration 14](../supabase/migrations/202610130014_retry_search_inventory.sql) retry columns, computed search and inventory aggregate are now visible and checked. Do not rerun the migration; authenticated business workflows still need a controlled test. See [Supabase setup status](SUPABASE_SETUP.md) for completed work and remaining administration access.

The owner can add another already registered/verified user through **Admin > Settings**, selecting Owner or Assistant. Package and delivery-rate management can be separately granted to assistants. Bank changes, actual payment verification, refunds and staff changes remain owner actions. Revoking access removes staff membership while preserving customer/profile history; the last owner is protected.

To transfer business ownership later, add the new verified user as an owner first, then remove the previous staff access after confirming the new owner can sign in. Do not put a privileged role in signup metadata.

## Recover the existing owner password locally

If sign-in says the email/password is incorrect, use the ASCEND website password for **akgreat62@gmail.com**. Your Supabase dashboard password is a separate credential.

If you have forgotten the website password:

1. In VS Code, choose **Terminal > New Terminal** in this project.
2. Run `npm run admin:password`. Keep the website server running in its existing terminal.
3. Check the owner email and Supabase project shown by the command. Enter a new password with 8 to 128 characters and press Enter. Nothing appears while you type.
4. Enter the same password again. The command updates only the existing, email-confirmed owner account password. It preserves the account's owner membership and other business data.
5. Open [local admin sign-in](http://localhost:3000/account?next=/admin), select **Sign in**, and use **akgreat62@gmail.com** with the new password.

The command uses the private service-role key already in `.env.local`, runs only in your interactive terminal, and sends no recovery email. Never share the new password here or put it in a command, source file or environment variable. This is a local maintenance command, not a public password-reset endpoint.

For a read-only connection/owner check, run `npm run admin:password -- --check`; this does not change the password. If the terminal says too many sign-in attempts, wait 15 minutes after the last attempt before signing in again.
