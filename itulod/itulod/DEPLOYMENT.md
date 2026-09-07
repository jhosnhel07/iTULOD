# iTULOD — deployment & security runbook

Everything here is a **manual step** done in a dashboard or terminal. The app
code is already in the repo; this is what has to happen around it for a
production-ready deploy. Do the steps in order.

---

## 0. One-time secrets hygiene

### Rotate the leaked PayMongo test key

The PayMongo **test** secret key `sk_test_aLaZX3jFpngxP6bBW47rkbpd` was committed
in `.claude/settings.local.json` and is in git history. It cannot be scrubbed
from history cheaply, so **rotate it**:

1. PayMongo dashboard → **Developers → API keys → Roll secret key** (test mode).
2. Set the new value on Supabase (see step 4 below):
   `supabase secrets set PAYMONGO_SECRET_KEY=sk_test_<new> --project-ref <ref>`
3. When you go live, repeat with the **live** keys — never put a live secret
   key anywhere in `js/` or in a settings file.

`.claude/settings.local.json` is now git-ignored and untracked. Keep it that
way; it holds machine-local tool permissions, not app config.

### Restrict the Mapbox token

The token in `js/map.js` / `js/config.js` is public by nature (it ships to the
browser), so lock down what it can do:

1. Mapbox account → **Tokens → the token iTULOD uses → Edit**.
2. **URL restrictions**: add the production origin(s) only, e.g.
   `https://itulod.vercel.app/*` and `http://localhost:*/*` for dev.
3. **Scopes**: keep only `styles:read`, `fonts:read`, `datasets:read` if used,
   and `vision:read` only if needed. Remove every write/secret scope.
4. **Spend cap**: Account → **Billing → set a monthly limit** so a leaked or
   abused token can't run up a bill.

Routing and geocoding go through OSRM (`router.project-osrm.org`) and Photon
(OpenStreetMap), which need no key.

---

## 1. Database — run the SQL migrations

Supabase dashboard → **SQL Editor**. Run each file's full contents **in order**,
once:

| Order | File | Purpose |
|------:|------|---------|
| 1 | `sql/schema.sql` | tables, enums, RLS, storage buckets, seed admin |
| 2 | `sql/002_payment_gateway.sql` | `payment_method` / `payment_status` / `paymongo_reference` columns |
| 3 | `sql/003_rider_application_documents.sql` | rider doc upload columns |
| 4 | `sql/004_fix_rider_payment_inserts.sql` | backfill + earlier payout fix |
| 5 | `sql/005_server_side_money_and_hardening.sql` | **money moves server-side**: `platform_config`, the `booking_before_update` trigger, hardened RLS, `rider_locations` |
| 6 | `sql/006_push_subscriptions.sql` | web-push subscription table (skip if you only want SMS / in-app) |
| 7 | `sql/007_delivery_distance.sql` | `distance_km` on food/parcel deliveries |

All files are idempotent (`create ... if not exists`, `drop policy if exists`),
so re-running one is safe.

After step 5, confirm:

```sql
select * from public.platform_config;               -- exactly one row
select tablename, policyname from pg_policies
  where schemaname = 'public' order by tablename;    -- RLS present on every table
```

`platform_config` holds `commission_rate` (0.15), `fare_min` (₱20),
`fare_max_multiplier` (3×). Change these with an `update` as the admin user, not
in code.

### What the hardening actually enforces

- Clients can no longer write `estimated_fare`, `final_fare`, `payment_status`,
  or insert `payments` rows. The `booking_before_update` trigger computes the
  commission/payout and writes the `payments` row on completion.
- Only an **approved, active rider** (`is_approved_rider()`) can see or claim
  open jobs.
- A rider can only advance *their own* booking's status; the customer can only
  cancel while pending.
- `rider_locations` is readable by the assigned customer only while the booking
  is active.

---

## 2. Realtime

Dashboard → **Database → Replication → `supabase_realtime`** — make sure these
tables are in the publication (005 adds `rider_locations` automatically, but
verify):

`transport_bookings`, `food_deliveries`, `parcel_deliveries`, `notifications`,
`rider_locations`.

---

## 3. Storage

`sql/schema.sql` creates the buckets. Confirm in **Storage** that `avatars` and
`rider-docs` exist and their policies loaded. `rider-docs` must be private.

---

## 4. Edge Functions

Install the CLI once: `npm i -g supabase` (or use `npx supabase@latest`).

```bash
supabase login
supabase link --project-ref <your-project-ref>

# deploy all five
supabase functions deploy create-payment      --project-ref <ref>
supabase functions deploy paymongo-webhook    --project-ref <ref>
supabase functions deploy finalize-fare       --project-ref <ref>
supabase functions deploy on-booking-change   --project-ref <ref>
```

`paymongo-webhook` and `on-booking-change` must **not** require a Supabase JWT
(they authenticate themselves): the repo's `supabase/functions/*/deno.json` /
project config should mark them `--no-verify-jwt`, or set that in the dashboard
under **Edge Functions → function → Details**.

### Function secrets

```bash
supabase secrets set \
  PAYMONGO_SECRET_KEY=sk_test_<rotated> \
  PAYMONGO_WEBHOOK_SECRET=<from PayMongo webhook page> \
  SITE_URL=https://itulod.vercel.app \
  --project-ref <ref>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

Optional notification channels (leave unset to disable that channel — in-app
notifications always work):

```bash
# SMS via Semaphore (https://semaphore.co) — Philippine gateway
supabase secrets set SEMAPHORE_API_KEY=<key> SEMAPHORE_SENDER_NAME=iTULOD --project-ref <ref>

# Web push (VAPID). Generate a key pair:
npx web-push generate-vapid-keys
# public key  -> js/config.js  VAPID_PUBLIC_KEY
# private key -> secret below
supabase secrets set \
  VAPID_PUBLIC_KEY=<public> \
  VAPID_PRIVATE_KEY=<private> \
  VAPID_SUBJECT=mailto:you@example.com \
  --project-ref <ref>
```

---

## 5. PayMongo webhook

PayMongo dashboard → **Developers → Webhooks → Add endpoint**:

- URL: `https://<ref>.functions.supabase.co/paymongo-webhook`
- Events: `source.chargeable`, `payment.paid`, `payment.failed`
- Copy the **signing secret** into `PAYMONGO_WEBHOOK_SECRET` (step 4).

---

## 6. Database webhooks for `on-booking-change`

Dashboard → **Database → Webhooks → Create**. Make **one webhook per booking
table** (`transport_bookings`, `food_deliveries`, `parcel_deliveries`):

- Events: **Update**
- Type: **HTTP Request**, method **POST**
- URL: `https://<ref>.functions.supabase.co/on-booking-change`
- HTTP header: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
  (the function rejects any call without this)

This is what turns "rider accepted" / "trip started" / "completed" / "paid" into
SMS + push + in-app notifications.

---

## 7. Frontend (Vercel)

- Project root deploys as-is; `vercel.json` rewrites `/*` →
  `/itulod/itulod/*` and sets no-cache headers on `.html` / `.css` / `.js`.
- Supabase dashboard → **Authentication → URL Configuration → Site URL**: set to
  the deployed origin, and add it to **Redirect URLs**.
- `js/config.js` is safe to commit: it holds only the Supabase URL, the anon
  key, the PayMongo **public** key, and the VAPID **public** key.

---

## 8. Post-deploy smoke test

1. Register a customer and a rider; approve the rider in the admin dashboard.
2. Rider dashboard should now show open jobs (an unapproved rider sees none).
3. Book a ride as the customer → rider accepts → customer's booking details map
   shows the moving rider marker + ETA.
4. Rider: **Start trip**, then **Mark complete**. Check:
   - `select * from payments order by created_at desc limit 1;` — one row, with
     `platform_commission` = 15 % and `rider_payout` = the rest.
   - the customer got a "completed" notification.
5. Food/parcel with GCash: rider taps **Set fare** at pickup → customer sees
   **Pay ₱X** in Booking history → completes GCash checkout → webhook flips
   `payment_status` to `paid`.
6. Try to tamper: as the customer, `update transport_bookings set
   estimated_fare = 1 where id = '<yours>'` from the SQL editor **using a
   non-service connection** — it must raise an exception.

Steps 4 and 6 are also the automated `npm run test:integration` check
(`test/README.md`).

---

## 9. PWA

No deploy steps. `manifest.webmanifest`, `sw.js`, and the icons ship as static
files; `js/pwa.js` registers the service worker on every page. The worker
caches an offline shell and serves `offline.html` when a navigation fails.
Bump `CACHE_VERSION` in `sw.js` if the offline behaviour ever needs to change
— old caches are dropped automatically on activate.

## 10. Tests

```
cd itulod/itulod
npm test                    # unit — fare + field helpers, no network
npm install && npm run test:integration   # full money path, needs ITULOD_TEST_* env
```
