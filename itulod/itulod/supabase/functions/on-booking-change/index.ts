// =============================================================================
// iTULOD Edge Function: on-booking-change
// -----------------------------------------------------------------------------
// Fired by a Supabase Database Webhook on UPDATE of transport_bookings /
// food_deliveries / parcel_deliveries. Turns a status/assignment change into
// the right notification (in-app + SMS + push via notifyUser).
//
// Set up (Dashboard -> Database -> Webhooks): one webhook per booking table,
// event = UPDATE, method = POST, url =
//   https://<project-ref>.functions.supabase.co/on-booking-change
// Add header  Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//
// Deploy: supabase functions deploy on-booking-change
// =============================================================================
import { adminClient, json, CORS_HEADERS } from '../_shared/helpers.ts';
import { notifyUser } from '../_shared/notify.ts';

const KIND_BY_TABLE: Record<string, string> = {
  transport_bookings: 'ride',
  food_deliveries: 'food delivery',
  parcel_deliveries: 'parcel delivery',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  // Only the service role (the webhook) may call this.
  const auth = req.headers.get('Authorization') || '';
  if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) {
    return json({ error: 'Forbidden.' }, 403);
  }

  try {
    const body = await req.json();
    const rec = body.record ?? {};
    const old = body.old_record ?? {};
    const label = KIND_BY_TABLE[body.table] || 'booking';
    const admin = adminClient();

    const notifyCustomer = (title: string, message: string) =>
      rec.customer_id && notifyUser(admin, rec.customer_id, { title, message });
    const notifyRider = (title: string, message: string) =>
      rec.rider_id && notifyUser(admin, rec.rider_id, { title, message });

    // Rider just accepted
    if (!old.rider_id && rec.rider_id) {
      const { data: rider } = await admin.from('profiles').select('full_name, phone').eq('id', rec.rider_id).single();
      await notifyCustomer(
        'A rider accepted your booking',
        `${rider?.full_name || 'Your rider'} is on the way${rider?.phone ? ' · ' + rider.phone : ''}.`,
      );
    }

    // Status transitions
    if (rec.status !== old.status) {
      if (rec.status === 'ongoing') {
        await notifyCustomer('Your trip has started', `Your ${label} is now in progress.`);
      } else if (rec.status === 'completed') {
        await notifyCustomer(`${cap(label)} completed`, `Thanks for using iTULOD! Rate your rider from Booking history.`);
      } else if (rec.status === 'cancelled') {
        // whoever didn't cancel gets told
        await notifyCustomer(`${cap(label)} cancelled`, rec.cancelled_reason || 'This booking was cancelled.');
        await notifyRider(`${cap(label)} cancelled`, 'The customer cancelled this booking.');
      }
    }

    // Payment landed
    if (rec.payment_status === 'paid' && old.payment_status !== 'paid') {
      await notifyCustomer('Payment received', `We've received your payment for this ${label}.`);
    }

    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ error: 'processing error' }, 500);
  }
});

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
