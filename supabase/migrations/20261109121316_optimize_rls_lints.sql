-- Evaluate caller identity once per statement instead of once per candidate row.
alter policy profiles_read on public.profiles
  using ((id = (select auth.uid()) or private.is_staff()));
alter policy profiles_edit_self on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
alter policy staff_roles_read on public.staff_roles
  using ((user_id = (select auth.uid()) or private.is_owner()));
alter policy customers_read on public.customers
  using ((profile_id = (select auth.uid()) or private.is_staff()));
alter policy expenses_owner_insert on public.expenses
  with check (private.is_owner() and created_by = (select auth.uid()));
alter policy notes_staff_insert on public.order_notes
  with check (private.is_staff() and created_by = (select auth.uid()));
alter policy coaching_notes_staff_insert on public.coaching_enrollment_notes
  with check (private.is_staff() and created_by = (select auth.uid()));

-- Owner deletion is already covered by the staff-delete policy because every
-- owner is also staff. Removing the redundant policies keeps the same access.
drop policy if exists catalog_owner_delete on public.collection_products;
drop policy if exists catalog_owner_delete on public.product_images;

-- Split the all-actions customer-address policy into write-only policies.
-- addresses_read continues to handle SELECT, avoiding duplicate permissive reads.
drop policy if exists addresses_write on public.customer_addresses;
create policy addresses_insert on public.customer_addresses
  for insert to authenticated
  with check (private.owns_customer(customer_id) or private.is_staff());
create policy addresses_update on public.customer_addresses
  for update to authenticated
  using (private.owns_customer(customer_id) or private.is_staff())
  with check (private.owns_customer(customer_id) or private.is_staff());
create policy addresses_delete on public.customer_addresses
  for delete to authenticated
  using (private.owns_customer(customer_id) or private.is_staff());
