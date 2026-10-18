/**
 * iTULOD — "Get the app" (Android APK download)
 *
 * The APKs live in the public Supabase Storage bucket `app-downloads`
 * (sql/026_app_downloads_bucket.sql) next to latest.json, which carries the
 * version and file sizes shown here. To publish a new build: upload
 * itulod.apk / itulod-armv7.apk / latest.json to that bucket (see
 * DEPLOYMENT.md → "Android app download").
 *
 * openAppDownload() shows a dialog tailored to the device:
 *   Android → download button + install steps
 *   iPhone  → app coming soon, add the website to the Home Screen meanwhile
 *   desktop → QR code to open the download page on a phone
 * renderGetAppBlock(el) fills an inline block (landing page / dashboards).
 */
const APP_DL_BASE = `${CONFIG.SUPABASE_URL}/storage/v1/object/public/app-downloads`;
const APP_DL = {
  apk: `${APP_DL_BASE}/itulod.apk`,
  apkArmv7: `${APP_DL_BASE}/itulod-armv7.apk`,
  meta: `${APP_DL_BASE}/latest.json`,
  pageUrl: 'https://i-tulod-pi.vercel.app/index.html#get-app',
};

function appDlPlatform() {
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  // iPadOS reports itself as Mac — a touch-capable "Mac" is an iPad.
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

let _appDlMeta = null;
async function appDlMeta() {
  if (_appDlMeta) return _appDlMeta;
  try {
    const res = await fetch(`${APP_DL.meta}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) _appDlMeta = await res.json();
  } catch (_) { /* offline or not uploaded yet — show the buttons without size */ }
  return _appDlMeta || {};
}

function _appDlSize(mb) {
  return mb ? ` · ${Number(mb).toFixed(0)} MB` : '';
}

function _appDlAndroidHtml(meta) {
  return `
    <a class="btn btn-primary btn-block app-dl__primary" href="${APP_DL.apk}" download="iTULOD.apk">
      <i class="fa-brands fa-android"></i> Download for Android${_appDlSize(meta.size_mb)}
    </a>
    ${meta.version ? `<p class="app-dl__version">Version ${escapeHtml(String(meta.version))}${meta.updated ? ` · updated ${escapeHtml(formatDate(meta.updated))}` : ''}</p>` : ''}
    <ol class="app-dl__steps">
      <li><strong>Download</strong> the file above.</li>
      <li><strong>Open</strong> it from your notifications or the Downloads folder.</li>
      <li>If Android asks, tap <strong>Settings → Allow from this source</strong> for your browser, then go back.</li>
      <li>Tap <strong>Install</strong>, then <strong>Open</strong>. Log in with your iTULOD account.</li>
    </ol>
    <p class="app-dl__fine">
      Android may warn that the app isn't from the Play Store — that's expected while
      iTULOD is being prepared for Google Play.
      Older phone and it won't install? <a href="${APP_DL.apkArmv7}" download="iTULOD-armv7.apk">Get the version for older phones${_appDlSize(meta.size_mb_armv7)}</a>.
    </p>`;
}

function _appDlIosHtml() {
  return `
    <div class="app-dl__note">
      <i class="fa-brands fa-apple"></i>
      <div>
        <strong>The iPhone app is coming soon.</strong>
        <span>Meanwhile you can use iTULOD like an app: in Safari tap
        <i class="fa-solid fa-arrow-up-from-bracket"></i> <strong>Share</strong> →
        <strong>Add to Home Screen</strong>.</span>
      </div>
    </div>`;
}

function _appDlDesktopHtml(meta) {
  return `
    <div class="app-dl__qr-wrap">
      <img class="app-dl__qr" src="${rootPath()}assets/get-app-qr.svg" alt="QR code to the iTULOD app download page" width="168" height="168">
      <div>
        <strong>Scan with your Android phone's camera</strong>
        <span>It opens this download page on your phone. The app is for Android; the iPhone app is coming soon.</span>
        <a href="${APP_DL.apk}" download="iTULOD.apk" class="app-dl__direct"><i class="fa-solid fa-download"></i> Or download the APK file${_appDlSize(meta.size_mb)}</a>
      </div>
    </div>`;
}

async function _appDlBody() {
  const platform = appDlPlatform();
  const meta = platform === 'ios' ? {} : await appDlMeta();
  if (platform === 'android') return _appDlAndroidHtml(meta);
  if (platform === 'ios') return _appDlIosHtml();
  return _appDlDesktopHtml(meta);
}

/** Dialog version — used by the "Get the app" buttons. */
async function openAppDownload() {
  document.querySelector('.app-dl-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'app-dialog-overlay app-dl-overlay';
  overlay.innerHTML = `
    <div class="app-dialog app-dl" role="dialog" aria-modal="true" aria-labelledby="app-dl-title">
      <button type="button" class="app-dl__close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
      <div class="app-dl__head">
        <img src="${rootPath()}assets/icon-192.png" alt="" width="56" height="56">
        <div>
          <h3 id="app-dl-title">Get the iTULOD app</h3>
          <p>Book rides, food, parcels and hauling faster, with live tracking.</p>
        </div>
      </div>
      <div class="app-dl__body"><div class="skeleton skeleton-line skeleton-line--w80"></div></div>
    </div>`;
  const close = () => {
    overlay.classList.remove('app-dialog-overlay--show');
    setTimeout(() => overlay.remove(), 180);
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.app-dl__close')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('app-dialog-overlay--show'));
  overlay.querySelector('.app-dl__body').innerHTML = await _appDlBody();
  overlay.querySelector('.app-dl__close').focus();
}

/** Inline version — the landing page section and the dashboard cards. */
async function renderGetAppBlock(el) {
  if (!el) return;
  el.innerHTML = await _appDlBody();
}

// Fill every inline "Get the app" block on the page.
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-get-app]').forEach((el) => renderGetAppBlock(el));
});
