/* ==========================================================================
   scenes-learn.js
   Scene 8: Learning tools.

   One showcase for four tools: SAT Question Bank Tracker, AMC Practice, Calculus III
   Visualizer and AP Atlas. A large preview of the chosen tool and a short caption.
   Three previews are real captures of the sites (assets/learn/*.webp, taken from local
   copies of the repositories, so fonts can differ slightly from the live pages).
   The SAT extension runs inside another website, so it is shown as a small working
   illustration of what it does (badges on questions, and a summary); the caption says
   so, and that illustration is not a screenshot.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth, A = U.A;

  var TOOLS = [
    { id: 'sat',   name: 'SAT Question Bank Tracker', host: 'Chrome Web Store', cap: 'Illustration of the idea, not a screenshot. Click a badge to change it.', capS: 'Illustration, not a screenshot. Tap a badge.' },
    { id: 'amc',   name: 'AMC Practice',              host: 'notivanly.github.io/AMCPRactice', img: 'assets/learn/amc-practice.webp', cap: 'Capture of the site.' },
    { id: 'calc',  name: 'Calculus III Visualizer',   host: 'notivanly.github.io/Calculus-III-Visualizer', img: 'assets/learn/calculus-iii.webp', cap: 'Capture of the site.' },
    { id: 'atlas', name: 'AP Atlas',                  host: 'notivanly.github.io/AP-Atlas', img: 'assets/learn/ap-atlas.webp', cap: 'Capture of the site.' }
  ];
  var Lr = PF.learn = { tool: 'sat', TOOLS: TOOLS, version: 0, marks: [1, 2, 0, 3, 1, 0, 2], last: 0, pop: [], imgs: {} };
  Lr.set = function (id) { if (TOOLS.some(function (t) { return t.id === id; }) && id !== Lr.tool) { Lr.tool = id; Lr.version++; } };
  Lr.cycle = function (row) { row = row == null ? (Lr.last + 1) % Lr.marks.length : row; Lr.marks[row] = (Lr.marks[row] + 1) % 4; Lr.last = row; Lr.pop[row] = 1; Lr.version++; };
  Lr.counts = function () { var c = [0, 0, 0, 0]; Lr.marks.forEach(function (m) { c[m]++; }); return c; };
  Lr.byId = function (id) { for (var i = 0; i < TOOLS.length; i++) if (TOOLS[i].id === id) return TOOLS[i]; return TOOLS[0]; };

  function preload() {                                                  // the captures load early, so the preview is ready by the time the section is reached
    if (Lr.loading || !global.Image) return; Lr.loading = true;
    TOOLS.forEach(function (t) {
      if (!t.img) return; var im = new global.Image(); im.decoding = 'async';
      im.onload = function () { Lr.imgs[t.id] = im; if (PF.input && PF.input.repaint) PF.input.repaint(); };
      im.src = t.img;
    });
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }

  var BADGE = [
    { name: 'Not marked', fill: 'rgba(255,255,255,0.05)', line: 'rgba(255,255,255,0.22)', ink: 'rgba(245,245,242,0.6)' },
    { name: 'Correct',    fill: 'rgba(142,201,255,0.2)',  line: 'rgba(142,201,255,0.9)', ink: 'rgb(190,226,255)' },
    { name: 'Incorrect',  fill: 'rgba(255,150,110,0.18)', line: 'rgba(255,150,110,0.9)', ink: 'rgb(255,190,160)' },
    { name: 'Flagged',    fill: 'rgba(245,245,242,0.14)', line: 'rgba(245,245,242,0.8)', ink: 'rgb(245,245,242)' }
  ];
  var DOMAINS = ['Algebra', 'Advanced Math', 'Problem-Solving and Data', 'Geometry and Trigonometry', 'Algebra', 'Advanced Math', 'Problem-Solving and Data'];

  S.learn = function () {
    var st = { shown: 'sat', prev: null, t: 1, rows: [], V: null, win: null };
    preload();

    function winRect(V) {
      var fr = V.free, capH = V.lod ? 44 : 54, aspect = 1120 / 700, bar = V.lod ? 22 : 28;
      var w = Math.min(fr.w * 0.98, (fr.h - capH - bar) * aspect), h = w / aspect + bar;
      return { x: fr.cx - w / 2, y: fr.cy - (h + capH) / 2, w: w, h: h, bar: bar, capH: capH };
    }

    function frameChrome(ctx, W, tool, alpha) {
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgb(20,23,28)'; rr(ctx, W.x, W.y, W.w, W.h, 10); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
      var k, cy = W.y + W.bar / 2;
      for (k = 0; k < 3; k++) { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.beginPath(); ctx.arc(W.x + 14 + k * 11, cy, 3, 0, TAU); ctx.fill(); }
      var px = W.x + 52, pw = W.w - 52 - 12; ctx.fillStyle = 'rgba(255,255,255,0.06)'; rr(ctx, px, cy - 8, pw, 16, 8); ctx.fill();
      U.text(ctx, tool.host, px + 10, cy + 3.6, W.w < 420 ? 9 : 10.5, 'rgba(245,245,242,0.7)', 'left', true);
      ctx.restore();
    }

    function drawSat(ctx, V, W, alpha) {
      var cx0 = W.x, cy0 = W.y + W.bar, cw = W.w, ch = W.h - W.bar, pad = Math.max(8, cw * 0.03), n = Lr.marks.length, i;
      var narrow = cw < 340;                                                                // a small phone: the rows take the whole window, and the counts are in the panel below
      var listW = narrow ? cw - pad * 2 : cw * (V.lod ? 0.64 : 0.62), rowH = (ch - pad * 2 - 16) / n, fs = V.lod ? 10 : 12.5;
      ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath(); ctx.rect(cx0, cy0, cw, ch); ctx.clip();
      U.text(ctx, 'Questions', cx0 + pad, cy0 + pad + 11, V.lod ? 10 : 12, 'rgba(245,245,242,0.55)', 'left', true);
      st.rows = [];
      for (i = 0; i < n; i++) {
        var y = cy0 + pad + 16 + i * rowH, m = Lr.marks[i], b = BADGE[m], pop = Lr.pop[i] || 0, bw = (narrow ? 56 : V.lod ? 62 : 84) * (1 + 0.12 * pop), bh = Math.min(rowH * 0.62, 24) * (1 + 0.1 * pop), bx = cx0 + pad + listW - bw;
        ctx.fillStyle = i === Lr.last ? 'rgba(142,201,255,0.07)' : 'rgba(255,255,255,0.03)'; rr(ctx, cx0 + pad, y, listW, rowH - 4, 6); ctx.fill();
        U.text(ctx, 'Question ' + (i + 1), cx0 + pad + 9, y + (rowH - 4) / 2 - 2, fs, 'rgba(245,245,242,0.92)', 'left', true);
        if (!narrow && (!V.lod || rowH > 30)) U.text(ctx, DOMAINS[i % DOMAINS.length], cx0 + pad + 9, y + (rowH - 4) / 2 + fs + 1, V.lod ? 8 : 10, 'rgba(245,245,242,0.5)', 'left', true);
        ctx.fillStyle = b.fill; ctx.strokeStyle = b.line; ctx.lineWidth = 1.2; if (m === 0) ctx.setLineDash([3, 3]);
        rr(ctx, bx - 6, y + (rowH - 4) / 2 - bh / 2, bw, bh, bh / 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
        U.text(ctx, b.name, bx - 6 + bw / 2, y + (rowH - 4) / 2 + 3.6, V.lod ? 9 : 11, b.ink, 'center', true);
        st.rows.push({ x: cx0 + pad, y: y, w: listW, h: rowH - 4 });
      }
      if (narrow) { ctx.restore(); return; }
      var px = cx0 + pad * 2 + listW, pw = cx0 + cw - pad - px, py = cy0 + pad + 16, ph = Math.min(ch - pad * 2 - 16, (V.lod ? 118 : 150));
      ctx.fillStyle = 'rgba(8,10,13,0.85)'; rr(ctx, px, py, pw, ph, 8); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
      U.text(ctx, 'Summary', px + 10, py + 17, V.lod ? 10 : 12, '#fff', 'left', true);
      var c = Lr.counts(), order = [1, 2, 3, 0], tot = Math.max(1, n);
      order.forEach(function (m, j) {
        var yy = py + 36 + j * (V.lod ? 20 : 25); U.text(ctx, BADGE[m].name, px + 10, yy, V.lod ? 9 : 11, 'rgba(245,245,242,0.78)', 'left', true); U.text(ctx, String(c[m]), px + pw - 10, yy, V.lod ? 10 : 12, '#fff', 'right', true);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px + 10, yy + 4, pw - 20, 2.5); ctx.fillStyle = BADGE[m].line; ctx.fillRect(px + 10, yy + 4, (pw - 20) * c[m] / tot, 2.5);
      });
      ctx.restore();
    }

    function drawTool(ctx, V, W, tool, alpha, dx) {
      ctx.save(); ctx.translate(dx, 0);
      frameChrome(ctx, W, tool, alpha);
      ctx.save(); ctx.beginPath(); rr(ctx, W.x, W.y + W.bar, W.w, W.h - W.bar, 0); ctx.clip();
      if (tool.id === 'sat') drawSat(ctx, V, W, alpha);
      else {
        var im = Lr.imgs[tool.id];
        if (im) { ctx.globalAlpha = alpha; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, W.x, W.y + W.bar, W.w, W.h - W.bar); }
        else { ctx.globalAlpha = alpha; ctx.fillStyle = 'rgb(16,18,22)'; ctx.fillRect(W.x, W.y + W.bar, W.w, W.h - W.bar); U.text(ctx, tool.name, W.x + W.w / 2, W.y + W.bar + (W.h - W.bar) / 2, V.lod ? 14 : 18, 'rgba(245,245,242,0.7)', 'center', true); }
      }
      ctx.restore(); ctx.restore();
    }

    function advance(dt) {
      st.t = Math.min(1, st.t + dt * 3.2);
      for (var i = 0; i < Lr.pop.length; i++) if (Lr.pop[i] > 0) Lr.pop[i] = Math.max(0, Lr.pop[i] - dt * 4);
    }

    function draw(ctx, V, o) {
      o = o || {}; st.V = V;
      if (st.shown !== Lr.tool) { st.prev = st.shown; st.shown = Lr.tool; st.t = PF.paused ? 1 : 0; }
      if (PF.paused) { st.t = 1; for (var q = 0; q < Lr.pop.length; q++) Lr.pop[q] = 0; }
      var fr = V.free, W = winRect(V), e = smooth(st.t), tool = Lr.byId(st.shown);
      st.win = W;
      ctx.fillStyle = 'rgb(12,14,17)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, fr.cx, fr.cy, Math.max(V.w, V.h) * 0.5, [100, 140, 190], 0.1);
      /* the window's shadow, then the old preview sliding out and the new one in */
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10; ctx.fillStyle = 'rgb(20,23,28)'; rr(ctx, W.x, W.y, W.w, W.h, 10); ctx.fill(); ctx.restore();
      if (e < 1 && st.prev) drawTool(ctx, V, W, Lr.byId(st.prev), 1 - e, -26 * e);
      drawTool(ctx, V, W, tool, st.prev && e < 1 ? e : 1, st.prev && e < 1 ? 26 * (1 - e) : 0);
      if (!o.nolabels) {
        var cy = W.y + W.h + (V.lod ? 16 : 20);
        U.text(ctx, tool.name, W.x + 2, cy, V.lod ? (W.w < 300 ? 11 : 13) : 16, '#fff', 'left', true);
        U.text(ctx, V.lod && tool.capS ? tool.capS : tool.cap, W.x + 2, cy + (V.lod ? 15 : 19), V.lod ? 10 : 12, 'rgba(245,245,242,0.74)', 'left', true);
        var k, n = TOOLS.length;                                                   // which of the four is showing
        for (k = 0; k < n; k++) { ctx.fillStyle = TOOLS[k].id === Lr.tool ? A(1) : 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(W.x + W.w - 8 - (n - 1 - k) * 14, cy - 4, TOOLS[k].id === Lr.tool ? 4 : 3, 0, TAU); ctx.fill(); }
      }
    }

    var input = {
      tap: function (x, y) {
        if (Lr.tool !== 'sat') return;
        var i; for (i = 0; i < st.rows.length; i++) { var r = st.rows[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { Lr.cycle(i); return; } }
      },
      cursor: function (x, y) { if (Lr.tool !== 'sat') return ''; var i; for (i = 0; i < st.rows.length; i++) { var r = st.rows[i]; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return 'pointer'; } return ''; }
    };
    return {
      id: 'learn', sim: Lr, side: -1, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      window: winRect,
      anchor: function (V) { var W = winRect(V); return { x: W.x + W.w / 2, y: W.y + W.h / 2, r: W.w / 2 }; }
    };
  };

  /* ---------- the Learning tools panel ---------- */
  PF.labs.add('learn', function (root, h) {
    h.seg('tool', function (v) { Lr.set(v); });
    h.btn('next', function () { Lr.cycle(); });
    return {
      sync: function () {
        h.setSeg('tool', Lr.tool);
        TOOLS.forEach(function (t) { h.show('tool-' + t.id, t.id === Lr.tool); });
        var c = Lr.counts();
        h.text('sat-r', 'Correct ' + c[1] + ', Incorrect ' + c[2] + ', Flagged ' + c[3] + ', Not marked ' + c[0]);
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
