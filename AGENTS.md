# AGENTS.md

## Repo layout gotcha

- The real app lives at **`itulod/itulod/`** (doubled nesting). Root-level files are mostly wrappers. Root `vercel.json` rewrites every path not starting with `/itulod/` to `/itulod/itulod/<path>`, so deploy URLs hide the nesting. **Edit files under `itulod/itulod/`, not the root.**
- The inner `vercel.json` redirects `/` → `/login.html`.

## Architecture

Vanilla HTML/CSS/JS frontend (no build step, no bundler, no tests/lint config). Two backends:

1. **Express API** — `itulod/itulod/server/` (only package.json in repo)
   - `npm run dev` (node --watch, port 3000). Serves the frontend statically *and* `/api/*` routes, so running it alone is enough for local dev.
   - Uses the Supabase **service-role key** from `server/.env` — it bypasses RLS. Route guards are app-level: `middleware.js` `requireAuth`/`requireRole`; riders additionally need an approved `rider_applications` row.
   - Frontend calls it via `js/api.js` (JWT kept in `sessionStorage`).
2. **Supabase Edge Functions (Deno)** — `supabase/functions/` — PayMongo payment flow only (`create-payment`, `attach-card-payment`, `paymongo-webhook`). Secrets via `secrets.env` + `supabase secrets set --env-file secrets.env`. Deploy webhook with `--no-verify-jwt` (it verifies PayMongo's signature instead).

Frontend also talks to Supabase directly for auth/session (`js/supabaseClient.js`) and Realtime (`js/api.js` keeps a separate anon-only client).

## Config duplication

Supabase URL/anon key are hardcoded in **two places**: `js/config.js` AND `js/api.js` (~line 66). Changing the Supabase project requires editing both.

## Database

- Canonical schema: `itulod/itulod/sql/schema.sql` (tables + RLS + storage buckets + seeds). Migrations are numbered (`002_…`, `003_…`, `004_…`) and must run in order after schema; `fix_rls_customer_read_rider.sql` is unnumbered/ad-hoc.
- The root-level `schema.sql` is a different (older) copy — don't confuse them.
- Schema changes are applied by pasting SQL into the Supabase SQL Editor; there is no migration runner.

## Secrets

- `server/.env` and `secrets.env` exist locally and contain live-looking service-role/secret keys; gitignored, never commit or move into `js/`. PayMongo secret keys belong only in Edge Function secrets. Per the inner README, keys were leaked in a prior export — assume rotation is required before production.

## Misc

- Directory is not currently a git repository.
- The two READMEs differ: `itulod/itulod/README.md` is current (payments wired); root `README.md` is older and says payments are placeholder.
