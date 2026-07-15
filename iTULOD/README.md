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
├── css/
│   ├── main.css             # Design tokens + landing + auth pages
│   └── dashboard.css         # Shared dashboard shell (sidebar, tables, cards, modal)
├── js/
│   ├── supabaseClient.js     # Supabase project config — EDIT THIS FIRST
│   ├── utils.js              # Toasts, formatting, session guard, pagination
│   ├── auth.js               # Login / register / logout / password reset
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
│   └── schema.sql             # Full Postgres schema, RLS policies, seed data
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
| Live map / turn-by-turn navigation | 🔲 Placeholder — wire in Google Maps or Mapbox where marked `map-placeholder` |
| GCash / Card payment | 🔲 Placeholder — cash is functional; GCash/Card need a payment gateway (e.g. PayMongo, Xendit) |
| Database backup/restore | 🔲 Placeholder button — wire to a Supabase Edge Function or scheduled export |

## 5. Deployment

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

## 6. Security notes
- The Supabase **anon key** is safe to expose in frontend code — every table is protected by the Row Level Security policies in `sql/schema.sql`, so users can only read/write rows they're allowed to.
- Rider documents (`rider-documents` bucket) are private; only the uploading rider and admins can read them.
- Before going to production, remove the "Admin" option from the public registration form (see step 2.6 above) and manage admin accounts manually.
