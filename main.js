/* ==========================================================================
   main.js
   Builds the project scenes from js/data.js, binds your contact details,
   starts the canvas visuals, and runs the scroll engine (section counter,
   parallax, reveals, navigation).
   ========================================================================== */
(function () {
  'use strict';

  var PF = window.PF, D = window.PF_DATA, U = PF.util;
  var doc = document, root = doc.documentElement;

  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var ARROW = '<svg class="ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9l6-6M4 3h5v5"/></svg>';

  /* A link is "pending" until you replace the "#" in data.js with a real URL. */
  function linkHTML(label, href) {
    var pending = !href || href === '#';
    return '<a class="link' + (pending ? ' is-pending' : '') + '" href="' + (pending ? '#' : esc(href)) + '"' +
      (pending ? ' aria-disabled="true" title="Link coming soon"' : ' target="_blank" rel="noopener noreferrer"') + '>' +
      esc(label) + ARROW + '</a>';
  }
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[aria-disabled="true"]');
    if (a) e.preventDefault();
  });

  /* ---------- 1. Your details (data.js -> page) ---------- */
  var site = D.site || {};
  var derived = {
    githubLabel: String(site.github || '').replace(/^https?:\/\/(www\.)?/, ''),
    linkedinLabel: String(site.linkedin || '').replace(/^https?:\/\/(www\.)?/, '')
  };
  $$('[data-site-text]').forEach(function (el) {
    var k = el.getAttribute('data-site-text');
    el.textContent = site[k] != null ? site[k] : (derived[k] || '');
  });
  $$('[data-site-href]').forEach(function (el) {
    var k = el.getAttribute('data-site-href');
    el.setAttribute('href', k === 'email' ? 'mailto:' + (site.email || '') : (site[k] || '#'));
  });

  /* ---------- 2. Project scenes ---------- */
  function sceneHTML(p, i, total) {
    var flip = p.side < 0;
    var lines = (p.title || []).map(function (l, k) {
      return '<span class="line"><span style="--i:' + k + '">' + esc(l) + '</span></span>';
    }).join('');
    var tags = (p.tags || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    return '<article class="slide scene' + (flip ? ' is-flip' : '') + '" id="' + esc(p.id) + '" data-slide data-tone="' + esc(p.tone || 'dark') + '"' +
      ' style="--cy:' + esc(p.cy || '28%') + '; --gx:' + (flip ? '30%' : '70%') + '; --gy:38%; --ox:' + (flip ? '31%' : '69%') + '; --oy:54%" aria-labelledby="' + esc(p.id) + '-t">' +
      '<div class="stage"><canvas data-visual="' + esc(p.visual) + '" data-side="' + (flip ? -1 : 1) + '" aria-hidden="true"></canvas></div>' +
      '<p class="index mono"><span>' + pad(i + 1) + '</span> / ' + pad(total) + '<em class="cat">' + esc(p.category) + '</em></p>' +
      '<div class="copy">' +
        '<h2 class="title" id="' + esc(p.id) + '-t">' + lines + '</h2>' +
        '<p class="desc" data-r style="--d:450">' + esc(p.description) + '</p>' +
        (tags ? '<ul class="tags" data-r style="--d:600">' + tags + '</ul>' : '') +
      '</div>' +
      '<div class="foot">' + linkHTML('Live demo', p.links && p.links.demo) + linkHTML('Source code', p.links && p.links.source) + '</div>' +
      '<dl class="hud" aria-hidden="true"></dl>' +
    '</article>';
  }
  var projectsRoot = $('#projects');
  projectsRoot.innerHTML = (D.projects || []).map(function (p, i, a) { return sceneHTML(p, i, a.length); }).join('');

  /* ---------- 3. Mathematics list ---------- */
  var mathHost = null, mathIndex = 0, mathLast = 0;
  function buildMath() {
    var items = D.math || [], list = $('#mathList'), desc = $('#mathDesc'), links = $('#mathLinks'), stage = $('#mathCanvas').parentNode;
    list.innerHTML = items.map(function (m, i) {
      return '<li><button type="button" class="math-item" data-i="' + i + '"><span class="n">' + pad(i + 1) + '</span><span class="t">' + esc(m.title) + '</span></button></li>';
    }).join('');
    function select(i, byUser) {
      if (!items.length) return;
      mathIndex = i; if (byUser) mathLast = Date.now();
      $$('.math-item', list).forEach(function (b, k) { b.classList.toggle('is-active', k === i); b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      var m = items[i];
      desc.textContent = m.description || '';
      links.innerHTML = linkHTML('Live demo', m.links && m.links.demo) + linkHTML('Source code', m.links && m.links.source);
      if (mathHost && mathHost.name !== m.visual) {
        stage.classList.add('swap');
        setTimeout(function () { mathHost.setVisual(m.visual); mathHost.updateHud(); stage.classList.remove('swap'); }, 240);
      }
    }
    list.addEventListener('click', function (e) { var b = e.target.closest('.math-item'); if (b) select(+b.getAttribute('data-i'), true); });
    list.addEventListener('mouseover', function (e) { var b = e.target.closest('.math-item'); if (b && +b.getAttribute('data-i') !== mathIndex) select(+b.getAttribute('data-i'), true); });
    list.addEventListener('focusin', function (e) { var b = e.target.closest('.math-item'); if (b) select(+b.getAttribute('data-i'), true); });
    select(0, false);
    setInterval(function () {
      var slide = $('.slide.math');
      if (PF.reduced || !inView.has(slide) || Date.now() - mathLast < 12000 || items.length < 2) return;
      select((mathIndex + 1) % items.length, false);
    }, 7000);
  }

  /* ---------- 4. Section rail ---------- */
  var ids = ['home', 'projects', 'mathematics', 'engineering', 'about', 'contact'];
  var names = ['Home', 'Projects', 'Mathematics', 'Engineering', 'About', 'Contact'];
  var rail = $('#rail');
  rail.innerHTML = ids.map(function (id, i) {
    return '<a href="#' + id + '" data-rail="' + (i + 1) + '" aria-label="' + names[i] + '"><span class="num mono">00' + (i + 1) + '</span><i></i></a>';
  }).join('');

  var activeChapter = 0, navMap = { 1: 1, 2: 2, 3: 2, 4: 4, 5: 5, 6: 6 };
  function setActive(n) {
    activeChapter = n;
    $$('[data-rail]').forEach(function (a) { var on = +a.getAttribute('data-rail') === n; a.classList.toggle('is-active', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    $$('[data-nav]').forEach(function (a) { var on = +a.getAttribute('data-nav') === navMap[n]; a.classList.toggle('is-active', on); });
  }

  /* ---------- 5. Visuals ---------- */
  var inView = new Set();
  var hosts = [];
  function startVisuals() {
    $$('canvas[data-visual]').forEach(function (cv) {
      var slide = cv.closest('.slide'), hudEl = slide.querySelector('.hud');
      var host = new PF.VisualHost(cv, cv.getAttribute('data-visual'), { side: +cv.getAttribute('data-side') || 1 }, hudEl);
      host.updateHud();
      slide._cv = cv; slide._copy = slide.querySelector('.copy');
      if (cv.id === 'mathCanvas') mathHost = host;
      hosts.push(host);
    });
  }

  /* ---------- 6. Scroll engine ---------- */
  var slides = [], chapters = [], vh = window.innerHeight, ticking = false, ready = false;

  function update() {
    ticking = false;
    root.classList.toggle('is-top', window.scrollY < 40);
    var cur = 1, i, r;
    for (i = 0; i < chapters.length; i++) {
      r = chapters[i].getBoundingClientRect();
      if (r.top <= vh * 0.5 && r.bottom > vh * 0.5) cur = +chapters[i].getAttribute('data-chapter');
    }
    if (cur !== activeChapter) setActive(cur);
    if (PF.reduced) return;
    inView.forEach(function (s) {
      var b = s.getBoundingClientRect();
      var p = U.clamp(((b.top + b.height / 2) - vh / 2) / (vh / 2 + b.height / 2), -1, 1);
      if (s._cv) s._cv.style.transform = 'scale(' + (1 + 0.07 * Math.max(p, 0) + 0.03 * Math.max(-p, 0)).toFixed(4) + ')';
      if (s._copy) s._copy.style.transform = 'translate3d(0,' + (p * -26).toFixed(1) + 'px,0)';
    });
  }
  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', function () { vh = window.innerHeight; schedule(); });

  function observe() {
    slides = $$('[data-slide]'); chapters = $$('.chapter');
    if (PF.reduced || !('IntersectionObserver' in window)) { slides.forEach(function (s) { s.classList.add('in'); }); }
    if (!('IntersectionObserver' in window)) return;
    var ioVis = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) inView.add(e.target); else inView.delete(e.target); });
      schedule();
    }, { rootMargin: '10% 0px' });
    var ioIn = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (e.target.classList.contains('hero') && !ready) return;
        e.target.classList.add('in'); ioIn.unobserve(e.target);
      });
    }, { threshold: 0.2 });
    slides.forEach(function (s) { ioVis.observe(s); ioIn.observe(s); });
  }

  /* ---------- 7. Menu (small screens) ---------- */
  var menuBtn = $('.menu-btn'), menu = $('#menu');
  function setMenu(open) {
    menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.textContent = open ? 'Close' : 'Menu'; root.classList.toggle('menu-open', open);
  }
  menuBtn.addEventListener('click', function () { setMenu(menu.hidden); });
  menu.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });

  /* ---------- 8. Go ---------- */
  buildMath();
  startVisuals();
  observe();
  setActive(1);
  update();
  if (PF.reduced) root.classList.add('reduce');

  function go() {
    if (ready) return; ready = true;
    doc.body.classList.remove('is-loading'); doc.body.classList.add('is-ready');
    var hero = $('.hero'); if (hero) hero.classList.add('in');
    update();
  }
  var fontsReady = (doc.fonts && doc.fonts.ready) ? Promise.race([doc.fonts.ready, new Promise(function (r) { setTimeout(r, 1500); })]) : Promise.resolve();
  fontsReady.then(function () { requestAnimationFrame(go); });
  setTimeout(go, 2200);   // safety net
})();
