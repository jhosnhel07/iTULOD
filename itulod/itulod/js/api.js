/**
 * iTULOD — frontend API client
 * All requests go to the Express backend. No Supabase keys in the browser.
 * JWT is stored in sessionStorage (cleared on tab close) — never in a cookie.
 */

const API = (() => {
  const BASE = '/api';

  function getToken() { return sessionStorage.getItem('itulod_token'); }
  function setToken(t) { sessionStorage.setItem('itulod_token', t); }
  function clearToken() { sessionStorage.removeItem('itulod_token'); }

  async function request(method, path, body, isFormData = false) {
    const headers = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
    });

    // Token expired — try to refresh via Supabase then retry once
    if (res.status === 401) {
      try {
        const { data } = await supabase.auth.refreshSession();
        if (data?.session?.access_token) {
          setToken(data.session.access_token);
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
          const retry = await fetch(BASE + path, {
            method, headers,
            body: body ? (isFormData ? body : JSON.stringify(body)) : undefined
          });
          const retryData = await retry.json().catch(() => ({}));
          if (!retry.ok) throw new Error(retryData.error || `Request failed (${retry.status})`);
          return retryData;
        }
      } catch (_) {}
      clearToken();
      window.location.href = rootPath() + 'login.html';
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  return {
    getToken, setToken, clearToken,
    get:    (path)        => request('GET',    path),
    post:   (path, body)  => request('POST',   path, body),
    patch:  (path, body)  => request('PATCH',  path, body),
    put:    (path, body)  => request('PUT',    path, body),
    delete: (path)        => request('DELETE', path),
  };
})();

// ── Supabase Realtime (anon key only — read-only pub/sub, no DB access) ────
// We keep a thin Supabase client ONLY for Realtime subscriptions.
// The anon key cannot read or write any table — RLS blocks everything.
// It is only used to receive change events so the UI can refresh via API.
const SUPABASE_URL  = 'https://ajzlvrvqpggnnwerahhq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqemx2cnZxcGdnbm53ZXJhaGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyODQ2OTAsImV4cCI6MjA5ODg2MDY5MH0.qNa97RY152fJgaA5mYQ0iCEoFVT1hfpqzUk6pRspDRU';
const realtimeClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false, autoRefreshToken: false }
});
