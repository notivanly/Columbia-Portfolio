/* ==========================================================================
   main.js
   Page behaviour. Every piece of content and every link works without this
   file; it adds the scroll-driven film, direct jumps to any project, the
   mobile menu, the active navigation item and the pause control.

   Two modes share one DOM:
     film   one pinned stage drawn by film.js; scroll position is the only
            input (no auto-scrolling, no scroll hijacking, fully reversible)
     rows   ordinary rows, each with its own still preview. Used when the
            visitor prefers reduced motion, and as the fallback if anything
            in the film fails.
   ========================================================================== */
(function () {
  'use strict';
  var d = document, root = d.documentElement, PF = window.PF || {}, F = PF.film;
  function $(s, r) { return (r || d).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); }

  /* ---------- mobile menu ---------- */
  var menu = $('#menu'), menuBtn = $('#menuBtn');
  function setMenu(open, returnFocus) {
    if (!menu || !menuBtn) return;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.textContent = open ? 'Close' : 'Menu';
    root.style.overflow = open ? 'hidden' : '';
    if (open) { var first = $('a', menu); if (first) first.focus(); }
    else if (returnFocus) menuBtn.focus();
  }
  if (menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(menu.hidden, false); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false, false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false, true); });
    window.addEventListener('resize', function () { if (window.innerWidth > 1040 && !menu.hidden) setMenu(false, false); });
  }

  /* ---------- pause control ---------- */
  var pauseBtn = $('#pauseBtn');
  function paintPause() {
    if (!pauseBtn) return;
    var p = !!PF.paused, label = p ? 'Play animation' : 'Pause animation';
    pauseBtn.setAttribute('data-paused', p ? 'true' : 'false');
    pauseBtn.setAttribute('aria-label', label);
    var t = $('.pause-t', pauseBtn); if (t) t.textContent = label;
  }
  if (pauseBtn) {
    if (!PF.setPaused) pauseBtn.hidden = true;
    else pauseBtn.addEventListener('click', function () { PF.setPaused(!PF.paused); paintPause(); });
    paintPause();
  }

  /* ---------- scene index: which scene does each link or anchor mean? ---------- */
  var filmEl = $('#film'), stage = $('.film-stage'), canvas = $('#filmCanvas'), scenes = $$('.scene[data-scene]');
  var sceneOf = {};                                           // element id -> scene index
  scenes.forEach(function (el) { sceneOf[el.id] = +el.getAttribute('data-scene'); });
  sceneOf.projects = 1; sceneOf.mathematics = 7;
  var NAV = ['home', 'projects', 'mathematics', 'about', 'contact'];
  function headH() { var h = $('.site-header'); return h ? h.offsetHeight : 72; }

  /* ---------- the film ---------- */
  var mqReduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var host = null, filmOn = false, failed = false, stageH = 0, tickEls = $$('.film-ticks a'), capEl = $('#filmCap');
  var last = { i: -1, u: -1, w: '', active: -1, cap: '', nav: '' };

  function filmTop() { return filmEl.getBoundingClientRect().top + window.scrollY; }
  function scrollToS(s) { window.scrollTo(0, Math.round(filmTop() + s * stageH)); }
  function jumpToScene(i) {
    var s = i === 0 ? 0 : F.sceneCenter(i);
    F.target = s; F.snap();                                    // an anchor jump goes straight there; no fast-forward through the scenes between
    scrollToS(s);
    readScroll();
  }

  function layoutFilm() {
    stageH = stage.clientHeight;
    filmEl.style.height = Math.round(headH() + stageH * (1 + F.TL.total)) + 'px';
  }

  function readScroll() {
    if (!filmOn || !stageH) return;
    F.target = Math.min(F.TL.total, Math.max(0, (window.scrollY - filmTop()) / stageH));
    if (host && PF.paused) host.refresh();                       // paused: draw straight away; otherwise the render loop picks it up
    else if (host) PF.start();
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    window.requestAnimationFrame(function () { ticking = false; readScroll(); if (!filmOn) rowsActive(); });
  }

  /* text, caption, ticks and header navigation follow the film */
  function onFilmUpdate(loc, w) {
    var key = w.map(function (x) { return x.toFixed(2); }).join(',');
    if (key !== last.w) {
      last.w = key;
      scenes.forEach(function (el) {
        var i = +el.getAttribute('data-scene'), v = w[i] || 0;
        el.style.opacity = v < 0.01 ? '0' : v.toFixed(3);
        el.setAttribute('data-on', v > 0.5 ? '1' : '0');
      });
    }
    var active = loc.u > 0.5 ? loc.i + 1 : loc.i;
    if (active !== last.active) {
      last.active = active;
      tickEls.forEach(function (a, k) {
        var idx = k + 1, on = idx === active;
        if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
        a.setAttribute('data-seen', idx < active ? '1' : '0');
      });
    }
    var navId = active === 0 ? 'home' : active <= 6 ? 'projects' : active <= 9 ? 'mathematics' : (F.cur > F.TL.total - 0.22 ? 'contact' : 'about');
    if (navId !== last.nav) { last.nav = navId; setActive(navId); }
    if (capEl) {
      var txt = loc.u > 0.04 && loc.u < 0.96 ? 'Decorative transition. Not a simulation.' : captionOf(active);
      if (txt !== last.cap) { last.cap = txt; capEl.textContent = txt; }
    }
  }
  function captionOf(i) {
    var el = scenes.filter(function (s) { return +s.getAttribute('data-scene') === i; })[0], c = el && $('figcaption', el);
    return c ? c.textContent : '';
  }

  /* header navigation: highlight the current section in both modes */
  var navLinks = $$('.nav a');
  function setActive(id) {
    navLinks.forEach(function (a) { if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
  }
  function atBottom() { return window.innerHeight + window.scrollY >= d.documentElement.scrollHeight - 4; }
  function rowsActive() {
    var y = window.scrollY + headH() + window.innerHeight * 0.35, cur = 'home';
    NAV.forEach(function (id) { var el = d.getElementById(id); if (el && el.getBoundingClientRect().top + window.scrollY <= y) cur = id; });
    if (atBottom()) cur = 'contact';
    setActive(cur);
  }
  setActive('home');

  /* ---------- go to a section: jumps land where that scene is settled ---------- */
  function targetScene(id) { return sceneOf.hasOwnProperty(id) ? sceneOf[id] : -1; }
  d.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]'); if (!a || !filmOn) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1)), i = targetScene(id);
    if (i < 0) return;
    e.preventDefault();
    if (id === 'contact') { F.target = F.TL.total - 0.1; F.snap(); scrollToS(F.target); readScroll(); }
    else jumpToScene(i);
    if (window.history && history.replaceState) history.replaceState(null, '', '#' + id);
  });
  window.addEventListener('hashchange', function () {
    if (!filmOn) return;
    var id = decodeURIComponent(location.hash.slice(1)), i = targetScene(id);
    if (i >= 0) jumpToScene(i);
  });
  // Tabbing to a link in a scene that is not showing brings that scene into view.
  scenes.forEach(function (el) {
    el.addEventListener('focusin', function () {
      if (!filmOn || el.getAttribute('data-on') === '1') return;
      jumpToScene(+el.getAttribute('data-scene'));
    });
  });

  /* ---------- rows mode: a still preview for each row, started when scrolled near ---------- */
  function mountStill(c) {
    if (c.getAttribute('data-mounted') || !PF.VisualHost) return;
    c.setAttribute('data-mounted', '1');
    try { c._host = new PF.VisualHost(c, 'still', { key: c.getAttribute('data-still') }, null); }
    catch (err) { c.parentNode.classList.add('pv-failed'); }
  }
  var stills = $$('canvas[data-still]'), stillIO = null;
  function startRows() {
    if ('IntersectionObserver' in window) {
      if (!stillIO) stillIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { mountStill(e.target); stillIO.unobserve(e.target); } });
      }, { rootMargin: '300px 0px' });
      stills.forEach(function (c) { if (!c.getAttribute('data-mounted')) stillIO.observe(c); });
    } else stills.forEach(mountStill);
    rowsActive();
  }

  /* ---------- choose a mode ---------- */
  function wantFilm() { return !mqReduce.matches && !failed && !!(PF.visuals && PF.visuals.film && PF.VisualHost && F && stage && canvas); }
  function clearFilmState() {
    filmOn = false; root.classList.remove('film-on'); filmEl.style.height = '';
    scenes.forEach(function (el) { el.style.opacity = ''; el.removeAttribute('data-on'); });
    last = { i: -1, u: -1, w: '', active: -1, cap: '', nav: '' };
  }
  function applyMode() {
    var want = wantFilm();
    if (want && !filmOn) {
      try {
        filmOn = true; root.classList.add('film-on');
        layoutFilm();
        if (!host) { host = new PF.VisualHost(canvas, 'film', {}, null); canvas._host = host; F.onUpdate = onFilmUpdate; }
        readScroll(); host.resize();
      } catch (err) {                                           // anything wrong with the film: fall back to ordinary rows
        failed = true; host = null; clearFilmState();
        if (window.console) console.warn('Film disabled:', err);
        startRows();
      }
    } else if (!want && filmOn) { clearFilmState(); startRows(); }
    else if (!want) startRows();
  }

  var resizing = false;
  window.addEventListener('resize', function () {
    if (resizing) return; resizing = true;
    window.requestAnimationFrame(function () {
      resizing = false;
      var was = filmOn, s = F && F.target;
      applyMode();
      if (filmOn && was) { layoutFilm(); scrollToS(s); readScroll(); if (host) host.resize(); }
    });
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', applyMode);

  applyMode();
  window.addEventListener('load', function () {
    if (filmOn) layoutFilm();
    var id = decodeURIComponent(location.hash.slice(1)), i = targetScene(id);
    if (filmOn && i >= 0) jumpToScene(i);
    else if (filmOn) readScroll();
    else if (id) { var el = d.getElementById(id); if (el) el.scrollIntoView(); }
  });
})();
