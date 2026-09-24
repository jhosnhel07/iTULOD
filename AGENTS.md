# AGENTS.md

## Repo layout gotcha

- The real app lives at **`itulod/itulod/`** (doubled nesting). Root-level `schema.sql`/`vercel.json`/`README.md` are an older, unused copy — don't confuse them with the ones under `itulod/itulod/`. Root `vercel.json` rewrites every path not starting with `/itulod/` to `/itulod/itulod/<path>`, so deploy URLs hide the nesting. **Edit files under `itulod/itulod/`, not the root.**
- The inner `vercel.json` redirects `/` → `/login.html`.
- **Git gotcha:** there is a second, stray `.git` at `itulod/.git` (one level below this repo's root) with its own disconnected single-commit history — not the real repo, not linked to GitHub. If a git command run from inside `itulod/` or `itulod/itulod/` shows unfamiliar history (e.g. just "Initial commit"), that's this stray repo shadowing the real one. Always run git commands from this repo's actual root (where this file lives) to be sure you're on the real, GitHub-connected history.

## Architecture

Vanilla HTML/CSS/JS frontend (no build step, no bundler). Single backend: **Supabase** (Postgres + Auth + Storage + Realtime + Edge Functions). There is no Express/Node API server — an earlier one under `itulod/itulod/server/` was removed and money/authorization moved server-side into Postgres RLS + triggers + Edge Functions instead.

- **Edge Functions (Deno)** — `itulod/itulod/supabase/functions/`: `create-payment`, `paymongo-webhook`, `sync-payment-status`, `finalize-fare`, `on-booking-change`, `expire-bookings`, `check-email`, `redeem-promo`, `wallet-topup`, `apply-referral-code`, plus `_shared/` (helpers.ts, notify.ts, payments.ts). Secrets via `secrets.env` + `supabase secrets set --env-file secrets.env`. `paymongo-webhook`, `on-booking-change`, `expire-bookings`, and `check-email` deploy with `--no-verify-jwt` (see `supabase/config.toml`).
- Frontend talks to Supabase directly for everything — auth/session, Realtime, and RPC/Edge Function calls — via `js/supabaseClient.js`. There is no separate `js/api.js`; that file was removed along with the Express server.

## Config

Supabase URL/anon key live in exactly one place now: `itulod/itulod/js/config.js`. (No more two-file duplication — the old `js/api.js` copy is gone.)

## Database

- Canonical schema: `itulod/itulod/sql/schema.sql` (tables + RLS + storage buckets + seeds). Migrations are numbered (`002_…` through `018_…` and counting) and must run in order after schema; `fix_rls_customer_read_rider.sql` is unnumbered/ad-hoc.
- Apply migrations with the Supabase CLI: `npx supabase@latest db query --project-ref <ref> --linked --file sql/0NN_name.sql` (from `itulod/itulod/`). The Supabase Dashboard SQL Editor also works if you prefer pasting SQL by hand.
- `DEPLOYMENT.md` (in `itulod/itulod/`) has the full migration table, Edge Function deploy list, and a post-deploy smoke-test checklist — check it before assuming something isn't wired up.

## Secrets

- `secrets.env` exists locally and contains live-looking service-role/secret keys; gitignored, never commit it or move its contents into `js/`. PayMongo secret keys belong only in Edge Function secrets.

## Misc

- This directory **is** a git repository, with a GitHub remote (`origin` → `jhosnhel07/iTULOD.git`) — see the git gotcha above before trusting `git log` output from a subdirectory.
- `itulod/itulod/README.md` is current and describes the actual feature set; the root-level `README.md` is an older, unused copy (see the repo layout gotcha above).
