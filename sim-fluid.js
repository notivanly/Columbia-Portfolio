/* ==========================================================================
   sim-fluid.js
   Simulation state and calculations for the Wind Tunnel. No DOM, no canvas.

   What is calculated, and how honest it is:
     airfoil          potential flow around a Joukowski section (the original model), with the
                      circulation set by the Kutta condition. Lift and drag coefficients are a
                      thin-airfoil approximation with a simple stall rule.
     the other shapes a 2D constant-strength source-panel solution of potential flow around the
                      side silhouette. Potential flow has no wake, so a separated wake is added
                      behind each shape as an ILLUSTRATION (slower, unsteady air). It is not CFD.
     coefficients     drag coefficients are rough textbook values for each shape (sphere 0.47,
                      cylinder about 0.8 to 0.95, car about 0.3). The banana has no published
                      value; its number is an estimate. Forces use  F = 1/2 rho V^2 A C.
   Nothing here is measured, and it is not a substitute for a wind tunnel.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF = global.PF || {}, U = PF.util, SIM = PF.sim = PF.sim || {};
  var TAU = U.TAU, clamp = U.clamp, lerp = U.lerp;
  var UNIT = 0.05;                                               // metres per world unit (one unit is 5 cm)

  /* ---------- outlines (counter-clockwise, flow arrives from the left, units of 5 cm) ---------- */
  var JK = { c: 1, eps: 0.09, del: 0.06 };
  JK.z0x = -JK.eps; JK.z0y = JK.del; JK.ra = Math.hypot(JK.c + JK.eps, JK.del); JK.beta = Math.asin(JK.del / JK.ra);

  function airfoilOutline(K) {
    var pts = [], i, th, zx, zy, d, minx = 1e9, maxx = -1e9;
    for (i = 0; i < K; i++) {
      th = (i / K) * TAU; zx = JK.z0x + JK.ra * Math.cos(th); zy = JK.z0y + JK.ra * Math.sin(th); d = zx * zx + zy * zy;
      var fx = zx + JK.c * JK.c * zx / d, fy = zy - JK.c * JK.c * zy / d;
      pts.push([fx, fy]); if (fx < minx) minx = fx; if (fx > maxx) maxx = fx;
    }
    // the mapping starts at the trailing edge going counter-clockwise: keep that order, centre on mid-chord
    var mid = (minx + maxx) / 2; pts.forEach(function (p) { p[0] -= mid; });
    return { pts: pts, chord: maxx - minx };
  }
  function circle(R, n) { var a = [], i; for (i = 0; i < n; i++) { var t = (i / n) * TAU; a.push([R * Math.cos(t), R * Math.sin(t)]); } return a; }
  function roundRect(hw, hh, r, n) {                               // a can seen from the side: counter-clockwise rounded rectangle
    var a = [], i, k = Math.max(3, Math.round(n / 8)), cs = [[hw - r, -hh + r, -90], [hw - r, hh - r, 0], [-hw + r, hh - r, 90], [-hw + r, -hh + r, 180]];
    cs.forEach(function (c) { for (i = 0; i <= k; i++) { var t = (c[2] + 90 * i / k) * Math.PI / 180; a.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); } });
    return a;
  }
  function chaikin(pts, it) {                                      // round the corners of a closed polygon
    var p = pts, k, i;
    for (k = 0; k < it; k++) { var q = []; for (i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } p = q; }
    return p;
  }
  function carOutline() {
    var raw = [[-2.2, -0.34], [-2.05, -0.55], [-1.7, -0.6], [-0.9, -0.6], [1.5, -0.6], [2.05, -0.55], [2.22, -0.28], [2.2, 0.16], [1.85, 0.36], [1.3, 0.44], [0.85, 0.68], [0.25, 0.77], [-0.45, 0.75], [-0.92, 0.46], [-1.55, 0.3], [-2.08, 0.2], [-2.24, 0.0]];
    return chaikin(raw, 2);
  }
  function bananaOutline() {                                        // a crescent: curved centre line, thickest in the middle, blunt stem end on the right
    var n = 64, up = [], dn = [], i, R = 3.1, sweep = 1.3, len = R * sweep;
    for (i = 0; i <= n; i++) {
      var s = i / n, ph = (s - 0.5) * sweep, cx = R * Math.sin(ph), cy = R * (Math.cos(ph) - Math.cos(sweep / 2)), nx = -Math.sin(ph), ny = Math.cos(ph);
      var t = 0.86 * Math.pow(Math.sin(Math.PI * clamp(s * 0.94 + 0.03, 0, 1)), 0.55) * (0.55 + 0.45 * Math.sin(Math.PI * (0.06 + s * 0.88))) / 2 + (s > 0.96 ? 0.1 : 0.04);
      up.push([cx + nx * t, cy + ny * t]); dn.push([cx - nx * t, cy - ny * t]);
    }
    var pts = dn.concat(up.reverse()), cx0 = 0, cy0 = 0; pts.forEach(function (p) { cx0 += p[0]; cy0 += p[1]; }); cx0 /= pts.length; cy0 /= pts.length;
    void len; return pts.map(function (p) { return [p[0] - cx0, p[1] - cy0]; });
  }

  /* ---------- the objects ---------- */
  var AF = airfoilOutline(160);
  var OBJECTS = {
    airfoil:  { name: 'Airfoil',  range: [-10, 22], def: 6, angleName: 'Angle of attack', base: AF.pts, len: AF.chord, depth: 3.0, model: 'Potential flow around a Joukowski airfoil (Kutta condition). Lift and drag from a thin-airfoil approximation with a stall rule.' },
    sphere:   { name: 'Sphere',   range: [0, 0], def: 0, angleName: 'Angle (no effect)', base: circle(1.3, 96), len: 2.6, depth: 2.6, model: 'Source-panel potential flow around the circular cross-section, with an illustrative wake. Drag coefficient 0.47 (smooth sphere, Re about 10^3 to 2x10^5).' },
    cylinder: { name: 'Cylinder', range: [0, 90], def: 90, angleName: 'Axis angle to the wind', base: roundRect(1.8, 0.75, 0.16, 96), len: 1.5, depth: 1.5, model: 'Source-panel potential flow around the can seen from the side, with an illustrative wake. Drag coefficient estimated at 0.8 (end-on) to 0.95 (side-on).' },
    car:      { name: 'Car',      range: [-12, 20], def: 0, angleName: 'Pitch', base: carOutline(), len: 4.5, depth: 1.8, model: 'Source-panel potential flow around the side silhouette in free air (no ground), with an illustrative wake. Drag coefficient about 0.30 at zero angle, rising as the car pitches.' },
    banana:   { name: 'Banana',   range: [-90, 90], def: 0, angleName: 'Tilt', base: bananaOutline(), len: 4.0, depth: 0.95, model: 'Source-panel potential flow around the crescent, with an illustrative wake. There is no published drag coefficient for a banana: the value here is an estimate.' }
  };
  var ORDER = ['airfoil', 'sphere', 'cylinder', 'car', 'banana'];

  /* resample a closed polygon to n panels of nearly equal length */
  function resample(pts, n) {
    var m = pts.length, cum = [0], i, L = 0;
    for (i = 0; i < m; i++) { var a = pts[i], b = pts[(i + 1) % m]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(L); }
    var out = [], j = 0;
    for (i = 0; i < n; i++) {
      var d = (i / n) * L; while (j < m - 1 && cum[j + 1] < d) j++;
      var a2 = pts[j], b2 = pts[(j + 1) % m], f = (d - cum[j]) / ((cum[j + 1] - cum[j]) || 1);
      out.push([a2[0] + (b2[0] - a2[0]) * f, a2[1] + (b2[1] - a2[1]) * f]);
    }
    return out;
  }
  function inside(pts, x, y) {                                      // ray casting
    var c = false, i, j;
    for (i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /* ---------- source-panel method ---------- */
  function Panels(poly) {
    var n = poly.length, i, j, P = { n: n, x: [], y: [], tx: [], ty: [], nx: [], ny: [], h: [], sig: new Float64Array(n), poly: poly };
    for (i = 0; i < n; i++) {
      var a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1e-9;
      P.x.push((a[0] + b[0]) / 2); P.y.push((a[1] + b[1]) / 2); P.tx.push(dx / l); P.ty.push(dy / l); P.nx.push(dy / l); P.ny.push(-dx / l); P.h.push(l / 2);
    }
    P.vel = function (x, y, out, skip) {                             // velocity from all the panels at a point (unit source strengths scaled by sig)
      var vx = 0, vy = 0, k;
      for (k = 0; k < n; k++) {
        if (k === skip) continue;
        var rx = x - P.x[k], ry = y - P.y[k], xi = rx * P.tx[k] + ry * P.ty[k], eta = rx * P.nx[k] + ry * P.ny[k], h = P.h[k];
        var r1 = (xi + h) * (xi + h) + eta * eta + 1e-12, r2 = (xi - h) * (xi - h) + eta * eta + 1e-12;
        var ux = Math.log(r1 / r2) / (4 * Math.PI), uy = (Math.atan2(eta, xi - h) - Math.atan2(eta, xi + h)) / TAU;
        vx += P.sig[k] * (ux * P.tx[k] + uy * P.nx[k]); vy += P.sig[k] * (ux * P.ty[k] + uy * P.ny[k]);
      }
      out.x = vx; out.y = vy; return out;
    };
    // boundary condition: no flow through the surface, for a free stream (1, 0)
    var A = [], rhs = new Float64Array(n), tmp = { x: 0, y: 0 };
    for (i = 0; i < n; i++) {
      var row = new Float64Array(n);
      for (j = 0; j < n; j++) {
        if (i === j) { row[j] = 0.5; continue; }
        var rx = P.x[i] - P.x[j], ry = P.y[i] - P.y[j], xi2 = rx * P.tx[j] + ry * P.ty[j], eta2 = rx * P.nx[j] + ry * P.ny[j], h2 = P.h[j];
        var q1 = (xi2 + h2) * (xi2 + h2) + eta2 * eta2 + 1e-12, q2 = (xi2 - h2) * (xi2 - h2) + eta2 * eta2 + 1e-12;
        var ux2 = Math.log(q1 / q2) / (4 * Math.PI), uy2 = (Math.atan2(eta2, xi2 - h2) - Math.atan2(eta2, xi2 + h2)) / TAU;
        row[j] = (ux2 * P.tx[j] + uy2 * P.nx[j]) * P.nx[i] + (ux2 * P.ty[j] + uy2 * P.ny[j]) * P.ny[i];
      }
      A.push(row); rhs[i] = -P.nx[i];
    }
    for (i = 0; i < n; i++) {                                        // Gaussian elimination, partial pivoting
      var piv = i, best = Math.abs(A[i][i]);
      for (j = i + 1; j < n; j++) if (Math.abs(A[j][i]) > best) { best = Math.abs(A[j][i]); piv = j; }
      if (piv !== i) { var t = A[i]; A[i] = A[piv]; A[piv] = t; var tr = rhs[i]; rhs[i] = rhs[piv]; rhs[piv] = tr; }
      for (j = i + 1; j < n; j++) { var f = A[j][i] / A[i][i]; if (!f) continue; for (var k2 = i; k2 < n; k2++) A[j][k2] -= f * A[i][k2]; rhs[j] -= f * rhs[i]; }
    }
    for (i = n - 1; i >= 0; i--) { var s = rhs[i]; for (j = i + 1; j < n; j++) s -= A[i][j] * P.sig[j]; P.sig[i] = s / A[i][i]; }
    // surface speeds, for checks and for the coefficient of pressure
    P.surf = new Float64Array(n);
    for (i = 0; i < n; i++) { P.vel(P.x[i], P.y[i], tmp, i); P.surf[i] = Math.abs((1 + tmp.x) * P.tx[i] + tmp.y * P.ty[i]); }
    return P;
  }

  /* ---------- the simulation ---------- */
  function WindSim() {
    var S = { OBJECTS: OBJECTS, ORDER: ORDER, UNIT: UNIT, kind: 'airfoil', prev: null, morph: 1, speed: 24, angle: 6, angles: {}, rho: 1.225, mu: 1.81e-5,
      X0: -8, X1: 8, Ytop: 2.05, Ybot: -2.05, SW: 1.5, parts: [], lanes: [], outline: [], panels: null, wake: null, stall: 0, c: null, found: false, version: 0 }, tmp = { x: 0, y: 0 }, out = { x: 1, y: 0, q: 1 }, t = 0;

    function rotated(base, ang) {                                    // nose up for a positive angle (rotate clockwise)
      var ca = Math.cos(ang), sa = Math.sin(ang);
      return base.map(function (p) { return [p[0] * ca + p[1] * sa, -p[0] * sa + p[1] * ca]; });
    }

    /* Joukowski velocity at a point of the display plane (the original model). false when inside the body */
    function jouk(X, Y, alpha, Gam) {
      var c = JK.c, ca = Math.cos(alpha), sa = Math.sin(alpha), z0x = JK.z0x, z0y = JK.z0y, ra = JK.ra;
      var zx = X * ca - Y * sa, zy = X * sa + Y * ca;
      var z2x = zx * zx - zy * zy - 4 * c * c, z2y = 2 * zx * zy, mod = Math.hypot(z2x, z2y);
      var sx = Math.sqrt((mod + z2x) / 2), sy = Math.sqrt(Math.max(0, (mod - z2x) / 2)); if (z2y < 0) sy = -sy;
      var r1x = (zx + sx) / 2, r1y = (zy + sy) / 2, r2x = (zx - sx) / 2, r2y = (zy - sy) / 2;
      var d1 = Math.hypot(r1x - z0x, r1y - z0y), d2 = Math.hypot(r2x - z0x, r2y - z0y), zex, zey, d;
      if (d1 >= d2) { zex = r1x; zey = r1y; d = d1; } else { zex = r2x; zey = r2y; d = d2; }
      if (d < ra) return false;
      var qx = zex - z0x, qy = zey - z0y, q2 = qx * qx + qy * qy, q2x = qx * qx - qy * qy, q2y = 2 * qx * qy, qq = q2x * q2x + q2y * q2y;
      var t2r = ra * ra * (ca * q2x + sa * q2y) / qq, t2i = ra * ra * (sa * q2x - ca * q2y) / qq;
      var wr = ca - t2r + (Gam / (TAU * q2)) * qy, wi = -sa - t2i + (Gam / (TAU * q2)) * qx;
      var e2x = zex * zex - zey * zey, e2y = 2 * zex * zey, ee = e2x * e2x + e2y * e2y;
      var jr = 1 - c * c * e2x / ee, ji = c * c * e2y / ee, jj = jr * jr + ji * ji;
      if (jj < 1e-6) { out.x = 1; out.y = 0; out.q = 1; return true; }
      var Wr = (wr * jr + wi * ji) / jj, Wi = (wi * jr - wr * ji) / jj, u = Wr, v = -Wi, vx = u * ca + v * sa, vy = -u * sa + v * ca, q = Math.hypot(vx, vy);
      if (q > 3.6) { vx *= 3.6 / q; vy *= 3.6 / q; q = 3.6; }
      out.x = vx; out.y = vy; out.q = q; return true;
    }

    /* ----- coefficients (approximate) ----- */
    function coefficients() {
      var o = OBJECTS[S.kind], a = S.angle, ar = a * Math.PI / 180, V = S.speed, q = 0.5 * S.rho * V * V, Lc = o.len * UNIT, c = { cd: 0, cl: null, area: 0, note: '' }, stall = 0;
      if (S.kind === 'airfoil') {
        var chord = o.len * UNIT, span = o.depth * UNIT, clp = 2 * Math.PI * (ar + JK.beta), sa = a;
        var cl = clp;
        if (sa > 15) { stall = clamp((sa - 15) / 4, 0, 1); cl = 2 * Math.PI * (15 * Math.PI / 180 + JK.beta) * Math.max(0.35, 1 - 0.055 * (sa - 15)); }
        else if (sa < -15) { stall = clamp((-15 - sa) / 4, 0, 1); cl = 2 * Math.PI * (-15 * Math.PI / 180 + JK.beta) * Math.max(0.35, 1 - 0.055 * (-sa - 15)); }
        c.area = chord * span; c.cl = cl; c.cd = 0.02 + 0.05 * cl * cl + 0.25 * stall; c.clUnstalled = clp; Lc = chord;
        c.note = stall > 0 ? 'Stalled: past about 15 degrees the real flow separates and lift falls.' : '';
      } else if (S.kind === 'sphere') {
        c.cd = 0.47; c.area = Math.PI / 4 * Math.pow(o.len * UNIT, 2); Lc = o.len * UNIT;
      } else if (S.kind === 'cylinder') {
        var D = 1.5 * UNIT, Ln = 3.6 * UNIT, th = Math.abs(ar), sn = Math.sin(th), cn = Math.cos(th);
        c.cd = 0.8 + 0.15 * sn * sn; c.area = D * Ln * sn + Math.PI / 4 * D * D * cn; Lc = D;
      } else if (S.kind === 'car') {
        var th2 = Math.abs(a), hh = bounds(S.outline).h * UNIT, ww = 1.8 * UNIT; c.cd = 0.30 + 0.0016 * th2 * th2; c.area = 0.85 * hh * ww; Lc = 4.5 * UNIT;
      } else {
        var th3 = Math.abs(ar), s3 = Math.sin(th3), hb = bounds(S.outline).h * UNIT; c.cd = 0.45 + 0.5 * s3 * s3; c.area = Math.PI / 4 * hb * 0.95 * UNIT; Lc = 4.0 * UNIT;
      }
      c.Re = S.rho * V * Lc / S.mu; c.D = q * c.area * c.cd; c.L = c.cl == null ? null : q * c.area * c.cl; c.q = q;
      if ((S.kind === 'sphere' || S.kind === 'cylinder') && c.Re > 2e5) c.note = 'Above Re of about 2x10^5 the real drag of a round body drops sharply; this model keeps its constant.';
      if (c.Re < 1e3) c.note = 'At this low a Reynolds number the textbook coefficient no longer applies.';
      S.stall = stall; return c;
    }
    function bounds(poly) {
      var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; poly.forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
      return { x0: x0, x1: x1, y0: y0, y1: y1, w: x1 - x0, h: y1 - y0 };
    }

    /* the wake: where the air is slow and unsteady. Illustrative, shaped by the silhouette and by how bluff the body is. */
    function makeWake() {
      var b = bounds(S.outline), top = null, k;
      for (k = 0; k < S.outline.length; k++) if (!top || S.outline[k][1] > top[1]) top = S.outline[k];
      var xs = top[0] * 0.5 + (b.x0 + b.x1) * 0.25, wide = S.kind === 'airfoil' ? 0.35 + 0.65 * S.stall : 1;
      var thick = b.h / 2 * (S.kind === 'airfoil' ? lerp(0.3, 1.1, S.stall) : 1);
      S.wake = { xs: xs, yc: (b.y0 + b.y1) / 2, w0: thick, len: thick * (S.kind === 'airfoil' ? 4 + 6 * S.stall : 3 + 5 * clamp(S.c.cd / 1.1, 0, 1)), floor: S.kind === 'airfoil' ? 1 - 0.8 * S.stall : lerp(0.55, 0.12, clamp(S.c.cd / 1.0, 0, 1)), k: wide };
    }
    function wakeAt(x, y) {                                          // 0 outside, up to 1 in the core
      var w = S.wake; if (!w || x < w.xs) return 0;
      var d = (x - w.xs), fx = clamp(1 - d / w.len, 0, 1), half = w.w0 * (0.85 + 0.25 * clamp(d / w.len, 0, 1)) * w.k;
      var fy = clamp(1 - Math.abs(y - w.yc) / (half + 1e-6), 0, 1);
      return fy * fy * (3 - 2 * fy) * Math.sqrt(fx);
    }

    /* velocity of the air at a point, in units of the free stream. null inside the body */
    S.vel = function (x, y, o) {
      o = o || out;
      if (S.kind === 'airfoil') {
        var ar = S.angle * Math.PI / 180, gam = 4 * Math.PI * JK.ra * Math.sin(ar + JK.beta), st = S.c ? clamp(S.c.cl / (S.c.clUnstalled || 1), 0, 1.5) : 1;
        if (!jouk(x, y, ar, gam * st)) return null;
        o.x = out.x; o.y = out.y; o.q = out.q;
      } else {
        if (inside(S.outline, x, y)) return null;
        S.panels.vel(x, y, tmp); o.x = 1 + tmp.x; o.y = tmp.y; o.q = Math.hypot(o.x, o.y);
        if (o.q > 3.2) { o.x *= 3.2 / o.q; o.y *= 3.2 / o.q; o.q = 3.2; }
      }
      var wk = wakeAt(x, y);
      if (wk > 0) {                                                  // slow, swirling air behind the body (illustrative)
        var f = 1 - wk * (1 - S.wake.floor), sw = Math.sin(x * 2.3 + t * 5.1 + y * 3.7) * 0.5 * wk;
        o.x *= f; o.y = o.y * f + sw * 0.55; o.q = Math.hypot(o.x, o.y);
      }
      return o;
    };

    function rebuild() {
      var o = OBJECTS[S.kind], ang = S.angle * Math.PI / 180;
      S.outline = rotated(o.base, S.kind === 'sphere' ? 0 : ang);
      if (S.kind !== 'airfoil') S.panels = Panels(resample(S.outline, 96));
      S.c = coefficients(); makeWake(); S.version++;
    }

    function spawn(p, lane) { p.x = S.X0; p.y = lane; p.trail = []; p.q = 1; }
    S.uref = function () { return 0.1 * S.speed; };                  // world units per second at free-stream speed
    function advanceParts(dt) {
      var uref = S.uref(), i, lane, p, tmp2 = { x: 0, y: 0, q: 1 }, per = 0.42 * (2.4 / uref);
      for (i = 0; i < S.lanes.length; i++) {
        lane = S.lanes[i]; lane.t -= dt;
        if (lane.t <= 0) { lane.t += per + (i % 5) * 0.03 * (2.4 / uref); p = { x: 0, y: 0, trail: [], q: 1 }; spawn(p, lane.y); S.parts.push(p); }
      }
      for (i = S.parts.length - 1; i >= 0; i--) {
        p = S.parts[i];
        var v1 = S.vel(p.x, p.y, tmp2); if (!v1) { S.parts.splice(i, 1); continue; }
        var vx1 = v1.x, vy1 = v1.y, v2 = S.vel(p.x + vx1 * uref * dt * 0.5, p.y + vy1 * uref * dt * 0.5, tmp2);
        if (!v2) { S.parts.splice(i, 1); continue; }
        p.q = v2.q; p.x += v2.x * uref * dt; p.y += v2.y * uref * dt;
        p.trail.push(p.x, p.y); if (p.trail.length > 40) p.trail.splice(0, 2);
        if (p.x > S.X1 || p.y > S.Ytop + 0.5 || p.y < S.Ybot - 0.5) S.parts.splice(i, 1);
      }
    }
    S.step = function (dt) { t += dt; if (S.morph < 1) S.morph = Math.min(1, S.morph + dt / 0.45); advanceParts(Math.min(dt, 0.05)); };
    S.warm = function () { var i; S.parts = []; for (i = 0; i < S.lanes.length; i++) S.lanes[i].t = (i * 0.137) % 0.42; for (i = 0; i < 260; i++) advanceParts(1 / 30); };

    S.setKind = function (k) {
      if (!OBJECTS[k] || k === S.kind) return;
      S.angles[S.kind] = S.angle;                                    // each object remembers its own angle
      S.prev = { kind: S.kind, outline: S.outline.slice() }; S.kind = k; S.morph = 0; S.angle = S.angles[k] != null ? S.angles[k] : OBJECTS[k].def;
      if (k === 'banana') S.found = true;
      rebuild(); S.parts = S.parts.filter(function (p) { return p.x < S.outline.reduce(function (m, q) { return Math.min(m, q[0]); }, 9) - 0.5; });
    };
    S.setSpeed = function (v) { S.speed = clamp(+v || 10, 5, 40); S.c = coefficients(); makeWake(); S.version++; };
    S.range = function () { return OBJECTS[S.kind].range; };
    S.setAngle = function (a) { var r = OBJECTS[S.kind].range; S.angle = clamp(+a || 0, r[0], r[1]); rebuild(); };
    S.info = function () { return { kind: S.kind, name: OBJECTS[S.kind].name, c: S.c, model: OBJECTS[S.kind].model, bounds: bounds(S.outline), lenM: OBJECTS[S.kind].len * UNIT }; };
    S.bounds = function () { return bounds(S.outline); };
    S.angleMatters = function () { var r = OBJECTS[S.kind].range; return r[1] > r[0]; };
    S.inside = function (x, y) { return inside(S.outline, x, y); };
    S.reset = function () { S.kind = 'airfoil'; S.speed = 24; S.angle = 6; S.angles = {}; S.morph = 1; S.prev = null; rebuild(); S.warm(); };
    (function () { var y, i = 0; for (y = S.Ybot + 0.1; y < S.Ytop - 0.05; y += 0.21) { S.lanes.push({ y: y, t: (i * 0.137) % 0.42 }); i++; } })();
    rebuild(); S.warm();
    S.Panels = Panels; S.jouk = jouk; S.JK = JK;
    return S;
  }
  SIM.wind = WindSim();
  SIM.windOutline = function (kind) { return OBJECTS[kind].base; };
})(typeof window !== 'undefined' ? window : globalThis);
