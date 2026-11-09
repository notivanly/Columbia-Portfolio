/* ==========================================================================
   core.js
   Shared utilities, the canvas "VisualHost", and the single render loop.
   Every animated visual in the site is registered on PF.visuals and driven
   from here, so only the canvases currently on screen are ever drawn.
   ========================================================================== */
(function (global) {
  'use strict';

  var PF = (global.PF = global.PF || {});
  var TAU = Math.PI * 2;

  /* ---------- small math helpers ---------- */
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function inOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }   // slow, fast, slow
  function out3(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }                                     // fast, then settles
  function in3(t) { t = clamp(t, 0, 1); return t * t * t; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }                                              // progress of t inside [a, b]

  // Seeded random number generator (mulberry32) so layouts are repeatable.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- colour + type helpers ---------- */
  function W(a) { return 'rgba(255,255,255,' + a + ')'; }
  function A(a) { return 'rgba(142,201,255,' + a + ')'; }          // light-blue accent
  function R(a) { return 'rgba(255,138,92,' + a + ')'; }          // warm tone, used for compression and Mars
  var MONO = '"Martian Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  function text(ctx, str, x, y, size, color, align) {
    if (PF.hideNumbers && /[0-9]/.test(str)) return;        // previews are illustrations: never show invented readings
    ctx.font = '500 ' + size + 'px ' + MONO;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function arrow(ctx, x1, y1, x2, y2, head) {
    head = head || 7;
    var a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
    ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
  }

  /* ---------- Statics: method of joints for 2D pin-jointed trusses ----------
     nodes    [{x,y}]
     members  [[a,b], ...]
     supports [{node, rx, ry}]  (reaction components that exist)
     loads    Float64Array [fx0, fy0, fx1, fy1, ...] (external, N or kN)
     Returns member forces (tension = +) and support reactions.               */
  function solveTruss(nodes, members, supports, loads) {
    var m = members.length, N = nodes.length * 2, reactions = [], i, j, k;
    supports.forEach(function (s) {
      if (s.rx) reactions.push([s.node, 0]);
      if (s.ry) reactions.push([s.node, 1]);
    });
    var M = [];
    for (i = 0; i < N; i++) M.push(new Float64Array(N + 1));
    members.forEach(function (mb, kk) {
      var a = mb[0], b = mb[1];
      var dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y, L = Math.hypot(dx, dy);
      var ux = dx / L, uy = dy / L;
      M[2 * a][kk] += ux; M[2 * a + 1][kk] += uy;
      M[2 * b][kk] -= ux; M[2 * b + 1][kk] -= uy;
    });
    reactions.forEach(function (r, ri) { M[2 * r[0] + r[1]][m + ri] = 1; });
    for (i = 0; i < N; i++) M[i][N] = -loads[i];

    // Gaussian elimination with partial pivoting.
    for (i = 0; i < N; i++) {
      var piv = i, best = Math.abs(M[i][i]);
      for (j = i + 1; j < N; j++) if (Math.abs(M[j][i]) > best) { best = Math.abs(M[j][i]); piv = j; }
      if (best < 1e-10) continue;
      if (piv !== i) { var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp; }
      for (j = i + 1; j < N; j++) {
        var f = M[j][i] / M[i][i];
        if (f === 0) continue;
        for (k = i; k <= N; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Float64Array(N);
    for (i = N - 1; i >= 0; i--) {
      if (Math.abs(M[i][i]) < 1e-10) { x[i] = 0; continue; }
      var sum = M[i][N];
      for (j = i + 1; j < N; j++) sum -= M[i][j] * x[j];
      x[i] = sum / M[i][i];
    }
    return {
      forces: x.subarray(0, m),
      reactions: reactions.map(function (r, ri) { return { node: r[0], axis: r[1], value: x[m + ri] }; })
    };
  }

  /* Warren truss: n panels, bottom chord nodes 0..n, top nodes n+1..2n. */
  function warren(n, L, H) {
    var nodes = [], members = [], i;
    for (i = 0; i <= n; i++) nodes.push({ x: i * L / n, y: 0 });
    for (i = 0; i < n; i++) nodes.push({ x: (i + 0.5) * L / n, y: H });
    var top = function (k) { return n + 1 + k; };
    for (i = 0; i < n; i++) members.push([i, i + 1]);
    for (i = 0; i < n - 1; i++) members.push([top(i), top(i + 1)]);
    for (i = 0; i < n; i++) { members.push([i, top(i)]); members.push([i + 1, top(i)]); }
    return { nodes: nodes, members: members, supports: [{ node: 0, rx: true, ry: true }, { node: n, ry: true }], bottom: n + 1 };
  }

  /* Pratt truss: n panels (n even). Bottom nodes 0..n, top nodes n+1..2n-1. */
  function pratt(n, L, H) {
    var nodes = [], members = [], i;
    for (i = 0; i <= n; i++) nodes.push({ x: i * L / n, y: 0 });
    for (i = 1; i < n; i++) nodes.push({ x: i * L / n, y: H });   // top i is node n + i
    for (i = 0; i < n; i++) members.push([i, i + 1]);
    for (i = 1; i < n - 1; i++) members.push([n + i, n + i + 1]);
    members.push([0, n + 1]); members.push([n, 2 * n - 1]);
    for (i = 1; i < n; i++) members.push([i, n + i]);
    for (i = 1; i < n / 2; i++) members.push([n + i, i + 1]);
    for (i = n / 2 + 1; i < n; i++) members.push([n + i, i - 1]);
    return { nodes: nodes, members: members, supports: [{ node: 0, rx: true, ry: true }, { node: n, ry: true }], bottom: n + 1 };
  }

  PF.util = {
    TAU: TAU, clamp: clamp, lerp: lerp, smooth: smooth, inOut: inOut, out3: out3, in3: in3, seg: seg, rng: rng,
    W: W, A: A, R: R, MONO: MONO, text: text, arrow: arrow,
    solveTruss: solveTruss, warren: warren, pratt: pratt
  };
  /* ---------- views ----------
     Every scene is drawn into a view V = { w, h, free, compact, lod, side }.
     V.free is the part of the canvas not covered by the text column, which is
     where the scene composes its main object.
       side +1: object on the right, text on the left.   side -1: the opposite.
       mode 'still': an ordinary row; the object may use the whole canvas.
       Narrow, upright canvases (860px and under, as in the stylesheet) put the object in the top part and the text below it. */
  PF.scenes = PF.scenes || {};
  PF.makeView = function (w, h, side, mode, textFrac) {
    var compact = w <= 860 && h + 64 >= w, fr;           // the stylesheet's stacked layout: 860px and under, held upright (orientation: portrait)
    if (mode === 'still') fr = { x0: 0, y0: 0, x1: w, y1: h };
    else if (compact) fr = { x0: 0, y0: h * 0.015, x1: w, y1: h * 0.55 };
    else {
      var tw = (h <= 458 ? Math.min(w * 0.47, 440) : Math.min(textFrac ? w * textFrac : 400, w * (textFrac || 0.29))) + 36;   // short landscape: the stylesheet widens the column
      if (side > 0) fr = { x0: tw, y0: h * 0.05, x1: w - 10, y1: h * 0.93 };
      else if (side < 0) fr = { x0: 10, y0: h * 0.05, x1: w - tw, y1: h * 0.93 };
      else fr = { x0: 0, y0: 0, x1: w, y1: h };
    }
    fr.w = fr.x1 - fr.x0; fr.h = fr.y1 - fr.y0; fr.cx = (fr.x0 + fr.x1) / 2; fr.cy = (fr.y0 + fr.y1) / 2;
    return { w: w, h: h, free: fr, compact: compact, lod: w < 760 ? 1 : 0, side: side, mode: mode || 'film', t: 0 };
  };

  PF.visuals = PF.visuals || {};
  PF.reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  PF.paused = PF.reduced;           // reduced motion starts paused; the visitor can opt in
  PF.hideNumbers = true;
  PF.pointer = { x: -1, y: -1, has: false };

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('pointermove', function (e) {
      PF.pointer.x = e.clientX; PF.pointer.y = e.clientY; PF.pointer.has = true;
    }, { passive: true });
    document.addEventListener('pointerleave', function () { PF.pointer.has = false; });
  }

  /* ---------- VisualHost: owns one <canvas> and one visual ---------- */
  var hosts = [], rafId = 0;

  function VisualHost(canvas, name, opts, hudEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.hudEl = hudEl || null;
    this.t = 0; this.last = 0; this.visible = false; this.w = 0; this.h = 0; this.dpr = 1;
    this.hudAt = 0; this.hudHTML = '';
    this.m = { x: 0.5, y: 0.5, nx: 0, ny: 0, px: 0, py: 0, rx: -9999, ry: -9999, active: 0 };
    this.setVisual(name);
    var self = this;
    this.resize();
    if (global.ResizeObserver) new ResizeObserver(function () { self.resize(); }).observe(canvas.parentElement);
    if (global.IntersectionObserver) {
      new IntersectionObserver(function (en) {
        self.visible = en[0].isIntersecting;
        self.last = 0;
        if (self.visible && !PF.paused) PF.start();
      }, { rootMargin: '8% 0px' }).observe(canvas);
    } else { this.visible = true; }
    hosts.push(this);
  }

  VisualHost.prototype.setVisual = function (name) {
    var f = PF.visuals[name] || function () { return { draw: function () {} }; };
    this.name = name;
    this.visual = f(this.opts);
    if (this.w) { this.visual.init && this.visual.init(this.w, this.h); this.hudHTML = ''; }
    if (PF.paused && this.w) this.still();
  };

  VisualHost.prototype.resize = function () {
    var r = this.canvas.parentElement.getBoundingClientRect();
    var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    while (w * h * dpr * dpr > 6.5e6 && dpr > 1) dpr -= 0.25;
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.visual.init && this.visual.init(w, h);
    if (PF.paused) this.still(); else this.render(0);
  };

  VisualHost.prototype.render = function (dt) {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.visual.draw(ctx, this.w, this.h, this.t, dt, this.m);
  };

  // Paused or reduced motion: advance the simulation silently once, then paint one frame.
  VisualHost.prototype.still = function () {
    if (!this.stilled) {
      var i;
      if (this.visual.advance) { for (i = 0; i < 170; i++) { this.t += 1 / 30; this.visual.advance(1 / 30, this.m); } this.render(0); }
      else { for (i = 0; i < 170; i++) { this.t += 1 / 30; this.render(1 / 30); } }
      this.stilled = true;
    } else this.render(0);
    this.updateHud(true);
  };

  // Repaint once (used when the scroll-linked camera moves while animation is paused).
  VisualHost.prototype.refresh = function () { if (this.w && PF.paused) this.render(0); };

  VisualHost.prototype.updateHud = function () {
    if (!this.hudEl || !this.visual.hud) return;
    var rows = this.visual.hud(), html = '', i;
    for (i = 0; i < rows.length; i++) html += '<div><dt>' + rows[i][0] + '</dt><dd>' + rows[i][1] + '</dd></div>';
    if (html !== this.hudHTML) { this.hudEl.innerHTML = html; this.hudHTML = html; }
  };

  VisualHost.prototype.frame = function (now) {
    var dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now; this.t += dt;
    var m = this.m, p = PF.pointer, r = this.canvas.getBoundingClientRect();
    var inside = p.has && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    var k = 1 - Math.exp(-dt * 5);
    var tx = inside ? (p.x - r.left) / r.width : 0.5, ty = inside ? (p.y - r.top) / r.height : 0.5;
    m.x += (tx - m.x) * k; m.y += (ty - m.y) * k;
    m.nx = (m.x - 0.5) * 2; m.ny = (m.y - 0.5) * 2;
    m.active += ((inside ? 1 : 0) - m.active) * k;
    m.px = m.x * this.w; m.py = m.y * this.h;
    m.rx = inside ? (p.x - r.left) * (this.w / r.width) : -9999;
    m.ry = inside ? (p.y - r.top) * (this.h / r.height) : -9999;
    if (this.visual.advance) this.visual.advance(dt, m);
    this.render(dt);
    if (now - this.hudAt > 140) { this.hudAt = now; this.updateHud(); }
  };

  function tick(now) {
    if (PF.paused || (typeof document !== 'undefined' && document.hidden)) { rafId = 0; return; }   // nothing drawn while paused or in a hidden tab
    var i, any = false;
    for (i = 0; i < hosts.length; i++) if (hosts[i].visible) { any = true; break; }
    if (!any) { rafId = 0; return; }                          // nothing on screen: stop the loop; an observer restarts it when something appears
    rafId = requestAnimationFrame(tick);
    for (i = 0; i < hosts.length; i++) if (hosts[i].visible) hosts[i].frame(now);
  }
  PF.start = function () { if (!rafId && !PF.paused && global.requestAnimationFrame) rafId = requestAnimationFrame(tick); };
  PF.setPaused = function (p) {
    PF.paused = !!p;
    for (var i = 0; i < hosts.length; i++) { hosts[i].last = 0; if (PF.paused) hosts[i].still(); }
    if (!PF.paused) PF.start();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () {
    for (var i = 0; i < hosts.length; i++) hosts[i].last = 0;
    if (!document.hidden) PF.start();
  });
  PF.VisualHost = VisualHost;

})(typeof window !== 'undefined' ? window : globalThis);
