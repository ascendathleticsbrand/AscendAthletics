-- Public buckets serve known object URLs without a storage.objects SELECT policy.
-- Keep the staff-only insert/update/delete policies for product image management.
drop policy if exists catalog_files_public on storage.objects;
