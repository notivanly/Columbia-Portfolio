/* ==========================================================================
   scenes-math.js
   Scenes 7 to 10: SAT Question Bank Tracker, AMC Practice, Calculus III
   Visualizer, and the quiet ending behind About and Contact.

   These are illustrations of the ideas, not screenshots, and none shows a real
   problem. They share geometry on purpose so the transitions can hand off:
     - the same circle and triangle are the SAT question's figure and the
       AMC construction;
     - the AMC compass rings are the surface's mesh rings;
     - the ending is the same mesh, flattened.
   The surface's gradient and tangent plane are computed numerically, as the
   linked tool notes it does.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var W = U.W, A = U.A;

  /* ---------- the construction: a triangle inscribed in a circle, with its incircle (unit circle, plane coordinates u, v) ---------- */
  var CONS = (function () {
    var ang = [100, 222, 318].map(function (d) { return d * Math.PI / 180; }), V = ang.map(function (a) { return [Math.cos(a), Math.sin(a)]; });
    function dist(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
    var a = dist(V[1], V[2]), b = dist(V[2], V[0]), c = dist(V[0], V[1]), sum = a + b + c;
    var I = [(a * V[0][0] + b * V[1][0] + c * V[2][0]) / sum, (a * V[0][1] + b * V[1][1] + c * V[2][1]) / sum];
    var area = Math.abs((V[1][0] - V[0][0]) * (V[2][1] - V[0][1]) - (V[2][0] - V[0][0]) * (V[1][1] - V[0][1])) / 2;
    return { V: V, I: I, r: area / (sum / 2), mids: [[(V[1][0] + V[2][0]) / 2, (V[1][1] + V[2][1]) / 2], [(V[2][0] + V[0][0]) / 2, (V[2][1] + V[0][1]) / 2], [(V[0][0] + V[1][0]) / 2, (V[0][1] + V[1][1]) / 2]] };
  })();

  /* A path on a horizontal plane: points given in plane units, mapped to the world and projected. */
  function planePath(ctx, P, cx, y, cz, R, pts, close) {
    var i, p;
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) { p = P(cx + pts[i][0] * R, y, cz - pts[i][1] * R); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
    if (close) ctx.closePath();
  }
  function circlePts(u, v, r, n) { var out = [], k; for (k = 0; k <= n; k++) out.push([u + r * Math.cos(k / n * TAU), v + r * Math.sin(k / n * TAU)]); return out; }

  // The figure shared by the SAT question and the AMC page: circle, triangle, incircle.
  function figure(ctx, P, cx, y, cz, R, al, lw) {
    ctx.lineJoin = 'round';
    planePath(ctx, P, cx, y, cz, R, circlePts(0, 0, 1, 72), true); ctx.strokeStyle = A(0.85 * al); ctx.lineWidth = lw; ctx.stroke();
    planePath(ctx, P, cx, y, cz, R, CONS.V, true); ctx.fillStyle = 'rgba(190,205,222,' + (0.1 * al) + ')'; ctx.fill(); ctx.strokeStyle = 'rgba(245,245,242,' + (0.95 * al) + ')'; ctx.lineWidth = lw * 1.4; ctx.stroke();
    planePath(ctx, P, cx, y, cz, R, circlePts(CONS.I[0], CONS.I[1], CONS.r, 56), true); ctx.setLineDash([lw * 3, lw * 2.4]); ctx.strokeStyle = A(0.7 * al); ctx.lineWidth = lw * 0.9; ctx.stroke(); ctx.setLineDash([]);
  }

  /* ======================================================================
     SAT QUESTION BANK TRACKER  (a lit grid of question tokens with their badges)
     ====================================================================== */
  S.sat = function () {
    var COLS = 12, ROWS = 6, SEL = [6, 2], st = { t: 0, tokens: [], sel: null, pose: null, mx: -1, my: -1 }, tokenBase = [], rnd = U.rng(7), c, r;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {                    // Correct, Incorrect, Flagged or not marked yet
      var q = rnd(); tokenBase.push({ c: c, r: r, s: q < 0.34 ? 1 : q < 0.5 ? 2 : q < 0.62 ? 3 : 0, ph: rnd(), cyc: rnd() < 0.2 });
    }
    tokenBase[SEL[1] * COLS + SEL[0]].s = 3; tokenBase[SEL[1] * COLS + SEL[0]].cyc = false;
    function advance(dt, m) { st.t += dt; }
    function settled(V) {
      var fr = V.free, dist = 22, pxm = Math.min(fr.w * 0.96 / 13.6, fr.h * 0.86 / 6.4);
      return { tx: 0, ty: 0, tz: 0, yaw: 0.16, pitch: 0.66, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.cy + fr.h * 0.03, roll: 0 };
    }
    function tokenWorld(c_, r_) { return [c_ - (COLS - 1) / 2, 0, r_ - (ROWS - 1) / 2]; }
    function selWorld() { var w = tokenWorld(SEL[0], SEL[1]); return { x: w[0], y: 1.15, z: w[2], R: 0.82 }; }

    function draw(ctx, V, o) {
      o = o || {};
      var pose = o.pose || settled(V), P = G.camera(pose), t = st.t, m = V.m || { active: 0 }, i, k;
      st.pose = pose;
      if (!o.nobg) { ctx.fillStyle = 'rgb(13,15,18)'; ctx.fillRect(0, 0, V.w, V.h); var gc = P(0, 0, 0); G.glow(ctx, gc.x, gc.y, Math.max(V.w, V.h) * 0.6, [100, 140, 180], 0.14); }
      var b = new G.Batch();
      // the slab the tokens sit on
      G.box(b, P, -6.7, 6.7, -0.34, 0, -3.7, 3.7, [64, 68, 74], { top: [34, 37, 42], k: 0.95 });
      b.flush(ctx);
      var sw = selWorld(), toks = [];
      for (var row = 0; row < ROWS; row++) for (var col = 0; col < COLS; col++) {   // far rows first
        var tb = tokenBase[row * COLS + col], w = tokenWorld(col, row), isSel = col === SEL[0] && row === SEL[1];
        var s = tb.s, pop = 1, ph = (t * 0.2 + tb.ph) % 1;
        if (tb.cyc) { if (ph < 0.45) s = 0; else if (ph < 0.55) pop = 1 + 0.35 * Math.sin((ph - 0.45) / 0.1 * Math.PI); }
        var lift = 0, pc = P(w[0], 0.1, w[2]);
        if (m.active > 0.2 && !o.pose) lift = 0.34 * m.active * Math.max(0, 1 - Math.hypot(pc.x - m.rx, pc.y - m.ry) / (pc.k * 1.8));
        var rad = (isSel ? sw.R : 0.38) * pop, h = isSel ? sw.y : 0.13 + lift;
        var cp = P(w[0], h, w[2]);
        toks.push({ x: cp.x, y: cp.y, r: rad * cp.k, s: s, sel: isSel });
        if (!cp.ok) continue;
        // body: a short cylinder drawn as stacked rings, then the top face
        var base = isSel ? [92, 104, 120] : s === 1 ? [142, 201, 255] : s === 2 ? [176, 186, 198] : s === 3 ? [70, 78, 90] : [46, 50, 57];
        var layers = isSel ? 8 : 3, ly;
        G.shadow(ctx, P, w[0] + 0.06, 0.01, w[2] + 0.08, rad * 1.05, rad * 1.05, isSel ? 1.3 : 0.55);
        for (ly = 0; ly < layers; ly++) {                          // the side of the token: stacked rings from the slab up to the top
          var yy = h * ly / layers, ring = [];
          for (k = 0; k <= 22; k++) ring.push(P(w[0] + Math.cos(k / 22 * TAU) * rad, yy, w[2] + Math.sin(k / 22 * TAU) * rad));
          ctx.fillStyle = G.shade(base, 0.3 + 0.16 * ly / layers); ctx.beginPath();
          for (k = 0; k < ring.length; k++) { if (k === 0) ctx.moveTo(ring[k].x, ring[k].y); else ctx.lineTo(ring[k].x, ring[k].y); }
          ctx.closePath(); ctx.fill();
        }
        var top = []; for (k = 0; k <= 26; k++) top.push(P(w[0] + Math.cos(k / 26 * TAU) * rad, h, w[2] + Math.sin(k / 26 * TAU) * rad));
        ctx.beginPath(); for (k = 0; k < top.length; k++) { if (k === 0) ctx.moveTo(top[k].x, top[k].y); else ctx.lineTo(top[k].x, top[k].y); } ctx.closePath();
        var tg = ctx.createLinearGradient(cp.x, cp.y - rad * cp.k, cp.x, cp.y + rad * cp.k);
        tg.addColorStop(0, G.shade(base, 1.25)); tg.addColorStop(1, G.shade(base, 0.8)); ctx.fillStyle = tg; ctx.fill();
        ctx.strokeStyle = s === 3 ? A(0.9) : 'rgba(255,255,255,0.22)'; ctx.lineWidth = isSel ? 1.8 : 1; if (s === 0) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
        // glyphs, drawn on the top face of the token
        var gl = function (pts, close) { ctx.beginPath(); pts.forEach(function (p, ii) { var q = P(w[0] + p[0] * rad, h + 0.002, w[2] - p[1] * rad); if (ii === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }); if (close) ctx.closePath(); };
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (s === 1) { gl([[-0.42, 0.0], [-0.1, -0.34], [0.46, 0.38]]); ctx.strokeStyle = 'rgb(6,18,29)'; ctx.lineWidth = Math.max(1.6, rad * cp.k * 0.2); ctx.stroke(); }
        else if (s === 2) { ctx.strokeStyle = 'rgb(20,24,30)'; ctx.lineWidth = Math.max(1.6, rad * cp.k * 0.2); gl([[-0.36, 0.36], [0.36, -0.36]]); ctx.stroke(); gl([[0.36, 0.36], [-0.36, -0.36]]); ctx.stroke(); }
        else if (s === 3 && !isSel) { ctx.strokeStyle = A(0.95); ctx.lineWidth = Math.max(1.4, rad * cp.k * 0.14); gl([[-0.3, -0.5], [-0.3, 0.5]]); ctx.stroke(); gl([[-0.3, 0.5], [0.42, 0.28], [-0.3, 0.06]], false); ctx.fillStyle = A(0.9); ctx.fill(); }
        ctx.lineCap = 'butt';
        if (isSel) {                                              // the one question in focus: its figure, and a flag beside it
          figure(ctx, P, w[0], h + 0.003, w[2], rad * 0.82, 1, Math.min(2, Math.max(1.2, rad * cp.k * 0.035)));
          ctx.strokeStyle = A(0.95); ctx.lineWidth = 2.2; var fp = P(w[0] + rad * 1.25, h, w[2] - rad * 0.2), ft = P(w[0] + rad * 1.25, h + 0.75, w[2] - rad * 0.2), fe = P(w[0] + rad * 1.75, h + 0.55, w[2] - rad * 0.2), fm = P(w[0] + rad * 1.25, h + 0.35, w[2] - rad * 0.2);
          ctx.beginPath(); ctx.moveTo(fp.x, fp.y); ctx.lineTo(ft.x, ft.y); ctx.stroke(); ctx.fillStyle = A(0.9); ctx.beginPath(); ctx.moveTo(ft.x, ft.y); ctx.lineTo(fe.x, fe.y); ctx.lineTo(fm.x, fm.y); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = A(0.5); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cp.x, cp.y, rad * cp.k * 1.25, 0, TAU); ctx.stroke();
        }
      }
      st.tokens = toks; st.sel = toks[SEL[1] * COLS + SEL[0]];
    }
    return { init: function () {}, advance: advance, draw: draw, settled: settled, side: -1, id: 'sat', sim: st, st: st,
      tokens: function () { return st.tokens; }, count: COLS * ROWS, selected: function () { var s = st.sel; return s ? { x: s.x, y: s.y, r: s.r } : null; },
      selWorld: selWorld };
  };

  /* ======================================================================
     AMC PRACTICE  (a geometry construction on a slab, with an answer strip)
     ====================================================================== */
  S.amc = function () {
    var RING_R = 3, NR = 12, st = { t: 0, pose: null, O: { x: 0, y: 0, R: 100 } };
    function advance(dt) { st.t += dt; }
    function settled(V) {
      var fr = V.free, dist = 24, pitch = 1.3, pxm = Math.min(fr.w * 0.9 / 9.6, fr.h * 0.92 / (8.9 * Math.sin(pitch) + 0.8));
      return { tx: 0, ty: 0, tz: 0.55, yaw: 0, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.cy, roll: 0 };
    }
    var LET = ['A', 'B', 'C', 'D', 'E'];

    /* o: { pose, detail (0..1: everything except the figure), nobg, slab (0..1) } */
    function draw(ctx, V, o) {
      o = o || {};
      var pose = o.pose || settled(V), P = G.camera(pose), det = o.detail == null ? 1 : o.detail, slab = o.slab == null ? 1 : o.slab, i, k;
      st.pose = pose;
      if (!o.nobg) { ctx.fillStyle = 'rgb(12,14,17)'; ctx.fillRect(0, 0, V.w, V.h); }
      var c0 = P(0, 0, 0);
      st.O = { x: c0.x, y: c0.y, R: RING_R * c0.k };
      if (!o.nobg) G.glow(ctx, c0.x, c0.y, Math.max(V.w, V.h) * 0.55, [100, 140, 180], 0.12);
      if (slab > 0.01) {
        var b = new G.Batch(); ctx.save(); ctx.globalAlpha *= slab;
        G.box(b, P, -4.8, 4.8, -0.3, 0, -3.9, 5.1, [66, 70, 76], { top: [30, 34, 40], k: 0.95 }); b.flush(ctx); ctx.restore();
      }
      var R = RING_R;
      // compass rings: the same radii as the mesh rings of the surface in the next scene
      ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(245,245,242,' + (0.22 * det) + ')'; ctx.lineWidth = 1;
      for (k = 2; k < NR; k += 2) { planePath(ctx, P, 0, 0.002, 0, 1, circlePts(0, 0, R * k / NR, 72), true); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(245,245,242,' + (0.07 * det) + ')'; ctx.beginPath();
      for (k = 0; k < 24; k++) { var an = k / 24 * TAU, p0 = P(0, 0.002, 0), p1 = P(Math.cos(an) * R, 0.002, -Math.sin(an) * R); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); }
      ctx.stroke();
      // the construction lines: angle bisectors to the incenter, perpendicular bisectors to the circumcenter
      ctx.setLineDash([5, 5]); ctx.lineWidth = 1.1;
      ctx.strokeStyle = 'rgba(245,245,242,' + (0.4 * det) + ')';
      CONS.V.forEach(function (v) { planePath(ctx, P, 0, 0.003, 0, R, [v, CONS.I], false); ctx.stroke(); });
      ctx.strokeStyle = A(0.45 * det);
      CONS.mids.forEach(function (mp) { planePath(ctx, P, 0, 0.003, 0, R, [[0, 0], mp], false); ctx.stroke(); });
      ctx.setLineDash([]);
      // compass arcs at each vertex
      ctx.strokeStyle = 'rgba(245,245,242,' + (0.5 * det) + ')'; ctx.lineWidth = 1.2;
      CONS.V.forEach(function (v) { var a0 = Math.atan2(v[1], v[0]) + Math.PI, pts = [], q; for (q = -6; q <= 6; q++) pts.push([v[0] + 0.3 * Math.cos(a0 + q * 0.09), v[1] + 0.3 * Math.sin(a0 + q * 0.09)]); planePath(ctx, P, 0, 0.003, 0, R, pts, false); ctx.stroke(); });
      figure(ctx, P, 0, 0.004, 0, R, 1, 2);
      // points and their letters
      var names = ['A', 'B', 'C'];
      CONS.V.forEach(function (v, ix) {
        var p = P(v[0] * R, 0.01, -v[1] * R), pl = P(v[0] * R * 1.14, 0.01, -v[1] * R * 1.14);
        G.ball(ctx, p.x, p.y, 4.5, [245, 245, 242], { rim: 0 });
        U.text(ctx, names[ix], pl.x, pl.y + 4, 13, 'rgba(245,245,242,' + (0.9 * det) + ')', 'center');
      });
      [[CONS.I, 'I'], [[0, 0], 'O']].forEach(function (pr) { var p = P(pr[0][0] * R, 0.01, -pr[0][1] * R); ctx.fillStyle = A(det); ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, TAU); ctx.fill(); U.text(ctx, pr[1], p.x + 9, p.y - 7, 12, A(0.95 * det), 'left'); });
      // the answer strip: five bubbles, one filled, and a flag beside the strip
      if (det > 0.02) {
        ctx.save(); ctx.globalAlpha *= det;
        for (i = 0; i < 5; i++) {
          var bx = (i - 2) * 1.25, bz = 4.15, p2 = P(bx, 0.01, bz), rr = 0.42 * p2.k, on = i === 2;
          planePath(ctx, P, bx, 0.01, bz, 0.42, circlePts(0, 0, 1, 28), true);
          if (on) { ctx.fillStyle = A(1); ctx.fill(); ctx.strokeStyle = A(1); } else { ctx.strokeStyle = 'rgba(245,245,242,0.55)'; }
          ctx.lineWidth = 1.6; ctx.stroke();
          U.text(ctx, LET[i], p2.x, p2.y + rr * 0.22, Math.max(10, rr * 0.8), on ? 'rgb(6,18,29)' : 'rgba(245,245,242,0.9)', 'center');
        }
        var fa = P(3.9, 0.01, 4.55), fb = P(3.9, 0.01, 3.75), fc = P(4.5, 0.01, 4.15);
        ctx.strokeStyle = A(0.95); ctx.fillStyle = A(0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(fb.x, fb.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(fb.x, fb.y); ctx.lineTo(fc.x, fc.y); ctx.lineTo((fa.x + fb.x) / 2, (fa.y + fb.y) / 2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    return { init: function () {}, advance: advance, draw: draw, settled: settled, side: 1, id: 'amc', sim: st, st: st, origin: function () { return { x: st.O.x, y: st.O.y, R: st.O.R }; } };
  };

  /* ======================================================================
     CALCULUS III  (a shaded surface over a disc, with level curves, a tangent plane and a gradient)
     The same object, flattened and viewed low, is the quiet ending (S.finale).
     ====================================================================== */
  S.calc = function () {
    var NR = 12, NT = 48, RAD = 3, FLOOR = -2.15, st = { t: 0, pose: null, u: [], v: [], f: [] }, k, j;
    function fxy(u, v) { return 0.15 * (u * u - v * v) * Math.exp(-0.04 * (u * u + v * v)); }
    function grad(u, v) { var h = 1e-3; return [(fxy(u + h, v) - fxy(u - h, v)) / (2 * h), (fxy(u, v + h) - fxy(u, v - h)) / (2 * h)]; }   // numerical, like the tool
    for (k = 0; k <= NR; k++) { st.u.push([]); st.v.push([]); st.f.push([]); for (j = 0; j <= NT; j++) { var r = RAD * k / NR, a = j / NT * TAU, u = r * Math.cos(a), v = r * Math.sin(a); st.u[k].push(u); st.v[k].push(v); st.f[k].push(fxy(u, v)); } }
    var LEVELS = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2];
    function advance(dt) { st.t += dt; }
    function settled(V) {
      var fr = V.free, dist = 18, pxm = Math.min(fr.w * 0.9 / 6.6, fr.h * 0.84 / 5.2);
      return { tx: 0, ty: -0.4, tz: 0, yaw: 0.55, pitch: 0.6, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.cy + fr.h * 0.02, roll: 0 };
    }
    function calmPose(V) {                                       // the ending: the same disc, flat, seen low
      var fr = V.free, dist = 26, pxm = Math.min(fr.w * 0.5 / 6.4, fr.h * 0.7 / 3.2);
      return { tx: 0, ty: 0, tz: 0, yaw: 0.5, pitch: 0.2, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.h * 0.5, roll: 0 };
    }

    /* o: { pose, amp (height scale 0..1), fill (0..1), lines (0..1), tangent (0..1), floor (0..1), ground (0..1), nobg } */
    function draw(ctx, V, o) {
      o = o || {};
      var pose = o.pose || settled(V), P = G.camera(pose), amp = o.amp == null ? 1 : o.amp, fill = o.fill == null ? 1 : o.fill, lines = o.lines == null ? 1 : o.lines;
      var tan = o.tangent == null ? 1 : o.tangent, flo = o.floor == null ? 1 : o.floor, gnd = o.ground || 0, t = st.t, i;
      st.pose = pose;
      if (!o.nobg) {
        if (gnd > 0.01) { G.sky(ctx, V.w, V.h, P, [10, 12, 15], [lerp(11, 24, gnd), lerp(13, 28, gnd), lerp(16, 34, gnd)], [11, 13, 16]); }
        else { ctx.fillStyle = 'rgb(11,13,16)'; ctx.fillRect(0, 0, V.w, V.h); }
        var gc = P(0, 0, 0); G.glow(ctx, gc.x, gc.y, Math.max(V.w, V.h) * 0.55, [100, 140, 190], 0.13);
      }
      if (gnd > 0.01) G.grid(ctx, P, 0, -30, 30, -30, 30, 2, [180, 190, 200], 0.1 * gnd, pose.dist * 0.7, pose.dist * 2.2);
      // projected vertices
      var pts = [], row, q;
      for (k = 0; k <= NR; k++) { row = []; for (j = 0; j <= NT; j++) row.push(P(st.u[k][j], amp * st.f[k][j], -st.v[k][j])); pts.push(row); }
      // floor: the level curves projected flat, and a rim
      if (flo > 0.01 && amp > 0.02) {
        ctx.strokeStyle = 'rgba(245,245,242,' + (0.14 * flo * lines) + ')'; ctx.lineWidth = 1; ctx.beginPath();
        for (k = 2; k <= NR; k += 2) for (j = 0; j <= NT; j++) { q = P(st.u[k][j], FLOOR, -st.v[k][j]); if (j === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      }
      // cells: corners, depth, shading, and the level-curve segments that cross them
      var cells = [];
      for (k = 0; k < NR; k++) for (j = 0; j < NT; j++) {
        var p00 = pts[k][j], p10 = pts[k + 1][j], p11 = pts[k + 1][j + 1], p01 = pts[k][j + 1];
        var y00 = amp * st.f[k][j], y10 = amp * st.f[k + 1][j], y01 = amp * st.f[k][j + 1];
        var ax = st.u[k + 1][j] - st.u[k][j], ay = y10 - y00, az = -(st.v[k + 1][j] - st.v[k][j]), bx = st.u[k][j + 1] - st.u[k][j], by = y01 - y00, bz = -(st.v[k][j + 1] - st.v[k][j]);
        if (k === 0) { bx = st.u[k + 1][j + 1] - st.u[k][j]; by = amp * st.f[k + 1][j + 1] - y00; bz = -(st.v[k + 1][j + 1] - st.v[k][j]); }
        var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, nl = Math.hypot(nx, ny, nz) || 1; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
        var yav = (y00 + y10 + amp * st.f[k + 1][j + 1] + y01) / 4;
        cells.push({ d: (p00.d + p10.d + p11.d + p01.d) / 4, k: k, j: j, lit: G.lambert(nx / nl, ny / nl, nz / nl), h: clamp((yav / Math.max(amp, 0.001) + 1.3) / 2.6, 0, 1) });
      }
      if (fill > 0.01) cells.sort(function (a, b) { return b.d - a.d; });
      var edgeA = (fill > 0.01 ? 0.1 : 0.16) * lines;
      for (i = 0; i < cells.length; i++) {
        var cl = cells[i], a_ = pts[cl.k][cl.j], b_ = pts[cl.k + 1][cl.j], c_ = pts[cl.k + 1][cl.j + 1], d_ = pts[cl.k][cl.j + 1];
        if (!a_.ok || !b_.ok || !c_.ok || !d_.ok) continue;
        ctx.beginPath(); ctx.moveTo(a_.x, a_.y); ctx.lineTo(b_.x, b_.y); ctx.lineTo(c_.x, c_.y); ctx.lineTo(d_.x, d_.y); ctx.closePath();
        if (fill > 0.01) {
          var base = G.mix([34, 58, 92], [158, 204, 240], cl.h);
          var fc = G.shade(base, 0.35 + 0.8 * cl.lit, fill); ctx.fillStyle = fc; ctx.fill();
          ctx.strokeStyle = fc; ctx.lineWidth = 1; ctx.stroke();                       // covers the hairline seams between neighbouring cells
        }
        if (edgeA > 0.005) {
          ctx.strokeStyle = 'rgba(255,255,255,' + edgeA.toFixed(3) + ')'; ctx.lineWidth = 1;
          if (cl.k === 0) { ctx.beginPath(); ctx.moveTo(b_.x, b_.y); ctx.lineTo(c_.x, c_.y); }       // the centre fan: only its outer edge
          ctx.stroke();
        }
        if (amp > 0.03 && tan > 0.02) {                          // level curves: marching triangles on this cell
          var f0 = st.f[cl.k][cl.j], f1 = st.f[cl.k + 1][cl.j], f2 = st.f[cl.k + 1][cl.j + 1], f3 = st.f[cl.k][cl.j + 1];
          var tri = [[a_, b_, c_, f0, f1, f2], [a_, c_, d_, f0, f2, f3]];
          ctx.strokeStyle = A(0.95 * tan * Math.min(1, amp * 1.6)); ctx.lineWidth = 1.7; ctx.beginPath();
          for (var ti = 0; ti < 2; ti++) {
            var T = tri[ti], mn = Math.min(T[3], T[4], T[5]), mx = Math.max(T[3], T[4], T[5]);
            for (var li = 0; li < LEVELS.length; li++) {
              var lv = LEVELS[li]; if (lv < mn || lv >= mx) continue;
              var seg = [], ed = [[0, 1], [1, 2], [2, 0]];
              for (var ei = 0; ei < 3; ei++) {
                var ia = ed[ei][0], ib = ed[ei][1], fa = T[3 + ia], fb = T[3 + ib];
                if ((fa - lv) * (fb - lv) < 0) { var s = (lv - fa) / (fb - fa); seg.push([lerp(T[ia].x, T[ib].x, s), lerp(T[ia].y, T[ib].y, s)]); }
              }
              if (seg.length === 2) { ctx.moveTo(seg[0][0], seg[0][1]); ctx.lineTo(seg[1][0], seg[1][1]); }
            }
          }
          ctx.stroke();
        }
      }
      // tangent plane, gradient and the point, moving slowly over the surface
      if (tan > 0.02 && amp > 0.05) {
        var ang = t * 0.35, pr = 1.55 + 0.35 * Math.sin(t * 0.21), pu = pr * Math.cos(ang), pv = pr * Math.sin(ang), g = grad(pu, pv), f0v = amp * fxy(pu, pv), h = 0.95;
        var corner = function (du, dv) { return P(pu + du, f0v + amp * (g[0] * du + g[1] * dv), -(pv + dv)); };
        var tc = [corner(-h, -h), corner(h, -h), corner(h, h), corner(-h, h)];
        ctx.beginPath(); ctx.moveTo(tc[0].x, tc[0].y); for (i = 1; i < 4; i++) ctx.lineTo(tc[i].x, tc[i].y); ctx.closePath();
        ctx.fillStyle = 'rgba(235,245,255,' + (0.2 * tan) + ')'; ctx.fill(); ctx.strokeStyle = A(tan); ctx.lineWidth = 2.2; ctx.stroke();
        var pp = P(pu, f0v, -pv), fl = P(pu, FLOOR, -pv), gl = Math.hypot(g[0], g[1]) || 1, gu = g[0] / gl, gv = g[1] / gl;
        ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(245,245,242,' + (0.55 * tan) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(fl.x, fl.y); ctx.stroke(); ctx.setLineDash([]);
        var ge = P(pu + gu * 1.1, f0v + amp * (g[0] * gu * 1.1 + g[1] * gv * 1.1), -(pv + gv * 1.1));          // gradient arrow, along the steepest direction on the plane
        ctx.strokeStyle = 'rgba(245,245,242,' + tan + ')'; ctx.fillStyle = 'rgba(245,245,242,' + tan + ')'; ctx.lineWidth = 2.4; U.arrow(ctx, pp.x, pp.y, ge.x, ge.y, 9);
        var fe = P(pu + gu * 1.1, FLOOR, -(pv + gv * 1.1)); ctx.strokeStyle = A(0.85 * tan); ctx.fillStyle = A(0.85 * tan); ctx.lineWidth = 2; U.arrow(ctx, fl.x, fl.y, fe.x, fe.y, 8);
        G.ball(ctx, pp.x, pp.y, 5.5, [255, 255, 255], { rim: 0 }); ctx.strokeStyle = A(tan); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pp.x, pp.y, 8, 0, TAU); ctx.stroke();
      }
    }
    return { init: function () {}, advance: advance, draw: draw, settled: settled, calmPose: calmPose, side: -1, id: 'calc', sim: st, st: st };
  };

  /* ---------- the ending: the same surface at rest, a quiet line of ground ---------- */
  S.finale = function () {
    var calc = S.calc();
    return {
      id: 'finale', side: 0, sim: calc.sim, init: function () {}, advance: calc.advance,
      settled: function (V) { return calc.calmPose(V); },
      draw: function (ctx, V, o) {
        o = o || {};
        calc.draw(ctx, V, { pose: o.pose || calc.calmPose(V), amp: 0, fill: 0, lines: 0.5, tangent: 0, floor: 0, ground: 1, nobg: o.nobg });
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
