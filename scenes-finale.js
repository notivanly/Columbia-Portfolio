/* ==========================================================================
   scenes-finale.js
   Scene 9: the ending, "Build your own constellation".

   Click or tap to place a star, drag a star to move it, and (in Connect mode) tap one
   star and then another to draw or remove the line between them. Nothing is saved or
   sent anywhere and there is no account; Reset clears the sky. The stars live in
   PF.sim.stars (sim-motion.js) in normalised coordinates, so a resize keeps them where
   they were. The About and Contact text sit beneath the sky in ordinary HTML, so every
   link stays usable, and the sky only takes taps inside its own area.
   Every action also has a button or menu in the panel, for keyboard use.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, A = U.A, St = PF.sim.stars;

  var DIPPER = { stars: [[0.74, 0.3], [0.72, 0.56], [0.55, 0.62], [0.52, 0.42], [0.4, 0.36], [0.27, 0.32], [0.14, 0.4]], links: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]] };
  function example() { St.reset(); DIPPER.stars.forEach(function (p) { St.add(p[0], p[1]); }); DIPPER.links.forEach(function (l) { St.link(l[0], l[1]); }); St.select(-1); }

  S.finale = function () {
    var st = { V: null, drag: -1, moved: false, mx: -1, my: -1, born: {}, dust: [], t: 0, down: null };
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    (function () { var r = U.rng(23), i; for (i = 0; i < 130; i++) st.dust.push([r(), r(), 0.5 + r() * 1.1, r() * TAU, 0.1 + r() * 0.35]); })();

    /* where the sky is: the whole row when it is an ordinary row; in the film, the band between the panel above and the About and Contact text below */
    function region(V) {
      if (V.mode === 'still') return { x: V.free.x0 + 6, y: V.free.y0 + 6, w: V.free.w - 12, h: V.free.h - 12 };
      var top = V.compact ? 0.2 : 0.17, bot = V.compact ? 0.6 : 0.64;
      return { x: 12, y: V.h * top, w: V.w - 24, h: V.h * (bot - top) };
    }
    function toS(R, s) { return [R.x + s.x * R.w, R.y + s.y * R.h]; }
    function inRegion(R, x, y) { return x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h; }

    function advance(dt) { st.t += dt; }

    function sparkle(ctx, x, y, r, a, twin) {
      var g = ctx.createRadialGradient(x, y, 0, x, y, r * 4.2); g.addColorStop(0, 'rgba(190,226,255,' + (0.5 * a) + ')'); g.addColorStop(1, 'rgba(142,201,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 4.2, 0, TAU); ctx.fill();
      var L = r * (2.6 + twin * 0.8);
      ctx.strokeStyle = 'rgba(235,245,255,' + (0.85 * a) + ')'; ctx.lineWidth = Math.max(1, r * 0.3); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = 'rgba(255,255,255,' + a + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }

    function draw(ctx, V, o) {
      o = o || {}; st.V = V;
      var R = region(V), i, t = V.t || st.t, fr = V.free;
      ctx.fillStyle = 'rgb(10,12,15)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, V.w * 0.5, R.y + R.h * 0.5, Math.max(V.w, V.h) * 0.55, [100, 140, 190], 0.11);
      for (i = 0; i < st.dust.length; i++) { var d = st.dust[i], tw = 0.55 + 0.45 * Math.sin(t * 0.8 + d[3]); ctx.fillStyle = 'rgba(214,228,250,' + (d[4] * tw) + ')'; ctx.fillRect(d[0] * V.w, d[1] * V.h, d[2], d[2]); }

      /* the area that takes taps */
      ctx.strokeStyle = St.stars.length ? 'rgba(142,201,255,0.1)' : 'rgba(142,201,255,0.28)'; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(R.x, R.y, R.w, R.h, 14); else ctx.rect(R.x, R.y, R.w, R.h); ctx.stroke(); ctx.setLineDash([]);

      /* lines between stars */
      var pts = St.stars.map(function (s) { return toS(R, s); });
      St.links.forEach(function (l) {
        var a = pts[l[0]], b = pts[l[1]]; if (!a || !b) return;
        ctx.strokeStyle = 'rgba(142,201,255,0.16)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        ctx.strokeStyle = 'rgba(190,226,255,0.8)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      });
      if (St.mode === 'connect' && St.sel >= 0 && pts[St.sel] && st.mx >= 0 && inRegion(R, st.mx, st.my) && st.drag < 0) {         // a line follows the pointer from the selected star
        ctx.strokeStyle = A(0.55); ctx.lineWidth = 1.2; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(pts[St.sel][0], pts[St.sel][1]); ctx.lineTo(st.mx, st.my); ctx.stroke(); ctx.setLineDash([]);
      }

      /* the stars */
      for (i = 0; i < St.stars.length; i++) {
        var s = St.stars[i], p = pts[i]; if (st.born[s.id] == null) st.born[s.id] = t;
        var age = clamp((t - st.born[s.id]) / 0.45, 0, 1), grow = PF.paused ? 1 : 0.4 + 0.6 * age + 0.5 * Math.sin(age * Math.PI) * (1 - age), twin = 0.5 + 0.5 * Math.sin(t * 1.6 + s.id * 1.9);
        sparkle(ctx, p[0], p[1], (V.lod ? 2.6 : 3.2) * grow, 0.6 + 0.4 * age, twin);
        if (i === St.sel) { ctx.strokeStyle = A(0.95); ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(p[0], p[1], 13, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      }

      /* words */
      if (!o.nolabels) {
        if (!St.stars.length) U.text(ctx, coarse ? 'Tap anywhere here to place a star.' : 'Click anywhere here to place a star.', R.x + R.w / 2, R.y + R.h / 2, V.lod ? 13 : 16, 'rgba(255,255,255,0.9)', 'center', true);
        U.text(ctx, St.stars.length + ' / ' + St.MAX + ' stars', R.x + R.w - 10, R.y + R.h - 8, V.lod ? 10 : 11, St.stars.length >= St.MAX ? 'rgba(255,170,130,1)' : 'rgba(245,245,242,0.72)', 'right', true);
        U.text(ctx, St.mode === 'connect' ? 'Connect: tap a star, then another.' : 'Place: tap to add. Drag a star to move it.', R.x + 10, R.y + R.h - 8, V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
      }
      void fr;
    }

    /* ---------- input ---------- */
    function starAt(x, y) {
      if (!st.V) return -1; var R = region(st.V), best = -1, bd = coarse ? 28 : 16, i;
      for (i = 0; i < St.stars.length; i++) { var p = toS(R, St.stars[i]), d = Math.hypot(x - p[0], y - p[1]); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function clickStar(i) {                                              // a tap on a star, in either mode
      if (St.mode === 'connect' && St.sel >= 0 && St.sel !== i) { St.link(St.sel, i); St.select(i); }
      else St.select(i === St.sel && St.mode === 'place' ? -1 : i);
    }
    var input = {
      hit: function (x, y) { return starAt(x, y) >= 0; },
      down: function (x, y) { st.drag = starAt(x, y); st.moved = false; st.down = [x, y]; },
      move: function (x, y) {
        if (st.drag < 0 || !st.V) return;
        if (!st.moved && Math.hypot(x - st.down[0], y - st.down[1]) < 5) return; st.moved = true;
        var R = region(st.V); St.move(st.drag, (x - R.x) / R.w, (y - R.y) / R.h); St.select(st.drag);
      },
      up: function (x, y, e, cancelled) { var i = st.drag; st.drag = -1; if (i >= 0 && !st.moved && !cancelled) clickStar(i); st.moved = false; },
      tap: function (x, y) {
        if (!st.V) return; var R = region(st.V);
        if (!inRegion(R, x, y)) return;
        if (St.mode === 'connect') { St.select(-1); return; }
        St.add((x - R.x) / R.w, (y - R.y) / R.h);
      },
      cursor: function (x, y) {
        var i = starAt(x, y), changed = Math.abs(x - st.mx) + Math.abs(y - st.my) > 2; st.mx = x; st.my = y;
        if (changed && St.mode === 'connect' && St.sel >= 0 && PF.input && PF.input.repaint) PF.input.repaint();
        if (i >= 0) return st.drag >= 0 ? 'grabbing' : 'grab';
        return st.V && inRegion(region(st.V), x, y) && St.mode === 'place' ? 'crosshair' : '';
      }
    };
    return {
      id: 'finale', sim: St, side: 0, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      region: region,
      anchor: function (V) { var R = region(V); return { x: R.x + R.w / 2, y: R.y + R.h / 2, r: Math.min(R.w, R.h) / 2 }; }
    };
  };

  /* ---------- the constellation panel ---------- */
  PF.labs.add('sky', function (root, h) {
    function starOpts(none) { var o = [['-1', none]]; St.stars.forEach(function (s, i) { o.push([String(i), 'Star ' + (i + 1)]); }); return o; }
    function addSpot() {                                                  // a pleasant place that is not on top of another star
      var best = null, bd = -1, k; for (k = 0; k < 24; k++) { var x = 0.08 + Math.random() * 0.84, y = 0.12 + Math.random() * 0.76, d = 9; St.stars.forEach(function (s) { d = Math.min(d, Math.hypot(s.x - x, s.y - y)); }); if (d > bd) { bd = d; best = [x, y]; } }
      return best;
    }
    h.seg('mode', function (v) { St.setMode(v); });
    h.btn('add', function () { var p = addSpot(); St.add(p[0], p[1]); });
    h.btn('remove', function () { if (St.sel >= 0) St.remove(St.sel); });
    h.btn('example', function () { example(); });
    h.btn('reset', function () { St.reset(); });
    h.pick('star', function (v) { St.select(+v); });
    h.pick('link', function (v) { if (St.sel >= 0 && +v >= 0) St.link(St.sel, +v); });
    [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]].forEach(function (d) {
      h.btn('nudge-' + d[0], function () { var s = St.stars[St.sel]; if (s) St.move(St.sel, s.x + d[1] * 0.03, s.y + d[2] * 0.045); });
    });
    return {
      sync: function () {
        var sel = St.sel, n = St.stars.length, linked = [];
        h.setSeg('mode', St.mode);
        h.setBtn('add', { disabled: n >= St.MAX }); h.setBtn('remove', { disabled: sel < 0 }); h.setBtn('reset', { disabled: n === 0 });
        h.setPick('star', sel, starOpts(n ? 'No star selected' : 'Place a star first'));
        h.setPick('link', -1, sel < 0 ? [['-1', 'Select a star first']] : [['-1', 'Connect Star ' + (sel + 1) + ' to...']].concat(St.stars.map(function (s, i) { return [String(i), 'Star ' + (i + 1) + (St.links.some(function (l) { return (l[0] === sel && l[1] === i) || (l[1] === sel && l[0] === i); }) ? ' (connected: choose to remove)' : '')]; }).filter(function (o) { return +o[0] !== sel; })));
        ['left', 'right', 'up', 'down'].forEach(function (d) { h.setBtn('nudge-' + d, { disabled: sel < 0 }); });
        void linked;
        h.text('count', n + ' of ' + St.MAX + ' stars, ' + St.links.length + (St.links.length === 1 ? ' line' : ' lines'));
        h.status(n >= St.MAX ? 'Limit of ' + St.MAX + ' stars reached. Remove one, or reset.' : '', n >= St.MAX);
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
