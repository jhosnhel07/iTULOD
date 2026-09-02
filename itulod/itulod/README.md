# iTULOD
**Intelligent Transport and Unified Logistics On-Demand Delivery**

An all-in-one transportation booking and on-demand delivery platform: ride booking, food delivery, and parcel delivery in one app, with separate dashboards for Admin, Customer, and Rider. Built with vanilla HTML/CSS/JS on the frontend and Supabase (Auth, Postgres, Storage, Realtime) on the backend.

---

## 1. Folder structure

```
itulod/
├── index.html              # Landing page
├── login.html               # Login (all roles)
├── register.html            # Registration (customer / rider / admin)
├── payment-return.html      # Receipt page shown after the GCash redirect
├── css/
│   ├── main.css             # Design tokens + landing + auth pages
│   └── dashboard.css         # Shared dashboard shell (sidebar, tables, cards, modal)
├── js/
│   ├── config.js              # Public config: Supabase project ref, PayMongo public key
│   ├── supabaseClient.js     # Supabase client init — reads from config.js
│   ├── utils.js              # Toasts, formatting, session guard, pagination
│   ├── auth.js               # Login / register / logout / password reset
│   ├── payment.js             # GCash confirm modal + PayMongo checkout (browser side)
│   ├── landing.js             # Landing page behaviour
│   ├── customer.js            # Customer dashboard logic
│   ├── rider.js               # Rider dashboard logic
│   └── admin.js               # Admin dashboard logic
├── customer/
│   └── dashboard.html
├── rider/
│   └── dashboard.html
├── admin/
│   └── dashboard.html
├── sql/
│   ├── schema.sql             # Full Postgres schema, RLS policies, seed data
│   └── 002_payment_gateway.sql  # Adds payment_method/payment_status columns — run after schema.sql
├── supabase/
│   ├── config.toml           # CLI project config (per-function verify_jwt lives here)
│   ├── dashboard-deploy/     # Single-file builds for CLI-free paste-deploy (see §5)
│   └── functions/
│       ├── create-payment/          # Opens a PayMongo GCash source for a booking
│       ├── paymongo-webhook/        # Source of truth: marks a booking paid/failed
│       └── _shared/helpers.ts
├── secrets.env.example       # Template for local Edge Function secrets (never commit secrets.env)
└── README.md
```

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run the entire contents of `sql/schema.sql`. This creates:
   - All tables (`profiles`, `rider_applications`, `vehicles`, `transport_bookings`, `food_deliveries`, `parcel_deliveries`, `payments`, `reviews`, `notifications`, `announcements`)
   - Row Level Security policies for every table
   - A trigger that auto-creates a `profiles` row on signup, using the role chosen at registration
   - Storage buckets: `avatars` (public), `rider-documents` (private), `vehicle-icons` (public)
   - Seed data for the 9 vehicle categories
3. In **Project Settings → API**, copy your **Project URL** and **anon public key**.
4. Open `js/supabaseClient.js` and replace:
   ```js
   const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   const SUPABASE_ANON_KEY = 'YOUR-PUBLIC-ANON-KEY';
   ```
5. In **Authentication → Providers**, make sure Email is enabled. In **Authentication → URL Configuration**, set your site URL (e.g. your Vercel/Netlify URL) so password-reset links work.
6. **Create your first admin account:** sign up normally through `register.html` choosing "Admin", then in the SQL editor run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
   (The signup form lets anyone request an admin role for convenience in this starter kit — for production, remove the "Admin" option from `register.html` and promote admins manually via SQL instead.)

## 3. Run locally

No build step — it's static HTML/CSS/JS. Serve the folder with any static server, for example:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## 4. What's fully wired vs. placeholder

| Feature | Status |
|---|---|
| Auth (signup/login/logout/reset), role-based routing | ✅ Live via Supabase Auth |
| Booking creation (ride/food/parcel), fare estimate | ✅ Live — distance is simulated from address text; addresses can be set by map click or place search (Mapbox) |
| Rider accept/status updates, earnings, ratings | ✅ Live |
| Admin analytics, customer/rider management, approvals, vehicle CRUD, payments, announcements | ✅ Live |
| Real-time updates (new bookings, status changes) | ✅ Live via Supabase Realtime |
| File uploads (avatars, license, OR/CR) | ✅ Live via Supabase Storage |
| **GCash payment (ride bookings)** | ✅ Live via PayMongo Sources + a Supabase Edge Function + webhook (see §5) |
| Card payment | ❌ Removed — GCash is the only online method. Card checkout (Payment Intents, in-browser tokenization, `attach-card-payment`) was deleted. |
| Cash payment | ✅ Live — collected by the rider, marked paid on completion (unchanged) |
| GCash for food & parcel deliveries | 🔲 Not wired — those fares are set by the rider at pickup, so there's no amount to charge up front yet. Cash-on-completion still works for them. |
| Live map / navigation | ✅ Live — Mapbox GL JS on every map (customer ride/food/parcel, rider navigation, booking-details preview): satellite-streets style, place search, live GPS on the rider nav map, OSRM route lines. Turn-by-turn voice guidance is still not implemented. |
| Database backup/restore | 🔲 Placeholder button — wire to a Supabase Edge Function or scheduled export |

## 5. Set up GCash payments (PayMongo)

The ride-booking payment method dropdown is **Cash / GCash** and is wired end-to-end. Card checkout has been removed on purpose, so no card data is ever collected. The PayMongo *secret* key only ever lives in Supabase Edge Function secrets.

1. **Create a PayMongo account** at [paymongo.com](https://paymongo.com) and grab your **test** keys from Developers → API Keys (`pk_test_...` and `sk_test_...`).
2. **Run the migration:** open the SQL editor and run `sql/002_payment_gateway.sql` (after `sql/schema.sql`).
3. **Set the public key** in `js/config.js`:
   ```js
   PAYMONGO_PUBLIC_KEY: 'pk_test_...'
   ```
4. **Set the app secrets on your project.** Set them by name — don't push
   `secrets.env` wholesale with `--env-file`. That file also holds
   `SUPABASE_URL` / `SUPABASE_SECRET_KEY`, which exist only for local
   `functions serve`; when deployed, the platform injects `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` itself (that's what `adminClient()` reads first),
   and `SUPABASE_` is the platform's own reserved namespace:
   ```bash
   supabase secrets set PAYMONGO_SECRET_KEY=sk_test_... PAYMONGO_WEBHOOK_SECRET=whsk_... SITE_URL=https://your-site.example.com
   ```
   `SITE_URL` must be the absolute URL of the folder that holds `payment-return.html`, with no trailing slash — `create-payment` builds the GCash return URL as `${SITE_URL}/payment-return.html`. That means origin **plus any base path**: if your static server's document root sits above the project (VS Code Live Server rooted at a parent folder is the common case), you need e.g. `http://localhost:5500/itulod/itulod`, not `http://localhost:5500`. Get this wrong and GCash checkout works but the return trip lands on "site can't be reached." Secrets apply immediately; no redeploy needed.
5. **Deploy the two Edge Functions** (add `--project-ref <ref>` if you haven't run `supabase link`):
   ```bash
   supabase functions deploy create-payment
   supabase functions deploy paymongo-webhook --no-verify-jwt
   ```
   (`--no-verify-jwt` on the webhook only — PayMongo calls it anonymously and it verifies PayMongo's own signature instead.)

   **If you skip this step, GCash checkout fails with "Failed to send a request to the Edge Function."** That message is a CORS artifact, not a network problem: the gateway's 404 for a missing function doesn't allow the `content-type` request header, so the browser blocks the response before your code can read the 404.
6. **Register the webhook** in PayMongo Dashboard → Developers → Webhooks:
   - URL: `https://<project-ref>.functions.supabase.co/paymongo-webhook`
   - Events: `source.chargeable`, `payment.paid`, `payment.failed`
   - Copy the generated **webhook signing secret** into `PAYMONGO_WEBHOOK_SECRET` (step 4).

   This works fine while you're developing against `localhost`. The webhook is delivered to the *Supabase* URL above, which is public — only the post-payment redirect goes to your local frontend, and that's the browser navigating, not PayMongo calling in. No tunnel needed.

   You can also register it from the API instead of the Dashboard, which returns the signing secret as `data.attributes.secret_key`:
   ```bash
   curl -s -X POST https://api.paymongo.com/v1/webhooks \
     -H "Content-Type: application/json" \
     -H "Authorization: Basic $(printf 'sk_test_...:' | base64)" \
     -d '{"data":{"attributes":{"url":"https://<project-ref>.functions.supabase.co/paymongo-webhook","events":["source.chargeable","payment.paid","payment.failed"]}}}'
   ```
   `GET /v1/webhooks` lists what's registered — if it returns `total_records: 0`, nothing is, and every GCash payment will stall on the receipt's *Awaiting confirmation* status no matter how well the rest of the flow works.

   A `source.chargeable` event that fires while no webhook is registered is **not** re-sent. To rescue such a booking, charge its still-`chargeable` source by hand — `POST /v1/payments` with `{"source":{"id":"src_...","type":"source"}}` — which emits `payment.paid` into the now-registered webhook.
7. **Test it:** book a ride with GCash. PayMongo's test mode shows a simulated GCash authorization screen you can approve or decline.

The GCash flow is three steps:

1. **Confirm the amount** — a *Confirm payment* modal on the customer dashboard shows the exact amount PayMongo is about to charge, plus the route, with a **Pay ₱X.XX** button. Nothing is sent to PayMongo until it's clicked. (It shows `estimated_fare`, because that's the column `create-payment` converts to centavos — don't switch it to `final_fare` without changing the Edge Function too.)
2. **Authorize on GCash** — PayMongo's hosted checkout page.
3. **Receipt** — `payment-return.html` shows a simple receipt (reference, booking, route, date, method, status, amount) and a **Back to dashboard** button. The receipt appears immediately; the status row then polls for ~12s while it waits for the webhook, since the webhook — not the redirect — is what marks a booking paid.

Booking history shows a payment badge (e.g. *GCash · pending*) for ride bookings paid this way, with a **Pay with GCash** button if a payment is still pending or failed. That button reopens the same confirmation modal.

### Deploying without the CLI (Dashboard paste-deploy)

`supabase login` opens a browser and can't be scripted. If you'd rather not set
up the CLI at all, `supabase/dashboard-deploy/` holds single-file builds of both
functions with `_shared/helpers.ts` inlined — the browser editor has no
`_shared/` sibling to import from.

1. Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Name it exactly `create-payment`, paste `supabase/dashboard-deploy/create-payment.ts`, Deploy. Leave **Verify JWT on**.
3. Repeat for `paymongo-webhook` with `supabase/dashboard-deploy/paymongo-webhook.ts`. **Turn Verify JWT off** — PayMongo calls it with no Supabase session token, so with verification on every event is rejected and nothing is ever marked paid.
4. Set the secrets from step 4 above under **Edge Functions → Secrets**.

These are duplicates of `supabase/functions/`, kept in sync by hand — the two
handler bodies are currently byte-identical. Dashboard edits have no versioning
or rollback, so treat this as the prototyping path and prefer the CLI once it's
set up.

## 6. Deployment

### Frontend (choose one)

**Vercel**
```bash
npm i -g vercel
vercel --prod
```
No build command needed — set the output/root directory to the project root.

**Netlify**
```bash
npm i -g netlify-cli
netlify deploy --prod
```
Publish directory: project root.

**GitHub Pages**
1. Push this folder to a GitHub repo.
2. Repo → **Settings → Pages** → Source: `main` branch, root folder.
3. Your site will be live at `https://<username>.github.io/<repo>/`.

### Backend
Supabase is already hosted — no deployment step beyond running `sql/schema.sql` and setting your keys in `js/supabaseClient.js` (step 2 above). Just make sure the **Authentication → URL Configuration → Site URL** matches your deployed frontend URL.

## 7. Security notes
- The Supabase **anon/publishable key** and PayMongo **public key** are safe to expose in frontend code — every table is protected by the Row Level Security policies in `sql/schema.sql` and `sql/002_payment_gateway.sql`, and the public PayMongo key cannot charge anyone.
- The Supabase **secret/service-role key** and PayMongo **secret key** must never appear in frontend code (`js/`) — they belong only in Supabase Edge Function secrets (`supabase secrets set`), which is where `supabase/functions/` reads them from via `Deno.env.get(...)`.
- **If you're picking up this project from an earlier export:** `js/config.js` and `secrets.env` in this copy have had their key values replaced with placeholders, because real-looking Supabase and PayMongo keys — including secret keys — were found hardcoded in them. If those keys were ever real, rotate all of them (Supabase Project Settings → API, and PayMongo Developers → API Keys) before using this project further, since a key that has been pasted or committed anywhere should be treated as compromised.
- Rider documents (`rider-documents` bucket) are private; only the uploading rider and admins can read them.
- Before going to production, remove the "Admin" option from the public registration form (see step 2.6 above) and manage admin accounts manually.
