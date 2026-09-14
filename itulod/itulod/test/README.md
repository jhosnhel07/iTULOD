# Tests

The app has no build step; this suite runs on Node's built-in test runner
(`node --test`), no framework.

## Unit tests — `npm test`

Pure-function tests for the money-path helpers (fare estimation, the PH phone
formatters that gate what reaches the DB) and for `statusBadge()`'s handling
of the booking-expiration statuses (`expired`, `no_show`). They load the real
classic browser scripts (`js/utils.js`) into a small sandbox — see
`helpers/load-classic.mjs` — so there's nothing to keep in sync. No network,
no install needed.

```
cd itulod/itulod
node --test "test/unit/*.test.mjs"      # or: npm test
```

## Integration tests — `npm run test:integration`

Both drive a **real** Supabase project and skip unless all three env vars
below are set (they need `@supabase/supabase-js`):

- `integration/money-path.test.mjs` — sign up a customer + rider, approve the
  rider, book, accept, run the trip to completion, then assert (1) the
  customer is blocked from editing `estimated_fare` after the row exists, and
  (2) the DB — not the browser — wrote the `payments` row with a 15% platform
  commission and the remainder as rider payout.
- `integration/booking-expiration.test.mjs` — creates bookings backdated past
  the 15-minute grace period in each relevant state (stale pending, stale
  accepted, stale *ongoing*), runs `expire_stale_bookings()`, and asserts only
  the pending and accepted ones expire (never the ongoing one), a fresh
  pending booking is untouched, and an ordinary client can no longer change
  an expired booking's status.

```
cd itulod/itulod
npm install
ITULOD_TEST_SUPABASE_URL=https://<ref>.supabase.co \
ITULOD_TEST_ANON_KEY=<anon key> \
ITULOD_TEST_SERVICE_ROLE_KEY=<service_role key> \
  npm run test:integration
```

The project must already have `sql/schema.sql` + migrations `002`–`009` applied.
Both tests create their own throwaway auth users/bookings and delete them when
they finish.
