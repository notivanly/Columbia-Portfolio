/* ==========================================================================
   sim-motion.js
   Simulation state and calculations for the Physics Sandbox, the Planet Explorer,
   Orbital Mechanics and the constellation. No DOM, no canvas, no input handling.

   SIM.physics   2D rigid bodies (circles and boxes) in metres, y up. Sequential impulses with
                 friction, restitution, warm starting and rod joints, in the style of Box2D-lite.
                 A grab is a soft constraint, so a released body keeps the speed you gave it.
   SIM.planets   planetary systems and where each planet is at a given time. Real data comes from
                 NASA and the papers named in each system; the invented system says so.
   SIM.orbit     a point mass in the gravity field of one body: fourth-order Runge-Kutta, impact
                 and escape handled, the orbit's elements, a predicted path and simple challenges.
   SIM.stars     the constellation the visitor builds.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF = global.PF || {}, U = PF.util, SIM = PF.sim = PF.sim || {};
  var TAU = U.TAU, clamp = U.clamp;

  /* ======================================================================
     PHYSICS
     ====================================================================== */
  function PhysicsSim() {
    var W = 9, H = 6, MAXDYN = 48;
    var S = { W: W, H: H, MAX: MAXDYN, bodies: [], rods: [], g: 9.81, bounce: 0.25, friction: 0.5, paused: false, t: 0, preset: 'free', grab: null, nextId: 1, hot: null, pivot: { x: 3.6, y: 5.72 }, version: 0, arb: {}, acc: 0 };
    var rnd = U.rng(11);

    function mk(type, x, y, o) {
      var b = { id: S.nextId++, type: type, x: x, y: y, a: 0, vx: 0, vy: 0, w: 0, invM: 0, invI: 0, r: 0, hx: 0, hy: 0, fixed: false, mat: 0, hot: false };
      for (var k in o) b[k] = o[k];
      var m;
      if (type === 'circle') { m = b.density * Math.PI * b.r * b.r; b.invM = b.fixed ? 0 : 1 / m; b.invI = b.fixed ? 0 : 1 / (0.5 * m * b.r * b.r); }
      else { m = b.density * 4 * b.hx * b.hy; b.invM = b.fixed ? 0 : 1 / m; b.invI = b.fixed ? 0 : 1 / (m * (4 * b.hx * b.hx + 4 * b.hy * b.hy) / 12); }
      b.mass = b.fixed ? 0 : m; return b;
    }
    function ball(x, y, r, o) { o = o || {}; o.r = r; o.density = o.density || 1; var b = mk('circle', x, y, o); S.bodies.push(b); return b; }
    function box(x, y, hx, hy, o) { o = o || {}; o.hx = hx; o.hy = hy; o.density = o.density || 1; var b = mk('box', x, y, o); S.bodies.push(b); return b; }
    function walls() {
      box(W / 2, -0.5, W / 2 + 1, 0.5, { fixed: true, wall: true }); box(W / 2, H + 0.5, W / 2 + 1, 0.5, { fixed: true, wall: true });
      box(-0.5, H / 2, 0.5, H / 2 + 1, { fixed: true, wall: true }); box(W + 0.5, H / 2, 0.5, H / 2 + 1, { fixed: true, wall: true });
    }
    S.dynamic = function () { return S.bodies.filter(function (b) { return !b.fixed; }); };
    S.count = function () { return S.dynamic().length; };

    /* ---------- presets (each one only uses what the engine does well) ---------- */
    var PRE = {
      free: function () {
        ball(2.2, 4.4, 0.34, { mat: 1, hot: true }); ball(5.6, 3.6, 0.26, { mat: 0 }); ball(6.9, 4.9, 0.42, { mat: 2 });
        box(3.4, 1.6, 0.4, 0.3, { mat: 3, a: 0.3 }); box(5.0, 2.6, 0.32, 0.32, { mat: 1, a: 0.7 }); box(7.6, 1.2, 0.5, 0.25, { mat: 0, a: -0.2 }); box(1.4, 2.4, 0.28, 0.28, { mat: 2 });
      },
      pendulum: function () {
        var L = 2.6, ang = 1.05, p = S.pivot, b = ball(p.x + Math.sin(ang) * L, p.y - Math.cos(ang) * L, 0.4, { mat: 1, hot: true, density: 2 });
        S.rods.push({ a: null, ax: p.x, ay: p.y, b: b, bx: 0, by: 0, len: L });
        box(6.4, 0.3, 0.3, 0.3, { mat: 3 }); box(6.4, 0.9, 0.3, 0.3, { mat: 0 }); box(6.4, 1.5, 0.3, 0.3, { mat: 3 });
      },
      dominoes: function () {
        var i, n = 12, hx = 0.07, hy = 0.42, gap = 0.5, x0 = 1.6;
        for (i = 0; i < n; i++) box(x0 + i * gap, hy, hx, hy, { mat: i % 4, density: 1.2 });
        S.bodies[S.bodies.length - n].w = -0.9; S.bodies[S.bodies.length - n].vx = 0.5;     // a first push, so something happens straight away
      },
      stack: function () {
        var i; for (i = 0; i < 7; i++) box(4.5 + (i % 2 ? 0.05 : -0.05), 0.3 + i * 0.6, 0.45, 0.3, { mat: i % 4 });
        ball(1.3, 3.2, 0.3, { mat: 1, hot: true });
      },
      pyramid: function () {
        var r, c, rows = 5, s = 0.32;
        for (r = 0; r < rows; r++) for (c = 0; c < rows - r; c++) box(4.5 + (c - (rows - r - 1) / 2) * (2 * s + 0.01), s + r * (2 * s + 0.002), s, s, { mat: (r + c) % 4 });
        ball(1.4, 3.6, 0.36, { mat: 1, hot: true, density: 2 });
      }
    };
    S.PRESETS = [['free', 'Free play'], ['pendulum', 'Pendulum'], ['dominoes', 'Dominoes'], ['stack', 'Stack'], ['pyramid', 'Pyramid']];
    S.load = function (key) {
      if (!PRE[key]) key = 'free';
      S.preset = key; S.bodies = []; S.rods = []; S.arb = {}; S.grab = null; S.hot = null; S.t = 0; S.acc = 0; S.nextId = 1; rnd = U.rng(11 + key.length);
      walls(); PRE[key]();
      S.hot = S.bodies.filter(function (b) { return b.hot; })[0] || S.dynamic()[0] || null;
      S.paused = false; S.version++;
    };
    S.reset = function () { S.load(S.preset); };

    /* ---------- spawning ---------- */
    S.spawn = function (kind, x, y) {
      if (S.count() >= MAXDYN) return null;
      var px = x == null ? 1 + rnd() * (W - 2) : clamp(x, 0.6, W - 0.6), py = y == null ? H - 0.9 : clamp(y, 0.6, H - 0.6), b;
      if (kind === 'box') b = box(px, py, 0.22 + rnd() * 0.22, 0.2 + rnd() * 0.18, { mat: Math.floor(rnd() * 4), a: (rnd() - 0.5) * 1.2 });
      else b = ball(px, py, 0.2 + rnd() * 0.22, { mat: Math.floor(rnd() * 4) });
      b.vx = (rnd() - 0.5) * 2; S.version++; return b;
    };
    S.throwOne = function () {                                       // a keyboard-friendly way to throw something
      var b = S.spawn(rnd() < 0.5 ? 'ball' : 'box', 0.9, 1.4); if (!b) return null; b.vx = 7 + rnd() * 3; b.vy = 5 + rnd() * 3; b.w = (rnd() - 0.5) * 6; return b;
    };
    S.shake = function () { S.dynamic().forEach(function (b) { b.vy += 3 + rnd() * 4; b.vx += (rnd() - 0.5) * 6; b.w += (rnd() - 0.5) * 5; }); };
    S.remove = function (b) { var i = S.bodies.indexOf(b); if (i >= 0 && !b.fixed) { S.bodies.splice(i, 1); S.rods = S.rods.filter(function (r) { return r.b !== b && r.a !== b; }); if (S.hot === b) S.hot = S.dynamic()[0] || null; } };
    S.clearDynamic = function () { S.bodies = S.bodies.filter(function (b) { return b.fixed; }); S.rods = []; S.arb = {}; S.hot = null; S.version++; };

    /* ---------- picking and grabbing ---------- */
    function contains(b, x, y) {
      var dx = x - b.x, dy = y - b.y;
      if (b.type === 'circle') return dx * dx + dy * dy <= b.r * b.r;
      var c = Math.cos(b.a), s = Math.sin(b.a), lx = dx * c + dy * s, ly = -dx * s + dy * c;
      return Math.abs(lx) <= b.hx && Math.abs(ly) <= b.hy;
    }
    S.pick = function (x, y, pad) {
      var i, best = null, bd = 1e9; pad = pad || 0;
      for (i = S.bodies.length - 1; i >= 0; i--) {
        var b = S.bodies[i]; if (b.fixed) continue;
        if (contains(b, x, y)) return b;
        var d = Math.hypot(x - b.x, y - b.y) - (b.type === 'circle' ? b.r : Math.hypot(b.hx, b.hy));
        if (d < pad && d < bd) { bd = d; best = b; }
      }
      return best;
    };
    S.grabAt = function (b, x, y) {
      var dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
      S.grab = { b: b, lx: dx * c + dy * s, ly: -dx * s + dy * c, tx: x, ty: y }; S.hot = b;
    };
    S.dragTo = function (x, y) { if (S.grab) { S.grab.tx = clamp(x, 0.1, W - 0.1); S.grab.ty = clamp(y, 0.1, H - 0.1); } };
    S.release = function () { var g = S.grab; S.grab = null; if (g) { var sp = Math.hypot(g.b.vx, g.b.vy); if (sp > 26) { g.b.vx *= 26 / sp; g.b.vy *= 26 / sp; } } return g; };

    /* ---------- collision ---------- */
    function rot(a) { return [Math.cos(a), Math.sin(a)]; }
    var MARGIN = 0.004;                                              // contacts are found a few millimetres early, so touching bodies do not flicker in and out
    function circleCircle(A, B) {
      var dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), rr = A.r + B.r;
      if (d >= rr + MARGIN) return null;
      var nx = d > 1e-9 ? dx / d : 0, ny = d > 1e-9 ? dy / d : 1;
      return { nx: nx, ny: ny, pts: [{ x: A.x + nx * (A.r - (rr - d) / 2), y: A.y + ny * (A.r - (rr - d) / 2), sep: d - rr }] };
    }
    function circleBox(C, B) {                                       // normal points from the circle to the box
      var cs = Math.cos(B.a), sn = Math.sin(B.a), dx = C.x - B.x, dy = C.y - B.y, lx = dx * cs + dy * sn, ly = -dx * sn + dy * cs;
      var px = clamp(lx, -B.hx, B.hx), py = clamp(ly, -B.hy, B.hy), ex = px - lx, ey = py - ly, d = Math.hypot(ex, ey), nlx, nly, sep, qx, qy;
      if (d > 1e-9) { if (d >= C.r + MARGIN) return null; nlx = ex / d; nly = ey / d; sep = d - C.r; qx = px; qy = py; }
      else {                                                         // the centre is inside the box: leave by the nearest face
        var ox = B.hx - Math.abs(lx), oy = B.hy - Math.abs(ly);
        if (ox < oy) { nlx = -(lx >= 0 ? 1 : -1); nly = 0; qx = (lx >= 0 ? B.hx : -B.hx); qy = ly; sep = -(ox + C.r); }
        else { nlx = 0; nly = -(ly >= 0 ? 1 : -1); qx = lx; qy = (ly >= 0 ? B.hy : -B.hy); sep = -(oy + C.r); }
      }
      return { nx: nlx * cs - nly * sn, ny: nlx * sn + nly * cs, pts: [{ x: B.x + qx * cs - qy * sn, y: B.y + qx * sn + qy * cs, sep: sep }] };
    }
    function clip(vs, nx, ny, off) {                                 // keep the part of a segment behind the plane  n . p <= off
      var d0 = nx * vs[0].x + ny * vs[0].y - off, d1 = nx * vs[1].x + ny * vs[1].y - off, out = [];
      if (d0 <= 0) out.push(vs[0]); if (d1 <= 0) out.push(vs[1]);
      if (d0 * d1 < 0) { var f = d0 / (d0 - d1); out.push({ x: vs[0].x + f * (vs[1].x - vs[0].x), y: vs[0].y + f * (vs[1].y - vs[0].y) }); }
      return out;
    }
    function incident(B, nx, ny) {                                   // the edge of B most facing against the reference normal
      var c = Math.cos(B.a), s = Math.sin(B.a), lx = -(nx * c + ny * s), ly = -(-nx * s + ny * c), h = [B.hx, B.hy], v;
      if (Math.abs(lx) > Math.abs(ly)) v = lx > 0 ? [[h[0], -h[1]], [h[0], h[1]]] : [[-h[0], h[1]], [-h[0], -h[1]]];
      else v = ly > 0 ? [[h[0], h[1]], [-h[0], h[1]]] : [[-h[0], -h[1]], [h[0], -h[1]]];
      return v.map(function (p) { return { x: B.x + p[0] * c - p[1] * s, y: B.y + p[0] * s + p[1] * c }; });
    }
    function boxBox(A, B) {                                          // separating axis test, then clip the incident edge (after Box2D-lite)
      var ca = Math.cos(A.a), sa = Math.sin(A.a), cb = Math.cos(B.a), sb = Math.sin(B.a), dpx = B.x - A.x, dpy = B.y - A.y;
      var dAx = ca * dpx + sa * dpy, dAy = -sa * dpx + ca * dpy, dBx = cb * dpx + sb * dpy, dBy = -sb * dpx + cb * dpy;
      var c00 = ca * cb + sa * sb, c01 = -ca * sb + sa * cb, c10 = -sa * cb + ca * sb, c11 = sa * sb + ca * cb;     // A^T B
      var fAx = Math.abs(dAx) - A.hx - (Math.abs(c00) * B.hx + Math.abs(c01) * B.hy), fAy = Math.abs(dAy) - A.hy - (Math.abs(c10) * B.hx + Math.abs(c11) * B.hy);
      if (fAx > MARGIN || fAy > MARGIN) return null;
      var fBx = Math.abs(dBx) - (Math.abs(c00) * A.hx + Math.abs(c10) * A.hy) - B.hx, fBy = Math.abs(dBy) - (Math.abs(c01) * A.hx + Math.abs(c11) * A.hy) - B.hy;
      if (fBx > MARGIN || fBy > MARGIN) return null;
      var axis = 0, sep = fAx, nx = dAx > 0 ? ca : -ca, ny = dAx > 0 ? sa : -sa, rt = 0.95, at = 0.01;
      if (fAy > rt * sep + at * A.hy) { axis = 1; sep = fAy; nx = dAy > 0 ? -sa : sa; ny = dAy > 0 ? ca : -ca; }
      if (fBx > rt * sep + at * B.hx) { axis = 2; sep = fBx; nx = dBx > 0 ? cb : -cb; ny = dBx > 0 ? sb : -sb; }
      if (fBy > rt * sep + at * B.hy) { axis = 3; sep = fBy; nx = dBy > 0 ? -sb : sb; ny = dBy > 0 ? cb : -cb; }
      var fnx, fny, front, snx, sny, neg, pos, inc;
      if (axis === 0) { fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + A.hx; snx = -sa; sny = ca; var sd = A.x * snx + A.y * sny; neg = -sd + A.hy; pos = sd + A.hy; inc = incident(B, fnx, fny); }
      else if (axis === 1) { fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + A.hy; snx = ca; sny = sa; var sd1 = A.x * snx + A.y * sny; neg = -sd1 + A.hx; pos = sd1 + A.hx; inc = incident(B, fnx, fny); }
      else if (axis === 2) { fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + B.hx; snx = -sb; sny = cb; var sd2 = B.x * snx + B.y * sny; neg = -sd2 + B.hy; pos = sd2 + B.hy; inc = incident(A, fnx, fny); }
      else { fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + B.hy; snx = cb; sny = sb; var sd3 = B.x * snx + B.y * sny; neg = -sd3 + B.hx; pos = sd3 + B.hx; inc = incident(A, fnx, fny); }
      var c1 = clip(inc, -snx, -sny, neg); if (c1.length < 2) return null;
      var c2 = clip(c1, snx, sny, pos); if (c2.length < 2) return null;
      var pts = [];
      c2.forEach(function (p) { var s2 = fnx * p.x + fny * p.y - front; if (s2 <= MARGIN) pts.push({ x: p.x - s2 * fnx, y: p.y - s2 * fny, sep: s2 }); });
      return pts.length ? { nx: nx, ny: ny, pts: pts } : null;
    }
    function collide(A, B) {
      if (A.type === 'circle' && B.type === 'circle') return circleCircle(A, B);
      if (A.type === 'box' && B.type === 'box') return boxBox(A, B);
      if (A.type === 'circle') return circleBox(A, B);
      var m = circleBox(B, A); if (!m) return null; m.nx = -m.nx; m.ny = -m.ny; return m;
    }
    function reach(b) { return b.type === 'circle' ? b.r : Math.hypot(b.hx, b.hy); }

    /* ---------- one step ---------- */
    function step(dt) {
      var bodies = S.bodies, i, j, k, n = bodies.length, b, A, B, newArb = {}, list = [];
      for (i = 0; i < n; i++) {
        b = bodies[i]; if (b.fixed) continue;
        b.vy -= S.g * dt; var damp = 1 / (1 + 0.03 * dt); b.vx *= damp; b.vy *= damp; b.w *= 1 / (1 + 0.08 * dt);
      }
      // contacts
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        A = bodies[i]; B = bodies[j];
        if (A.invM === 0 && B.invM === 0) continue;
        var rr = reach(A) + reach(B); if (Math.abs(A.x - B.x) > rr || Math.abs(A.y - B.y) > rr) continue;
        var m = collide(A, B); if (!m) continue;
        var key = A.id + ':' + B.id, old = S.arb[key], arb = { A: A, B: B, nx: m.nx, ny: m.ny, cs: [] };
        m.pts.forEach(function (p) {
          var c = { x: p.x, y: p.y, sep: p.sep, Pn: 0, Pt: 0, bias: 0, mn: 0, mt: 0, r1x: 0, r1y: 0, r2x: 0, r2y: 0 };
          if (old) old.cs.forEach(function (q) { if (Math.hypot(q.x - p.x, q.y - p.y) < 0.06) { c.Pn = q.Pn; c.Pt = q.Pt; } });
          arb.cs.push(c);
        });
        newArb[key] = arb; list.push(arb);
      }
      S.arb = newArb;
      var inv = 1 / dt, e = S.bounce, mu = S.friction;
      list.forEach(function (ar) {                                   // prepare
        var nx = ar.nx, ny = ar.ny, tx = ny, ty = -nx; A = ar.A; B = ar.B;
        ar.cs.forEach(function (c) {
          c.r1x = c.x - A.x; c.r1y = c.y - A.y; c.r2x = c.x - B.x; c.r2y = c.y - B.y;
          var rn1 = c.r1x * nx + c.r1y * ny, rn2 = c.r2x * nx + c.r2y * ny, rt1 = c.r1x * tx + c.r1y * ty, rt2 = c.r2x * tx + c.r2y * ty;
          c.mn = 1 / (A.invM + B.invM + A.invI * (c.r1x * c.r1x + c.r1y * c.r1y - rn1 * rn1) + B.invI * (c.r2x * c.r2x + c.r2y * c.r2y - rn2 * rn2));
          c.mt = 1 / (A.invM + B.invM + A.invI * (c.r1x * c.r1x + c.r1y * c.r1y - rt1 * rt1) + B.invI * (c.r2x * c.r2x + c.r2y * c.r2y - rt2 * rt2));
          var vn0 = (B.vx - B.w * c.r2y - A.vx + A.w * c.r1y) * nx + (B.vy + B.w * c.r2x - A.vy - A.w * c.r1x) * ny;
          c.bias = c.sep > 0 ? -c.sep * inv : Math.min(1.5, Math.max(0, -0.1 * inv * Math.min(0, c.sep + 0.008)));
          if (vn0 < -1.2) c.bias = Math.max(c.bias, -e * vn0);        // restitution, only for real impacts
        });
      });
      list.forEach(function (ar) {                                   // warm start, after every contact has read the velocities it arrived with
        var nx = ar.nx, ny = ar.ny, tx = ny, ty = -nx; A = ar.A; B = ar.B;
        ar.cs.forEach(function (c) {
          var Px = c.Pn * nx + c.Pt * tx, Py = c.Pn * ny + c.Pt * ty;
          A.vx -= A.invM * Px; A.vy -= A.invM * Py; A.w -= A.invI * (c.r1x * Py - c.r1y * Px);
          B.vx += B.invM * Px; B.vy += B.invM * Py; B.w += B.invI * (c.r2x * Py - c.r2y * Px);
        });
      });
      var g = S.grab;
      for (k = 0; k < 16; k++) {
        list.forEach(function (ar) {
          var nx = ar.nx, ny = ar.ny, tx = ny, ty = -nx; A = ar.A; B = ar.B;
          ar.cs.forEach(function (c) {
            var dvx = B.vx - B.w * c.r2y - A.vx + A.w * c.r1y, dvy = B.vy + B.w * c.r2x - A.vy - A.w * c.r1x;
            var vt = dvx * tx + dvy * ty, dPt = c.mt * (-vt), mx = mu * c.Pn, Pt0 = c.Pt, Px, Py;       // friction first, then the normal, which matters more
            c.Pt = clamp(Pt0 + dPt, -mx, mx); dPt = c.Pt - Pt0; Px = dPt * tx; Py = dPt * ty;
            A.vx -= A.invM * Px; A.vy -= A.invM * Py; A.w -= A.invI * (c.r1x * Py - c.r1y * Px);
            B.vx += B.invM * Px; B.vy += B.invM * Py; B.w += B.invI * (c.r2x * Py - c.r2y * Px);
            dvx = B.vx - B.w * c.r2y - A.vx + A.w * c.r1y; dvy = B.vy + B.w * c.r2x - A.vy - A.w * c.r1x;
            var vn = dvx * nx + dvy * ny, dPn = c.mn * (-vn + c.bias), Pn0 = c.Pn; c.Pn = Math.max(Pn0 + dPn, 0); dPn = c.Pn - Pn0;
            Px = dPn * nx; Py = dPn * ny;
            A.vx -= A.invM * Px; A.vy -= A.invM * Py; A.w -= A.invI * (c.r1x * Py - c.r1y * Px);
            B.vx += B.invM * Px; B.vy += B.invM * Py; B.w += B.invI * (c.r2x * Py - c.r2y * Px);
          });
        });
        S.rods.forEach(function (r) { solveRod(r, inv); });
        if (g) solveGrab(g);
      }
      for (i = 0; i < n; i++) { b = bodies[i]; if (b.fixed) continue; b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt; }
    }
    function solveRod(r, inv) {                                      // a rigid rod between a point (or body) and a body
      var B = r.b, A = r.a, c = Math.cos(B.a), s = Math.sin(B.a), rbx = r.bx * c - r.by * s, rby = r.bx * s + r.by * c, pbx = B.x + rbx, pby = B.y + rby, pax, pay, rax = 0, ray = 0, iMA = 0, iIA = 0, vax = 0, vay = 0, wa = 0;
      if (A) { var ca = Math.cos(A.a), sa = Math.sin(A.a); rax = r.ax * ca - r.ay * sa; ray = r.ax * sa + r.ay * ca; pax = A.x + rax; pay = A.y + ray; iMA = A.invM; iIA = A.invI; vax = A.vx; vay = A.vy; wa = A.w; } else { pax = r.ax; pay = r.ay; }
      var dx = pbx - pax, dy = pby - pay, L = Math.hypot(dx, dy) || 1e-9, nx = dx / L, ny = dy / L, C = L - r.len;
      var cr1 = rax * ny - ray * nx, cr2 = rbx * ny - rby * nx, k = iMA + B.invM + iIA * cr1 * cr1 + B.invI * cr2 * cr2;
      var cdot = nx * (B.vx - B.w * rby - vax + wa * ray) + ny * (B.vy + B.w * rbx - vay - wa * rax), lam = -(cdot + 0.15 * inv * C) / k;
      if (A) { A.vx -= iMA * lam * nx; A.vy -= iMA * lam * ny; A.w -= iIA * lam * cr1; }
      B.vx += B.invM * lam * nx; B.vy += B.invM * lam * ny; B.w += B.invI * lam * cr2;
    }
    function solveGrab(g) {                                          // a soft point constraint that pulls the grabbed point toward the pointer
      var b = g.b, c = Math.cos(b.a), s = Math.sin(b.a), rx = g.lx * c - g.ly * s, ry = g.lx * s + g.ly * c, px = b.x + rx, py = b.y + ry;
      var dvx = clamp((g.tx - px) * 14, -30, 30), dvy = clamp((g.ty - py) * 14, -30, 30);
      var cdx = b.vx - b.w * ry - dvx, cdy = b.vy + b.w * rx - dvy;
      var k11 = b.invM + b.invI * ry * ry, k12 = -b.invI * rx * ry, k22 = b.invM + b.invI * rx * rx, det = k11 * k22 - k12 * k12 || 1e-9;
      var jx = -(k22 * cdx - k12 * cdy) / det, jy = -(-k12 * cdx + k11 * cdy) / det, mj = b.mass * 40 / 10, jl = Math.hypot(jx, jy);
      if (jl > mj) { jx *= mj / jl; jy *= mj / jl; }
      b.vx += b.invM * jx; b.vy += b.invM * jy; b.w += b.invI * (rx * jy - ry * jx); b.w *= 0.985;
    }
    S.step = function (dt, force) {
      if (S.paused && !force) return;
      S.acc += Math.min(dt, 0.05);
      var h = 1 / 120, guard = 0;
      while (S.acc >= h && guard++ < 8) { step(h); S.acc -= h; S.t += h; }
    };
    S.stepOnce = function () { var was = S.paused; S.paused = false; step(1 / 60); step(1 / 60); S.t += 1 / 30; S.paused = was; S.version++; };
    S.setGravity = function (g) { S.g = clamp(+g, 0, 30); };
    S.setBounce = function (v) { S.bounce = clamp(+v, 0, 0.95); };
    S.setFriction = function (v) { S.friction = clamp(+v, 0, 1.2); };
    S.energy = function () { var e = 0; S.dynamic().forEach(function (b) { e += 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy) + 0.5 * (b.invI ? 1 / b.invI : 0) * b.w * b.w + b.mass * S.g * b.y; }); return e; };
    S.load('free');
    return S;
  }
  SIM.physics = PhysicsSim();

  /* ======================================================================
     PLANETARY SYSTEMS
     Real values: NASA Planetary Fact Sheet (Solar System, accessed Nov 2026); TRAPPIST-1:
     masses, periods and semi-major axes from Agol et al. (2021, Planetary Science Journal 2, 1),
     radii from the NASA Exoplanet Archive. Appearance is NOT observed for any exoplanet.
     ====================================================================== */
  function fmt(n) { return n >= 1000 ? Math.round(n).toLocaleString('en-US') : String(n); }
  var SOLAR = [
    ['Mercury', 'Terrestrial', 4879, '0.330', 3.7, 57.9, 88.0, [170, 164, 156]], ['Venus', 'Terrestrial', 12104, '4.87', 8.9, 108.2, 224.7, [226, 204, 160]],
    ['Earth', 'Terrestrial', 12756, '5.97', 9.8, 149.6, 365.2, [88, 146, 214]], ['Mars', 'Terrestrial', 6792, '0.642', 3.7, 228.0, 687.0, [214, 112, 76]],
    ['Jupiter', 'Gas giant', 142984, '1898', 23.1, 778.5, 4331, [212, 182, 150]], ['Saturn', 'Gas giant', 120536, '568', 9.0, 1432.0, 10747, [226, 206, 160]],
    ['Uranus', 'Ice giant', 51118, '86.8', 8.7, 2867.0, 30589, [150, 214, 222]], ['Neptune', 'Ice giant', 49528, '102', 11.0, 4515.0, 59800, [70, 104, 214]]
  ].map(function (r, i) {
    var au = r[5] / 149.6, yrs = r[6] / 365.25;
    return { name: r[0], type: r[1], radiusE: r[2] / 2 / 6371, a: au, period: r[6], color: r[7], phase: [0.9, 2.6, 4.2, 5.5, 1.3, 3.4, 0.2, 4.9][i], rings: r[0] === 'Saturn', bands: r[0] === 'Jupiter' || r[0] === 'Saturn', spot: r[0] === 'Jupiter',
      rows: [['Type', r[1]], ['Diameter', fmt(r[2]) + ' km'], ['Mass', r[3] + ' × 10²⁴ kg'], ['Distance from the Sun', r[5] + ' million km (' + au.toFixed(2) + ' au)'], ['Orbital period', fmt(r[6]) + ' days' + (r[6] > 700 ? ' (' + yrs.toFixed(1) + ' years)' : '')], ['Surface gravity', r[4] + ' m/s²' + (r[1] === 'Terrestrial' ? '' : ' at the 1-bar level')]] };
  });
  var T1 = [['b', 1.12, 1.375, 0.012, 1.511], ['c', 1.10, 1.317, 0.016, 2.423], ['d', 0.79, 0.390, 0.022, 4.050], ['e', 0.92, 0.704, 0.029, 6.103], ['f', 1.04, 1.044, 0.039, 9.210], ['g', 1.13, 1.321, 0.047, 12.356], ['h', 0.75, 0.327, 0.062, 18.779]];
  var T1COL = [[196, 120, 96], [214, 150, 108], [118, 172, 196], [140, 190, 150], [120, 150, 214], [176, 140, 206], [196, 196, 210]];
  var TRAPPIST = T1.map(function (r, i) {
    return { name: 'TRAPPIST-1 ' + r[0], short: r[0], type: 'Rocky, Earth-sized', radiusE: r[1], a: r[3], period: r[4], color: T1COL[i], phase: [0.4, 2.2, 3.6, 5.1, 1.1, 4.4, 2.9][i],
      rows: [['Type', 'Rocky, Earth-sized'], ['Radius', r[1].toFixed(2) + ' × Earth'], ['Mass', r[2].toFixed(3) + ' × Earth'], ['Distance from its star', r[3].toFixed(3) + ' au'], ['Orbital period', r[4].toFixed(3) + ' days']] };
  });
  var LANTERN = [['Ember', 'Rocky', 0.6, 0.31, 70], ['Tarn', 'Ocean world', 1.1, 0.55, 140], ['Hollow', 'Rocky', 0.9, 0.9, 260], ['Vesper', 'Gas giant', 6.5, 1.8, 720], ['Rime', 'Ice giant', 3.2, 3.4, 2100]].map(function (r, i) {
    return { name: r[0], type: r[1], radiusE: r[2], a: r[3], period: r[4], color: [[220, 120, 80], [90, 160, 190], [170, 150, 130], [200, 170, 130], [130, 180, 210]][i], phase: [1, 3, 5, 0.5, 4][i], bands: r[1] === 'Gas giant', rings: r[0] === 'Rime',
      rows: [['Status', 'Fictional: invented for this page'], ['Type', r[1]], ['Radius', r[2] + ' × Earth (invented)'], ['Distance from its star', r[3] + ' au (invented)'], ['Orbital period', r[4] + ' days (invented)']] };
  });
  var SYSTEMS = {
    solar: { id: 'solar', name: 'Solar System', real: true, star: { name: 'Sun', color: [255, 205, 140], note: 'G-type star' }, planets: SOLAR, days: 30, base: 'Sun',
      source: 'NASA Planetary Fact Sheet (NSSDC), values as published', look: 'Planet colours and features are the ones seen in spacecraft and telescope images.', blurb: 'Eight planets' },
    trappist: { id: 'trappist', name: 'TRAPPIST-1', real: true, star: { name: 'TRAPPIST-1', color: [255, 130, 96], note: 'Ultra-cool dwarf star' }, planets: TRAPPIST, days: 0.6,
      source: 'Masses, periods, distances: Agol et al. 2021 (Planetary Science Journal). Radii: NASA Exoplanet Archive.', look: 'No surface has been observed on any of these planets. Colours here only tell them apart.', blurb: 'Seven Earth-sized planets' },
    lantern: { id: 'lantern', name: 'Lantern', real: false, star: { name: 'Lantern', color: [255, 150, 90], note: 'Fictional star' }, planets: LANTERN, days: 12,
      source: 'Fictional. Invented for this page; not real data.', look: 'Everything here is made up, including how the planets look.', blurb: 'A fictional system' }
  };

  function PlanetsSim() {
    var S = { SYSTEMS: SYSTEMS, ORDER: ['solar', 'trappist', 'lantern'], view: 'select', sys: null, planet: -1, speed: 1, paused: false, t: 0, version: 0, cam: 0, hover: -1 };
    S.system = function () { return S.sys ? SYSTEMS[S.sys] : null; };
    S.enter = function (id) { if (!SYSTEMS[id]) return; S.sys = id; S.view = 'system'; S.planet = -1; S.t = 0; S.version++; };
    S.focus = function (i) { var s = S.system(); if (s && s.planets[i]) { S.planet = i; S.view = 'planet'; S.version++; } };
    S.overview = function () { if (S.sys) { S.view = 'system'; S.planet = -1; S.version++; } };
    S.back = function () { S.view = 'select'; S.planet = -1; S.sys = S.sys; S.version++; };      // the chosen system stays remembered
    S.up = function () { if (S.view === 'planet') S.overview(); else if (S.view === 'system') S.back(); };
    S.setSpeed = function (v) { S.speed = clamp(+v, 0.1, 20); };
    S.daysPerSecond = function () { var s = S.system() || SYSTEMS.solar; return s.days * S.speed; };
    S.step = function (dt) { if (!S.paused) S.t += Math.min(dt, 0.05) * S.daysPerSecond(); };
    S.angle = function (p) { return p.phase + TAU * S.t / p.period; };
    S.layout = function (sys) {                                      // orbit radius in the picture: logarithmic, so every orbit can be seen
      var a = sys.planets.map(function (p) { return p.a; }), lo = Math.log(Math.min.apply(null, a)), hi = Math.log(Math.max.apply(null, a));
      return sys.planets.map(function (p) { return 0.16 + 0.84 * (hi > lo ? (Math.log(p.a) - lo) / (hi - lo) : 0.5); });
    };
    S.reset = function () { S.view = 'select'; S.sys = null; S.planet = -1; S.speed = 1; S.paused = false; S.t = 0; S.version++; };
    return S;
  }
  SIM.planets = PlanetsSim();

  /* ======================================================================
     ORBITAL MECHANICS
     ====================================================================== */
  var BODIES = {
    earth: { name: 'Earth', mu: 398600.4418, R: 6378.137, color: [96, 146, 206], low: 400, high: 35786, highName: 'geostationary height', g: 'EGM / IAU values' },
    moon:  { name: 'Moon',  mu: 4902.8,      R: 1737.4,   color: [172, 172, 168], low: 100, high: 1500, highName: 'a high lunar orbit' },
    mars:  { name: 'Mars',  mu: 42828.37,    R: 3396.2,   color: [214, 112, 76],  low: 250, high: 17032, highName: 'areostationary height' }
  };

  function OrbitSim() {
    var S = { BODIES: BODIES, body: 'earth', alt: 400, vrel: 1, burn: 50, warp: 300, status: 'ready', x: 0, y: 0, vx: 0, vy: 0, t: 0, dv: 0, trail: [], impact: null, version: 0, challenge: 0, done: false, doneAt: 0, msg: '', paused: false, flightT: 0, held: 0 };
    S.B = function () { return BODIES[S.body]; };
    S.vc = function (alt) { var B = S.B(); return Math.sqrt(B.mu / (B.R + (alt == null ? S.alt : alt))); };
    S.v0 = function () { return S.vrel * S.vc(); };
    S.altRange = function () { var B = S.B(); return [Math.round(B.R * 0.03 / 10) * 10, Math.round(B.R * 4 / 100) * 100]; };
    S.CH = function () { var B = S.B(); return [
      { id: 'low', title: 'Circular orbit at ' + B.low + ' km', kind: 'circ', alt: B.low },
      { id: 'high', title: 'Circular orbit at ' + B.high.toLocaleString('en-US') + ' km (' + B.highName + ')', kind: 'circ', alt: B.high },
      { id: 'esc', title: 'Escape from ' + B.name, kind: 'escape' }]; };

    function accel(x, y, o) { var B = BODIES[S.body], r2 = x * x + y * y, r3 = r2 * Math.sqrt(r2); o[0] = -B.mu * x / r3; o[1] = -B.mu * y / r3; }
    var a1 = [0, 0], a2 = [0, 0], a3 = [0, 0], a4 = [0, 0];
    function rk4(s, h) {                                             // one fourth-order Runge-Kutta step of (x, y, vx, vy)
      accel(s.x, s.y, a1);
      var x2 = s.x + 0.5 * h * s.vx, y2 = s.y + 0.5 * h * s.vy, vx2 = s.vx + 0.5 * h * a1[0], vy2 = s.vy + 0.5 * h * a1[1]; accel(x2, y2, a2);
      var x3 = s.x + 0.5 * h * vx2, y3 = s.y + 0.5 * h * vy2, vx3 = s.vx + 0.5 * h * a2[0], vy3 = s.vy + 0.5 * h * a2[1]; accel(x3, y3, a3);
      var x4 = s.x + h * vx3, y4 = s.y + h * vy3, vx4 = s.vx + h * a3[0], vy4 = s.vy + h * a3[1]; accel(x4, y4, a4);
      s.x += h / 6 * (s.vx + 2 * vx2 + 2 * vx3 + vx4); s.y += h / 6 * (s.vy + 2 * vy2 + 2 * vy3 + vy4);
      s.vx += h / 6 * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]); s.vy += h / 6 * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]);
    }
    function maxStep(r) { var B = BODIES[S.body]; return 0.012 * Math.sqrt(r * r * r / B.mu); }
    S.elements = function (s) {
      s = s || S; var B = S.B(), r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy, eps = v2 / 2 - B.mu / r, h = s.x * s.vy - s.y * s.vx;
      var rv = s.x * s.vx + s.y * s.vy, ex = ((v2 - B.mu / r) * s.x - rv * s.vx) / B.mu, ey = ((v2 - B.mu / r) * s.y - rv * s.vy) / B.mu, e = Math.hypot(ex, ey);
      var o = { r: r, v: Math.sqrt(v2), alt: r - B.R, eps: eps, h: h, e: e, w: Math.atan2(ey, ex), bound: eps < 0, retro: h < 0 };
      if (eps < 0) { o.a = -B.mu / (2 * eps); o.peri = o.a * (1 - e); o.apo = o.a * (1 + e); o.period = TAU * Math.sqrt(o.a * o.a * o.a / B.mu); }
      else { o.peri = h * h / (B.mu * (1 + e)); o.apo = Infinity; o.period = Infinity; o.vinf = Math.sqrt(2 * eps); }
      return o;
    };
    S.classify = function () {
      var el = S.elements(), B = S.B();
      if (S.status === 'crashed' || S.status === 'escaped') return S.status;
      if (!el.bound) return 'escape';
      return el.peri < B.R ? 'suborbital' : 'orbit';
    };
    /* the path the craft will follow from where it is now, found by stepping a copy forward */
    S.predict = function (from, maxPts) {
      var s = from ? { x: from.x, y: from.y, vx: from.vx, vy: from.vy } : { x: S.x, y: S.y, vx: S.vx, vy: S.vy }, B = S.B(), el = S.elements(s), pts = [], i = 0, t = 0, N = maxPts || 360, hit = false, lx, ly;
      var span = el.bound ? el.period : Math.min(6 * B.R / Math.max(0.5, el.v), 1e6), tEnd = Math.min(span, 5e5), minGap = B.R * 0.012;
      pts.push(s.x, s.y); lx = s.x; ly = s.y;
      while (t < tEnd && i < N * 12) {
        var r0 = Math.hypot(s.x, s.y), h = Math.min(maxStep(r0) * 3, tEnd / N, tEnd - t); if (h < 1e-6) break; rk4(s, h); t += h; i++;
        var r = Math.hypot(s.x, s.y);
        if (r <= B.R) { hit = true; var k = B.R / r; pts.push(s.x * k, s.y * k); break; }
        if (Math.hypot(s.x - lx, s.y - ly) > minGap) { pts.push(s.x, s.y); lx = s.x; ly = s.y; }
        if (r > 40 * B.R) break;
      }
      if (!hit && (pts[pts.length - 2] !== s.x || pts[pts.length - 1] !== s.y)) pts.push(s.x, s.y);
      return { pts: pts, impact: hit, closed: !hit && el.bound };
    };
    S.setBody = function (id) { if (!BODIES[id] || id === S.body) return; S.body = id; var r = S.altRange(); S.alt = clamp(BODIES[id].low, r[0], r[1]); S.vrel = 1; S.challenge = 0; S.ready(); };
    S.setAlt = function (a) { var r = S.altRange(); S.alt = clamp(+a, r[0], r[1]); if (S.status === 'ready') S.ready(); S.version++; };
    S.setV = function (v) { S.vrel = clamp(+v, 0.2, 1.6); if (S.status === 'ready') S.ready(); S.version++; };
    S.ready = function () {                                          // place the craft at the launch point, not yet flying
      var B = S.B(); S.x = B.R + S.alt; S.y = 0; S.vx = 0; S.vy = S.v0(); S.t = 0; S.flightT = 0; S.dv = 0; S.trail = []; S.impact = null; S.status = 'ready'; S.done = false; S.msg = ''; S.held = 0; S.version++;
    };
    S.launch = function () { S.ready(); S.status = 'flying'; S.paused = false; S.trail = [S.x, S.y]; S.msg = ''; S.version++; };
    S.reset = function () { S.ready(); };
    S.setWarp = function (w) { S.warp = clamp(+w, 1, 20000); };
    S.setChallenge = function (i) { S.challenge = clamp(i | 0, 0, 2); S.done = false; S.held = 0; S.version++; };
    S.burn = function (dir) {                                        // dir +1 prograde, -1 retrograde: a change of speed along the direction of travel
      if (S.status !== 'flying') return false;
      var v = Math.hypot(S.vx, S.vy) || 1, dv = dir * S.burnSize / 1000;
      if (dir < 0 && -dv > v) dv = -v;
      S.vx += S.vx / v * dv; S.vy += S.vy / v * dv; S.dv += Math.abs(dv) * 1000; S.version++; return true;
    };
    S.burnSize = 50;                                                 // m/s per burn
    S.setBurn = function (m) { S.burnSize = clamp(+m, 5, 1000); };
    function checkChallenge() {
      var ch = S.CH()[S.challenge], el = S.elements(), B = S.B();
      if (S.done || S.status !== 'flying' || S.dv <= 0) return;                  // the craft starts in a 400 km circle: a challenge counts only once a burn has been made
      var okNow = false;
      if (ch.kind === 'escape') okNow = !el.bound && el.alt > 2 * B.R;
      else if (el.bound && el.peri > B.R) { var tol = ch.alt * 0.04 + 15; okNow = Math.abs(el.peri - B.R - ch.alt) <= tol && Math.abs(el.apo - B.R - ch.alt) <= tol; }
      S.held = okNow ? S.held + 1 : 0;
      if (S.held >= 3) { S.done = true; S.doneAt = S.flightT; S.msg = 'Challenge complete: ' + ch.title + ' (change of speed used: ' + Math.round(S.dv) + ' m/s)'; S.version++; }
    }
    S.step = function (dt) {
      if (S.status !== 'flying' || S.paused) return;
      var B = S.B(), left = Math.min(dt, 0.05) * S.warp, n = 0, s = S, el;
      while (left > 1e-9 && n < 600) {
        var r = Math.hypot(s.x, s.y), h = Math.min(left, maxStep(r)); rk4(s, h); left -= h; S.t += h; S.flightT += h; n++;
        r = Math.hypot(s.x, s.y);
        if (r <= B.R) {                                              // impact: put the craft on the surface and stop
          var k = B.R / r; S.x *= k; S.y *= k; S.impact = { speed: Math.hypot(S.vx, S.vy), x: S.x, y: S.y, t: S.flightT }; S.vx = 0; S.vy = 0; S.status = 'crashed';
          S.msg = 'Impact at ' + S.impact.speed.toFixed(2) + ' km/s. Press Reset to try again.'; S.version++; break;
        }
        if (r > 30 * B.R) { el = S.elements(); if (!el.bound) { S.status = 'escaped'; S.msg = 'Escaped ' + B.name + ' with ' + el.vinf.toFixed(2) + ' km/s to spare. Press Reset to fly again.'; S.version++; break; } }
      }
      var last = S.trail.length ? Math.hypot(S.x - S.trail[S.trail.length - 2], S.y - S.trail[S.trail.length - 1]) : 1e9;
      if (last > S.B().R * 0.03) { S.trail.push(S.x, S.y); if (S.trail.length > 1800) S.trail.splice(0, 2); }
      checkChallenge();
    };
    S.ready();
    return S;
  }
  SIM.orbit = OrbitSim();
  SIM.orbit.launch();                                                  // the page opens with a circular orbit already under way; the controls take over from there

  /* ======================================================================
     CONSTELLATION
     ====================================================================== */
  function StarsSim() {
    var S = { stars: [], links: [], sel: -1, mode: 'place', MAX: 24, version: 0, nextId: 1 };
    S.add = function (x, y) { if (S.stars.length >= S.MAX) return -1; S.stars.push({ id: S.nextId++, x: clamp(x, 0.02, 0.98), y: clamp(y, 0.04, 0.96) }); S.sel = S.stars.length - 1; S.version++; return S.sel; };
    S.move = function (i, x, y) { var s = S.stars[i]; if (s) { s.x = clamp(x, 0.02, 0.98); s.y = clamp(y, 0.04, 0.96); S.version++; } };
    S.select = function (i) { S.sel = i; S.version++; };
    S.link = function (i, j) {
      if (i === j || !S.stars[i] || !S.stars[j]) return false;
      var k = S.links.findIndex(function (l) { return (l[0] === i && l[1] === j) || (l[0] === j && l[1] === i); });
      if (k >= 0) S.links.splice(k, 1); else S.links.push([i, j]);
      S.version++; return true;
    };
    S.remove = function (i) {
      if (!S.stars[i]) return; S.stars.splice(i, 1);
      S.links = S.links.filter(function (l) { return l[0] !== i && l[1] !== i; }).map(function (l) { return [l[0] > i ? l[0] - 1 : l[0], l[1] > i ? l[1] - 1 : l[1]]; });
      S.sel = -1; S.version++;
    };
    S.setMode = function (m) { S.mode = m === 'connect' ? 'connect' : 'place'; S.version++; };
    S.reset = function () { S.stars = []; S.links = []; S.sel = -1; S.mode = 'place'; S.version++; };
    S.nearest = function (x, y, maxD) { var best = -1, bd = maxD == null ? 1e9 : maxD; S.stars.forEach(function (s, i) { var d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } }); return best; };
    return S;
  }
  SIM.stars = StarsSim();
})(typeof window !== 'undefined' ? window : globalThis);
