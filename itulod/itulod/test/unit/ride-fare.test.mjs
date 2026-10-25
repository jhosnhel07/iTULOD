/* Ride fares + passengers (sql/044). estimateRideFare() must match
   public.vehicle_fare() in the database, or bookings are refused as
   underpriced. Rates are the ones sql/044 sets (Philippine fares). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassicScripts } from '../helpers/load-classic.mjs';

const g = loadClassicScripts(['js/config.js', 'js/utils.js']);

const V = {
  motorcycle: { name: 'Motorcycle', base_fare: 25, per_km_rate: 8, ride_base_fare: 20, ride_base_km: 1, ride_per_km_rate: 10, min_passengers: 1, max_passengers: 1 },
  tricycle: { name: 'Tricycle', base_fare: 30, per_km_rate: 9, ride_base_fare: 20, ride_base_km: 1.5, ride_per_km_rate: 8, extra_passenger_fee: 20, min_passengers: 1, max_passengers: 3 },
  car: { name: 'Car', base_fare: 40, per_km_rate: 12, ride_base_fare: 65, ride_base_km: 0, ride_per_km_rate: 15, min_passengers: 1, max_passengers: 4 },
  suv: { name: 'SUV', ride_base_fare: 75, ride_per_km_rate: 18, min_passengers: 3, max_passengers: 6 },
  jeepney: { name: 'Jeepney', ride_base_fare: 14, ride_base_km: 4, ride_per_km_rate: 2, fare_per_passenger: true, min_passengers: 9, max_passengers: 14 },
  bus: { name: 'Bus', ride_base_fare: 12, ride_base_km: 5, ride_per_km_rate: 2.2, fare_per_passenger: true, min_passengers: 15, max_passengers: 40 },
};

test('ride fares for 10 km match the plan (and the DB)', () => {
  assert.equal(g.estimateRideFare(V.motorcycle, 10, 1), 110);
  assert.equal(g.estimateRideFare(V.tricycle, 10, 1), 88);
  assert.equal(g.estimateRideFare(V.tricycle, 10, 3), 128); // + 2 × ₱20
  assert.equal(g.estimateRideFare(V.car, 10, 4), 215);       // per vehicle
  assert.equal(g.estimateRideFare(V.jeepney, 10, 12), 312);  // ₱26 × 12
  assert.equal(g.estimateRideFare(V.bus, 10, 20), 460);      // ₱23 × 20
});

test('the minimum fare covers the included km', () => {
  assert.equal(g.estimateRideFare(V.jeepney, 3, 9), 14 * 9);
  assert.equal(g.estimateRideFare(V.motorcycle, 0.5, 1), 20);
});

test('deliveries keep their own rates', () => {
  assert.equal(g.estimateFare(V.motorcycle, 10), 105);
  assert.equal(g.estimateFare(V.car, 10), 160);
});

test('only vehicles that fit the group are offered', () => {
  const fits = (pax) => Object.values(V).filter((v) => g.vehicleFitsPassengers(v, pax)).map((v) => v.name);
  assert.deepEqual(fits(1), ['Motorcycle', 'Tricycle', 'Car']);
  assert.deepEqual(fits(3), ['Tricycle', 'Car', 'SUV']);
  assert.deepEqual(fits(12), ['Jeepney']);
  assert.deepEqual(fits(20), ['Bus']);
});

test('labels and breakdowns', () => {
  assert.equal(g.passengerRangeText(V.motorcycle), '1 passenger');
  assert.equal(g.passengerRangeText(V.jeepney), '9–14 passengers');
  assert.match(g.rideVehicleLabel(V.jeepney), /Jeepney — 9–14 passengers · ₱14\.00\/person/);
  assert.match(g.rideFareBreakdown(V.tricycle, 10, 3), /2 extra passengers × ₱20\.00/);
  assert.match(g.rideFareBreakdown(V.jeepney, 10, 12), /per person × 12/);
});
