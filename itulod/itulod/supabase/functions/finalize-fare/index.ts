// =============================================================================
// iTULOD Edge Function: finalize-fare (retired)
// -----------------------------------------------------------------------------
// Riders used to set a food / parcel / hauling job's final fare at pickup.
// The total the customer booked is now the total they pay (sql/050): the
// booking gets it when a rider accepts, and out-of-stock food items come off
// it on their own. Older app versions that still call this get a clear answer.
//
// Deploy: supabase functions deploy finalize-fare
// =============================================================================
import { json, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  return json({ error: 'The total is fixed now — the customer pays what they booked. Please update the app.' }, 410);
});
