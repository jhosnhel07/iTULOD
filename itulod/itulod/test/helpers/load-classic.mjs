/* Loads iTULOD's classic (non-module) browser scripts into a sandbox so their
   top-level `function` declarations can be unit-tested in Node without a real
   browser. Only the DOM/BOM surface the pure helpers actually touch is stubbed.
   `let`/`const` at the top of a script stay private to it — same as the browser
   where they aren't on `window`. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fakeElement() {
  let text = '';
  return {
    set textContent(v) { text = String(v ?? ''); },
    get textContent() { return text; },
    get innerHTML() {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
    set innerHTML(v) { text = String(v ?? ''); },
    appendChild() {}, remove() {}, classList: { add() {}, remove() {}, toggle() {} },
    style: {}, setAttribute() {}, addEventListener() {},
  };
}

export function loadClassicScripts(files) {
  const ctx = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    navigator: { userAgent: 'node-test' },
    location: { href: 'http://localhost/', pathname: '/' },
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); },
    },
    document: {
      createElement: fakeElement,
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      body: fakeElement(),
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  for (const rel of files) {
    const src = fs.readFileSync(path.join(appRoot, rel), 'utf8');
    vm.runInContext(src, ctx, { filename: rel });
  }
  return ctx;
}
