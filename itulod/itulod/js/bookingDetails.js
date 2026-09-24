// iTULOD — Booking details modal
// Opened when a customer clicks a booking card in history, or a rider clicks
// a booking request / accepted booking card.
// Displays full booking info: route (+ map), fare, payment, rider, vehicle & documents.

(function () {

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  function kindTable(kind) {
    return { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' }[kind];
  }

  function ratingStars(n) {
    if (!n) return '<span style="color:var(--text-muted)">Not yet rated</span>';
    return '<span style="color:#e0a200">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
  }

  function paymentMethodLabel(method) {
    return { cash: '💵 Cash', gcash: '📱 GCash', wallet: '👛 Wallet', card: '💳 Card' }[method] || method || '—';
  }

  function paymentStatusBadge(status) {
    if (!status) return '';
    const cls = { paid: 'badge--completed', failed: 'badge--cancelled', pending: 'badge--pending', refunded: 'badge--cancelled' }[status] || 'badge--pending';
    return `<span class="badge ${cls}">${status}</span>`;
  }

  function row(label, value) {
    return `<div class="bd-row"><span>${label}</span><strong>${value}</strong></div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Main open function                                                   */
  /* ------------------------------------------------------------------ */

  async function openBookingDetails({ kind, id }) {
    const overlay = document.getElementById('booking-details-modal-overlay');
    const modal   = document.getElementById('booking-details-modal');
    if (!overlay || !modal) { toast('Booking details modal not found.', 'error'); return; }

    overlay.style.display = 'flex'; // matches .modal-overlay.open — centres the modal
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const body = document.getElementById('booking-details-body');
    body.innerHTML = `<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading details…</div>`;

    try {
      const table = kindTable(kind);
      if (!table) throw new Error('Unknown booking type: ' + kind);

      /* ---- 1. Fetch the booking row ---- */
      const { data: booking, error: bookingErr } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single();
      if (bookingErr) throw bookingErr;
      if (!booking)   throw new Error('Booking not found.');

      const riderId  = booking.rider_id  || null;
      const vehicleId = booking.vehicle_id || null;

      /* ---- 2. Fetch rider profile, rider application, and vehicle in parallel ---- */
      const [profileResult, appResult, vehicleResult] = await Promise.all([
        riderId
          ? supabase.from('profiles')
              .select('id, full_name, phone, avatar_url')
              .eq('id', riderId)
              .maybeSingle()
          : Promise.resolve({ data: null }),

        riderId
          ? supabase.from('rider_applications')
              .select('vehicle_type, vehicle_plate, license_number, license_url, or_cr_url, status')
              .eq('rider_id', riderId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),

        vehicleId
          ? supabase.from('vehicles')
              .select('name, icon, base_fare, per_km_rate')
              .eq('id', vehicleId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const riderProfile     = profileResult.data  || null;
      const riderApplication = appResult.data       || null;
      const vehicle          = vehicleResult.data   || null;

      /* ---- 2b. Ride stops (transport only) ---- */
      const rideStops = kind === 'transport'
        ? (await supabase.from('ride_stops').select('*').eq('booking_id', id).order('stop_order', { ascending: true })).data || []
        : [];

      /* ---- 2c. Order items (food only, cart-based orders) ---- */
      const orderItems = kind === 'food'
        ? (await supabase.from('food_order_items').select('*').eq('food_delivery_id', id).order('created_at', { ascending: true })).data || []
        : [];

      /* ---- 3. Build title ---- */
      const title = kind === 'transport'
        ? `${booking.pickup_address} → ${booking.destination_address}`
        : kind === 'food'
          ? `${booking.restaurant_name} → ${booking.delivery_address}`
          : `${booking.sender_name} → ${booking.receiver_name}`;

      /* ---- 4. Route / booking details section ---- */
      const routePickup  = kind === 'transport' ? booking.pickup_address
        : kind === 'food' ? booking.pickup_address
        : booking.sender_address;
      const routeDropoff = kind === 'transport' ? booking.destination_address
        : kind === 'food' ? booking.delivery_address
        : booking.receiver_address;

      const liveTrackable = booking.rider_id && ['accepted', 'ongoing'].includes(booking.status);
      const mapSection = (routePickup && routeDropoff) ? `
        <button type="button" class="btn btn-outline btn-block bd-map-toggle" id="bd-map-toggle">
          <i class="fa-solid fa-map-location-dot"></i> ${liveTrackable ? 'Track rider on map' : 'View route on map'}
        </button>
        <p id="bd-eta" class="bd-eta" hidden></p>
        <div class="bd-map" id="bd-map" hidden>
          <div class="bd-map-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading route…</div>
        </div>
      ` : '';

      const canManageStops = riderId && ['accepted', 'ongoing'].includes(booking.status);
      const stopsRows = rideStops.map(s => `
        <div class="bd-row" data-stop-row="${s.id}">
          <span>${s.arrived_at ? '<i class="fa-solid fa-circle-check" style="color:var(--green)"></i>' : '<i class="fa-regular fa-circle"></i>'} Stop ${s.stop_order}: ${escapeHtml(s.address)}</span>
          ${(!s.arrived_at && canManageStops) ? `<button type="button" class="btn btn-outline btn-sm bd-stop-arrive-btn" data-stop-id="${s.id}" style="display:none">Mark arrived</button>` : ''}
        </div>`).join('');

      let routeSection = '';
      if (kind === 'transport') {
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-route"></i> Trip Details</h4>
            ${row('<i class="fa-solid fa-location-dot"></i> Pickup',      escapeHtml(booking.pickup_address || '—'))}
            ${rideStops.length ? `<div class="bd-stops-list">${stopsRows}</div>` : ''}
            ${row('<i class="fa-solid fa-flag-checkered"></i> Destination', escapeHtml(booking.destination_address || '—'))}
            ${booking.distance_km ? row('<i class="fa-solid fa-road"></i> Distance', booking.distance_km + ' km') : ''}
            ${mapSection}
          </div>`;
      } else if (kind === 'food') {
        const itemsRows = orderItems.map(it => `
          <div class="bd-row">
            <span>${it.quantity} × ${escapeHtml(it.name)}</span>
            <strong>${peso(it.subtotal)}</strong>
          </div>`).join('');
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-utensils"></i> Food Delivery Details</h4>
            ${row('<i class="fa-solid fa-store"></i> Restaurant',   escapeHtml(booking.restaurant_name || '—'))}
            ${row('<i class="fa-solid fa-location-dot"></i> Pickup', escapeHtml(booking.pickup_address || '—'))}
            ${row('<i class="fa-solid fa-flag-checkered"></i> Deliver to', escapeHtml(booking.delivery_address || '—'))}
            ${booking.instructions ? row('<i class="fa-solid fa-note-sticky"></i> Instructions', escapeHtml(booking.instructions)) : ''}
            ${orderItems.length ? `
              <div style="margin-top:10px">
                <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Order</div>
                <div class="bd-stops-list">${itemsRows}</div>
              </div>` : ''}
            ${mapSection}
          </div>`;
      } else {
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-box"></i> Parcel Details</h4>
            ${row('<i class="fa-solid fa-user"></i> Sender',    escapeHtml(booking.sender_name || '—') + (booking.sender_phone ? ' · ' + escapeHtml(booking.sender_phone) : ''))}
            ${row('<i class="fa-solid fa-location-dot"></i> Pickup address', escapeHtml(booking.sender_address || '—'))}
            ${row('<i class="fa-solid fa-user-check"></i> Receiver', escapeHtml(booking.receiver_name || '—') + (booking.receiver_phone ? ' · ' + escapeHtml(booking.receiver_phone) : ''))}
            ${row('<i class="fa-solid fa-flag-checkered"></i> Drop-off address', escapeHtml(booking.receiver_address || '—'))}
            ${booking.parcel_size        ? row('<i class="fa-solid fa-cube"></i> Parcel size',    escapeHtml(booking.parcel_size)) : ''}
            ${booking.parcel_weight      ? row('<i class="fa-solid fa-weight-hanging"></i> Weight', booking.parcel_weight + ' kg') : ''}
            ${booking.parcel_description ? row('<i class="fa-solid fa-tag"></i> Description',     escapeHtml(booking.parcel_description)) : ''}
            ${booking.instructions       ? row('<i class="fa-solid fa-note-sticky"></i> Instructions', escapeHtml(booking.instructions)) : ''}
            ${mapSection}
          </div>`;
      }

      /* ---- 5. Fare & payment section ---- */
      const fare = booking.final_fare ?? booking.estimated_fare;
      const fareSection = `
        <div class="bd-section">
          <h4><i class="fa-solid fa-peso-sign"></i> Fare & Payment</h4>
          ${booking.item_subtotal != null ? row('Item subtotal', peso(booking.item_subtotal)) : ''}
          ${booking.delivery_fee  != null ? row('Delivery fee',  peso(booking.delivery_fee))  : ''}
          ${booking.estimated_fare ? row('Estimated fare', peso(booking.estimated_fare)) : ''}
          ${booking.final_fare     ? row('Final fare',     peso(booking.final_fare))     : ''}
          ${!booking.estimated_fare && !booking.final_fare ? row('Fare', '—') : ''}
          ${booking.distance_km && kind === 'transport' ? row('Distance', booking.distance_km + ' km') : ''}
          ${booking.payment_method ? row('Payment method', paymentMethodLabel(booking.payment_method)) : ''}
          ${booking.payment_status ? row('Payment status', paymentStatusBadge(booking.payment_status)) : ''}
          ${booking.tip_amount        ? row('Tip',                peso(booking.tip_amount))        : ''}
          ${booking.cancellation_fee  ? row('Cancellation fee',   peso(booking.cancellation_fee))   : ''}
          ${booking.rating         ? row('Your rating',    ratingStars(booking.rating))  : ''}
          ${booking.review         ? row('Your review',    escapeHtml(booking.review))    : ''}
        </div>`;

      /* ---- 6. Vehicle section ---- */
      // Prefer the vehicle from the `vehicles` table (booked vehicle_id).
      // Fall back to what the rider wrote in their application.
      const vehicleName  = vehicle?.name || riderApplication?.vehicle_type || null;
      const vehiclePlate = riderApplication?.vehicle_plate || null;
      const vehicleLicense = riderApplication?.license_number || null;

      const vehicleSection = vehicleName ? `
        <div class="bd-section">
          <h4><i class="fa-solid fa-car"></i> Vehicle</h4>
          ${row('Vehicle type',  escapeHtml(vehicleName))}
          ${vehiclePlate   ? row('Plate number',   escapeHtml(vehiclePlate))   : ''}
          ${vehicleLicense ? row('License number', escapeHtml(vehicleLicense)) : ''}
          ${vehicle?.base_fare   ? row('Base fare',    peso(vehicle.base_fare)) : ''}
          ${vehicle?.per_km_rate ? row('Rate per km',  peso(vehicle.per_km_rate) + '/km') : ''}
        </div>` : '';

      /* ---- 7. Rider section ---- */
      let riderSection = '';
      if (riderId && riderProfile) {
        // Rider profile was readable (RLS allows it)
        const avatarHtml = riderProfile.avatar_url
          ? `<img src="${riderProfile.avatar_url}" class="bd-avatar" alt="Rider photo">`
          : `<div class="bd-avatar bd-avatar--initials">${(riderProfile.full_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</div>`;

        const appStatus = riderApplication?.status;
        riderSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-motorcycle"></i> Rider</h4>
            <div class="bd-rider-card">
              ${avatarHtml}
              <div class="bd-rider-info">
                <strong>${escapeHtml(riderProfile.full_name || '—')}</strong>
                ${riderProfile.phone ? `<span><i class="fa-solid fa-phone"></i> ${escapeHtml(riderProfile.phone)}</span>` : ''}
                ${appStatus ? `<span>${statusBadge(appStatus)}</span>` : ''}
              </div>
            </div>
          </div>`;
      } else if (riderId && !riderProfile) {
        // Rider assigned but couldn't load profile (RLS not yet updated — show ID)
        riderSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-motorcycle"></i> Rider</h4>
            <p class="muted" style="font-size:0.85rem">
              Rider assigned — run the RLS fix SQL in Supabase to display rider details.<br>
              <code style="font-size:0.78rem;opacity:0.7">${riderId}</code>
            </p>
          </div>`;
      } else {
        riderSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-user-clock"></i> Rider</h4>
            <p class="muted">No rider assigned yet — waiting for a rider to accept.</p>
          </div>`;
      }

      /* ---- 8. Documents section ---- */
      const hasLicense = riderApplication?.license_url;
      const hasOrcr    = riderApplication?.or_cr_url;
      const docsSection = (hasLicense || hasOrcr) ? `
        <div class="bd-section">
          <h4><i class="fa-solid fa-id-card"></i> Rider Documents</h4>
          <div class="bd-doc-grid">
            ${hasLicense ? `<div class="bd-doc"><strong>Driver's License</strong><a href="${riderApplication.license_url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a></div>` : ''}
            ${hasOrcr    ? `<div class="bd-doc"><strong>OR / CR</strong><a href="${riderApplication.or_cr_url}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a></div>` : ''}
          </div>
        </div>` : '';

      /* ---- 8b. Expiration / grace-period context ----
         Bookings auto-expire after a 15-minute grace period: pending ones if
         no rider accepts, accepted ones if the rider never starts the job.
         See sql/009_booking_expiration.sql. */
      let statusNote = '';
      if (booking.status === 'expired') {
        statusNote = `<div class="bd-status-note bd-status-note--warning">
          <i class="fa-solid fa-hourglass-end"></i>
          <span>This booking has expired because the scheduled date and time has already passed.</span>
        </div>`;
      } else if (booking.status === 'no_show') {
        statusNote = `<div class="bd-status-note bd-status-note--warning">
          <i class="fa-solid fa-user-slash"></i>
          <span>This booking was marked as a no-show by the rider.</span>
        </div>`;
      } else if (booking.status === 'pending' || booking.status === 'accepted') {
        statusNote = `<div class="bd-status-note bd-status-note--info">
          <i class="fa-regular fa-clock"></i>
          <span>You have a 15-minute grace period after your scheduled booking time —
            ${booking.status === 'pending'
              ? 'if no rider accepts within that window, this request expires automatically.'
              : "if your rider doesn't start the trip within that window, it expires automatically."}
          </span>
        </div>`;
      }

      /* ---- 8c. Proof of delivery (food/parcel only) ---- */
      const proofSection = (kind !== 'transport' && booking.delivery_proof_url) ? `
        <div class="bd-section">
          <h4><i class="fa-solid fa-camera"></i> Proof of Delivery</h4>
          <a href="${booking.delivery_proof_url}" target="_blank" rel="noopener noreferrer">
            <img src="${booking.delivery_proof_url}" alt="Proof of delivery" style="width:100%;max-width:320px;border-radius:var(--radius-sm);border:1px solid var(--border);display:block">
          </a>
        </div>` : '';

      /* ---- 8d. Chat — only once a rider is assigned. Sending is gated to
         'accepted'/'ongoing' by RLS; a finished trip still shows the thread,
         just without the composer. */
      const canChat = riderId && ['accepted', 'ongoing'].includes(booking.status);
      const chatSection = riderId ? `
        <div class="bd-section">
          <h4><i class="fa-solid fa-comment-dots"></i> Messages</h4>
          <div class="bd-chat-messages" id="bd-chat-messages">
            <p class="muted" style="font-size:0.85rem">Loading…</p>
          </div>
          ${canChat ? `
            <form id="bd-chat-form" style="display:flex;gap:8px;margin-top:10px">
              <input type="text" id="bd-chat-input" placeholder="Type a message…" maxlength="1000" style="flex:1" autocomplete="off" />
              <button type="submit" class="btn btn-primary btn-sm" id="bd-chat-send"><i class="fa-solid fa-paper-plane"></i></button>
            </form>
          ` : `<p class="muted" style="font-size:0.8rem;margin-top:8px">This thread is read-only now that the booking is ${escapeHtml(booking.status)}.</p>`}
        </div>` : '';

      /* ---- 9. Render ---- */
      body.innerHTML = `
        <div class="bd-header">
          <div class="bd-kind-pill">
            <i class="fa-solid ${kind === 'transport' ? 'fa-car' : kind === 'food' ? 'fa-utensils' : 'fa-box'}"></i>
            ${kind.charAt(0).toUpperCase() + kind.slice(1)}
          </div>
          <h2>${escapeHtml(title)}</h2>
          <div class="bd-sub">
            ${formatDate(booking.created_at)}
            &nbsp;·&nbsp;
            ${statusBadge(booking.status)}
            &nbsp;·&nbsp;
            <strong>${peso(fare)}</strong>
          </div>
        </div>
        ${statusNote}
        ${routeSection}
        ${fareSection}
        ${vehicleSection}
        ${riderSection}
        ${docsSection}
        ${proofSection}
        ${chatSection}
        <div class="bd-section">
          <button type="button" class="btn btn-outline btn-block btn-sm" onclick="typeof openSupportRequestModal === 'function' && openSupportRequestModal({ kind: '${kind}', id: '${booking.id}' })">
            <i class="fa-solid fa-circle-question"></i> Report an issue with this booking
          </button>
        </div>
      `;

      if (riderId) {
        initChat({ kind, id: booking.id, canSend: canChat });
      }
      if (rideStops.length) {
        initStopControls({ kind, id: booking.id, riderId, stops: rideStops });
      }

      /* ---- 10. Route map — built on demand from the "View route on map" button.
         Shows the pickup and drop-off markers with the driving route between
         them. Kept out of the initial render so the details modal stays light. */
      if (routePickup && routeDropoff && typeof initBookingDetailsMap === 'function') {
        const toggle = document.getElementById('bd-map-toggle');
        const mapEl = document.getElementById('bd-map');
        const openLabel = `<i class="fa-solid fa-map-location-dot"></i> ${liveTrackable ? 'Track rider on map' : 'View route on map'}`;
        toggle?.addEventListener('click', async () => {
          const opening = mapEl.hidden;
          mapEl.hidden = !opening;
          toggle.innerHTML = opening
            ? '<i class="fa-solid fa-chevron-up"></i> Hide map'
            : openLabel;
          if (!opening) {
            if (typeof stopTrackingRider === 'function') stopTrackingRider();
            if (typeof destroyBookingDetailsMap === 'function') destroyBookingDetailsMap();
            mapEl.innerHTML = '<div class="bd-map-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading route…</div>';
            return;
          }
          try {
            if (typeof loadMapbox === 'function') await loadMapbox();
            initBookingDetailsMap('bd-map');
            showBookingDetailsRoute(routePickup, routeDropoff, rideStops.map(s => s.address));
            mapEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            // Live rider position while the trip is active
            if (booking.rider_id && ['accepted', 'ongoing'].includes(booking.status)
                && typeof trackRiderOnBookingMap === 'function') {
              trackRiderOnBookingMap(booking.rider_id, booking.status, routePickup, routeDropoff);
            }
          } catch (err) {
            console.error('Booking-details map failed:', err);
            mapEl.innerHTML = '<div class="bd-map-loading">Map unavailable right now.</div>';
          }
        });
      }

    } catch (err) {
      console.error('Booking details failed to render:', err);
      const msg = err?.message || String(err);
      body.innerHTML = emptyState({
        icon: 'fa-triangle-exclamation',
        title: 'Could not load this booking',
        body: msg,
        tone: 'error'
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Chat                                                                 */
  /* ------------------------------------------------------------------ */

  let CHAT_CHANNEL = null;

  function renderChatMessages(messages, myId) {
    const el = document.getElementById('bd-chat-messages');
    if (!el) return;
    if (!messages.length) {
      el.innerHTML = `<p class="muted" style="font-size:0.85rem">No messages yet — say hello!</p>`;
      return;
    }
    el.innerHTML = messages.map(m => {
      const mine = m.sender_id === myId;
      return `<div style="display:flex;justify-content:${mine ? 'flex-end' : 'flex-start'};margin-bottom:8px">
        <div style="max-width:75%;padding:8px 12px;border-radius:14px;font-size:0.85rem;background:${mine ? 'var(--blue)' : 'var(--bg-alt, #f1f3f5)'};color:${mine ? '#fff' : 'inherit'}">
          <div>${escapeHtml(m.body)}</div>
          <div style="font-size:0.7rem;opacity:0.7;margin-top:2px">${formatDate(m.created_at)}</div>
        </div>
      </div>`;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  async function initChat({ kind, id, canSend }) {
    const { data: { session } } = await supabase.auth.getSession();
    const myId = session?.user?.id;
    if (!myId) return;

    const { data: messages, error } = await supabase
      .from('booking_messages')
      .select('*')
      .eq('booking_type', kind)
      .eq('booking_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      const el = document.getElementById('bd-chat-messages');
      if (el) el.innerHTML = `<p class="muted" style="font-size:0.85rem">Could not load messages.</p>`;
      return;
    }
    renderChatMessages(messages || [], myId);

    if (CHAT_CHANNEL) { supabase.removeChannel(CHAT_CHANNEL); CHAT_CHANNEL = null; }
    CHAT_CHANNEL = supabase
      .channel(`booking-chat-${kind}-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'booking_messages', filter: `booking_id=eq.${id}` }, () => {
        if (!document.getElementById('bd-chat-messages')) return; // modal has since closed
        supabase.from('booking_messages').select('*').eq('booking_type', kind).eq('booking_id', id).order('created_at', { ascending: true })
          .then(({ data }) => renderChatMessages(data || [], myId));
      })
      .subscribe();

    const form = document.getElementById('bd-chat-form');
    if (form && canSend) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('bd-chat-input');
        const body = input.value.trim();
        if (!body) return;
        const btn = document.getElementById('bd-chat-send');
        setLoading(btn, true);
        const { error: sendErr } = await supabase.from('booking_messages').insert({
          booking_type: kind, booking_id: id, sender_id: myId, body,
        });
        setLoading(btn, false);
        if (sendErr) { toast(sendErr.message, 'error'); return; }
        input.value = '';
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Multi-stop rides — only the assigned rider, only for the first      */
  /* not-yet-arrived stop, keeping stops worked through in order.        */
  /* ------------------------------------------------------------------ */

  async function initStopControls({ kind, id, riderId, stops }) {
    const nextStop = stops.find(s => !s.arrived_at);
    if (!nextStop) return;
    const btn = document.querySelector(`.bd-stop-arrive-btn[data-stop-id="${nextStop.id}"]`);
    if (!btn) return; // no rider assigned, or the trip isn't accepted/ongoing — canManageStops was false

    // The button element only exists when canManageStops was true (rider
    // assigned, trip accepted/ongoing) — but the customer views the same
    // markup, so also check *this* viewer is that rider before revealing it.
    // RLS enforces the real security boundary; this just avoids showing the
    // customer a button that would error if clicked.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id !== riderId) return;

    btn.style.display = '';
    btn.addEventListener('click', async () => {
      setLoading(btn, true);
      const { error } = await supabase.from('ride_stops').update({ arrived_at: new Date().toISOString() }).eq('id', nextStop.id);
      setLoading(btn, false);
      if (error) { toast(error.message, 'error'); return; }
      toast(`Marked stop ${nextStop.stop_order} arrived.`, 'success');
      openBookingDetails({ kind, id }); // re-render to advance to the next stop
    });
  }

  /* ------------------------------------------------------------------ */
  /* Close                                                                */
  /* ------------------------------------------------------------------ */

  function closeBookingDetails() {
    const overlay = document.getElementById('booking-details-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    if (typeof stopTrackingRider === 'function') stopTrackingRider();
    if (typeof destroyBookingDetailsMap === 'function') destroyBookingDetailsMap();
    if (CHAT_CHANNEL) { supabase.removeChannel(CHAT_CHANNEL); CHAT_CHANNEL = null; }
    const body = document.getElementById('booking-details-body');
    if (body) body.innerHTML = '';
  }

  window.openBookingDetails  = openBookingDetails;
  window.closeBookingDetails = closeBookingDetails;
})();
