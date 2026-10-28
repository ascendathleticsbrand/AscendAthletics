# Saving customer details

Normal customer entry happens through the admin. The connected project already has Owner access for **akgreat62@gmail.com**; daily entry does not require SQL or the Supabase dashboard.

1. Sign in with an Owner or Assistant account.
2. Open **Admin > Customers** (or **Coaching Clients**).
3. In **Quick add customer**, enter their **full name and phone number**.
4. Click **Save customer**. Email is optional under **Add email**.

The form clears and focuses the name field after a successful save, so you can enter the next person quickly. If saving fails, the entered details stay in the form and the error is shown. Existing contacts can be edited from the customer details view.

To register someone for training, click **Assign training package** beside the saved confirmation. Their saved customer record is already selected; choose a real configured package. This creates the pending enrollment and invoice. Payment verification and owner activation remain separate steps.

The quick form saves a real customer contact in the same secure database used for orders and coaching. It does not create a login, merge people because of matching names/contacts, or subscribe them to marketing. Coaching account registration uses the secure account flow when required.

No new database migration is needed for this form. See [owner access](OWNER_SETUP.md) and [Supabase setup status](SUPABASE_SETUP.md); hosted migration 14 additions are now checked, while authenticated workflows still need verification.
