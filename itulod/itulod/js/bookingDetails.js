// iTULOD — Booking details modal
// Opened when a customer clicks a booking card in history, or a rider clicks
// a booking request / accepted booking card.
// Displays full booking info: route (+ map), fare, payment, rider, vehicle & documents.

(function () {

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  const ICON_BY_KIND_DETAILS = { transport: 'fa-car', food: 'fa-utensils', parcel: 'fa-box', hauling: 'fa-truck-moving' };

  function kindTable(kind) {
    return { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries', hauling: 'hauling_bookings' }[kind];
  }

  function ratingStars(n) {
    if (!n) return '<span class="muted">Not yet rated</span>';
    return '<span class="bd-stars">' + '★'.repeat(n) + '<span class="bd-stars__off">' + '★'.repeat(5 - n) + '</span></span>';
  }

  const PAYMENT_METHOD = {
    cash:   { icon: 'fa-money-bill-wave', label: 'Cash' },
    gcash:  { icon: 'fa-mobile-screen-button', label: 'GCash' },
    wallet: { icon: 'fa-wallet', label: 'Wallet' },
    card:   { icon: 'fa-credit-card', label: 'Card' },
  };
  function paymentMethodLabel(method) {
    const m = PAYMENT_METHOD[method];
    return m ? `<i class="fa-solid ${m.icon}"></i> ${m.label}` : escapeHtml(method || '—');
  }

  // Pickup → (stops) → drop-off drawn as a vertical route line.
  function routeBlock(fromLabel, from, toLabel, to, stopsHtml = '') {
    return `
      <div class="bd-route">
        <div class="bd-route__pt bd-route__pt--from">
          <span class="bd-route__label">${fromLabel}</span>
          <span class="bd-route__addr">${escapeHtml(from || '—')}</span>
        </div>
        ${stopsHtml ? `<div class="bd-route__stops">${stopsHtml}</div>` : ''}
        <div class="bd-route__pt bd-route__pt--to">
          <span class="bd-route__label">${toLabel}</span>
          <span class="bd-route__addr">${escapeHtml(to || '—')}</span>
        </div>
      </div>`;
  }

  // Booked → Accepted → In progress → Done, with the times we know.
  // A cancelled / expired / no-show booking ends in a red step where it stopped.
  const PROGRESS_LABEL = {
    transport: ['Trip started', 'Arrived'],
    food:      ['Order picked up', 'Delivered'],
    parcel:    ['Parcel picked up', 'Delivered'],
    hauling:   ['Loaded, on the way', 'Delivered'],
  };
  const ENDED_LABEL = { cancelled: 'Cancelled', expired: 'Expired', no_show: 'No-show' };
  function timeOnly(iso) {
    return iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
  }
  function timelineHTML(b, kind) {
    const [startLabel, doneLabel] = PROGRESS_LABEL[kind] || PROGRESS_LABEL.transport;
    const steps = [
      { label: 'Booked', time: timeOnly(b.created_at) },
      { label: 'Rider accepted', time: timeOnly(b.accepted_at) },
      { label: startLabel, time: '' },
      { label: doneLabel, time: b.status === 'completed' ? timeOnly(b.updated_at) : '' },
    ];
    const reachedByStatus = { pending: 0, accepted: 1, ongoing: 2, completed: 3 };
    let reached = reachedByStatus[b.status];
    const ended = ENDED_LABEL[b.status];
    if (ended) {
      reached = b.accepted_at ? 1 : 0;
      steps.splice(reached + 1, steps.length, { label: ended, time: timeOnly(b.updated_at), ended: true });
    }
    if (reached == null) reached = 0;
    return `
      <ol class="bd-timeline" aria-label="Booking progress" style="grid-template-columns:repeat(${steps.length}, 1fr)">
        ${steps.map((s, i) => {
          const state = s.ended ? 'ended' : (i < reached || (i === reached && (ended || b.status === 'completed'))) ? 'done' : i === reached ? 'current' : 'todo';
          return `<li class="bd-step bd-step--${state}">
            <span class="bd-step__dot">${state === 'done' ? '<i class="fa-solid fa-check"></i>' : state === 'ended' ? '<i class="fa-solid fa-xmark"></i>' : ''}</span>
            <span class="bd-step__label">${s.label}</span>
            ${s.time ? `<span class="bd-step__time">${s.time}</span>` : ''}
          </li>`;
        }).join('')}
      </ol>`;
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
    if (typeof viewState === 'function') viewState('details', { kind, id }); // reopened after a refresh

    overlay.style.display = 'flex'; // matches .modal-overlay.open — centres the modal
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const body = document.getElementById('booking-details-body');
    body.innerHTML = skeletonDetails();

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
      const [profileResult, appResult, vehicleResult, reviewsResult] = await Promise.all([
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
              .select('name, icon, base_fare, per_km_rate, ride_base_fare, ride_per_km_rate, ride_base_km, extra_passenger_fee, fare_per_passenger')
              .eq('id', vehicleId)
              .maybeSingle()
          : Promise.resolve({ data: null }),

        // Rider's average rating for the rider card (reviews are readable by
        // any signed-in user).
        riderId
          ? supabase.from('reviews').select('rating').eq('rider_id', riderId).limit(500)
          : Promise.resolve({ data: null }),
      ]);

      const riderProfile     = profileResult.data  || null;
      const riderApplication = appResult.data       || null;
      const vehicle          = vehicleResult.data   || null;
      const riderRatings     = (reviewsResult.data || []).map(r => Number(r.rating)).filter(Boolean);
      const riderAvg         = riderRatings.length ? riderRatings.reduce((a, b) => a + b, 0) / riderRatings.length : null;

      /* ---- 2b. Ride stops (transport only) ---- */
      const rideStops = kind === 'transport'
        ? (await supabase.from('ride_stops').select('*').eq('booking_id', id).order('stop_order', { ascending: true })).data || []
        : [];

      /* ---- 2c. Order items (food only, cart-based orders) ---- */
      const orderItems = kind === 'food'
        ? (await supabase.from('food_order_items').select('*').eq('food_delivery_id', id).order('created_at', { ascending: true })).data || []
        : [];

      /* ---- 2d. The rider's own view (sql/047) ----
         Riders see the customer (name, photo, bookings; phone while the trip
         is on) and what they earn, instead of "Your rider", the vehicle and
         documents. A waiting request shows the earnings but not the customer
         until they accept. */
      const asRider = CURRENT_PROFILE?.role === 'rider';
      const myJob = asRider && booking.rider_id === CURRENT_PROFILE.id;
      const openRequest = asRider && !booking.rider_id && booking.status === 'pending';
      const [custRes, earnRes] = await Promise.all([
        myJob ? supabase.rpc('booking_customer', { p_type: kind, p_id: booking.id }) : Promise.resolve({ data: null }),
        myJob || openRequest ? supabase.rpc('rider_booking_earnings', { p_type: kind, p_id: booking.id }) : Promise.resolve({ data: null }),
      ]);
      const customer = custRes.data?.[0] || null;
      const earn = earnRes.data?.[0] || null;

      /* ---- 3. Build title ---- */
      const title = kind === 'parcel'
        ? `${booking.sender_name} → ${booking.receiver_name}`
        : bookingTitle(booking, kind);

      /* ---- 4. Route / booking details section ---- */
      const routePickup  = bookingPickup(booking, kind);
      const routeDropoff = bookingDropoff(booking, kind);

      const liveTrackable = booking.rider_id && ['accepted', 'ongoing'].includes(booking.status);
      const mapSection = (routePickup && routeDropoff) ? `
        <button type="button" class="btn btn-outline btn-block bd-map-toggle" id="bd-map-toggle">
          <i class="fa-solid fa-map-location-dot"></i> ${liveTrackable && !asRider ? 'Track rider on map' : 'View route on map'}
        </button>
        <p id="bd-eta" class="bd-eta" hidden></p>
        <div class="bd-map" id="bd-map" hidden>
          <div class="bd-map-loading skeleton"><i class="fa-solid fa-map-location-dot"></i> Loading route…</div>
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
            ${routeBlock('Pickup', booking.pickup_address, 'Destination', booking.destination_address, rideStops.length ? `<div class="bd-stops-list">${stopsRows}</div>` : '')}
            ${booking.distance_km ? row('<i class="fa-solid fa-road"></i> Distance', booking.distance_km + ' km') : ''}
            ${asRider ? row('<i class="fa-solid fa-user-group"></i> Passengers', String(booking.passengers || 1)) : ''}
            ${asRider && booking.scheduled_for ? row('<i class="fa-regular fa-calendar"></i> Scheduled for', formatDate(booking.scheduled_for)) : ''}
            ${mapSection}
          </div>`;
      } else if (kind === 'food') {
        const itemsRows = orderItems.map(it => {
          const oosStyle = it.is_out_of_stock ? 'text-decoration: line-through; color: var(--text-muted);' : '';
          const oosBadge = it.is_out_of_stock ? ' <span class="badge badge--cancelled" style="transform:scale(0.8)">Out of stock</span>' : '';
          
          let actionBtn = '';
          if (CURRENT_PROFILE.role === 'rider' && booking.status === 'ongoing' && !it.is_out_of_stock) {
            actionBtn = ` <button class="btn btn-outline btn-sm" style="padding: 2px 6px; font-size: var(--fs-2xs);" onclick="markItemOutOfStock('${it.id}', '${booking.id}', event)">OOS</button>`;
          }

          return `
          <div class="bd-row">
            <span style="${oosStyle}">${it.quantity} × ${escapeHtml(it.name)}${oosBadge}${actionBtn}</span>
            <strong style="${oosStyle}">${peso(it.subtotal)}</strong>
          </div>`;
        }).join('');
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-utensils"></i> Food Delivery Details</h4>
            ${row('<i class="fa-solid fa-store"></i> Restaurant',   escapeHtml(booking.restaurant_name || '—'))}
            ${routeBlock('Pickup', booking.pickup_address, 'Deliver to', booking.delivery_address)}
            ${booking.instructions ? row('<i class="fa-solid fa-note-sticky"></i> Instructions', escapeHtml(booking.instructions)) : ''}
            ${orderItems.length ? `
              <div style="margin-top:10px">
                <div style="font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Order</div>
                <div class="bd-stops-list">${itemsRows}</div>
              </div>` : ''}
            ${asRider ? `
              ${booking.item_subtotal != null ? row('Item subtotal', peso(booking.item_subtotal)) : ''}
              ${booking.delivery_fee != null ? row('Delivery fee', peso(booking.delivery_fee)) : ''}
              ${booking.item_subtotal != null && ['pending', 'accepted'].includes(booking.status)
                ? `<div class="bd-status-note bd-status-note--info" style="margin:8px 0 0"><i class="fa-solid fa-money-bill-wave"></i>
                    <span>Bring <strong>${peso(booking.item_subtotal)}</strong> cash to buy the food — the customer pays you back with the delivery fee.</span></div>`
                : ''}` : ''}
            ${mapSection}
          </div>`;
      } else if (kind === 'hauling') {
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-truck-moving"></i> Hauling Details</h4>
            ${row('<i class="fa-solid fa-user"></i> Pickup contact', escapeHtml(booking.sender_name || '—') + (booking.sender_phone ? ' · ' + escapeHtml(booking.sender_phone) : ''))}
            ${row('<i class="fa-solid fa-user-check"></i> Receiver', escapeHtml(booking.receiver_name || '—') + (booking.receiver_phone ? ' · ' + escapeHtml(booking.receiver_phone) : ''))}
            ${routeBlock('Pickup', booking.pickup_address, 'Drop-off', booking.dropoff_address)}
            ${row('<i class="fa-solid fa-boxes-stacked"></i> Items', escapeHtml(HAULING_CATEGORY_LABEL[booking.item_category] || 'Other items') + ' — ' + escapeHtml(booking.item_description || ''))}
            ${booking.estimated_weight_kg ? row('<i class="fa-solid fa-weight-hanging"></i> Approx. weight', booking.estimated_weight_kg + ' kg') : ''}
            ${row('<i class="fa-solid fa-people-carry-box"></i> Helpers', booking.helpers ? `${booking.helpers} × ${peso(booking.helper_fee)}` : 'None — driver only')}
            ${booking.scheduled_for ? row('<i class="fa-regular fa-calendar"></i> Scheduled for', formatDate(booking.scheduled_for)) : ''}
            ${booking.instructions ? row('<i class="fa-solid fa-note-sticky"></i> Instructions', escapeHtml(booking.instructions)) : ''}
            ${booking.distance_km ? row('<i class="fa-solid fa-road"></i> Distance', booking.distance_km + ' km') : ''}
            ${mapSection}
          </div>`;
      } else {
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-box"></i> Parcel Details</h4>
            ${row('<i class="fa-solid fa-user"></i> Sender',    escapeHtml(booking.sender_name || '—') + (booking.sender_phone ? ' · ' + escapeHtml(booking.sender_phone) : ''))}
            ${row('<i class="fa-solid fa-user-check"></i> Receiver', escapeHtml(booking.receiver_name || '—') + (booking.receiver_phone ? ' · ' + escapeHtml(booking.receiver_phone) : ''))}
            ${routeBlock('Pickup', booking.sender_address, 'Drop-off', booking.receiver_address)}
            ${booking.parcel_size        ? row('<i class="fa-solid fa-cube"></i> Parcel size',    escapeHtml(booking.parcel_size)) : ''}
            ${booking.parcel_weight      ? row('<i class="fa-solid fa-weight-hanging"></i> Weight', booking.parcel_weight + ' kg') : ''}
            ${booking.parcel_description ? row('<i class="fa-solid fa-tag"></i> Description',     escapeHtml(booking.parcel_description)) : ''}
            ${booking.instructions       ? row('<i class="fa-solid fa-note-sticky"></i> Instructions', escapeHtml(booking.instructions)) : ''}
            ${Number(booking.cod_amount) > 0 ? row('<i class="fa-solid fa-hand-holding-dollar"></i> Cash on delivery', peso(booking.cod_amount) + (booking.cod_remitted_at ? ' · handed to sender ' + formatDate(booking.cod_remitted_at) : booking.status === 'completed' ? ' · collected, not yet handed over' : '')) : ''}
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
          ${booking.estimated_fare && booking.final_fare ? row('Estimated fare', peso(booking.estimated_fare)) : ''}
          ${booking.final_fare || booking.estimated_fare ? `<div class="bd-row bd-row--total"><span>${booking.final_fare ? 'Final fare' : 'Estimated fare'}</span><strong>${peso(booking.final_fare ?? booking.estimated_fare)}</strong></div>` : ''}
          ${!booking.estimated_fare && !booking.final_fare ? row('Fare', '—') : ''}
          ${booking.distance_km && kind === 'transport' ? row('Distance', booking.distance_km + ' km') : ''}
          ${kind === 'transport' ? row('Passengers', String(booking.passengers || 1)) : ''}
          ${booking.payment_method ? row('Payment method', paymentMethodLabel(booking.payment_method)) : ''}
          ${booking.payment_status ? row('Payment status', paymentStatusBadge(booking.payment_status)) : ''}
          ${booking.tip_amount        ? row('Tip',                peso(booking.tip_amount))        : ''}
          ${booking.cancellation_fee  ? row(booking.status === 'no_show' ? 'No-show fee' : 'Cancellation fee',
                peso(booking.cancellation_fee) + (booking.cancellation_fee_paid === true ? ' · paid' : booking.cancellation_fee_paid === false ? ' · unpaid (top up your wallet)' : '')) : ''}
          ${booking.payment_status === 'refunded' ? row('Refund', peso(Math.max(0, Number(booking.final_fare ?? booking.estimated_fare ?? 0) - Number(booking.cancellation_fee || 0))) + ' to your iTULOD wallet') : ''}
          ${booking.rating         ? row('Your rating',    ratingStars(booking.rating))  : ''}
          ${booking.review         ? row('Your review',    escapeHtml(booking.review))    : ''}
        </div>`;

      /* ---- 6. Vehicle section ---- */
      // Prefer the vehicle from the `vehicles` table (booked vehicle_id).
      // Fall back to what the rider wrote in their application.
      const vehicleName  = vehicle?.name || riderApplication?.vehicle_type || null;
      const vehiclePlate = riderApplication?.vehicle_plate || null;
      const vehicleLicense = riderApplication?.license_number || null;

      // Type and plate are on the rider card once a rider is assigned.
      const showVehicleIdentity = !(riderId && riderProfile);
      const vehicleSection = vehicleName ? `
        <div class="bd-section">
          <h4><i class="fa-solid fa-car"></i> Vehicle</h4>
          ${row('Vehicle type',  escapeHtml(vehicleName))}
          ${vehiclePlate && showVehicleIdentity ? row('Plate number', escapeHtml(vehiclePlate)) : ''}
          ${vehicleLicense ? row('License number', escapeHtml(vehicleLicense)) : ''}
          ${vehicle && kind === 'transport' ? row('Fare', escapeHtml(rideFareBreakdown(vehicle, booking.distance_km || 1, booking.passengers || 1))) : ''}
          ${vehicle?.base_fare   && kind !== 'transport' ? row('Base fare',    peso(vehicle.base_fare)) : ''}
          ${vehicle?.per_km_rate && kind !== 'transport' ? row('Rate per km',  peso(vehicle.per_km_rate) + '/km') : ''}
        </div>` : '';

      /* ---- 7. Rider section ---- */
      let riderSection = '';
      if (riderId && riderProfile) {
        // Rider profile was readable (RLS allows it)
        const avatarHtml = safeImageUrl(riderProfile.avatar_url)
          ? `<img src="${escapeHtml(riderProfile.avatar_url)}" class="bd-avatar" alt="Rider photo">`
          : `<div class="bd-avatar bd-avatar--initials">${escapeHtml((riderProfile.full_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase())}</div>`;

        // Call / message buttons are for the customer — not shown to the
        // rider looking at their own job.
        const isOwnJob = CURRENT_PROFILE?.id === riderId;
        const tripActive = ['accepted', 'ongoing'].includes(booking.status);
        // A finished trip only offers View chat when there was a chat.
        let hadChat = false;
        if (!tripActive && !isOwnJob) {
          const { count } = await supabase.from('booking_messages').select('id', { count: 'exact', head: true })
            .eq('booking_type', kind).eq('booking_id', booking.id);
          hadChat = (count || 0) > 0;
        }
        const telHref = riderProfile.phone ? 'tel:' + riderProfile.phone.replace(/[^\d+]/g, '') : '';
        const callBtn = telHref && !isOwnJob && tripActive
          ? `<a class="btn btn-primary btn-sm bd-call-btn" href="${telHref}"><i class="fa-solid fa-phone"></i> Call</a>`
          : '';
        // The only chat button in booking details: Message during the trip,
        // View chat (read-only) after.
        const msgBtn = !isOwnJob && (tripActive || hadChat) && typeof openBookingChat === 'function'
          ? `<button type="button" class="btn btn-outline btn-sm" onclick="openBookingChat('${kind}', '${booking.id}')"><i class="fa-solid fa-comment-dots"></i> ${tripActive ? 'Message' : 'View chat'}</button>`
          : '';
        riderSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-motorcycle"></i> ${isOwnJob ? 'You' : 'Your rider'}</h4>
            <div class="bd-rider-card">
              ${avatarHtml}
              <div class="bd-rider-info">
                <strong>${escapeHtml(riderProfile.full_name || '—')}</strong>
                <span class="bd-rider-meta">
                  ${riderAvg ? `<span class="bd-rider-rating"><i class="fa-solid fa-star"></i> ${riderAvg.toFixed(1)} <small>(${riderRatings.length})</small></span>` : '<span class="bd-rider-rating bd-rider-rating--new">New rider</span>'}
                  ${riderProfile.phone ? `<a href="${telHref}">${escapeHtml(riderProfile.phone)}</a>` : ''}
                </span>
              </div>
              ${vehicleName || vehiclePlate ? `
                <div class="bd-rider-vehicle">
                  ${vehiclePlate ? `<span class="bd-plate">${escapeHtml(vehiclePlate)}</span>` : ''}
                  ${vehicleName ? `<span class="bd-rider-vehicle__name">${escapeHtml(vehicleName)}</span>` : ''}
                </div>` : ''}
              ${callBtn || msgBtn ? `<div class="bd-rider-actions">${callBtn}${riderId && msgBtn ? msgBtn : ''}</div>` : ''}
            </div>
          </div>`;
      } else if (riderId && !riderProfile) {
        // Rider assigned but couldn't load profile (RLS not yet updated — show ID)
        riderSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-motorcycle"></i> Rider</h4>
            <p class="muted" style="font-size:var(--fs-sm)">
              Rider assigned — run the RLS fix SQL in Supabase to display rider details.<br>
              <code style="font-size:var(--fs-xs);opacity:0.7">${riderId}</code>
            </p>
          </div>`;
      } else {
        riderSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-user-clock"></i> Rider</h4>
            <p class="muted">${['pending', 'accepted'].includes(booking.status) ? 'No rider assigned yet — waiting for a rider to accept.' : 'No rider was assigned to this booking.'}</p>
          </div>`;
      }

      /* ---- 8. Documents section ---- */
      // rider-documents is private: the saved public URL answers "Bucket not
      // found", so open each file through a 1-hour signed link (customers may
      // sign their rider's license and OR/CR — sql/045).
      const docs = [["Driver's License", riderApplication?.license_url], ['OR / CR', riderApplication?.or_cr_url]]
        .map(([label, url]) => ({ label, path: url && url.includes('/rider-documents/')
          ? decodeURIComponent(url.split('/rider-documents/')[1].split('?')[0]) : null }))
        .filter(d => d.path);
      const signed = {};
      if (docs.length && !asRider) { // a rider doesn't need their own documents here
        const { data: links } = await supabase.storage.from('rider-documents').createSignedUrls(docs.map(d => d.path), 3600);
        for (const l of links || []) if (l.signedUrl) signed[l.path] = l.signedUrl;
      }
      const docsSection = docs.length ? `
        <div class="bd-section">
          <h4><i class="fa-solid fa-id-card"></i> Rider Documents</h4>
          <div class="bd-doc-grid">
            ${docs.map(d => `<div class="bd-doc"><strong>${d.label}</strong>${signed[d.path]
              ? `<a href="${escapeHtml(signed[d.path])}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>`
              : '<span class="muted">Not available</span>'}</div>`).join('')}
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

      /* ---- 8d. Rider view: the customer, earnings, what to collect ---- */
      let customerSection = '';
      let earningsSection = '';
      if (asRider) {
        const tripActive = ['accepted', 'ongoing'].includes(booking.status);
        if (customer) {
          let hadChat = false;
          if (!tripActive) {
            const { count } = await supabase.from('booking_messages').select('id', { count: 'exact', head: true })
              .eq('booking_type', kind).eq('booking_id', booking.id);
            hadChat = (count || 0) > 0;
          }
          const face = safeImageUrl(customer.avatar_url)
            ? `<img src="${escapeHtml(customer.avatar_url)}" class="bd-avatar" alt="Customer photo">`
            : `<div class="bd-avatar bd-avatar--initials">${escapeHtml((customer.full_name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase())}</div>`;
          const tel = customer.phone ? 'tel:' + customer.phone.replace(/[^\d+]/g, '') : '';
          const since = customer.member_since ? new Date(customer.member_since).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '';
          const n = Number(customer.completed_bookings || 0);
          customerSection = `
            <div class="bd-section">
              <h4><i class="fa-solid fa-user"></i> Your customer</h4>
              <div class="bd-rider-card">
                ${face}
                <div class="bd-rider-info">
                  <strong>${escapeHtml(customer.full_name || '—')}</strong>
                  <span class="bd-rider-meta">
                    <span class="bd-rider-rating ${n ? '' : 'bd-rider-rating--new'}">${n ? `<i class="fa-solid fa-circle-check"></i> ${n} completed booking${n === 1 ? '' : 's'}` : 'New customer'}</span>
                    ${since ? `<span>Since ${escapeHtml(since)}</span>` : ''}
                    ${customer.phone ? `<a href="${tel}">${escapeHtml(customer.phone)}</a>` : ''}
                  </span>
                </div>
                ${tripActive || hadChat ? `<div class="bd-rider-actions">
                  ${tel && tripActive ? `<a class="btn btn-primary btn-sm bd-call-btn" href="${tel}"><i class="fa-solid fa-phone"></i> Call</a>` : ''}
                  ${typeof openBookingChat === 'function' ? `<button type="button" class="btn btn-outline btn-sm" onclick="openBookingChat('${kind}', '${booking.id}')"><i class="fa-solid fa-comment-dots"></i> ${tripActive ? 'Message' : 'View chat'}</button>` : ''}
                </div>` : ''}
              </div>
            </div>`;
        } else if (openRequest) {
          customerSection = `
            <div class="bd-section">
              <h4><i class="fa-solid fa-user"></i> Customer</h4>
              <p class="muted" style="font-size:var(--fs-sm)">The customer's name and number show once you accept this booking.</p>
            </div>`;
        }

        const ended = ['cancelled', 'no_show', 'expired'].includes(booking.status);
        const tip = Number(earn?.tip || 0);
        const fareOnly = earn ? Number(earn.fare) - (earn.is_final ? tip : 0) : null;
        const cod = kind === 'parcel' && Number(booking.cod_amount) > 0 ? Number(booking.cod_amount) : 0;
        const collect = !ended && booking.status !== 'completed'
          ? (booking.payment_method === 'cash' || !booking.payment_method
              ? `Collect <strong>${peso(fare)}</strong> in cash from the customer${cod ? ` · plus the <strong>${peso(cod)}</strong> cash on delivery for the sender` : ''}.`
              : booking.payment_status === 'paid'
                ? `Paid online — nothing to collect${cod ? `, except the <strong>${peso(cod)}</strong> cash on delivery for the sender` : ''}.`
                : `The customer pays online (${paymentMethodLabel(booking.payment_method)})${cod ? ` · collect the <strong>${peso(cod)}</strong> cash on delivery for the sender` : ''}.`)
          : '';
        earningsSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-sack-dollar"></i> Your earnings</h4>
            ${earn ? `
              ${row(ended ? 'Fee from the customer' : 'Fare', peso(fareOnly))}
              ${Number(earn.commission) ? row('iTULOD commission', '− ' + peso(earn.commission)) : ''}
              ${tip ? row('Tip from the customer', peso(tip)) : ''}
              <div class="bd-row bd-row--total"><span>${earn.is_final ? 'You earned' : 'You earn (estimate)'}</span><strong>${peso(Number(earn.payout) + (earn.is_final ? 0 : tip))}</strong></div>`
              : row('Fare', fare != null ? peso(fare) : '—')}
            ${booking.payment_method ? row('Payment method', paymentMethodLabel(booking.payment_method)) : ''}
            ${booking.payment_status ? row('Payment status', paymentStatusBadge(booking.payment_status)) : ''}
            ${collect ? `<div class="bd-status-note bd-status-note--info" style="margin:8px 0 0"><i class="fa-solid fa-hand-holding-dollar"></i><span>${collect}</span></div>` : ''}
            ${booking.rating ? row('Customer rated you', ratingStars(booking.rating)) : ''}
            ${booking.review ? row('Their review', escapeHtml(booking.review)) : ''}
          </div>`;

        // the grace-period note, from the rider's side
        if (booking.status === 'pending') {
          statusNote = `<div class="bd-status-note bd-status-note--info"><i class="fa-regular fa-clock"></i>
            <span>Accept within the 15-minute window, or this request expires automatically.</span></div>`;
        } else if (booking.status === 'accepted') {
          statusNote = `<div class="bd-status-note bd-status-note--info"><i class="fa-regular fa-clock"></i>
            <span>Start the trip within 15 minutes of the booking time, or it expires automatically.</span></div>`;
        }
      }

      // The customer can cancel until the trip starts (pending / accepted),
      // like the Cancel on their Home and History cards (customer.js).
      const canCancelHere = typeof cancelBooking === 'function'
        && CURRENT_PROFILE?.id === booking.customer_id
        && ['pending', 'accepted'].includes(booking.status);

      /* ---- 9. Render ---- */
      body.innerHTML = `
        <div class="bd-header">
          <div class="bd-header__top">
            <div class="bd-kind-pill">
              <i class="fa-solid ${ICON_BY_KIND_DETAILS[kind] || 'fa-box'}"></i>
              ${KIND_LABEL[kind] || kind}
            </div>
            ${statusBadge(booking.status)}
          </div>
          <h2>${escapeHtml(title)}</h2>
          <div class="bd-sub">${formatDate(booking.created_at)}</div>
          <div class="bd-fare-hero">
            <div>
              <span class="bd-fare-hero__label">${asRider && earn ? (earn.is_final ? 'You earned' : 'You earn') : booking.final_fare ? 'Final fare' : 'Estimated fare'}</span>
              <strong class="bd-fare-hero__amount">${asRider && earn ? peso(Number(earn.payout) + (earn.is_final ? 0 : Number(earn.tip || 0))) : fare != null ? peso(fare) : '—'}</strong>
            </div>
            ${booking.payment_method ? `
              <div class="bd-fare-hero__pay">
                <span class="bd-pay-chip">${paymentMethodLabel(booking.payment_method)}</span>
                ${booking.payment_status ? paymentStatusBadge(booking.payment_status) : ''}
              </div>` : ''}
          </div>
          ${timelineHTML(booking, kind)}
        </div>
        ${statusNote}
        ${asRider ? customerSection : riderSection}
        ${routeSection}
        ${asRider ? earningsSection : fareSection}
        ${asRider ? '' : vehicleSection}
        ${asRider ? '' : docsSection}
        ${proofSection}
        <div class="bd-section" ${asRider ? 'hidden' : ''}>
          ${canCancelHere ? `<button type="button" class="btn btn-outline btn-block btn-sm btn-danger-ghost" style="margin-bottom:8px"
            onclick="cancelBooking('${kind}', '${booking.id}').then(ok => ok && openBookingDetails({ kind: '${kind}', id: '${booking.id}' }))">
            <i class="fa-solid fa-xmark"></i> Cancel booking
          </button>` : ''}
          <button type="button" class="btn btn-outline btn-block btn-sm" onclick="typeof openSupportRequestModal === 'function' && openSupportRequestModal({ kind: '${kind}', id: '${booking.id}' })">
            <i class="fa-solid fa-circle-question"></i> Report an issue with this booking
          </button>
        </div>
      `;

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
            mapEl.innerHTML = '<div class="bd-map-loading skeleton"><i class="fa-solid fa-map-location-dot"></i> Loading route…</div>';
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
    if (typeof viewState === 'function') viewState('details', null);
    if (typeof stopTrackingRider === 'function') stopTrackingRider();
    if (typeof destroyBookingDetailsMap === 'function') destroyBookingDetailsMap();
    const body = document.getElementById('booking-details-body');
    if (body) body.innerHTML = '';
  }

  // After a refresh, reopen the booking that was open — if it can still be seen.
  async function reopenBookingDetails() {
    const d = typeof viewState === 'function' ? viewState('details') : null;
    const table = d && d.id && kindTable(d.kind);
    if (!table) return;
    const { data } = await supabase.from(table).select('id').eq('id', d.id).maybeSingle();
    if (data) openBookingDetails(d); else viewState('details', null);
  }

  window.openBookingDetails  = openBookingDetails;
  window.closeBookingDetails = closeBookingDetails;
  window.reopenBookingDetails = reopenBookingDetails;

  window.markItemOutOfStock = async function(itemId, bookingId, e) {
    if (e) e.stopPropagation();
    if (!(await appConfirm('The customer will see this item marked as out of stock on their order.', { title: 'Mark as out of stock?', confirmText: 'Out of stock', icon: 'fa-box-open' }))) return;
    try {
      toast('Updating...', 'info');
      const { error } = await supabase.from('food_order_items').update({ is_out_of_stock: true }).eq('id', itemId);
      if (error) throw error;
      toast('Item marked out of stock.', 'success');
      // refresh booking details
      openBookingDetails({ kind: 'food', id: bookingId });
    } catch (err) {
      toast(err.message, 'error');
    }
  };
})();
