-- 027_catalog_images.sql
-- Public storage bucket for restaurant logos and menu-item photos.
--   restaurants/<restaurant id>-<time>.<ext>   uploaded by an admin (admin Restaurants tab)
--   menu-items/<item id>-<time>.<ext>          uploaded by an admin (restaurant menu modal)
--   stock/<dish>.jpg                           sample dish photos (CC0 / public domain,
--                                              see STOCK_PHOTOS.md) — shown with a
--                                              "Sample photo" tag in the apps
-- Anyone can view (public bucket); only admins can upload, replace or delete.
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880, -- 5 MB per image
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "catalog_images_admin_insert" on storage.objects;
create policy "catalog_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalog-images' and public.is_admin());

drop policy if exists "catalog_images_admin_update" on storage.objects;
create policy "catalog_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'catalog-images' and public.is_admin())
  with check (bucket_id = 'catalog-images' and public.is_admin());

drop policy if exists "catalog_images_admin_delete" on storage.objects;
create policy "catalog_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'catalog-images' and public.is_admin());
