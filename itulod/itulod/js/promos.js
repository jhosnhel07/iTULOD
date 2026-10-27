/* iTULOD — customer promos (sql/053): claim a promo from its notification or
   by code, see them in My promos, and pick one when booking any service.
   iTULOD pays for the discount (the rider still earns from the full price).
   The server (redeem-promo) checks everything again when it's applied. */

let MY_PROMOS = [];
let PROMO_FARE_MIN = 20; // a promo never takes a fare below this (platform_config.fare_min)
const PROMO_CHOICE = {}; // booking kind → chosen code ('' = no promo)
const PROMO_KIND_WORD = { transport: 'rides', food: 'food', parcel: 'parcels', hauling: 'hauling' };

async function loadMyPromos() {
  const { data, error } = await supabase.rpc('my_promos');
  if (error) { console.warn('my_promos failed:', error.message); return; }
  MY_PROMOS = data || [];
  setNavCount('promos', MY_PROMOS.filter(p => p.status === 'ready').length);
  renderPromoPickers();
  renderMyPromos();
}

function promoDiscount(p, fare) {
  const raw = p.discount_type === 'percent'
    ? Math.round(fare * (Number(p.discount_value) / 100) * 100) / 100
    : Number(p.discount_value);
  return Math.max(0, Math.round(Math.min(raw, fare - PROMO_FARE_MIN) * 100) / 100);
}
function promoBadge(p) {
  return p.discount_type === 'percent' ? `${Number(p.discount_value)}%` : peso(p.discount_value).replace('.00', '');
}

// "₱1,234.50" on a form → 1234.5
function readFare(el) {
  const n = Number(String(el?.textContent || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ---- the picker on each booking form --------------------------------------
// <div class="promo-pick" data-kind="transport" data-fare="ride-fare">
function renderPromoPickers() {
  document.querySelectorAll('.promo-pick').forEach(renderPromoPicker);
}
function renderPromoPicker(box) {
  const kind = box.dataset.kind;
  const fare = readFare(document.getElementById(box.dataset.fare));
  const ready = MY_PROMOS.filter(p => p.status === 'ready' && (p.services || []).includes(kind));
  const usable = ready.filter(p => fare >= Number(p.min_fare || 0) && promoDiscount(p, fare) > 0);
  if (PROMO_CHOICE[kind] && !usable.some(p => p.code === PROMO_CHOICE[kind])) PROMO_CHOICE[kind] = '';
  const chosen = usable.find(p => p.code === PROMO_CHOICE[kind]);
  const saving = chosen ? promoDiscount(chosen, fare) : 0;
  const tooSmall = ready.filter(p => !usable.includes(p));
  const note = chosen
    ? `<span class="promo-pick__save"><i class="fa-solid fa-tag"></i> You save <strong>${peso(saving)}</strong> — new total <strong>${peso(fare - saving)}</strong>. iTULOD pays the discount.</span>`
    : usable.length
      ? `${usable.length} promo${usable.length === 1 ? '' : 's'} you can use on this booking.`
      : tooSmall.length && fare > 0
        ? `Your ${tooSmall.length === 1 ? 'promo needs' : 'promos need'} a bigger total (min ${peso(Math.min(...tooSmall.map(p => Number(p.min_fare || 0))))}).`
        : fare > 0 ? `No promos for ${PROMO_KIND_WORD[kind]} yet — new ones arrive in your notifications.` : 'Set your trip to see which promos you can use.';
  box.innerHTML = `
    <label>Promo</label>
    <div class="promo-pick__row">
      <select class="promo-pick__select" ${usable.length ? '' : 'disabled'} aria-label="Promo for this booking">
        <option value="">No promo</option>
        ${usable.map(p => `<option value="${escapeHtml(p.code)}" ${p.code === PROMO_CHOICE[kind] ? 'selected' : ''}>${escapeHtml(p.title)} — save ${peso(promoDiscount(p, fare))}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-outline btn-sm promo-pick__code-btn"><i class="fa-solid fa-ticket"></i> Have a code?</button>
    </div>
    <div class="promo-pick__code" hidden>
      <input type="text" class="promo-pick__input" placeholder="Enter a promo code" style="text-transform:uppercase" maxlength="40">
      <button type="button" class="btn btn-primary btn-sm promo-pick__claim">Claim</button>
    </div>
    <p class="promo-pick__note">${note}</p>`;
  box.querySelector('.promo-pick__select').addEventListener('change', (e) => {
    PROMO_CHOICE[kind] = e.target.value;
    renderPromoPicker(box);
  });
  box.querySelector('.promo-pick__code-btn').addEventListener('click', () => {
    const code = box.querySelector('.promo-pick__code');
    code.hidden = !code.hidden;
    if (!code.hidden) box.querySelector('.promo-pick__input').focus();
  });
  const claim = async () => {
    const input = box.querySelector('.promo-pick__input');
    const claimed = await claimPromo({ code: input.value }, box.querySelector('.promo-pick__claim'));
    if (!claimed) return;
    PROMO_CHOICE[kind] = claimed.code;
    await loadMyPromos();
  };
  box.querySelector('.promo-pick__claim').addEventListener('click', claim);
  box.querySelector('.promo-pick__input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); claim(); } });
}

// After a booking is placed: apply the chosen promo to it (redeem-promo).
async function applyChosenPromo(kind, bookingId) {
  const code = PROMO_CHOICE[kind];
  if (!code || !bookingId) return;
  PROMO_CHOICE[kind] = '';
  const { data, error } = await supabase.functions.invoke('redeem-promo', {
    body: { code, booking_type: kind, booking_id: bookingId },
  });
  if (error || data?.error) {
    let message = data?.error || 'That promo could not be applied.';
    try { message = (await error.context.json()).error || message; } catch (_) { /* network error */ }
    toast(`Booked, but the promo wasn't applied: ${message}`, 'error');
  } else {
    toast(`Promo applied — you saved ${peso(data.discount_amount)}!`, 'success');
  }
  loadMyPromos();
}

async function claimPromo({ id = null, code = null }, btn) {
  if (!id && !String(code || '').trim()) { toast('Enter a promo code.', 'error'); return null; }
  if (btn) setLoading(btn, true);
  const { data, error } = await supabase.rpc('claim_promo', { p_promo: id, p_code: code ? code.trim() : null });
  if (btn) setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return null; }
  const claimed = data?.[0];
  toast(`Promo ${claimed?.code || ''} claimed — pick it when you book.`, 'success');
  return claimed;
}

// ---- My promos -----------------------------------------------------------------
const PROMO_STATE = {
  ready: ['Ready to use', 'badge--completed'],
  unclaimed: ['New — claim it', 'badge--pending'],
  used: ['Used', 'badge--expired'],
  expired: ['Expired', 'badge--cancelled'],
  ended: ['Ended', 'badge--cancelled'],
  full: ['Fully used', 'badge--cancelled'],
};
function renderMyPromos() {
  const el = document.getElementById('my-promos');
  if (!el) return;
  if (!MY_PROMOS.length) {
    el.innerHTML = emptyState({ icon: 'fa-ticket', title: 'No promos yet', body: 'New promos arrive in your notifications — claim one, then pick it when you book. Have a code? Enter it above.' });
    return;
  }
  el.innerHTML = MY_PROMOS.map(p => {
    const [label, cls] = PROMO_STATE[p.status] || [p.status, 'badge--pending'];
    const used = p.status === 'used' ? ` on ${KIND_LABEL[p.used_booking_type] || 'a booking'} · ${formatDate(p.used_at)}` : '';
    return `<div class="promo-card promo-card--${p.status}" data-promo="${p.id}">
      <div class="promo-card__value">${escapeHtml(promoBadge(p))}<small>off</small></div>
      <div class="promo-card__info">
        <strong>${escapeHtml(p.title)}</strong>
        <span>${escapeHtml(p.summary)}</span>
        <code>${escapeHtml(p.code)}</code>
      </div>
      <div class="promo-card__state">
        <span class="badge ${cls}">${label}${escapeHtml(used)}</span>
        ${p.status === 'unclaimed' ? `<button type="button" class="btn btn-primary btn-sm" onclick="claimPromo({ id: '${p.id}' }, this).then(c => c && loadMyPromos())"><i class="fa-solid fa-hand-pointer"></i> Claim</button>` : ''}
        ${p.status === 'ready' ? `<button type="button" class="btn btn-outline btn-sm" onclick="activateTab('book')"><i class="fa-solid fa-plus"></i> Book with it</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

// From a promo notification (link 'promo/<id>') or a phone notification tap.
function openPromo(id) {
  activateTab('promos');
  setTimeout(() => {
    const card = document.querySelector(`.promo-card[data-promo="${id}"]`);
    if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.add('is-flash'); setTimeout(() => card.classList.remove('is-flash'), 1600); }
  }, 300);
}
function promoNotifAction(n) {
  const id = String(n.link || '').split('/')[1];
  const p = MY_PROMOS.find(x => x.id === id);
  if (p && p.status === 'unclaimed') {
    return `<button type="button" class="btn btn-primary btn-block" onclick="claimPromo({ id: '${id}' }, this).then(c => { if (c) { closeNotification(); loadMyPromos().then(() => openPromo('${id}')); } })"><i class="fa-solid fa-ticket"></i> Claim promo</button>`;
  }
  return `<button type="button" class="btn btn-primary btn-block" onclick="closeNotification(); openPromo('${id}')"><i class="fa-solid fa-ticket"></i> ${p && p.status === 'ready' ? 'Claimed — view my promos' : 'View my promos'}</button>`;
}

async function initPromos() {
  try {
    const { data } = await supabase.from('platform_config').select('fare_min').limit(1).maybeSingle();
    if (data?.fare_min != null) PROMO_FARE_MIN = Number(data.fare_min);
  } catch (_) { /* keep the default */ }
  // the pickers follow each form's total
  document.querySelectorAll('.promo-pick').forEach(box => {
    const fareEl = document.getElementById(box.dataset.fare);
    if (fareEl) new MutationObserver(() => renderPromoPicker(box)).observe(fareEl, { childList: true, characterData: true, subtree: true });
  });
  document.getElementById('promo-code-claim')?.addEventListener('click', async (e) => {
    const input = document.getElementById('promo-code-input');
    if (await claimPromo({ code: input.value }, e.currentTarget)) { input.value = ''; loadMyPromos(); }
  });
  supabase.channel(`promos-${CURRENT_PROFILE.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promo_claims', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => loadMyPromos())
    .subscribe();
  await loadMyPromos();
  const { tab, sub } = readViewHash();
  if (tab === 'promo' && sub) openPromo(sub);
}
