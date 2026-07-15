// =============================================================================
// iTULOD Edge Functions — shared helpers
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

// Table name for each booking "kind" used across the customer/rider/admin dashboards.
export const TABLE_BY_KIND: Record<string, string> = {
  transport: 'transport_bookings',
  food: 'food_deliveries',
  parcel: 'parcel_deliveries'
};

// Service-role client — bypasses RLS. Only ever used inside Edge Functions,
// never shipped to the browser.
export function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SECRET_KEY')!
  );
}

// Verifies the caller's Supabase session JWT (sent from the browser as
// `Authorization: Bearer <access_token>`) and returns the authenticated user.
export async function getRequestUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Basic-auth header PayMongo expects: base64("<key>:")
export function paymongoAuthHeader(key: string) {
  return 'Basic ' + btoa(`${key}:`);
}

export async function paymongoFetch(path: string, key: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.paymongo.com/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: paymongoAuthHeader(key),
      ...(init.headers || {})
    }
  });
  const body = await res.json();
  if (!res.ok) {
    const message = body?.errors?.[0]?.detail || 'PayMongo request failed';
    throw new Error(message);
  }
  return body;
}

// Peso amount (e.g. 125.50) -> PayMongo integer centavos (12550).
export function toCentavos(amount: number) {
  return Math.round(Number(amount) * 100);
}
