-- =============================================================================
-- 056: Forgot password — the code comes in Supabase's built-in code email
-- -----------------------------------------------------------------------------
-- The free plan with Supabase's default email sender doesn't allow editing
-- email templates, and the default "Reset Password" email only has a link.
-- The default "Reauthentication" email does carry a code ({{ .Token }}), so
-- password-reset-code (send) now has Supabase email that one: it opens a
-- short-lived server-side session for the account, calls reauthenticate and
-- signs that session out again. Nothing in it reaches the browser.
--
-- Supabase Auth keeps the code as auth.users.reauthentication_token =
-- hex(sha224(email || code)) with reauthentication_sent_at (supabase/auth
-- internal/crypto GenerateTokenHash, api/reauthenticate verifyReauthentication).
-- check_password_reset_code() checks it the same way (valid for 1 hour, the
-- mailer OTP expiry) and uses it up, so a code works once. Only the Edge
-- Function (service role) can call it; wrong guesses are still capped by
-- password_reset_attempts (sql/049).
-- =============================================================================

create or replace function public.check_password_reset_code(p_user uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_token text;
  v_sent  timestamptz;
begin
  if coalesce(p_code, '') !~ '^\d{6,10}$' then
    return false;
  end if;

  select email, reauthentication_token, reauthentication_sent_at
    into v_email, v_token, v_sent
    from auth.users
   where id = p_user
   for update;

  if not found or coalesce(v_token, '') = '' or v_sent is null
     or v_sent < now() - interval '1 hour' then
    return false;
  end if;

  if v_token <> encode(extensions.digest(coalesce(v_email, '') || p_code, 'sha224'), 'hex') then
    return false;
  end if;

  -- used up: the same code can't be entered twice
  update auth.users
     set reauthentication_token = '', reauthentication_sent_at = null
   where id = p_user;
  delete from auth.one_time_tokens
   where user_id = p_user and token_type = 'reauthentication_token';

  return true;
end;
$$;

revoke all on function public.check_password_reset_code(uuid, text) from public, anon, authenticated;
grant execute on function public.check_password_reset_code(uuid, text) to service_role;
