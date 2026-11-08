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
    try { new PF.VisualHost(c, c.getAttribute('data-visual'), { side: +c.getAttribute('data-side') || 1, panel: c.getAttribute('data-panel') === '1' }, null); }
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
})();
