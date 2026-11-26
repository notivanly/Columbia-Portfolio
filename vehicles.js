/* ==========================================================================
   vehicles.js
   Draws the three vehicles on the bridge (car, pickup, heavy truck) as lit solids
   built from extruded side profiles: body panels, glass, lamps, wheel arches,
   tyres and rims. Rendering only: sizes come from PF.sim.bridge (VEH), and the
   wheel angle is given by the caller (distance travelled / wheel radius), so the
   wheels turn exactly as far as the vehicle has moved, in either direction.

   Local axes: x forward (the direction of travel), y up, z across (the vehicle
   spans -w..+w). The origin is on the road, half-way between the axles.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, G = PF.g3d, TAU = PF.util.TAU;

  /* body profiles, counter-clockwise, in metres */
  var CAR = {
    w: 0.88, h: 1.4, color: [112, 168, 226],
    body: [[-2.15, 0.30], [-2.2, 0.60], [-2.12, 0.90], [-1.5, 0.95], [-0.95, 0.97], [0.95, 0.97], [1.5, 0.90], [2.02, 0.80], [2.2, 0.62], [2.15, 0.30]],
    cabin: [[-1.32, 0.95], [-0.85, 1.36], [0.28, 1.36], [0.98, 0.97]],
    glass: [[[-1.2, 1.0], [-0.8, 1.30], [-0.12, 1.30], [-0.12, 1.0]], [[0.0, 1.0], [0.0, 1.30], [0.26, 1.30], [0.84, 1.0]]],
    arches: [1.35, -1.3], wheelR: 0.33, wheelW: 0.21,
    lampsF: [[0.62, 0.86, 0.66, 0.78]], lampsR: [[0.62, 0.86, 0.66, 0.84]], doors: [[-0.12, 0.34, 0.95], [0.98, 0.34, 0.95]], trim: [[-2.2, 0.38, 2.2, 0.46]]
  };
  var PICKUP = {
    w: 0.98, h: 1.62, color: [236, 160, 108],
    body: [[-2.65, 0.42], [-2.7, 0.95], [-0.62, 0.98], [-0.5, 0.98], [1.55, 0.98], [2.1, 0.92], [2.7, 0.84], [2.74, 0.55], [2.62, 0.42]],
    cabin: [[-0.5, 0.98], [-0.18, 1.62], [0.85, 1.62], [1.55, 1.0]],
    glass: [[[-0.36, 1.04], [-0.1, 1.54], [0.5, 1.54], [0.5, 1.04]], [[0.58, 1.04], [0.58, 1.54], [0.8, 1.54], [1.38, 1.04]]],
    arches: [1.75, -1.55], wheelR: 0.38, wheelW: 0.26,
    bed: { x0: -2.62, x1: -0.7, y: 0.98, rim: 0.16 },
    lampsF: [[0.66, 0.9, 0.72, 0.8]], lampsR: [[0.66, 0.9, 0.74, 0.86]], doors: [[0.2, 0.46, 0.98]], trim: [[2.0, 0.5, 2.74, 0.58]]
  };
  var TRUCK = {
    w: 1.18, h: 2.9, color: [230, 232, 236], accent: [120, 168, 220],
    body: [[-4.2, 0.62], [-4.25, 2.82], [1.7, 2.84], [1.72, 0.62]],                   // the cargo box
    cab: [[2.0, 0.62], [1.98, 2.2], [2.5, 2.74], [3.7, 2.7], [4.18, 1.55], [4.3, 1.02], [4.28, 0.62]],
    glass: [[[2.55, 1.8], [2.62, 2.58], [3.5, 2.58], [3.95, 1.8]]],
    arches: [2.9, -1.7, -3.0], wheelR: 0.5, wheelW: 0.34,
    lampsF: [[0.72, 1.0, 1.02, 1.14], [-1.0, -0.72, 1.02, 1.14]], lampsR: [[0.78, 1.04, 0.78, 0.9]], trim: [[-4.25, 1.3, 1.7, 1.4]]
  };
  var PROFILES = { car: CAR, pickup: PICKUP, truck: TRUCK };

  /* an extruded polygon: caps at z0 and z1 and one quad per edge, each drawn only if it faces the camera */
  function extrude(batch, P, poly, z0, z1, col, tf, o) {
    o = o || {};
    var n = poly.length, i, a, b, k = o.k == null ? 1 : o.k, edge = o.edge == null ? 'rgba(255,255,255,0.10)' : o.edge, pa, pb, pc, pd, nx, ny, len, lit, fill, dep;
    var W0 = [], W1 = [], c0 = [0, 0, 0];
    for (i = 0; i < n; i++) { W0.push(tf(poly[i][0], poly[i][1], z0)); W1.push(tf(poly[i][0], poly[i][1], z1)); c0[0] += W0[i][0]; c0[1] += W0[i][1]; c0[2] += (W0[i][2] + W1[i][2]) / 2; }
    c0[0] /= n; c0[1] /= n; c0[2] /= n;
    for (i = 0; i < n; i++) {
      a = i; b = (i + 1) % n;
      var ex = W0[b][0] - W0[a][0], ey = W0[b][1] - W0[a][1]; len = Math.hypot(ex, ey) || 1; nx = ey / len; ny = -ex / len;
      var mid = [(W0[a][0] + W0[b][0]) / 2, (W0[a][1] + W0[b][1]) / 2, (z0 + z1) / 2];
      if (!G.facing(P, [nx, ny, 0], mid)) continue;
      pa = P(W0[a][0], W0[a][1], W0[a][2]); pb = P(W0[b][0], W0[b][1], W0[b][2]); pc = P(W1[b][0], W1[b][1], W1[b][2]); pd = P(W1[a][0], W1[a][1], W1[a][2]);
      lit = G.lambert(nx, ny, 0) * k * (o.topLift && ny > 0.5 ? 1.12 : 1);
      G.face(batch, [pa, pb, pc, pd], G.shade(col, lit, o.alpha), edge, 1);
    }
    [[z1, 1], [z0, -1]].forEach(function (cz) {
      var nz = cz[1];
      if (!G.facing(P, [0, 0, nz], [c0[0], c0[1], cz[0]])) return;
      var pts = [], j, p;
      for (j = 0; j < n; j++) { p = tf(poly[j][0], poly[j][1], cz[0]); pts.push(P(p[0], p[1], p[2])); }
      for (j = 0; j < n; j++) if (!pts[j].ok) return;
      lit = G.lambert(0, 0, nz) * k; fill = G.shade(col, lit, o.alpha); dep = 0;
      for (j = 0; j < n; j++) dep += pts[j].d; dep = dep / n - (o.capBias == null ? 0.03 : o.capBias);
      batch.add(dep, function (ctx) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var m = 1; m < n; m++) ctx.lineTo(pts[m].x, pts[m].y); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.stroke(); }
        if (o.sheen) {                                          // a soft diagonal reflection along the panel
          var xs = pts.map(function (q) { return q.x; }), ys = pts.map(function (q) { return q.y; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
          var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
          ctx.save(); ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.restore();
        }
      });
    });
  }

  /* a flat shape drawn on one side of the vehicle (windows, lamps, panel lines) */
  function decal(batch, P, poly, z, tf, fill, bias, edge) {
    var pts = poly.map(function (q) { var p = tf(q[0], q[1], z); return P(p[0], p[1], p[2]); }), n = pts.length, i, dep = 0;
    for (i = 0; i < n; i++) { if (!pts[i].ok) return; dep += pts[i].d; }
    dep = dep / n - bias;
    batch.add(dep, function (ctx) {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (var j = 1; j < n; j++) ctx.lineTo(pts[j].x, pts[j].y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill(); if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
    });
  }
  function rect(x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; }

  function wheel(batch, P, tf, ax, R, ww, z, rot, bodyW) {
    var N = 28, i, ring = [], rim = [], cx = ax, cy = R, dep, c = P(tf(cx, cy, z)[0], tf(cx, cy, z)[1], tf(cx, cy, z)[2]);
    // tyre on the near side and a darker inner side so the wheel has thickness
    var pts = [], pin = [], tz = z + 0.0;
    for (i = 0; i < N; i++) { var t = i / N * TAU, p0 = tf(cx + R * Math.cos(t), cy + R * Math.sin(t), tz), p1 = tf(cx + R * Math.cos(t), cy + R * Math.sin(t), tz - ww); pts.push(P(p0[0], p0[1], p0[2])); pin.push(P(p1[0], p1[1], p1[2])); }
    for (i = 0; i < N; i++) if (!pts[i].ok) return;
    dep = c.d - 0.18;
    batch.add(dep + 0.04, function (ctx) {                       // tread: a band joining the two sides
      var j; ctx.fillStyle = 'rgb(13,14,16)';
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (j = 1; j < N; j++) ctx.lineTo(pts[j].x, pts[j].y); for (j = N - 1; j >= 0; j--) ctx.lineTo(pin[j].x, pin[j].y); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (j = 1; j < N; j++) ctx.lineTo(pts[j].x, pts[j].y); ctx.closePath();
      ctx.fillStyle = 'rgb(24,25,28)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();
    });
    // rim with spokes that turn with the wheel angle
    var rr = R * 0.62, rp = [], hub = tf(cx, cy, z + 0.01), hp = P(hub[0], hub[1], hub[2]);
    for (i = 0; i < N; i++) { var t2 = i / N * TAU, q = tf(cx + rr * Math.cos(t2), cy + rr * Math.sin(t2), z + 0.01); rp.push(P(q[0], q[1], q[2])); }
    var spokes = [], S = 5;
    for (i = 0; i < S; i++) { var sa = rot + i / S * TAU, q1 = tf(cx + rr * 0.9 * Math.cos(sa), cy + rr * 0.9 * Math.sin(sa), z + 0.012); spokes.push(P(q1[0], q1[1], q1[2])); }
    batch.add(dep, function (ctx) {
      var j; ctx.beginPath(); ctx.moveTo(rp[0].x, rp[0].y); for (j = 1; j < N; j++) ctx.lineTo(rp[j].x, rp[j].y); ctx.closePath();
      ctx.fillStyle = 'rgb(120,128,138)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.stroke();
      var inner = []; for (j = 0; j < N; j++) inner.push([hp.x + (rp[j].x - hp.x) * 0.78, hp.y + (rp[j].y - hp.y) * 0.78]);
      ctx.beginPath(); ctx.moveTo(inner[0][0], inner[0][1]); for (j = 1; j < N; j++) ctx.lineTo(inner[j][0], inner[j][1]); ctx.closePath(); ctx.fillStyle = 'rgb(52,57,64)'; ctx.fill();
      ctx.strokeStyle = 'rgb(170,178,188)'; ctx.lineWidth = Math.max(1.2, hp.k * 0.03); ctx.lineCap = 'round';
      for (j = 0; j < S; j++) { ctx.beginPath(); ctx.moveTo(hp.x, hp.y); ctx.lineTo(spokes[j].x, spokes[j].y); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(hp.x, hp.y, Math.max(1.5, R * hp.k * 0.12), 0, TAU); ctx.fillStyle = 'rgb(190,196,204)'; ctx.fill(); ctx.lineCap = 'butt';
    });
  }

  /* o: { x (centre along the span, m), y (road height under the vehicle, m), slope (radians), z, rot (wheel angle, radians), alpha, shadow } */
  function drawVehicle(batch, P, kind, o) {
    var V = PROFILES[kind] || CAR, cs = Math.cos(o.slope || 0), sn = Math.sin(o.slope || 0), ox = o.x, oy = o.y, oz = o.z || 0, w = V.w, i;
    var bd = o.bodyDy || 0, cb = Math.cos((o.slope || 0) + (o.bodyPitch || 0)), sb = Math.sin((o.slope || 0) + (o.bodyPitch || 0));
    function tf(x, y, z) { return [ox + x * cb - y * sb, oy + bd + x * sb + y * cb, oz + z]; }            // the body rides on the suspension...
    function tfW(x, y, z) { return [ox + x * cs - y * sn, oy + x * sn + y * cs, oz + z]; }              // ...the wheels stay on the road
    var col = V.color, glassCol = [34, 46, 60], al = o.alpha;

    // contact shadow on the road
    if (o.shadow !== false) {
      var sh = G.shadow, bx = tf(0, 0.02, 0);
      batch.add(1e3, function (ctx) { sh(ctx, P, bx[0], bx[1] - 0.01, oz, (kind === 'truck' ? 4.3 : kind === 'pickup' ? 2.8 : 2.3), w * 0.95, 0.9); });
    }
    if (kind === 'truck') {
      // chassis rail and cargo box (white panels with an accent stripe), then the cab
      extrude(batch, P, rect(-4.1, 0.46, 2.1, 0.64), -w * 0.78, w * 0.78, [50, 54, 60], tf, { k: 0.8 });
      extrude(batch, P, V.body, -w, w, V.color, tf, { k: 0.98, sheen: true, alpha: al });
      decal(batch, P, rect(-4.25, 1.3, 1.7, 1.4), w + 0.003, tf, G.rgba(V.accent[0], V.accent[1], V.accent[2], 0.95), 0.06);
      decal(batch, P, rect(-4.25, 2.62, 1.7, 2.7), w + 0.003, tf, 'rgba(60,66,74,0.5)', 0.05);
      [-3.4, -2.0, -0.6].forEach(function (x) { decal(batch, P, rect(x, 0.7, x + 0.025, 2.74), w + 0.003, tf, 'rgba(40,46,54,0.45)', 0.05); });
      extrude(batch, P, V.cab, -w * 0.98, w * 0.98, [214, 218, 224], tf, { k: 1, sheen: true, alpha: al });
      decal(batch, P, V.glass[0], w * 0.98 + 0.004, tf, G.rgba(glassCol[0], glassCol[1], glassCol[2], 0.96), 0.08, 'rgba(255,255,255,0.18)');
      decal(batch, P, [[2.9, 0.7], [2.9, 1.7], [3.0, 1.7], [3.0, 0.7]], w * 0.98 + 0.004, tf, 'rgba(60,66,74,0.55)', 0.07);
    } else {
      var isCar = kind === 'car', wr = w + 0.0;
      extrude(batch, P, V.body, -w, w, col, tf, { k: 1, sheen: true, topLift: true, alpha: al });
      if (V.bed) {                                              // open cargo bed: inner floor and walls seen from above
        var b = V.bed, hb = V.bed.rim;
        extrude(batch, P, rect(b.x0 + 0.05, b.y - 0.02, b.x1, b.y + hb), -w * 0.9, w * 0.9, [58, 62, 68], tf, { k: 0.7, edge: 'rgba(255,255,255,0.06)' });
      }
      extrude(batch, P, V.cabin, -w * 0.9, w * 0.9, isCar ? col : [236, 160, 108], tf, { k: 1, sheen: true, topLift: true, alpha: al });
      V.glass.forEach(function (gp) { decal(batch, P, gp, w * 0.9 + 0.004, tf, G.rgba(glassCol[0], glassCol[1], glassCol[2], 0.96), 0.08, 'rgba(255,255,255,0.20)'); });
      if (V.doors) V.doors.forEach(function (d) { decal(batch, P, rect(d[0], d[1], d[0] + 0.025, d[2]), w + 0.003, tf, 'rgba(10,14,20,0.45)', 0.05); });
      V.trim.forEach(function (t) { decal(batch, P, rect(t[0], t[1], t[2], t[3]), w + 0.003, tf, 'rgba(18,22,28,0.7)', 0.06); });
      decal(batch, P, rect(V.body[0][0], V.body[0][1] - 0.04, V.body[V.body.length - 2][0] + 0.1, V.body[0][1] + 0.1), w + 0.004, tf, 'rgba(14,16,20,0.85)', 0.06);
    }
    // wheel arches (dark cut-outs on the side) then the wheels
    V.arches.forEach(function (ax) {
      var a = [], N = 14, rr = V.wheelR * 1.22, t;
      for (i = 0; i <= N; i++) { t = Math.PI * i / N; a.push([ax + rr * Math.cos(t), V.wheelR + rr * Math.sin(t) * 0.98]); }
      a.push([ax - rr, V.wheelR * 0.5]); a.push([ax + rr, V.wheelR * 0.5]);
      decal(batch, P, a, w + 0.005, tf, 'rgba(8,9,11,0.96)', 0.1);
      wheel(batch, P, tfW, ax, V.wheelR, V.wheelW, w + 0.006, o.rot || 0, w);
      wheel(batch, P, tfW, ax, V.wheelR, V.wheelW, -w + V.wheelW, o.rot || 0, w);       // the far side, mostly hidden but visible under the body from above
    });
    // lamps: the front (forward, +x) and the rear faces, only the one that faces the camera is drawn
    var eye = P.eye, frontX = V.body[V.body.length - 1][0] + (kind === 'truck' ? 0.1 : 0.04);
    function lamps(list, xPos, hot) {
      var p = tf(xPos, 0.8, 0); if (!G.facing(P, [Math.sign(xPos), 0, 0], p)) return;
      list.forEach(function (l) {
        var q0 = tf(xPos, l[2], l[0] * (hot ? 1 : 1)), q1 = tf(xPos, l[3], l[1]), pa = P(q0[0], q0[1], q0[2]), pb = P(q1[0], q1[1], q1[2]), qa = tf(xPos, l[2], l[0]), side;
        for (side = -1; side <= 1; side += 2) {
          var a0 = tf(xPos, l[2], side * Math.abs(l[0])), a1 = tf(xPos, l[3], side * Math.abs(l[1])), pp0 = P(a0[0], a0[1], a0[2]), pp1 = P(a1[0], a1[1], a1[2]);
          if (!pp0.ok || !pp1.ok) continue;
          (function (A, B) {
            batch.add(Math.min(A.d, B.d) - 0.12, function (ctx) {
              var x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
              ctx.fillStyle = hot ? 'rgba(255,248,226,0.98)' : 'rgba(224,64,56,0.95)'; ctx.fillRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
              if (hot) G.glow(ctx, (x0 + x1) / 2, (y0 + y1) / 2, 16 + (x1 - x0) * 1.2, [255, 244, 210], 0.28);
            });
          })(pp0, pp1);
        }
        void pa; void pb; void qa;
      });
    }
    lamps(V.lampsF, frontX, true);
    lamps(V.lampsR, V.body[0][0] - 0.04, false);
    // grille / bumper on the front face
    var fw = tf(frontX, 0.62, 0);
    if (G.facing(P, [1, 0, 0], fw)) {
      var gl = tf(frontX + 0.005, kind === 'truck' ? 0.9 : 0.5, -w * 0.5), gr = tf(frontX + 0.005, kind === 'truck' ? 1.3 : 0.62, w * 0.5), p0 = P(gl[0], gl[1], gl[2]), p1 = P(gr[0], gr[1], gr[2]);
      if (p0.ok && p1.ok) batch.add(Math.min(p0.d, p1.d) - 0.1, function (ctx) { ctx.fillStyle = 'rgba(10,12,16,0.8)'; ctx.fillRect(Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)); });
    }
  }

  /* the screen rectangle the vehicle occupies, for picking it with a pointer */
  function bounds(P, kind, o) {
    var V = PROFILES[kind] || CAR, cs = Math.cos(o.slope || 0), sn = Math.sin(o.slope || 0), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, hx = V.body[V.body.length - 1][0], lx = V.body[0][0];
    [[lx, 0], [hx, 0], [lx, V.h], [hx, V.h]].forEach(function (c) { [-V.w, V.w].forEach(function (z) {
      var p = P(o.x + c[0] * cs - c[1] * sn, o.y + c[0] * sn + c[1] * cs, (o.z || 0) + z);
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }); });
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }

  PF.vehicles = { draw: drawVehicle, bounds: bounds, PROFILES: PROFILES };
})(typeof window !== 'undefined' ? window : globalThis);
