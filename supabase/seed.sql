-- Additional requested catalog categories. Safe to run after all migrations.
-- No products, prices or physical stock are created by this seed.
insert into public.categories (name, slug, sort_order, active)
values ('Supplements', 'supplements', 7, true)
on conflict (slug) do nothing;
