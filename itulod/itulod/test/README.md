# Tests

The app has no build step; this suite runs on Node's built-in test runner
(`node --test`), no framework.

## Unit tests — `npm test`

Pure-function tests for the money-path helpers (fare estimation, the PH phone
formatters that gate what reaches the DB). They load the real classic browser
scripts (`js/utils.js`) into a small sandbox — see `helpers/load-classic.mjs` —
so there's nothing to keep in sync. No network, no install needed.

```
cd itulod/itulod
node --test "test/unit/*.test.mjs"      # or: npm test
```

## Integration test — `npm run test:integration`

`integration/money-path.test.mjs` drives the whole money path against a **real**
Supabase project: sign up a customer + rider, approve the rider, book, accept,
run the trip to completion, then assert

1. the customer is blocked from editing `estimated_fare` after the row exists, and
2. the DB — not the browser — wrote the `payments` row with a 15 % platform
   commission and the remainder as rider payout.

It **skips** unless all three env vars are set, and it needs `@supabase/supabase-js`:

```
cd itulod/itulod
npm install
ITULOD_TEST_SUPABASE_URL=https://<ref>.supabase.co \
ITULOD_TEST_ANON_KEY=<anon key> \
ITULOD_TEST_SERVICE_ROLE_KEY=<service_role key> \
  npm run test:integration
```

The project must already have `sql/schema.sql` + migrations `002`–`007` applied.
The test creates two throwaway auth users (`itulod.test.*@example.com`) and
deletes them, with their bookings, when it finishes.
