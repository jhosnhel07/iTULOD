-- =============================================================================
-- iTULOD migration 049: forgot password with a code — wrong-code limit
-- -----------------------------------------------------------------------------
-- "Forgot password?" now sends a 6-digit code (Supabase's recovery email,
-- with {{ .Token }} in the Reset Password template) to the account's email —
-- found by email or by mobile number — through the password-reset-code Edge
-- Function, which also checks the code. All calls come from that one
-- function, so Supabase's own per-IP limit doesn't separate users; this table
-- caps wrong codes at 5 per account per 15 minutes. Only the service role
-- touches it (RLS on, no policies).
--
-- Run AFTER 048. Safe to re-run.
-- =============================================================================

create table if not exists public.password_reset_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  failed int not null default 0,
  window_started timestamptz not null default now()
);
alter table public.password_reset_attempts enable row level security;
