/**
 * iTULOD — public configuration (safe to commit)
 * Secret keys belong in secrets.env (gitignored) or Supabase Edge Function secrets.
 */
const CONFIG = {
  // Project Settings → API → Project URL (e.g. https://abcdefgh.supabase.co)
  SUPABASE_URL: 'https://ajzlvrvqpggnnwerahhq.supabase.co',

  SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqemx2cnZxcGdnbm53ZXJhaGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODQ2OTAsImV4cCI6MjA5ODg2MDY5MH0.qNa97RY152fJgaA5mYQ0iCEoFVT1hfpqzUk6pRspDRU',

  // Safe to expose client-side — this is PayMongo's *public* key, used only
  // to tokenize card details in the browser. Never put a PayMongo *secret*
  // key here or anywhere in frontend code.
  PAYMONGO_PUBLIC_KEY: 'pk_test_YOUR_PAYMONGO_PUBLIC_KEY',
  PAYMONGO_API_URL: 'https://api.paymongo.com/v1',

  // Default admin account (seeded via sql/schema.sql)
  ADMIN_USERNAME: 'admin',
  ADMIN_EMAIL: 'admin@itulod.local'
};
