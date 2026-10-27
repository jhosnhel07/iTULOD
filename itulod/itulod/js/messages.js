/**
 * iTULOD — Messages (customer + rider dashboards)
 *
 * One conversation per booking that has a rider (sql/046 my_conversations).
 * Wide screens: the list and the open chat side by side; phones: the list,
 * then the chat full width with a back button. Unread counts show on the
 * sidebar link and the phone top-bar icon; "Seen" comes from the other
 * side's booking_message_reads row. Photos live in the private chat-photos
 * bucket and are shown through signed links. Chat notifications carry
 * #messages/<type>/<id> (notifications.link), which opens the conversation.
 */
const MSG = {
  list: [],
  filter: 'active',   // 'active' (trip still on, can type) | 'past' (read-only)
  open: null,         // { kind, id } of the conversation on screen
  messages: [],
  photoUrls: {},      // image_path → signed URL
  channel: null,
  loaded: false,
  pendingOpen: null,  // a conversation asked for before the list loaded
};
const MSG_QUICK = {
  rider: ['On my way', "I'm here", 'Running a bit late, sorry', 'Where exactly are you?', 'Please wait 5 minutes'],
  customer: ["I'm at the pickup point", 'Please call me', "I'm on my way out", 'Take your time, ride safe', 'Thank you!'],
};
const MSG_KIND = {
  transport: ['Ride', 'fa-car-side'], food: ['Food', 'fa-utensils'],
  parcel: ['Parcel', 'fa-box'], hauling: ['Hauling', 'fa-truck-moving'],
};
const MSG_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function msgKey(kind, id) { return kind + ':' + id; }
function msgConvo(kind, id) { return MSG.list.find(c => c.booking_type === kind && c.booking_id === id); }
function msgInitials(name) { return (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(); }
function msgFace(c, cls = 'msg-face') {
  return safeImageUrl(c.other_avatar)
    ? `<span class="${cls}"><img src="${escapeHtml(c.other_avatar)}" alt=""></span>`
    : `<span class="${cls}">${escapeHtml(msgInitials(c.other_name))}</span>`;
}
function msgTime(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

// ---- start-up -------------------------------------------------------------
async function initMessages() {
  const panel = document.getElementById('tab-messages');
  if (!panel) return;
  const start = readViewHash(); // before restoreView() rewrites it
  panel.innerHTML = `
    <div class="msg-shell" id="msg-shell">
      <aside class="msg-list-pane">
        <div class="segmented segmented--sm msg-filter" id="msg-filter" role="tablist">
          <button type="button" class="seg-btn active" data-filter="active">Active</button>
          <button type="button" class="seg-btn" data-filter="past">Past</button>
        </div>
        <div class="msg-list" id="msg-list">${skeletonList(4)}</div>
      </aside>
      <section class="msg-thread-pane" id="msg-thread">
        ${msgEmptyThread()}
      </section>
    </div>`;
  document.getElementById('msg-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    MSG.filter = btn.dataset.filter;
    viewState('msg-filter', MSG.filter);
    document.querySelectorAll('#msg-filter .seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderConversationList();
  });
  const savedFilter = viewState('msg-filter');
  if (savedFilter === 'past') document.querySelector('#msg-filter [data-filter="past"]')?.click();

  document.getElementById('msg-list').addEventListener('click', (e) => {
    const row = e.target.closest('.msg-row');
    if (row) openConversation(row.dataset.kind, row.dataset.id);
  });

  // Live: new messages (RLS only sends ours) and read receipts.
  MSG.channel = supabase.channel('messages-inbox')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages' }, (p) => onNewMessage(p.new))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'booking_message_reads' }, (p) => onReadReceipt(p.new))
    .subscribe();

  // A push notification clicked while this page is open (sw.js) → that chat.
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'open-link' && e.data.hash) openLink(e.data.hash);
  });
  window.addEventListener('hashchange', () => openLink(location.hash));

  if (start.tab === 'messages' && start.sub && start.rest) MSG.pendingOpen = { kind: start.sub, id: start.rest };
  await loadConversations();
}

// "#messages/transport/<id>" from a notification
function openLink(hash) {
  const [tab, kind, id] = String(hash || '').replace(/^#/, '').split('/');
  // a tapped promo notification (link 'promo/<id>', js/promos.js)
  if (tab === 'promo' && typeof openPromo === 'function') { openPromo(kind); return; }
  if (tab !== 'messages') return;
  if (typeof activateTab === 'function') activateTab('messages');
  if (kind && id) openConversation(kind, id);
}

async function loadConversations() {
  const { data, error } = await supabase.rpc('my_conversations');
  if (error) {
    document.getElementById('msg-list').innerHTML = `<p class="muted msg-pad">Could not load your messages.</p>`;
    return;
  }
  MSG.list = data || [];
  MSG.loaded = true;
  renderConversationList();
  updateMessageBadge();
  if (MSG.open) renderThreadHeader();
  if (MSG.pendingOpen) {
    const { kind, id } = MSG.pendingOpen;
    MSG.pendingOpen = null;
    openConversation(kind, id);
  }
}
let _msgReloadTimer = null;
function reloadConversationsSoon() {
  clearTimeout(_msgReloadTimer);
  _msgReloadTimer = setTimeout(loadConversations, 400);
}

function updateMessageBadge() {
  const n = MSG.list.reduce((s, c) => s + (c.unread || 0), 0);
  document.querySelectorAll('.js-msg-count').forEach(el => {
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  });
}

// ---- the list -------------------------------------------------------------
function renderConversationList() {
  const box = document.getElementById('msg-list');
  if (!box) return;
  const rows = MSG.list.filter(c => (MSG.filter === 'active') === !!c.can_send);
  if (!rows.length) {
    const rider = CURRENT_PROFILE?.role === 'rider';
    box.innerHTML = emptyState(MSG.filter === 'active'
      ? { icon: 'fa-comments', title: 'No active chats', body: rider ? 'Accept a booking to message the customer here.' : 'When a rider takes your booking, you can message each other here.' }
      : { icon: 'fa-box-archive', title: 'No past chats', body: 'Finished trips keep their messages here, read-only.' });
    return;
  }
  box.innerHTML = rows.map(c => {
    const [kindLabel, kindIcon] = MSG_KIND[c.booking_type] || ['Booking', 'fa-box'];
    const last = c.last_at
      ? (c.last_mine ? 'You: ' : '') + (c.last_has_photo && !c.last_body ? '📷 Photo' : c.last_body)
      : 'No messages yet — say hello';
    const isOpen = MSG.open && MSG.open.kind === c.booking_type && MSG.open.id === c.booking_id;
    return `<button type="button" class="msg-row${isOpen ? ' is-open' : ''}${c.unread ? ' has-unread' : ''}" data-kind="${c.booking_type}" data-id="${c.booking_id}">
      ${msgFace(c)}
      <span class="msg-row__main">
        <span class="msg-row__top"><strong>${escapeHtml(c.other_name || 'iTULOD user')}</strong><time>${escapeHtml(msgTime(c.last_at || c.sort_at))}</time></span>
        <span class="msg-row__route"><i class="fa-solid ${kindIcon}"></i> ${escapeHtml(kindLabel)} · ${escapeHtml(c.route || '')}</span>
        <span class="msg-row__last">${escapeHtml(last || '')}</span>
      </span>
      ${c.unread ? `<span class="msg-row__count">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}
    </button>`;
  }).join('');
}

// ---- one conversation -----------------------------------------------------
function msgEmptyThread() {
  return `<div class="msg-thread-empty"><i class="fa-regular fa-comments"></i><p>Pick a conversation to read and reply.</p></div>`;
}

async function openConversation(kind, id) {
  if (!MSG_KIND[kind] || !id) return;
  if (!MSG.loaded) { MSG.pendingOpen = { kind, id }; return; }
  const c = msgConvo(kind, id);
  if (!c) {
    if (MSG.open?.id !== id) toast('That conversation is no longer available.', 'info');
    return;
  }
  if (c.can_send !== (MSG.filter === 'active')) {
    MSG.filter = c.can_send ? 'active' : 'past';
    document.querySelectorAll('#msg-filter .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === MSG.filter));
  }
  MSG.open = { kind, id };
  writeViewHash('messages', kind + '/' + id);
  document.getElementById('msg-shell')?.classList.add('has-open');
  renderConversationList();

  const pane = document.getElementById('msg-thread');
  pane.innerHTML = `
    <header class="msg-thread-head" id="msg-thread-head"></header>
    <div class="msg-bubbles" id="msg-bubbles">${skeletonList(2)}</div>
    <div class="msg-compose" id="msg-compose"></div>`;
  renderThreadHeader();
  renderComposer();

  const { data, error } = await supabase.from('booking_messages')
    .select('id, sender_id, body, image_path, created_at')
    .eq('booking_type', kind).eq('booking_id', id)
    .order('created_at', { ascending: true }).limit(300);
  if (MSG.open?.id !== id) return; // switched away meanwhile
  if (error) { document.getElementById('msg-bubbles').innerHTML = `<p class="muted msg-pad">Could not load messages.</p>`; return; }
  MSG.messages = data || [];
  await signPhotos(MSG.messages);
  renderBubbles(true);
  markOpenRead();
}

function closeConversation() {
  MSG.open = null;
  MSG.messages = [];
  writeViewHash('messages');
  document.getElementById('msg-shell')?.classList.remove('has-open');
  const pane = document.getElementById('msg-thread');
  if (pane) pane.innerHTML = msgEmptyThread();
  renderConversationList();
}

function renderThreadHeader() {
  const head = document.getElementById('msg-thread-head');
  const c = MSG.open && msgConvo(MSG.open.kind, MSG.open.id);
  if (!head || !c) return;
  const [kindLabel, kindIcon] = MSG_KIND[c.booking_type] || ['Booking', 'fa-box'];
  const tel = c.other_phone ? 'tel:' + c.other_phone.replace(/[^\d+]/g, '') : '';
  head.innerHTML = `
    <button type="button" class="msg-back" onclick="closeConversation()" aria-label="Back to all messages"><i class="fa-solid fa-arrow-left"></i></button>
    ${msgFace(c, 'msg-face msg-face--lg')}
    <div class="msg-thread-head__who">
      <strong>${escapeHtml(c.other_name || 'iTULOD user')}</strong>
      <span>${c.vehicle ? escapeHtml(c.vehicle) + ' · ' : ''}<i class="fa-solid ${kindIcon}"></i> ${escapeHtml(kindLabel)} · ${escapeHtml(c.route || '')}</span>
    </div>
    <div class="msg-thread-head__actions">
      ${statusBadge(c.status)}
      ${tel ? `<a class="btn btn-primary btn-sm" href="${tel}" title="Call ${escapeHtml(c.other_name || '')}"><i class="fa-solid fa-phone"></i><span> Call</span></a>` : ''}
      <button type="button" class="btn btn-outline btn-sm" onclick="openBookingDetails({ kind: '${c.booking_type}', id: '${c.booking_id}' })"><i class="fa-solid fa-receipt"></i><span> Booking</span></button>
    </div>`;
}

function renderComposer() {
  const box = document.getElementById('msg-compose');
  const c = MSG.open && msgConvo(MSG.open.kind, MSG.open.id);
  if (!box || !c) return;
  if (!c.can_send) {
    box.innerHTML = `<p class="msg-readonly"><i class="fa-solid fa-lock"></i> This booking is ${escapeHtml(String(c.status).replace(/_/g, ' '))} — the chat is read-only now.</p>`;
    return;
  }
  const quick = MSG_QUICK[c.i_am] || [];
  box.innerHTML = `
    <div class="msg-quick">${quick.map(q => `<button type="button" class="msg-chip">${escapeHtml(q)}</button>`).join('')}</div>
    <form class="msg-form" id="msg-form">
      <label class="msg-photo-btn" title="Send a photo">
        <i class="fa-solid fa-camera"></i>
        <input type="file" id="msg-photo" accept="image/jpeg,image/png,image/webp" hidden />
      </label>
      <input type="text" id="msg-input" placeholder="Type a message…" maxlength="1000" autocomplete="off" />
      <button type="submit" class="btn btn-primary btn-sm" id="msg-send" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
    </form>`;
  box.querySelector('.msg-quick').addEventListener('click', (e) => {
    const chip = e.target.closest('.msg-chip');
    if (chip) sendMessage({ body: chip.textContent });
  });
  document.getElementById('msg-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('msg-input');
    const body = input.value.trim();
    if (!body) return;
    sendMessage({ body }).then(ok => { if (ok) input.value = ''; });
  });
  document.getElementById('msg-photo').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) sendPhoto(file);
  });
}

function renderBubbles(scroll) {
  const box = document.getElementById('msg-bubbles');
  const c = MSG.open && msgConvo(MSG.open.kind, MSG.open.id);
  if (!box || !c) return;
  const me = CURRENT_PROFILE?.id;
  if (!MSG.messages.length) {
    box.innerHTML = `<p class="msg-hello">No messages yet — say hello to ${escapeHtml((c.other_name || '').split(' ')[0] || 'them')}!</p>`;
    return;
  }
  const lastMine = [...MSG.messages].reverse().find(m => m.sender_id === me);
  const seen = lastMine && c.other_read_at && new Date(c.other_read_at) >= new Date(lastMine.created_at);
  let day = '';
  box.innerHTML = MSG.messages.map(m => {
    const mine = m.sender_id === me;
    const d = new Date(m.created_at).toDateString();
    const divider = d !== day ? `<div class="msg-day">${escapeHtml(new Date(m.created_at).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }))}</div>` : '';
    day = d;
    const photo = m.image_path
      ? (MSG.photoUrls[m.image_path]
        ? `<a href="${escapeHtml(MSG.photoUrls[m.image_path])}" target="_blank" rel="noopener" class="msg-photo"><img src="${escapeHtml(MSG.photoUrls[m.image_path])}" alt="Photo" loading="lazy"></a>`
        : `<span class="msg-photo msg-photo--missing"><i class="fa-regular fa-image"></i> Photo unavailable</span>`)
      : '';
    return `${divider}<div class="msg-bubble${mine ? ' mine' : ''}">
      ${photo}${m.body ? `<p>${escapeHtml(m.body)}</p>` : ''}
      <time>${escapeHtml(new Date(m.created_at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }))}</time>
    </div>${m === lastMine && seen ? '<div class="msg-seen"><i class="fa-solid fa-check-double"></i> Seen</div>' : ''}`;
  }).join('');
  if (scroll) box.scrollTop = box.scrollHeight;
}

async function signPhotos(messages) {
  const paths = messages.map(m => m.image_path).filter(p => p && !MSG.photoUrls[p]);
  if (!paths.length) return;
  const { data } = await supabase.storage.from('chat-photos').createSignedUrls(paths, 3600);
  for (const s of data || []) if (s.signedUrl) MSG.photoUrls[s.path] = s.signedUrl;
}

// ---- sending --------------------------------------------------------------
async function sendMessage({ body = '', image_path = null }) {
  const open = MSG.open;
  if (!open || !CURRENT_PROFILE) return false;
  const btn = document.getElementById('msg-send');
  if (btn) setLoading(btn, true);
  const { data, error } = await supabase.from('booking_messages')
    .insert({ booking_type: open.kind, booking_id: open.id, sender_id: CURRENT_PROFILE.id, body, image_path })
    .select('id, sender_id, body, image_path, created_at').single();
  if (btn) setLoading(btn, false);
  if (error) {
    toast(/row-level security/i.test(error.message) ? 'This chat is closed — the booking is no longer active.' : error.message, 'error');
    reloadConversationsSoon();
    return false;
  }
  if (MSG.open?.id === open.id && !MSG.messages.some(m => m.id === data.id)) {
    MSG.messages.push(data);
    await signPhotos([data]);
    renderBubbles(true);
  }
  reloadConversationsSoon();
  return true;
}

// Phone photos are big: shrink to 1600px JPEG before sending.
function shrinkPhoto(file) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => { URL.revokeObjectURL(img.src); resolve(blob || file); }, 'image/jpeg', 0.85);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function sendPhoto(file) {
  const open = MSG.open;
  if (!open) return;
  if (!MSG_PHOTO_TYPES.includes(file.type)) { toast('Send a JPG, PNG or WebP photo.', 'error'); return; }
  const blob = await shrinkPhoto(file);
  if (blob.size > 5 * 1024 * 1024) { toast('That photo is too big (5 MB max).', 'error'); return; }
  const path = `${open.kind}/${open.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  toast('Sending photo…', 'info');
  const { error } = await supabase.storage.from('chat-photos').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) { toast('Could not send the photo: ' + error.message, 'error'); return; }
  await sendMessage({ image_path: path });
}

// ---- live updates ---------------------------------------------------------
async function onNewMessage(m) {
  if (!m) return;
  const isOpen = MSG.open && MSG.open.kind === m.booking_type && MSG.open.id === m.booking_id;
  if (isOpen && !MSG.messages.some(x => x.id === m.id)) {
    MSG.messages.push(m);
    await signPhotos([m]);
    renderBubbles(true);
    if (m.sender_id !== CURRENT_PROFILE?.id) markOpenRead();
  }
  reloadConversationsSoon();
}

function onReadReceipt(r) {
  if (!r || r.user_id === CURRENT_PROFILE?.id) return;
  const c = msgConvo(r.booking_type, r.booking_id);
  if (!c) return;
  c.other_read_at = r.last_read_at;
  if (MSG.open && MSG.open.kind === r.booking_type && MSG.open.id === r.booking_id) renderBubbles(false);
}

// Reading the open chat while the Messages section is on screen.
function markOpenRead() {
  const open = MSG.open;
  if (!open || document.hidden || !document.getElementById('tab-messages')?.classList.contains('active')) return;
  const c = msgConvo(open.kind, open.id);
  if (c) { c.unread = 0; updateMessageBadge(); renderConversationList(); }
  // (a query only runs once it's awaited or then'd)
  supabase.rpc('mark_conversation_read', { p_type: open.kind, p_id: open.id })
    .then(({ error }) => { if (error) console.warn('mark_conversation_read:', error.message); });
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) markOpenRead(); });

// Called by activateTab('messages').
function onMessagesShown() {
  if (MSG.open) {
    writeViewHash('messages', MSG.open.kind + '/' + MSG.open.id);
    markOpenRead();
    const box = document.getElementById('msg-bubbles');
    if (box) box.scrollTop = box.scrollHeight;
  }
  reloadConversationsSoon();
}

// From booking details / a booking card: open that booking's chat.
function openBookingChat(kind, id) {
  if (typeof closeBookingDetails === 'function') closeBookingDetails();
  if (typeof activateTab === 'function') activateTab('messages');
  MSG.pendingOpen = { kind, id }; // opened once the list is (re)loaded
  if (MSG.loaded) loadConversations();
}
