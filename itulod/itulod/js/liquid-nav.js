/**
 * iTULOD — liquid glass bottom navigation (phones)
 *
 * Adds the "liquid" highlight to the frosted .bottom-nav: one glass blob that
 * flows to the tapped tab — its leading edge reaches the new tab first, the
 * bar stretches like a drop of water, then it settles — and shrinks the bar
 * while the page scrolls down (back to full size on scroll up).
 * Tab switching itself is untouched: the blob follows whichever button gets
 * the .active class (customer.js / rider.js activateTab).
 */
(function liquidNav() {
  const nav = document.querySelector('.bottom-nav');
  if (!nav) return;

  const blob = document.createElement('span');
  blob.className = 'bn-blob';
  blob.setAttribute('aria-hidden', 'true');
  nav.prepend(blob);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let last = null;

  function target() {
    const btn = nav.querySelector('button.active');
    if (!btn || nav.offsetWidth === 0) return null;
    const n = nav.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    const inset = 3;
    return { x: b.left - n.left + inset, w: Math.max(0, b.width - inset * 2) };
  }

  function set(g) {
    blob.style.transform = `translateX(${g.x}px)`;
    blob.style.width = `${g.w}px`;
  }

  function place(animate) {
    const to = target();
    if (!to) return;
    blob.style.opacity = '1';
    if (!animate || !last || reduceMotion || Math.abs(to.x - last.x) < 1) {
      set(to);
      last = to;
      return;
    }
    const from = last;
    const left = Math.min(from.x, to.x);
    const right = Math.max(from.x + from.w, to.x + to.w);
    // Leading edge arrives first (the blob stretches across both tabs and
    // thins a little), then the trailing edge catches up and it settles.
    blob.animate([
      { transform: `translateX(${from.x}px) scaleY(1)`, width: `${from.w}px` },
      { transform: `translateX(${left}px) scaleY(0.84)`, width: `${right - left}px`, offset: 0.42 },
      { transform: `translateX(${to.x}px) scaleY(1.04)`, width: `${to.w}px`, offset: 0.82 },
      { transform: `translateX(${to.x}px) scaleY(1)`, width: `${to.w}px` },
    ], { duration: 560, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)' });
    set(to);
    last = to;
  }

  // Follow the active tab.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; place(true); });
  }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // Keep it aligned when the bar changes size (rotation, compact mode).
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => place(false)).observe(nav);
  }
  window.addEventListener('resize', () => place(false));
  nav.addEventListener('transitionend', () => place(false));

  // Shrink while scrolling down, grow back on scroll up or near the top.
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastY + 8 && y > 90) nav.classList.add('bottom-nav--compact');
    else if (y < lastY - 8 || y < 40) nav.classList.remove('bottom-nav--compact');
    lastY = y;
  }, { passive: true });
  nav.addEventListener('click', () => nav.classList.remove('bottom-nav--compact'));

  requestAnimationFrame(() => place(false));
})();
