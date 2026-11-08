/* ==========================================================================
   main.js
   Small enhancements only. Every piece of content and every link works
   without this file; it adds the mobile menu, the active navigation item,
   the animation pause control, lazy-started previews and the Mathematics
   tabs. Scrolling is native: no scroll hijacking, no entrance animations.
   ========================================================================== */
(function () {
  'use strict';
  var d = document, PF = window.PF || {};
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }

  /* ---------- mobile menu ---------- */
  var menu = $('#menu'), menuBtn = $('#menuBtn');
  function setMenu(open, returnFocus) {
    if (!menu || !menuBtn) return;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.textContent = open ? 'Close' : 'Menu';
    d.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) { var first = $('a', menu); if (first) first.focus(); }
    else if (returnFocus) menuBtn.focus();
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(menu.hidden, false); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false, false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false, true); });
    window.addEventListener('resize', function () { if (window.innerWidth > 1040 && !menu.hidden) setMenu(false, false); });
  }

  /* ---------- active navigation ---------- */
  var navLinks = $$('.nav a'), ids = navLinks.map(function (a) { return a.getAttribute('href').slice(1); });
  function setActive(id) {
    navLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
  }
  // The last section is short, so the page can end before it reaches the top of the screen.
  function atBottom() { return window.innerHeight + window.scrollY >= d.documentElement.scrollHeight - 4; }
  var lastId = ids[ids.length - 1];
  if ('IntersectionObserver' in window) {
    var seen = {};
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting; });
      if (atBottom()) { setActive(lastId); return; }
      for (var i = 0; i < ids.length; i++) if (seen[ids[i]]) { setActive(ids[i]); return; }
    }, { rootMargin: '-45% 0px -50% 0px' });
    ids.forEach(function (id) { var s = d.getElementById(id); if (s) navIO.observe(s); });
  }
  window.addEventListener('scroll', function () { if (atBottom()) setActive(lastId); }, { passive: true });
  navLinks.forEach(function (a) { a.addEventListener('click', function () { setActive(a.getAttribute('href').slice(1)); }); });
  setActive('home');

  /* ---------- pause control for the animations ---------- */
  var pauseBtn = $('#pauseBtn');
  function paintPause() {
    if (!pauseBtn) return;
    var p = !!PF.paused, label = p ? 'Play animation' : 'Pause animation';
    pauseBtn.setAttribute('data-paused', p ? 'true' : 'false');
    pauseBtn.setAttribute('aria-label', label);
    var t = $('.pause-t', pauseBtn); if (t) t.textContent = label;
  }
  if (pauseBtn) {
    if (!PF.setPaused) { pauseBtn.hidden = true; }
    else pauseBtn.addEventListener('click', function () { PF.setPaused(!PF.paused); paintPause(); });
    paintPause();
  }

  /* ---------- previews: start each canvas only when it is near the screen ---------- */
  function mount(c) {
    if (c.getAttribute('data-mounted') || !PF.VisualHost) return;
    c.setAttribute('data-mounted', '1');
    try { c._host = new PF.VisualHost(c, c.getAttribute('data-visual'), { side: +c.getAttribute('data-side') || 1, panel: c.getAttribute('data-panel') === '1' }, null); }
    catch (err) { c.parentNode.classList.add('pv-failed'); }
  }
  var canvases = $$('canvas[data-visual]');
  if ('IntersectionObserver' in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { mount(e.target); vio.unobserve(e.target); } });
    }, { rootMargin: '300px 0px' });
    canvases.forEach(function (c) { vio.observe(c); });
  } else { canvases.forEach(mount); }

  /* ---------- Mathematics tabs ---------- */
  var tabs = $$('[data-math-tab]'), panels = $$('[data-math-panel]');
  function selectTab(id, focus) {
    var found = false;
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-math-tab') === id; if (on) found = true;
      t.setAttribute('aria-selected', on ? 'true' : 'false'); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    if (!found) return false;
    panels.forEach(function (p) { p.hidden = p.getAttribute('data-math-panel') !== id; });
    return true;
  }
  if (tabs.length && panels.length) {
    selectTab(tabs[0].getAttribute('data-math-tab'), false);
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { selectTab(t.getAttribute('data-math-tab'), false); });
      t.addEventListener('keydown', function (e) {
        var n = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = tabs.length - 1;
        if (n >= 0) { e.preventDefault(); selectTab(tabs[n].getAttribute('data-math-tab'), true); }
      });
    });
    // Links to a specific mathematics resource (such as the project index) show that panel first.
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a) return;
      var id = a.getAttribute('href').slice(1);
      if (panels.some(function (p) { return p.id === id; })) selectTab(id, false);
    });
    var fromHash = function (scroll) {
      var id = decodeURIComponent(location.hash.slice(1));
      if (id && panels.some(function (p) { return p.id === id; }) && selectTab(id, false) && scroll) {
        var el = d.getElementById(id); if (el) el.scrollIntoView();
      }
    };
    window.addEventListener('hashchange', function () { fromHash(true); });
    fromHash(false);
    window.addEventListener('load', function () { fromHash(true); });
  }

  /* ---------- scroll sequence: bridge to wind tunnel ----------
     A tall block holds one pinned stage. Scrolling through it moves a camera (see visuals-transition.js)
     from the bridge into the wind tunnel. Scroll position is the only input, so it is reversible and there
     is no auto-scrolling. Not used on small screens or with reduced motion: those get ordinary rows. */
  var seq = $('[data-seq]'), seqItems = seq ? $$('[data-seq-item]', seq) : [];
  var mqWide = window.matchMedia ? window.matchMedia('(min-width: 861px)') : { matches: false };
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var SEQ = { hold: 0.35, travel: 1.2, state: -1 };                        // lengths in screens: bridge view, transition, wind view
  var headH = function () { var h = $('.site-header'); return h ? h.offsetHeight : 72; };
  function seqOn() { return !!seq && seqItems.length === 2 && mqWide.matches && !mqReduce.matches; }
  function seqTop() { return seq.getBoundingClientRect().top + window.scrollY; }
  function seqHost() { var c = $('canvas[data-visual="bridgewind"]', seq); return c && c._host; }
  function setSeqState(i) {
    if (SEQ.state === i) return; SEQ.state = i;
    seqItems.forEach(function (it, k) { it.setAttribute('data-state', k === i ? 'on' : 'off'); });
    $$('[data-for]', seq).forEach(function (cap) { cap.hidden = cap.getAttribute('data-for') !== seqItems[i].id; });
  }
  function seqUpdate() {
    if (!seqOn() || !PF.seq) return;
    var y = window.scrollY - (seqTop() - headH());                         // 0 when the stage pins
    var tp = Math.min(1, Math.max(0, (y - SEQ.hold * window.innerHeight) / (SEQ.travel * window.innerHeight)));
    PF.seq.target = tp; setSeqState(tp < 0.5 ? 0 : 1);
    var host = seqHost(); if (host) host.refresh();
  }
  function seqApply() {
    var on = seqOn(); d.documentElement.classList.toggle('seq-on', on);
    if (!seq) return;
    if (!on) { if (PF.seq) PF.seq.target = 0; seq.style.height = ''; seqItems.forEach(function (it) { it.removeAttribute('data-state'); }); SEQ.state = -1; return; }
    var vh = window.innerHeight; seq.style.height = Math.round(vh - headH() + (SEQ.hold * 2 + SEQ.travel) * vh) + 'px';
    SEQ.state = -1; setSeqState(0); seqUpdate();
  }
  function seqJump(id) {                                                  // anchors keep working: land where that project is settled
    var base = seqTop() - headH();
    window.scrollTo(0, Math.round(id === seqItems[1].id ? base + (SEQ.hold + SEQ.travel) * window.innerHeight + 2 : base));
  }
  if (seq && PF.util) {
    PF.seq = { target: 0 };
    var ticking = false;
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(function () { ticking = false; seqUpdate(); }); } }, { passive: true });
    window.addEventListener('resize', seqApply);
    if (mqWide.addEventListener) { mqWide.addEventListener('change', seqApply); mqReduce.addEventListener('change', seqApply); }
    d.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || !seqOn()) return;
      var id = a.getAttribute('href').slice(1);
      if (seqItems.some(function (it) { return it.id === id; })) { e.preventDefault(); seqJump(id); if (window.history && history.replaceState) history.replaceState(null, '', '#' + id); }
    });
    // Tabbing to a link in the project that is not showing brings that project into view.
    seqItems.forEach(function (it) { it.addEventListener('focusin', function () { if (seqOn() && it.getAttribute('data-state') === 'off') seqJump(it.id); }); });
    window.addEventListener('hashchange', function () { var id = decodeURIComponent(location.hash.slice(1)); if (seqOn() && seqItems.some(function (it) { return it.id === id; })) seqJump(id); });
    window.addEventListener('load', function () { seqApply(); var id = decodeURIComponent(location.hash.slice(1)); if (seqOn() && seqItems.some(function (it) { return it.id === id; })) seqJump(id); });
    seqApply();
  }
})();
