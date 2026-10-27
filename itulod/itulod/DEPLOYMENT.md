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
| 17 | `sql/017_nearby_riders.sql` | "Riders near you" live map: `is_online` on `rider_locations`; `get_nearby_riders()` returns coarse (rounded, ~110m) coordinates for online, approved, not-currently-on-a-job riders only — the only way this data reaches a customer. |
| 18 | `sql/018_restaurant_menu_cart.sql` | Restaurant + menu data model (part 1 of the restaurant/menu/cart feature): `restaurants`, `menu_items` (admin-managed, browsable by any signed-in user), `food_order_items` (order line items, customer-insertable only at checkout time); `restaurant_id`/`item_subtotal`/`delivery_fee` on `food_deliveries`. Part 2 (this commit) is the customer-facing browse/cart/checkout UI — no further migration needed. |
| 19 | `sql/019_food_parcel_vehicle_receipts_oos.sql` | `vehicle_id` on `food_deliveries`/`parcel_deliveries` (food and parcel inserts failed without it); `receipts` storage bucket for the rider's food receipt photo; rider UPDATE policy + column grant so the assigned rider can flag a `food_order_items` row out of stock; adds bookings, `notifications`, `booking_messages`, `ride_stops` and `food_order_items` to the `supabase_realtime` publication (previously only `rider_locations` was published, so live updates never fired). |
| 20 | `sql/020_seed_ilocos_norte_restaurants.sql` | Seed data: 17 Ilocos Norte restaurants (Laoag, San Nicolas/Robinsons Place Ilocos, Batac, Paoay, Pagudpud) with 102 menu items. Prices are estimates and no logos/photos are included; review in the admin Restaurants tab. Idempotent — skips restaurants that already exist by name. |
| 21 | `sql/021_seed_more_ilocos_norte_restaurants.sql` | Seed data: 206 more food businesses in 18 Ilocos Norte towns, from OpenStreetMap (names + coordinates). Chains get their standard menus; local places get a typical menu for their type, each item labelled "typical item, availability may vary". Prices are estimates; no logos/photos. Idempotent by restaurant name. |
| 22 | `sql/022_hauling.sql` | Hauling service: `hauling_bookings` (same lifecycle as parcel — `booking_before_update`, referral bonus, `updated_at` triggers; RLS where open jobs are visible only to approved riders with a Van/Pickup/Truck via `is_hauling_rider()`), `vehicles.service` + 4 hauling vehicles, `platform_config.hauling_helper_fee`, `hauling` added to every `booking_type` check, the expiry / nearby-riders / chat-notification / referral functions, the cross-table policies (rider profile, rider application, live tracking, reviews, chat) and realtime. Redeploy `create-payment`, `finalize-fare`, `sync-payment-status`, `redeem-promo`, `paymongo-webhook`, `on-booking-change` (shared `TABLE_BY_KIND` now includes `hauling`). |
| 23 | `sql/023_booking_notifications_push.sql` | Booking-status notifications from the database (replaces the old `on-booking-change` webhooks): `notify_booking_change()` AFTER UPDATE on all four booking tables (accepted, released, on the way, completed, cancelled, expired, no-show, paid, tip); `notify_hauling_riders()` tells approved Van/Pickup/Truck riders about each new hauling job; `push_new_notification()` forwards every new `notifications` row to the `send-push` Edge Function via `pg_net`. Needs the two Vault secrets in §4a — without them notifications still appear in-app, just no push. |
| 24 | `sql/024_refunds_fees_settlements.sql` | Money settlement: `cancellation_fee_paid` on all four booking tables; parcel `cod_remitted_at`/`cod_remit_note`; `booking_before_update()` now refunds a paid GCash/wallet booking (minus any fee) to the customer's wallet when it's cancelled/expired/no-show, and collects an unpaid booking's fee from the wallet when it can; `rider_settlements` + `rider_balance()`, `admin_rider_balances()`, `admin_record_settlement()`, `admin_refund_to_wallet()` (admin Payments tab → Rider balances). |
| 40 | `sql/040_vehicle_services.sql` | Per-vehicle services: `vehicles.services` (any of ride / food / parcel / hauling, at least one), set in Admin → Vehicle categories (click a vehicle). `vehicles.service` is kept in step by `trg_vehicles_sync_services` for older app versions. `booking_before_insert` refuses a vehicle that doesn't allow the booking's service and requires a vehicle on every booking. Starting values: Bicycle food only (and bookable again), Motorcycle / Tricycle / Car ride+food+parcel, SUV / Van ride+parcel, Truck parcel, Jeepney / Bus ride (still off), hauling fleet hauling. |
| 41 | `sql/041_rider_approval_and_suspension_guards.sql` | Found by the end-to-end test: only an admin can change a rider application (a rider could set their own to approved, or swap the vehicle type), and a rider can only send a pending, unreviewed application. New bookings from a suspended customer are refused on all four booking tables (`trg_booking_require_active_customer`). |
| 42 | `sql/042_food_cash_on_hand.sql` | A rider can only accept a food order whose food cost (`item_subtotal`) is within their cash on hand (`profiles.float_amount`), like Grab / Foodpanda. The order stays listed with a note; the apps disable Accept and the DB refuses it (`trg_food_require_cash_on_hand`). |
| 43 | `sql/043_rider_debt_limit.sql` | Rider debt limit (`platform_config.rider_debt_limit`, default ₱500, Admin → Settings; 0 = off). A rider who owes more commission from cash trips than the limit can't accept jobs until the admin records their payment (`rider_debt_status()` + `trg_booking_require_rider_settled` on all four booking tables). Rider balances show "Can't take jobs". |
| 44 | `sql/044_ride_passengers_and_fares.sql` | Rides: passenger count + Philippine ride fares. Vehicles get a passenger range (`min_passengers`/`max_passengers`) and ride-only rates (`ride_base_fare`, `ride_base_km`, `ride_per_km_rate`, `extra_passenger_fee`, `fare_per_passenger`); `base_fare`/`per_km_rate` stay the delivery rates. `transport_bookings.passengers` (default 1). `vehicle_fare(v, km, pax, for_ride)` prices rides; `booking_before_insert` refuses a group outside the vehicle range or an underpriced fare. Seeded fares follow LTFRB/local rates (jeepney ₱14 first 4 km + ₱2/km per person, bus ₱12 first 5 km + ₱2.20/km per person, tricycle ₱20 first 1.5 km + ₱8/km + ₱20 per extra passenger, motorcycle taxi ₱20 first 1 km + ₱10/km, car/SUV/van TNVS-style) — check them against current Ilocos Norte rates before a demo. **App 1.0.34+ required to book rides** (older builds send no passengers and use the old formula). |
| 45 | `sql/045_customer_read_rider_documents.sql` | Booking details → Rider documents: a customer can open the driver's license and OR/CR (files `license-*` / `orcr-*` only) of a rider who took one of their bookings (`is_my_rider()` + storage policy `rider_docs_customer_read`). rider-documents stays private; the apps open the files through 1-hour signed links (the saved public URLs answer "Bucket not found"). Selfie, vehicle photo and NBI clearance stay rider/admin only. |
| 46 | `sql/046_messages_inbox.sql` | Messages section: `my_conversations()` (one conversation per booking with a rider, newest first, unread count, the other side's last-read time for "Seen"; phone number only while the trip is active), `mark_conversation_read()`, table `booking_message_reads` (in the realtime publication), photo messages (`booking_messages.image_path` + private bucket `chat-photos`, path `<type>/<booking id>/<file>`), `notifications.link` (chat notifications carry `messages/<type>/<id>`; `send-push` adds it to the web push URL and FCM data — redeploy `send-push`). |
| 47 | `sql/047_rider_booking_details.sql` | The rider's own booking details: `booking_customer(type, id)` gives the booking's rider (or an admin) the customer's name, photo, member since and completed bookings — the phone only while the trip is accepted/ongoing; `rider_booking_earnings(type, id)` gives fare, commission, payout and tip (the payments row once done, else the estimate by the completion rule; also for an approved rider looking at a waiting request); approved riders can read the `food_order_items` of waiting food requests. |
| 48 | `sql/048_announcement_delivery.sql` | Announcements reach people: an insert on `announcements` (trigger `trg_announcement_deliver`) sends it as a notification (title "📢 …", link `announcement/<id>`) to every active customer and/or rider in its audience — so it shows in Notifications on web and app and goes out as a push. `announcements.recipients` records how many it reached (null = published before this, never sent); `deliver_announcement(id)` (admin) sends one of those — the admin list has **Send now**. |
| 49 | `sql/049_password_reset_attempts.sql` | Forgot password with a code: `password_reset_attempts` caps wrong codes at 5 per account per 15 min for the new `password-reset-code` Edge Function (deploy with `--no-verify-jwt`). The function finds the account by email or mobile number (the code always goes to the account's email — no SMS provider) and checks the code. **Needs** the Reset Password email template to show `{{ .Token }}` — paste `supabase/templates/reset_password.html` into Dashboard → Authentication → Email Templates → Reset Password. |
| 50 | `sql/050_fixed_fare_receipt.sql` | **The booked total is the total** — riders no longer set a fare. When a rider accepts a food / parcel / hauling booking, `booking_before_update()` sets `final_fare` to the booked total, which is what opens GCash / wallet payment (still never before a rider is found; a released unpaid job goes back to no final fare). Food: `food_require_receipt()` refuses Start trip until the rider saved `receipt_photo_url` (only the rider can set it); `food_item_out_of_stock()` takes an out-of-stock item's price off the total, refunds it to the wallet if already paid online, notifies the customer, and allows no other edits or putting it back. "A rider accepted" says what to pay. `is_trusted_writer()` now also accepts `itulod.system_write = 'true'` and postgres sessions — expiry, unpaid-fee collection and out-of-stock write as the system that way and were being refused. Redeploy `finalize-fare` (now answers 410: the total is fixed) and `create-payment` (food / parcel / hauling payable only once a rider accepted). |
| 51 | `sql/051_rider_pay_dues.sql` | **Riders settle their own balance.** "Pay with GCash" on Earnings: the new `rider-pay-dues` Edge Function charges exactly what `rider_debt_status` says they owe (a `rider_payments` row + PayMongo source, return page `payment-return.html?type=rider`); when GCash confirms, `paymongo-webhook` / `sync-payment-status` call `settle_rider_payment()` (service role only, exactly once) which records the collection in `rider_settlements` — balance ₱0.00, debt-limit block lifted. "I paid the admin": `rider_claim_payment()` (one pending at a time, never more than owed) → Admin → Payments "Rider payments to confirm" → `admin_review_rider_claim()` Mark paid / Reject with a reason (the rider is notified). Riders can't write settlements. Redeploy `sync-payment-status` and `paymongo-webhook` (`--no-verify-jwt`), deploy `rider-pay-dues`. |
| 53 | `sql/053_promo_claims.sql` | **Promos reach customers.** `promo_codes` gets a title, `services` (transport / food / parcel / hauling) and `sent_at` / `recipients`; `admin_send_promo()` sends one as a notification (link `promo/<id>`) to every active customer; `claim_promo()` (by id or typed code) fills `promo_claims`; `my_promos()` lists them with a status (ready / used / expired / ended / full, plus sent ones to claim). Customers pick a claimed promo on every booking form; `redeem-promo` (redeploy) applies it to any service in its list, never below the minimum fare. **iTULOD pays for promos:** `booking_before_update()` pays the rider their share of the full price and takes the discount from iTULOD's commission (`payments.platform_commission` can go below zero; `payments.promo_discount` records it); `rider_booking_earnings()` matches. |
| 52 | `sql/052_admin_live_updates.sql` | Adds `payments`, `support_requests` and `rider_applications` to the realtime publication. The admin dashboard's one channel listens to them too, and an unpublished table stopped the whole channel — so admin lists and counts only updated on refresh. |
| 54 | `sql/054_remove_promos.sql` | **Promos removed.** Restores `booking_before_update()` (sql/050) and `rider_booking_earnings()` (sql/047) — the rider's share and iTULOD's commission come from the full price again. Drops `claim_promo` / `my_promos` / `admin_send_promo` / `send_promo_notifications` / `promo_summary`, the promo notifications (link `promo/…`), the tables `promo_claims` / `promo_redemptions` / `promo_codes` and type `promo_discount_type`, and the columns `promo_code` / `discount_amount` (all four booking tables) and `payments.promo_discount`. Redeploy `redeem-promo`: it now only answers 410 for older app versions. |
| 39 | `sql/039_tricycle_icon.sql` | Tricycle shows its own icon (motorcycle + sidecar): `vehicles.icon = 'fa-tricycle'`, a custom class drawn from `assets/icons/tricycle.svg` in css/main.css (Font Awesome has no tricycle). |
| 38 | `sql/038_public_vehicle_catalog.sql` | Logged-out visitors can read **available** vehicles (public price list) so the home / login / sign-up pages show the live catalog, vehicle count and sample fare. |
| 37 | `sql/037_device_push.sql` | Phone push (Firebase Cloud Messaging): `device_tokens` + `register_device()` / `unregister_device()` (the app saves its FCM token after login, removes it on logout); new ride/food/parcel jobs notify **online** riders with the matching vehicle (`trg_notify_new_job_riders`). `send-push` delivers every notification to these tokens too — needs the Edge Function secret `FIREBASE_SERVICE_ACCOUNT_B64` (base64 of the Firebase service-account JSON, project "itulod"; never commit that file) and the app's `android/app/google-services.json` (gitignored). |
| 36 | `sql/036_collect_unpaid_fees.sql` | Unpaid cancellation/no-show fees are collected: `settle_unpaid_fees()` takes them from the wallet (oldest first) and pays the rider; runs automatically when a wallet balance goes up (`trg_wallet_settle_fees`); new bookings are refused while a fee is still owed (updates `booking_before_insert` from 032); `my_unpaid_fees()` feeds the reminder banner. |
| 35 | `sql/035_food_commission_on_delivery_fee.sql` | Food orders: the commission is taken from the **delivery fee** only, not the food the rider bought (replaces `booking_before_update`, only the commission line changed). |
| 34 | `sql/034_platform_settings.sql` | Admin → Settings is editable: `support_phone`, `support_email`, `office_address` columns; `platform_config_limits` check (commission 0–50%, fees/minimum fare ranges); `updated_at` stamped on change; `public_site_info()` gives the logged-out home page the contact details. |
| 33 | `sql/033_vehicle_matching.sql` | Jobs only go to riders with the matching vehicle: `rider_type_for_vehicle()`, `rider_can_take()` used by the open-jobs read policies (both apps only list matching jobs), trigger `trg_booking_vehicle_match` refuses accepting a mismatch, hauling alerts only to matching riders; Bicycle/Jeepney/Bus switched off (no rider can register them). |
| 32 | `sql/032_booking_insert_guard.sql` | **Security:** trigger `trg_booking_before_insert` on all four booking tables — a new booking always starts pending/unassigned/unpaid (status, rider, payment status, final fare, tips, fees, proof, promo reset), the vehicle must be available and fit the service, the distance can't be shorter than the straight line between the pins, and the fare can't be below the minimum or the vehicle's rate for the distance. |
| 31 | `sql/031_require_delivery_proof.sql` | Trigger `trg_require_delivery_proof` on food / parcel / hauling: a drop-off can only be marked **completed** once `delivery_proof_url` is saved (riders take the proof photo as its own step first). Admins / service role exempt. |
| 30 | `sql/030_profile_photo_review.sql` | Profile photos: `profiles.avatar_pending_url`; trigger `profiles_photo_review` holds an **approved rider's** new photo for admin review (customers keep seeing the old one); `review_rider_photo(rider, approve)` — admin-only approve/reject with a notification. Admin → Riders → Pending applications lists them. |
| 29 | `sql/029_profile_guard_and_sync.sql` | **Security:** users could change protected columns of their own profile (role → admin, is_active) and request `admin` at sign-up. A guard trigger now allows only name / phone / photo / capital on hand for non-admins; sign-up accepts only customer/rider; profile self-insert is limited to your own row. **Sync:** profiles joins the realtime publication so web and app pick up each other's profile changes live. |
| 27 | `sql/027_catalog_images.sql` | Public `catalog-images` storage bucket for restaurant logos (`restaurants/`), menu-item photos (`menu-items/`) and the CC0 sample dish photos (`stock/`). Only admins can upload/replace/delete (admin Restaurants tab → Upload logo; menu modal → tap a photo). |
| 28 | `sql/028_stock_menu_photos.sql` | Gives menu items without a photo a sample photo of their dish type (first matching dish wins; never overwrites a real photo). Needs the `stock/*.jpg` files uploaded first — see STOCK_PHOTOS.md. |
| 26 | `sql/026_app_downloads_bucket.sql` | Public `app-downloads` storage bucket holding the Android app (`itulod.apk`, `itulod-armv7.apk`) and `latest.json` for the website's "Get the app" buttons. Upload-only by the service role / CLI. See §6a. |
| 25 | `sql/025_hauling_availability.sql` | `hauling_availability()` — how many hauling drivers exist / are online, shown on the Hauling booking form. |

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

# deploy all twelve
supabase functions deploy create-payment       --project-ref <ref>
supabase functions deploy paymongo-webhook     --project-ref <ref>
supabase functions deploy finalize-fare        --project-ref <ref>   # retired: answers 410 (sql/050)
supabase functions deploy rider-pay-dues       --project-ref <ref>   # riders pay what they owe (sql/051)
supabase functions deploy on-booking-change    --project-ref <ref>
supabase functions deploy expire-bookings      --project-ref <ref>
supabase functions deploy sync-payment-status  --project-ref <ref>
supabase functions deploy check-email          --project-ref <ref>
supabase functions deploy redeem-promo         --project-ref <ref>   # retired: answers 410 (sql/054)
supabase functions deploy wallet-topup         --project-ref <ref>
supabase functions deploy apply-referral-code  --project-ref <ref>
supabase functions deploy send-push            --project-ref <ref> --no-verify-jwt
```

`paymongo-webhook`, `on-booking-change`, `expire-bookings`, `check-email`, and `send-push`
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
  VAPID_SUBJECT=https://<your-site> \
  PUSH_HOOK_SECRET=<random string> \
  --project-ref <ref>
```

### 4a. Push hook (Vault secrets for sql/023)

`push_new_notification()` reads two Vault secrets to call `send-push`. Run
once in the SQL editor (same `PUSH_HOOK_SECRET` value as above):

```sql
select vault.create_secret('https://<ref>.functions.supabase.co/send-push', 'push_hook_url');
select vault.create_secret('<PUSH_HOOK_SECRET>', 'push_hook_secret');
```

Check it: insert a test row into `notifications`, then
`select status_code, content from net._http_response order by id desc limit 1;`
should show `200 {"ok":true,...}`.

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
~15-second poll window. `sync-payment-status` (below) now completes the
payment itself, so bookings get paid even without the webhook — but keep the
webhook secret correct as the backup for shoppers who close the page early.

`payment-return.html`, the dashboard and the app's receipt popup also call
**`sync-payment-status`** (needs no dashboard setup — it's just another
deployed function). It asks PayMongo about a still-pending GCash source and,
once the shopper has tapped **Authorize** (source `chargeable`), creates the
Payment itself — the same `chargeSource()` step the webhook uses — then marks
the booking / wallet top-up paid. So the payment completes right after
Authorize instead of waiting on the webhook. PayMongo charges a source only
once, so the webhook and this function racing can't double-charge.

---

## 6. Database webhooks for `on-booking-change` (superseded — skip)

`sql/023` now sends booking notifications from inside the database. Don't
add these webhooks on a project that has 023 applied, or customers get every
notification twice. Kept below for reference only.

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

## 6a. Android app download ("Get the app")

The landing page (#get-app), the login page and the customer/rider Profile tabs
link to the APKs in the public `app-downloads` bucket (js/app-download.js).
To publish a new version of app_itulod:

1. Bump `version:` in app_itulod/pubspec.yaml (e.g. `1.0.1+2` — the number
   after `+` must go up every release).
2. Build: `flutter build apk --release --split-per-abi` (from app_itulod).
   Release builds are signed with `android/app/itulod-release.jks` via
   `android/key.properties` — both gitignored. **Keep a backup of both files**:
   an update signed with a different key won't install over the old app.
3. Copy `build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` →
   `itulod.apk` and `app-armeabi-v7a-release.apk` → `itulod-armv7.apk`, and
   write `latest.json` (`version`, `build`, `size_mb`, `size_mb_armv7`,
   `updated`).
4. Upload (run from the folder holding the files — the CLI misreads
   `C:\…` paths):
   ```bash
   npx supabase@latest storage cp ./itulod.apk ss:///app-downloads/itulod.apk \
     --project-ref <ref> --experimental \
     --content-type application/vnd.android.package-archive
   # same for itulod-armv7.apk, and latest.json with --content-type application/json
   ```
   `storage cp` won't overwrite: remove the old copies first with
   `npx supabase@latest storage rm ss:///app-downloads/itulod.apk --project-ref <ref> --experimental --yes`
   (and the same for the other two files), then upload.

---

## 6b. Auth — password rule

The web (js/utils.js `passwordProblem`) and the app (`Validators.password`)
both require **8+ characters with an uppercase letter, a lowercase letter, a
number and a special character**. Make Supabase Auth enforce the same rule so
an old app build can't get around it: Dashboard → Authentication → Sign In /
Providers → Email → **Minimum password length: 8**, **Password requirements:
Lowercase, uppercase letters, digits and symbols** → Save (local equivalent:
`supabase/config.toml` `minimum_password_length` / `password_requirements`).
Existing accounts still log in with their old passwords; the rule applies to
new sign-ups and password changes.

Forgot password (web and app) emails a link to `/reset-password.html`, so
`https://<your-site>/reset-password.html` must be in Authentication → URL
Configuration → Redirect URLs (or covered by the Site URL).

Applied to the live project on 2026-10-22 with `supabase config push` from a
temporary copy of config.toml that matched every other live auth value:
Site URL `https://i-tulod-pi.vercel.app`, Redirect URLs
`https://i-tulod-pi.vercel.app/**`, minimum length 8, requirements
`lower_upper_letters_digits_symbols`. Don't `config push` the repo's
config.toml as-is — its site_url/redirects point at 127.0.0.1 for local dev
and it would also change OTP length, email frequency and MFA.

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
5. Food/parcel with GCash: a rider accepts → customer sees **Pay ₱X** (the
   booked total) in Booking history → completes GCash checkout → webhook flips
   `payment_status` to `paid`. Food: Start trip stays locked until the rider
   uploads / takes the receipt photo; the customer sees it in booking details.
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
16. (Removed — promos were taken out in sql/054.)
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
25. Riders near you: as an approved rider, Home tab → **Go online** (grant
    location permission when prompted) → `select is_online, updated_at from
    rider_locations where rider_id = '<yours>'` should show `true` and a
    fresh timestamp. As a customer, open New booking → Ride — within ~20s
    a green motorcycle marker for that rider should appear on the map, and
    the caption above it should read "1 rider nearby". Accept a booking as
    that rider — the marker should disappear from the nearby map (they're
    now excluded as on-a-job) without them ever going offline. Rider taps
    **Go offline** — the marker should be gone within the next refresh.
26. Restaurant admin: admin → **Restaurants** → **Add restaurant** → fill
    name/address → save → it appears in the table. Click the utensils icon
    to open its menu → add a couple of items with prices → they appear in
    the menu table, toggleable available/unavailable, deletable.
27. Restaurant ordering (customer): New booking → Food → **Choose a
    restaurant** → pick one from the list → its menu opens in the same
    modal → use +/- to add a couple of items → **Done**. Back on the form:
    pickup is auto-filled (read-only) with the restaurant's address, "Your
    order" lists what you picked, and the fare card shows item subtotal +
    delivery fee + estimated total. Fill delivery address + vehicle, submit.
    Check: `food_deliveries.item_subtotal`/`delivery_fee` are set,
    `final_fare` is still **null** (nothing is payable before a rider
    accepts), and `food_order_items` has one row per item ordered. Accept
    the booking as a rider — `final_fare` becomes the booked total (sql/050),
    and the booking's details should list the ordered items under Food
    Delivery Details for both customer and rider.

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
