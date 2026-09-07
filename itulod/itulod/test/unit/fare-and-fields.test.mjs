/* Unit tests for the pure helpers on the money path: fare estimation and the
   Philippine field formatters that gate what reaches the database. The
   commission / payout split itself lives in the Postgres trigger
   (sql/005_...) and is covered by test/integration/money-path.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassicScripts } from '../helpers/load-classic.mjs';

const g = loadClassicScripts(['js/utils.js']);

test('simulateDistanceKm: deterministic, clamped to 1–15 km', () => {
  assert.equal(
    g.simulateDistanceKm('laoag city hall', 'batac market'),
    g.simulateDistanceKm('laoag city hall', 'batac market'),
  );
  for (const [a, b] of [['a', 'b'], ['x', 'y'], ['laoag', 'currimao'], ['', '']]) {
    const km = g.simulateDistanceKm(a, b);
    assert.ok(km >= 1 && km <= 15, `${a}->${b} gave ${km}`);
  }
});

test('estimateFare = base_fare + per_km_rate * distance', () => {
  const v = { base_fare: 40, per_km_rate: 12 };
  assert.equal(g.estimateFare(v, 5), 100);
  assert.equal(g.estimateFare(v, 10), 160);
  assert.equal(g.estimateFare(null, 5), 0);          // no vehicle picked yet
  assert.equal(g.estimateFare(v, 0), 52);            // distance falls back to 1 km
  assert.equal(g.estimateFare(v, undefined), 52);
});

test('peso: PHP, always two decimals', () => {
  assert.equal(g.peso(1234.5), '₱1,234.50');
  assert.equal(g.peso(0), '₱0.00');
  assert.equal(g.peso(), '₱0.00');
  assert.equal(g.peso('87.1'), '₱87.10');
});

test('normalizePhoneMobile: digits only, 11 max', () => {
  assert.equal(g.normalizePhoneMobile('0917 123 4567'), '09171234567');
  assert.equal(g.normalizePhoneMobile('+63 917 123 4567 89'), '63917123456');
  assert.equal(g.normalizePhoneMobile(null), '');
});

test('isValidPhoneMobile: 09 + 9 digits', () => {
  assert.ok(g.isValidPhoneMobile('0917 123 4567'));
  assert.ok(!g.isValidPhoneMobile('0817 123 4567'));
  assert.ok(!g.isValidPhoneMobile('12345'));
  assert.ok(!g.isValidPhoneMobile(''));
});

test('formatPhoneMobile: groups as 09XX XXX XXXX, tolerates pasted 10-digit', () => {
  assert.equal(g.formatPhoneMobile('09171234567'), '0917 123 4567');
  assert.equal(g.formatPhoneMobile('9171234567'), '0917 123 4567');
  assert.equal(g.formatPhoneMobile('0917'), '0917');
});

test('formatPlateNumber / formatLicenseNumber', () => {
  assert.equal(g.formatPlateNumber('abc1234'), 'ABC 1234');
  assert.equal(g.formatPlateNumber('AB 12'), 'AB 12');
  assert.ok(g.isValidPlateNumber('ABC 1234'));
  assert.equal(g.formatLicenseNumber('n1234567890'), 'N12-34-567890');
  assert.ok(g.isValidLicenseNumber('N12-34-567890'));
  assert.ok(!g.isValidLicenseNumber('123-45-678901'));
});

test('formatName: strips non-letters, collapses spaces, caps at 60', () => {
  assert.equal(g.formatName('Juan   Dela Cruz'), 'Juan Dela Cruz');
  assert.equal(g.formatName('Ana-María O\'Brien'), 'Ana-María O\'Brien');
  assert.equal(g.formatName('R2-D2 99!!'), 'R-D ');
  assert.equal(g.formatName('x'.repeat(80)).length, 60);
  assert.ok(g.isValidName('Jose Rizal'));
  assert.ok(!g.isValidName('  '));
  assert.ok(!g.isValidName('7'));
});
