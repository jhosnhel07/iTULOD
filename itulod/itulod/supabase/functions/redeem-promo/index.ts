// =============================================================================
// iTULOD Edge Function: redeem-promo (retired)
// -----------------------------------------------------------------------------
// Promos were removed (sql/054). Older app versions that still call this get
// a clear answer instead of an error.
//
// Deploy: supabase functions deploy redeem-promo
// =============================================================================
import { json, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  return json({ error: 'Promos are no longer available.' }, 410);
});
