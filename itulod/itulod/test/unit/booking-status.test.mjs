/* Unit tests for statusBadge() covering the statuses added for automatic
   booking expiration (sql/009_booking_expiration.sql): 'expired' and
   'no_show'. The actual expiration timing/enforcement lives in Postgres and
   is out of reach for a pure-function test — see test/integration/. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassicScripts } from '../helpers/load-classic.mjs';

const g = loadClassicScripts(['js/utils.js']);

test('statusBadge: every booking status renders a badge with no throw', () => {
  const statuses = ['pending', 'accepted', 'ongoing', 'completed', 'cancelled', 'expired', 'no_show'];
  for (const s of statuses) {
    const html = g.statusBadge(s);
    assert.match(html, /^<span class="badge /, `${s} should render a badge span`);
  }
});

test('statusBadge: expired and no_show get their own distinct classes', () => {
  assert.match(g.statusBadge('expired'), /badge--expired/);
  assert.match(g.statusBadge('no_show'), /badge--no-show/);
  // Distinct from a deliberate cancellation — a timeout is not the same story.
  assert.doesNotMatch(g.statusBadge('expired'), /badge--cancelled/);
});

test('statusBadge: no_show gets a readable label, not the raw enum value', () => {
  assert.match(g.statusBadge('no_show'), />No-show</);
  assert.doesNotMatch(g.statusBadge('no_show'), />no_show</);
});

test('an unrecognized status still renders (falls back to pending styling)', () => {
  assert.doesNotThrow(() => g.statusBadge('something-new'));
});
