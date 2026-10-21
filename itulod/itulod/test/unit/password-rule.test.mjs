/* The password rule shared by sign-up, Profile → Change password and the
   reset page (js/utils.js passwordProblem). The app has the same rule in
   lib/core/utils/validators.dart; Supabase Auth enforces it server-side. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClassicScripts } from '../helpers/load-classic.mjs';

const g = loadClassicScripts(['js/config.js', 'js/utils.js']);

test('passwordProblem: accepts 8+ chars with upper, lower, number and symbol', () => {
  for (const ok of ['Itulod@2026', 'Abcdef1!', 'P4ssw0rd#long', 'Aa1~aaaa', 'Zz9"zzzz', 'Qq1\\qqqq']) {
    assert.equal(g.passwordProblem(ok), null, ok);
  }
});

test('passwordProblem: names what is missing', () => {
  assert.match(g.passwordProblem('Ab1!'), /at least 8 characters/);
  assert.match(g.passwordProblem('itulod@2026'), /uppercase/);
  assert.match(g.passwordProblem('ITULOD@2026'), /lowercase/);
  assert.match(g.passwordProblem('Itulod@abcd'), /number/);
  assert.match(g.passwordProblem('Itulod2026x'), /special character/);
  // A space or ₱ is not one of Supabase Auth's special characters.
  assert.match(g.passwordProblem('Itulod 2026'), /special character/);
  assert.match(g.passwordProblem('Itulod₱2026'), /special character/);
  assert.notEqual(g.passwordProblem(''), null);
});
