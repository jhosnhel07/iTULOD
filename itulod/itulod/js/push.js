/* iTULOD — opt-in web-push registration.
   No-op unless CONFIG.VAPID_PUBLIC_KEY is set and the browser supports push.
   Call enablePushNotifications() once CURRENT_PROFILE is known. */

function _urlB64ToUint8Array(base64) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function enablePushNotifications() {
  try {
    const vapid = (typeof CONFIG !== 'undefined' && CONFIG.VAPID_PUBLIC_KEY) || '';
    if (!vapid) return;                                   // push not configured
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;
    if (typeof CURRENT_PROFILE === 'undefined' || !CURRENT_PROFILE) return;

    const reg = await navigator.serviceWorker.register('/sw.js');

    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlB64ToUint8Array(vapid),
      });
    }

    const j = sub.toJSON();
    await supabase.from('push_subscriptions').upsert(
      {
        user_id: CURRENT_PROFILE.id,
        endpoint: sub.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: 'endpoint' },
    );
  } catch (e) {
    console.warn('Push setup skipped:', e && e.message);
  }
}
