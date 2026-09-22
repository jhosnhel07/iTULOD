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
| 8 | `sql/008_food_parcel_cancel_reason.sql` | `cancelled_reason` on food/parcel deliveries — without it, cancelling either fails |
| 9 | `sql/009_booking_expiration.sql` | Automatic booking expiration: `expired`/`no_show` statuses, `accepted_at`, `expire_stale_bookings()`, terminal-state lock. See §1a below — this one needs a follow-up step for the background sweep to actually run. |
| 10 | `sql/010_growth_features.sql` | `saved_addresses` table; `tip_amount` + `cancellation_fee` columns on all three booking tables; a rider can now "release" an accepted job back to the pool (`rider_id` → null, `status` → pending) instead of only ever ending it outright. |
| 11 | `sql/011_proof_promo_support.sql` | Proof-of-delivery photo (`delivery_proof_url` on food/parcel + a `delivery-proof` storage bucket); `promo_codes`/`promo_redemptions` (transport-only for now); `support_requests` (refund/dispute self-service). |
| 12 | `sql/012_wallet.sql` | In-app wallet: `wallets`, `wallet_transactions` (ledger), `wallet_topups`; `wallet` added to the `payment_method` enum; `adjust_wallet_balance()` does the atomic, race-safe balance update. |
| 13 | `sql/013_referrals.sql` | Referral program: `referral_code`/`referred_by` on `profiles` (auto-generated code per profile), `referral_events`; a trigger pays the referrer ₱50 into their wallet once the referred customer's first booking completes. |
| 14 | `sql/014_scheduled_bookings.sql` | Scheduled ("book later") rides: `scheduled_for` on `transport_bookings`; `expire_stale_bookings()` now measures a scheduled ride's 15-minute grace period from its pickup time instead of from when it was booked. |
| 15 | `sql/015_booking_chat.sql` | In-app chat: `booking_messages` (customer ↔ assigned rider, read/write gated by RLS to the two participants, sending gated to `accepted`/`ongoing`); a trigger notifies whichever side didn't send the message. |
| 16 | `sql/016_multi_stop_rides.sql` | Multi-stop rides: `ride_stops` (up to 3 stops between pickup and destination, set once at booking time, the rider marks each arrived in order). |

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

### 1a. Automatic booking expiration — turn on the background sweep

`sql/009_booking_expiration.sql` adds a database function,
`expire_stale_bookings()`, that flips a booking to **Expired** when:

- it's been **Pending** for more than **15 minutes** with no rider accepting it, or
- it's been **Accepted** for more than **15 minutes** since acceptance with the
  rider never starting the job (never moving it to Ongoing).

An **Ongoing** booking is never auto-expired — a real trip can take longer
than 15 minutes, and force-expiring one mid-trip would cancel real work.
Completed, cancelled, expired, and no-show bookings are terminal: the trigger
now refuses to let anyone but a trusted (service-role/admin) write change
their status again.

The app itself calls this function opportunistically (once when a dashboard
loads, and every ~60 seconds while it's open), so expiration mostly "just
works" whenever someone has the app open. To make it run **even when nobody
does** (a hard requirement — see the spec this was built against), pick one:

**Option A — pg_cron (simplest if your project has it):**
The migration itself tries `select cron.schedule('itulod-expire-bookings', '* * * * *', 'select public.expire_stale_bookings();')`
and just prints a notice instead of failing if the extension isn't enabled.
To enable it: Supabase dashboard → **Database → Extensions → pg_cron** → enable,
then re-run `sql/009_booking_expiration.sql`. Verify it's scheduled:
```sql
select * from cron.job where jobname = 'itulod-expire-bookings';
```

**Option B — the `expire-bookings` Edge Function on a schedule:**
Deploy it (`supabase functions deploy expire-bookings --no-verify-jwt`, see §4),
then Supabase dashboard → **Edge Functions → expire-bookings → Cron** → add a
schedule (every 1–5 minutes). It takes no auth header and no body — it just
calls the same database function. Works even on plans without pg_cron.

Either one is enough on its own; both together is also fine (idempotent).

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

# deploy all eleven
supabase functions deploy create-payment       --project-ref <ref>
supabase functions deploy paymongo-webhook     --project-ref <ref>
supabase functions deploy finalize-fare        --project-ref <ref>
supabase functions deploy on-booking-change    --project-ref <ref>
supabase functions deploy expire-bookings      --project-ref <ref>
supabase functions deploy sync-payment-status  --project-ref <ref>
supabase functions deploy check-email          --project-ref <ref>
supabase functions deploy redeem-promo         --project-ref <ref>
supabase functions deploy wallet-topup         --project-ref <ref>
supabase functions deploy apply-referral-code  --project-ref <ref>
```

`paymongo-webhook`, `on-booking-change`, `expire-bookings`, and `check-email`
must **not** require a Supabase JWT (they authenticate themselves, need no
auth at all, or — for `check-email` — are called by visitors who don't have
an account yet): the repo's `supabase/config.toml`
marks them `verify_jwt = false`, or set that in the dashboard under
**Edge Functions → function → Details** if deploying without the CLI config.

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

If the webhook secret is ever wrong or missing, every delivery gets silently
rejected as an invalid signature — a real GCash payment can succeed on
PayMongo's side while `payment_status` in the database stays stuck on
`pending` forever, since nothing else tells it otherwise. Symptom: PayMongo's
own dashboard (Developers → Webhooks → the endpoint → recent deliveries)
shows 401s, or `payment-return.html` sits on "Still confirming…" past the
~15-second poll window. `sync-payment-status` (below) papers over most of
this in the UI, but the webhook secret being correct is still what actually
gets bookings marked paid in the first place.

`payment-return.html` and the dashboard also call **`sync-payment-status`**
(needs no dashboard setup — it's just another deployed function) to ask
PayMongo directly whether a still-pending GCash source has actually gone
through, rather than only waiting on the webhook to arrive. It's read-only
against PayMongo — it never creates a charge, so it can't double-charge
anyone — it only syncs `payment_status` to match what PayMongo already says.

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
  the deployed origin, and add it to **Redirect URLs**. Also add
  `<origin>/reset-password.html` to **Redirect URLs** — that's where
  `resetPasswordForEmail()` sends the "Forgot password?" link, and Supabase
  rejects a `redirectTo` that isn't on this list.
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
7. Cancel a food delivery and a parcel delivery as the customer — both need
   `sql/008` applied or they fail with a missing-column error.
8. Password reset: **Forgot password?** on the login page → open the email →
   the link should land on `reset-password.html` and let you set a new
   password (needs the Redirect URLs entry from step 7 above). Also try
   **Change password** from the Profile tab of either dashboard while logged in.
9. Booking expiration — the manual-timer-free way to check this quickly is
   from the SQL editor rather than waiting 15 real minutes:
   ```sql
   -- back-date a pending booking, then run the sweep
   update transport_bookings set created_at = now() - interval '20 minutes'
     where id = '<a pending booking id>';
   select expire_stale_bookings();  -- should return >= 1
   ```
   Confirm: the booking's `status` is now `expired`; its card shows the
   **Expired** badge and the "This booking has expired…" note in Booking
   history/details; trying to update it as that customer (e.g. Cancel) is
   rejected. Then check an **ongoing** booking backdated the same way is
   *not* touched — ongoing must never auto-expire.
10. Saved addresses: Profile tab → add one → open New booking → the
    bookmark button next to any address field lists it → picking it fills
    the field and updates the fare estimate.
11. Fare breakdown: typing a pickup + destination in New booking shows a
    small "₱X base + Y km × ₱Z/km" line under the fare total.
12. Tip: rate a **completed** booking with an amount in "Add a cash tip" →
    check `payments` for that booking — `amount` and `rider_payout` should
    both have gone up by the tip, `platform_commission` unchanged. Rider
    gets a "You got a tip!" notification.
13. Cancellation fee: as the customer, cancel a booking a rider has already
    **accepted** — the confirm dialog should quote the configured fee
    (`platform_config.cancellation_fee`, ₱30 by default), and the
    cancelled booking's `cancellation_fee` column should be set afterward.
14. Rider release: accept a booking as one rider, tap **Release** — it
    should disappear from that rider's Accepted list, reappear in every
    approved rider's Requests list (status back to `pending`, `rider_id`
    null), and the customer gets a "Looking for a new rider" notification.
15. Proof of delivery: mark a **food or parcel** booking complete as the
    rider — a photo prompt appears first; the uploaded image should show
    up in that booking's details for the customer.
16. Promo code: admin → Settings → Promo codes → create one → book a
    **ride** with that code in the Promo code field → confirm the toast
    reports a discount and `transport_bookings.promo_code` /
    `discount_amount` are set. Try the same code again as the same
    customer — it should be rejected as already used.
17. Support request: Profile → **Report an issue** (or from a booking's
    details) → submit → it should appear in admin's **Support requests**
    tab with the Open-count badge on the sidebar; replying and resolving
    should notify the customer.
18. Wallet top-up: Profile → **My wallet** → enter an amount → **Top up** →
    complete GCash checkout → back on the return page it should say the
    money is ready to spend; `select balance from wallets where customer_id
    = '<yours>'` should match, and `wallet_transactions` should have a
    `topup` row for that amount.
19. Wallet payment: with a positive balance, tap **Pay ₱X** on a GCash-method
    booking in Booking history — the confirm modal should show a **Pay from
    wallet (₱balance)** button when the balance covers the fare. Paying with
    it should resolve immediately (no GCash redirect), set that booking's
    `payment_method` to `wallet` and `payment_status` to `paid`, and leave a
    negative `payment` row in `wallet_transactions`.
20. Referral: Profile → **Refer a friend** shows your code. As a *second*
    customer account, redeem the first account's code in **Have a code?
    Redeem it** — the second account's wallet should gain ₱50 immediately.
    Book and complete a ride as the second account; the first account's
    wallet should then gain ₱50 too (`referral_bonus` in `wallet_transactions`,
    `referral_events.referrer_paid` = true). Redeeming a second code on the
    same account should be rejected.
21. Scheduled ride: New booking → **Schedule for later** → pick a time
    30+ minutes out → book. It should *not* appear in any rider's Requests
    list yet. Back-date it close to now from the SQL editor
    (`update transport_bookings set scheduled_for = now() + interval '5
    minutes' where id = '<yours>'`) and within a minute it should show up
    in Requests, labelled "Scheduled · <time>". It should not auto-expire
    while its scheduled time is still more than 15 minutes away, even if
    `created_at` is old.
22. Chat: open a booking's details with a rider assigned and status
    accepted/ongoing (from either dashboard) — a **Messages** section
    appears with a composer. Send a message as the customer, then open the
    same booking as the rider (or vice versa) — it should already be there,
    and appear live without a refresh if both are open at once. Mark the
    booking completed and reopen its details — the composer should be gone
    and the thread read-only. The recipient should also get an in-app
    notification for each message.
23. Backup export: admin → Settings → **Backup now** downloads a
    `itulod-backup-<timestamp>.json` file containing every table. Open it
    and spot-check that `tables.profiles` and `tables.transport_bookings`
    are non-empty arrays.
24. Multi-stop ride: New booking → ride → **Add a stop** (up to 3) → fill
    pickup, one or two stops, and destination → the fare/distance should
    update to the *summed* multi-leg distance, not just pickup→destination.
    Book it, accept as a rider, open the booking's details — a **Stops**
    list appears under Trip Details with a **Mark arrived** button on the
    first unvisited stop only (rider's view). Marking it arrived should
    advance the button to the next stop. **View route on map** should draw
    through every stop in order, not a straight pickup→destination line.

Steps 4, 6, and 9 are also the automated `npm run test:integration` check
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
