// =============================================================================
// iTULOD Edge Function: check-email
// -----------------------------------------------------------------------------
// Lets the registration wizard tell a visitor "this email is already
// registered" the moment they type it — instead of the only chance being the
// very last step, after a rider has already filled in vehicle info and
// uploaded documents.
//
// Supabase Auth deliberately won't answer "does this email exist" from the
// browser (signInWithPassword / resetPasswordForEmail both return generic,
// non-committal responses, on purpose, to stop account enumeration). This
// function trades a small amount of that privacy for a much better signup
// flow — the same trade-off most signup forms make (Gmail, Facebook, etc. all
// tell you up front). It returns nothing but a boolean: no account details,
// no hint about which role/name is attached to the address.
//
//   POST { email }
//
// No auth required — anonymous visitors on the register page call this
// before they have an account.
//
// Deploy: supabase functions deploy check-email --no-verify-jwt
// =============================================================================
import { adminClient, json, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const { email } = await req.json();
    const normalized = String(email || '').trim().toLowerCase();
    // Cheap sanity check — not full RFC validation, just enough to skip a
    // database round trip for obviously-incomplete input while someone is
    // still mid-keystroke.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }

    const admin = adminClient();
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', normalized)
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    return json({ available: !data });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
