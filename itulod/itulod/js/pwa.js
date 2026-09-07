/* iTULOD — service worker registration (runs on every page).
   The worker itself (sw.js) does offline caching + push display.
   js/push.js reuses this same registration when web push is enabled. */
if ('serviceWorker' in navigator) {
  // Was the page already under a worker when it loaded? If not, the first
  // controllerchange is just the initial claim() — don't reload for that.
  const _hadController = !!navigator.serviceWorker.controller;
  let _reloaded = false;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err && err.message);
    });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (_reloaded || !_hadController) return;
    _reloaded = true;
    location.reload();
  });
}
