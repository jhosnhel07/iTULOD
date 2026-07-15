// iTULOD — Booking details modal
// Opened when a customer clicks a booking card in history.
// Displays full booking info: route, fare, payment, rider, vehicle & documents.

(function () {

  /* ------------------------------------------------------------------ */
  /* Helpers                                                              */
  /* ------------------------------------------------------------------ */

  function kindTable(kind) {
    return { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' }[kind];
  }

  function ratingStars(n) {
    if (!n) return '<span style="color:var(--text-muted)">Not yet rated</span>';
    return '<span style="color:#f59e0b">' + '★'.repeat(n) + '☆'.repeat(5 - n) + '</span>';
  }

  function paymentMethodLabel(method) {
    return { cash: '💵 Cash', gcash: '📱 GCash', card: '💳 Card' }[method] || method || '—';
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

    overlay.style.display = 'block';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');

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

      /* ---- 3. Build title ---- */
      const title = kind === 'transport'
        ? `${booking.pickup_address} → ${booking.destination_address}`
        : kind === 'food'
          ? `${booking.restaurant_name} → ${booking.delivery_address}`
          : `${booking.sender_name} → ${booking.receiver_name}`;

      /* ---- 4. Route / booking details section ---- */
      let routeSection = '';
      if (kind === 'transport') {
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-route"></i> Trip Details</h4>
            ${row('<i class="fa-solid fa-location-dot"></i> Pickup',      escapeHtml(booking.pickup_address || '—'))}
            ${row('<i class="fa-solid fa-flag-checkered"></i> Destination', escapeHtml(booking.destination_address || '—'))}
            ${booking.distance_km ? row('<i class="fa-solid fa-road"></i> Distance', booking.distance_km + ' km') : ''}
          </div>`;
      } else if (kind === 'food') {
        routeSection = `
          <div class="bd-section">
            <h4><i class="fa-solid fa-utensils"></i> Food Delivery Details</h4>
            ${row('<i class="fa-solid fa-store"></i> Restaurant',   escapeHtml(booking.restaurant_name || '—'))}
            ${row('<i class="fa-solid fa-location-dot"></i> Pickup', escapeHtml(booking.pickup_address || '—'))}
            ${row('<i class="fa-solid fa-flag-checkered"></i> Deliver to', escapeHtml(booking.delivery_address || '—'))}
            ${booking.instructions ? row('<i class="fa-solid fa-note-sticky"></i> Instructions', escapeHtml(booking.instructions)) : ''}
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
          </div>`;
      }

      /* ---- 5. Fare & payment section ---- */
      const fare = booking.final_fare ?? booking.estimated_fare;
      const fareSection = `
        <div class="bd-section">
          <h4><i class="fa-solid fa-peso-sign"></i> Fare & Payment</h4>
          ${booking.estimated_fare ? row('Estimated fare', peso(booking.estimated_fare)) : ''}
          ${booking.final_fare     ? row('Final fare',     peso(booking.final_fare))     : ''}
          ${!booking.estimated_fare && !booking.final_fare ? row('Fare', '—') : ''}
          ${booking.distance_km && kind === 'transport' ? row('Distance', booking.distance_km + ' km') : ''}
          ${booking.payment_method ? row('Payment method', paymentMethodLabel(booking.payment_method)) : ''}
          ${booking.payment_status ? row('Payment status', paymentStatusBadge(booking.payment_status)) : ''}
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
        ${routeSection}
        ${fareSection}
        ${vehicleSection}
        ${riderSection}
        ${docsSection}
      `;

    } catch (err) {
      const msg = err?.message || String(err);
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(msg)}</p></div>`;
    }
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
    const body = document.getElementById('booking-details-body');
    if (body) body.innerHTML = '';
  }

  window.openBookingDetails  = openBookingDetails;
  window.closeBookingDetails = closeBookingDetails;
})();
