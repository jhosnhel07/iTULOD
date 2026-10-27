// =============================================================================
// iTULOD Edge Function: password-reset-code
// -----------------------------------------------------------------------------
// "Forgot password?" with a 6-digit code, by email or mobile number:
//
//   POST { action: 'send',   identifier }        → { sent_to: 'ju***@gmail.com' }
//   POST { action: 'verify', identifier, code }  → { access_token, refresh_token, role }
//
// identifier is an email or a PH mobile number (09XX…, +63…). A number is
// looked up on profiles and the code goes to that account's email — there is
// no SMS provider — so only a masked address ever comes back.
//
// The code comes in Supabase's built-in "Reauthentication" email (sql/056):
// the free plan's default email sender can't use an edited Reset Password
// template, and the default one only has a link. send opens a short-lived
// session for the account here on the server, asks Supabase to email the
// reauthentication code, and signs that session out. verify checks the code
// with check_password_reset_code() (used once, 1 hour) and returns a fresh
// session, so the page can set the new password and go straight to the
// dashboard.
//
// Wrong codes are capped at 5 per account per 15 minutes
// (password_reset_attempts, sql/049) — every call comes from this function,
// so Supabase's per-IP limit wouldn't tell users apart. The admin account and
// deactivated accounts are refused, as at login.
//
// No auth required — the visitor has no session yet.
// Deploy: supabase functions deploy password-reset-code --no-verify-jwt
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { adminClient, json, CORS_HEADERS } from '../_shared/helpers.ts';

const MAX_WRONG = 5;
const WINDOW_MIN = 15;

function maskEmail(email: string) {
  const [user, domain] = email.split('@');
  const keep = user.length <= 2 ? 1 : 2;
  return user.slice(0, keep) + '*'.repeat(Math.max(3, user.length - keep)) + '@' + domain;
}

// 09XXXXXXXXX from "0917 123 4567", "+63 917…", "917…"
function normalizePhone(value: string) {
  const d = value.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('63')) return '0' + d.slice(2);
  if (d.length === 10 && d.startsWith('9')) return '0' + d;
  return d;
}

type Found = { id: string; email: string; role: string } | { error: string; status: number };

async function findAccount(admin: ReturnType<typeof adminClient>, identifier: string): Promise<Found> {
  const raw = String(identifier || '').trim();
  const byEmail = raw.includes('@');
  let query = admin.from('profiles').select('id, email, role, is_active').limit(2);
  if (byEmail) {
    const email = raw.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.', status: 400 };
    query = query.ilike('email', email);
  } else {
    const phone = normalizePhone(raw);
    if (!/^09\d{9}$/.test(phone)) return { error: 'Enter your email or an 11-digit mobile number (09XX XXX XXXX).', status: 400 };
    query = query.eq('phone', phone);
  }
  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) {
    return { error: byEmail ? 'No account uses that email.' : 'No account uses that mobile number.', status: 404 };
  }
  if (data.length > 1) {
    return { error: 'That mobile number is on more than one account — enter your email instead.', status: 409 };
  }
  const p = data[0];
  if (p.role === 'admin') return { error: "The admin account can't be reset here. Contact your system administrator.", status: 403 };
  if (p.is_active === false) return { error: 'This account has been deactivated. Contact support.', status: 403 };
  let email = p.email as string | null;
  if (!email) {
    const { data: u } = await admin.auth.admin.getUserById(p.id);
    email = u?.user?.email ?? null;
  }
  if (!email) return { error: 'This account has no email to send a code to. Contact support.', status: 409 };
  return { id: p.id, email: email.toLowerCase(), role: p.role };
}

// Supabase Auth as the public client (anon key), as it would be in the browser.
function authClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// A session for the account without sending anything: an admin magic link,
// redeemed here. Never sent to the browser except after a correct code.
async function sessionFor(admin: ReturnType<typeof adminClient>, email: string) {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.properties?.hashed_token) throw linkErr ?? new Error('Could not start the reset.');
  const auth = authClient();
  const { data, error } = await auth.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (error || !data?.session) throw error ?? new Error('Could not start the reset.');
  return { auth, session: data.session };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { action, identifier, code } = await req.json();
    const admin = adminClient();
    const found = await findAccount(admin, identifier);
    if ('error' in found) return json({ error: found.error }, found.status);

    if (action === 'send') {
      // Supabase emails the code ("Confirm reauthentication" / "Enter the code")
      const { auth } = await sessionFor(admin, found.email);
      const { error } = await auth.auth.reauthenticate();
      await auth.auth.signOut({ scope: 'local' }); // only this server-side session
      if (error) {
        const limited = /rate limit|seconds|too many/i.test(error.message);
        return json({
          error: limited
            ? 'A code was just sent. Please wait a minute before asking for another.'
            : 'Could not send the code: ' + error.message,
        }, limited ? 429 : 500);
      }
      // a new code: start the wrong-code count again
      await admin.from('password_reset_attempts').delete().eq('user_id', found.id);
      return json({ sent_to: maskEmail(found.email) });
    }

    if (action === 'verify') {
      const token = String(code || '').replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(token)) return json({ error: 'Enter the 6-digit code from the email.' }, 400);

      const { data: tries } = await admin.from('password_reset_attempts')
        .select('failed, window_started').eq('user_id', found.id).maybeSingle();
      const windowOpen = tries && Date.now() - new Date(tries.window_started).getTime() < WINDOW_MIN * 60_000;
      if (windowOpen && tries.failed >= MAX_WRONG) {
        return json({ error: `Too many wrong codes. Wait ${WINDOW_MIN} minutes or send a new code.` }, 429);
      }

      const { data: ok, error: checkErr } = await admin.rpc('check_password_reset_code', { p_user: found.id, p_code: token });
      if (checkErr) throw checkErr;
      if (ok !== true) {
        await admin.from('password_reset_attempts').upsert({
          user_id: found.id,
          failed: windowOpen ? tries!.failed + 1 : 1,
          window_started: windowOpen ? tries!.window_started : new Date().toISOString(),
        });
        return json({ error: 'That code is wrong or has expired. Check the email or send a new code.' }, 400);
      }
      await admin.from('password_reset_attempts').delete().eq('user_id', found.id);
      const { session } = await sessionFor(admin, found.email);
      return json({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        role: found.role,
      });
    }

    return json({ error: "action must be 'send' or 'verify'." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
