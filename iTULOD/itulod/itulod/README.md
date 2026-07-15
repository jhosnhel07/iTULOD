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
├── payment-return.html      # Landing page after a GCash / 3-D Secure redirect
├── css/
│   ├── main.css             # Design tokens + landing + auth pages
│   └── dashboard.css         # Shared dashboard shell (sidebar, tables, cards, modal)
├── js/
│   ├── config.js              # Public config: Supabase project ref, PayMongo public key
│   ├── supabaseClient.js     # Supabase client init — reads from config.js
│   ├── utils.js              # Toasts, formatting, session guard, pagination
│   ├── auth.js               # Login / register / logout / password reset
│   ├── payment.js             # PayMongo GCash + card checkout (browser side)
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
│   └── functions/
│       ├── create-payment/          # Opens a PayMongo GCash source or card payment intent
│       ├── attach-card-payment/     # Attaches a tokenized card to its payment intent
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
| Booking creation (ride/food/parcel), fare estimate | ✅ Live — distance is simulated from address text since no geocoding API is connected |
| Rider accept/status updates, earnings, ratings | ✅ Live |
| Admin analytics, customer/rider management, approvals, vehicle CRUD, payments, announcements | ✅ Live |
| Real-time updates (new bookings, status changes) | ✅ Live via Supabase Realtime |
| File uploads (avatars, license, OR/CR) | ✅ Live via Supabase Storage |
| **GCash payment (ride bookings)** | ✅ Live via PayMongo Sources + a Supabase Edge Function + webhook (see §5) |
| **Card payment (ride bookings)** | ✅ Live via PayMongo Payment Intents, in-browser tokenization, and a Supabase Edge Function (see §5) |
| Cash payment | ✅ Live — collected by the rider, marked paid on completion (unchanged) |
| GCash/Card for food & parcel deliveries | 🔲 Not wired — those fares are set by the rider at pickup, so there's no amount to charge up front yet. Cash-on-completion still works for them. |
| Live map / turn-by-turn navigation | 🔲 Placeholder — wire in Google Maps or Mapbox where marked `map-placeholder` |
| Database backup/restore | 🔲 Placeholder button — wire to a Supabase Edge Function or scheduled export |

## 5. Set up GCash / Card payments (PayMongo)

The ride-booking payment method dropdown (Cash / GCash / Card) is fully wired end-to-end. Card numbers are tokenized directly in the browser with PayMongo's *public* key and never touch your server; the *secret* key only ever lives in Supabase Edge Function secrets.

1. **Create a PayMongo account** at [paymongo.com](https://paymongo.com) and grab your **test** keys from Developers → API Keys (`pk_test_...` and `sk_test_...`).
2. **Run the migration:** open the SQL editor and run `sql/002_payment_gateway.sql` (after `sql/schema.sql`).
3. **Set the public key** in `js/config.js`:
   ```js
   PAYMONGO_PUBLIC_KEY: 'pk_test_...'
   ```
4. **Set your `SITE_URL`, secret keys, and webhook secret** as Supabase secrets (never commit these — copy `secrets.env.example` to `secrets.env`, fill it in, then run):
   ```bash
   supabase secrets set --env-file secrets.env
   supabase secrets set SITE_URL=https://your-deployed-site.example.com
   ```
5. **Deploy the three Edge Functions:**
   ```bash
   supabase functions deploy create-payment
   supabase functions deploy attach-card-payment
   supabase functions deploy paymongo-webhook --no-verify-jwt
   ```
   (`--no-verify-jwt` on the webhook only — PayMongo calls it anonymously and it verifies PayMongo's own signature instead.)
6. **Register the webhook** in PayMongo Dashboard → Developers → Webhooks:
   - URL: `https://<project-ref>.functions.supabase.co/paymongo-webhook`
   - Events: `source.chargeable`, `payment.paid`, `payment.failed`, `payment_intent.succeeded`, `payment_intent.payment_failed`
   - Copy the generated **webhook signing secret** into `PAYMONGO_WEBHOOK_SECRET` (step 4).
7. **Test it:** book a ride with GCash or Card. PayMongo's test mode accepts `4343 4343 4343 4345` (any future expiry/CVC) for card, and simulates a GCash authorization screen you can approve or decline.

Booking history shows a payment badge (e.g. *GCash · pending*) for ride bookings paid this way, with a **Pay again** button if a payment is still pending or failed.

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
- The Supabase **anon/publishable key** and PayMongo **public key** are safe to expose in frontend code — every table is protected by the Row Level Security policies in `sql/schema.sql` and `sql/002_payment_gateway.sql`, and the public PayMongo key can only tokenize card details, never charge them.
- The Supabase **secret/service-role key** and PayMongo **secret key** must never appear in frontend code (`js/`) — they belong only in Supabase Edge Function secrets (`supabase secrets set`), which is where `supabase/functions/` reads them from via `Deno.env.get(...)`.
- **If you're picking up this project from an earlier export:** `js/config.js` and `secrets.env` in this copy have had their key values replaced with placeholders, because real-looking Supabase and PayMongo keys — including secret keys — were found hardcoded in them. If those keys were ever real, rotate all of them (Supabase Project Settings → API, and PayMongo Developers → API Keys) before using this project further, since a key that has been pasted or committed anywhere should be treated as compromised.
- Rider documents (`rider-documents` bucket) are private; only the uploading rider and admins can read them.
- Before going to production, remove the "Admin" option from the public registration form (see step 2.6 above) and manage admin accounts manually.
