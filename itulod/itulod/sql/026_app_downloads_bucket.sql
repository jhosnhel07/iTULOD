-- 026_app_downloads_bucket.sql
-- Public storage bucket for the Android app (app_itulod) that the website's
-- "Get the app" button links to. Anyone can download (public bucket, served
-- from /storage/v1/object/public/app-downloads/...); there is deliberately no
-- insert/update policy, so only the service role / Supabase CLI can upload.
--
-- Files kept here:
--   itulod.apk          64-bit Android build (almost every phone from ~2017 on)
--   itulod-armv7.apk    32-bit build for older phones
--   latest.json         { version, build, size_mb, size_mb_armv7, updated }
--
-- Idempotent.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'app-downloads',
  'app-downloads',
  true,
  104857600, -- 100 MB per file
  array['application/vnd.android.package-archive', 'application/json', 'application/octet-stream']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
