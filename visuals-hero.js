/* ==========================================================================
   visuals-hero.js
   The landing visual: a dot-matrix Earth, dramatically cropped, with two
   real Keplerian orbits (Kepler's equation is solved every frame), motion
   trails, velocity / gravity vectors and live telemetry.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, W = U.W, A = U.A, TAU = U.TAU;

  var MU = 398600.4418;   // km^3 / s^2
  var RE = 6371;          // km

  /* 3x3 matrices stored as flat arrays [m00 m01 m02 m10 ...] */
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
  function rotZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
  function mul(a, b) {
    var o = new Array(9), i, j;
    for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return o;
  }
  function apply(m, x, y, z) {
    return [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];
  }

  function solveKepler(M, e) {
    M = M % TAU; if (M < 0) M += TAU;
    var E = e < 0.8 ? M : Math.PI, i;
    for (i = 0; i < 7; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
  }
  function trueAnomaly(E, e) {
    return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  }

  PF.visuals.hero = function () {
    var noise = U.noise3(7), rand = U.rng(11);

    /* ---- globe points on a Fibonacci sphere, continents from noise ---- */
    var N = 26000, pts = new Float32Array(N * 3), land = new Uint8Array(N), lights = new Uint8Array(N), vals = new Float32Array(N), i;
    for (i = 0; i < N; i++) {
      var y = 1 - ((i + 0.5) / N) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653;
      var x = Math.cos(th) * r, z = Math.sin(th) * r;
      pts[3 * i] = x; pts[3 * i + 1] = y; pts[3 * i + 2] = z;
      var n = 0, amp = 0.5, f = 1.7, o;
      for (o = 0; o < 4; o++) { n += amp * noise(x * f + 3.1, y * f + 1.7, z * f + 9.2); amp *= 0.5; f *= 2.05; }
      vals[i] = n;
    }
    var sorted = Array.prototype.slice.call(vals).sort(function (a, b) { return a - b; });
    var thr = sorted[Math.floor(N * 0.62)];
    for (i = 0; i < N; i++) { land[i] = vals[i] > thr ? 1 : 0; lights[i] = land[i] && rand() < 0.075 ? 1 : 0; }

    /* ---- graticule (lat / long lines) in local globe space ---- */
    var grat = [], lon, lat, k, line;
    for (lon = 0; lon < 12; lon++) {
      line = [];
      for (k = 0; k <= 72; k++) { var la = -Math.PI / 2 + (k / 72) * Math.PI, lo = (lon / 12) * TAU; line.push([Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)]); }
      grat.push(line);
    }
    for (lat = -60; lat <= 60; lat += 30) {
      line = [];
      for (k = 0; k <= 96; k++) { var lo2 = (k / 96) * TAU, la2 = lat * Math.PI / 180; line.push([Math.cos(la2) * Math.cos(lo2), Math.sin(la2), Math.cos(la2) * Math.sin(lo2)]); }
      grat.push(line);
    }

    /* ---- orbits (units of Earth radii) ---- */
    function makeOrbit(a, e, inc, raan, argp, period) {
      var Q = mul(rotY(raan), mul(rotX(inc), rotY(argp)));
      return { a: a, e: e, Q: Q, n: TAU / period };
    }
    function orbitPoint(o, nu) {
      var r = o.a * (1 - o.e * o.e) / (1 + o.e * Math.cos(nu));
      return apply(o.Q, r * Math.cos(nu), 0, r * Math.sin(nu));
    }
    var orbA = makeOrbit(1.34, 0.0, 0.92, 0.35, 0, 26);
    var orbB = makeOrbit(1.95, 0.36, 1.22, 0.95, 1.05, 26 * Math.pow(1.95 / 1.34, 1.5));
    var orbC = makeOrbit(2.7, 0.0, 1.32, 4.2, 0, 1);

    // A small constellation on orbit A, plus one probe on the eccentric orbit B.
    var crafts = [
      { o: orbA, M0: 0.6, name: 'ORBITER-01', accent: false, trail: [], tlen: 130 },
      { o: orbA, M0: 0.6 + TAU / 3, name: 'ORBITER-02', accent: false, trail: [], tlen: 130 },
      { o: orbA, M0: 0.6 + 2 * TAU / 3, name: 'ORBITER-03', accent: false, trail: [], tlen: 130 },
      { o: orbB, M0: 2.2, name: 'PROBE-01', accent: true, trail: [], tlen: 120 }
    ];

    function init() {}

    function draw(ctx, w, h, t, dt, m) {
      var compact = w < 760 || h > w * 1.05;
      var R, cx, cy;
      if (compact) { R = Math.min(w * 0.62, h * 0.42); cx = w * 0.62; cy = h * 0.82; }
      else { R = Math.min(h * 0.62, w * 0.5); cx = w * 0.79; cy = h * 0.9; }

      /* camera: slow drift + pointer parallax */
      var yaw = 0.35 + t * 0.012 + m.nx * 0.16, pitch = 0.46 + m.ny * 0.07;
      var Cam = mul(rotX(pitch), rotY(yaw));
      var Earth = mul(Cam, mul(rotZ(0.41), rotY(t * 0.05)));
      var Lx = -0.55, Ly = 0.55, Lz = 0.63;

      function scr(v) { return { x: cx + v[0] * R, y: cy - v[1] * R, z: v[2], X: v[0], Y: v[1] }; }
      function hidden(p) { return p.z < 0 && p.X * p.X + p.Y * p.Y < 1; }

      /* ---- dial ring: a protractor of ticks around the globe ---- */
      var dialR = R * 2.12;
      ctx.strokeStyle = W(0.07); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, dialR, 0, TAU); ctx.stroke();
      for (i = 0; i < 240; i++) {
        var aa = (i / 240) * TAU, major = i % 20 === 0, len = major ? 13 : (i % 4 === 0 ? 7 : 4);
        var x1 = cx + Math.cos(aa) * dialR, y1 = cy + Math.sin(aa) * dialR;
        if (x1 < -30 || x1 > w + 30 || y1 < -30 || y1 > h + 30) continue;
        ctx.strokeStyle = W(major ? 0.3 : 0.14);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(cx + Math.cos(aa) * (dialR + len), cy + Math.sin(aa) * (dialR + len)); ctx.stroke();
      }

      /* ---- orbit geometry: sample ellipses, split into back / front halves ---- */
      function strokeOrbit(pts_, front, alpha, dash, color) {
        ctx.strokeStyle = color || W(alpha);
        ctx.lineWidth = 1;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        var pen = false, j;
        for (j = 0; j < pts_.length - 1; j++) {
          var p0 = pts_[j], p1 = pts_[j + 1];
          var mz = (p0.z + p1.z) / 2, mx = (p0.X + p1.X) / 2, my = (p0.Y + p1.Y) / 2;
          var isFront = mz >= 0, occ = mz < 0 && mx * mx + my * my < 1;
          if (isFront !== front || occ) { pen = false; continue; }
          if (!pen) { ctx.moveTo(p0.x, p0.y); pen = true; }
          ctx.lineTo(p1.x, p1.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      function sample(o) {
        var out = [], s, v;
        for (s = 0; s <= 200; s++) { v = orbitPoint(o, (s / 200) * TAU); out.push(scr(apply(Cam, v[0], v[1], v[2]))); }
        return out;
      }
      var sA = sample(orbA), sB = sample(orbB), sC = sample(orbC);

      /* ---- atmosphere glow ---- */
      var glow = ctx.createRadialGradient(cx, cy, R * 0.99, cx, cy, R * 1.055);
      glow.addColorStop(0, 'rgba(255,255,255,0.13)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.055, 0, TAU); ctx.fill();

      /* back halves of orbits (behind the planet) */
      strokeOrbit(sC, false, 0.07);
      strokeOrbit(sA, false, 0.22);
      strokeOrbit(sB, false, 0.2, [3, 5]);

      /* ---- the globe ---- */
      var base = ctx.createRadialGradient(cx - R * 0.38, cy - R * 0.42, R * 0.05, cx, cy, R);
      base.addColorStop(0, 'rgba(150,152,158,0.30)'); base.addColorStop(0.55, 'rgba(46,47,51,0.62)'); base.addColorStop(1, 'rgba(6,6,8,0.90)');
      ctx.fillStyle = base; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();

      // graticule
      ctx.strokeStyle = W(0.10); ctx.lineWidth = 0.8; ctx.beginPath();
      var gi, gj;
      for (gi = 0; gi < grat.length; gi++) {
        var pen2 = false;
        for (gj = 0; gj < grat[gi].length; gj++) {
          var gp = apply(Earth, grat[gi][gj][0], grat[gi][gj][1], grat[gi][gj][2]);
          if (gp[2] < 0.02) { pen2 = false; continue; }
          if (!pen2) { ctx.moveTo(cx + gp[0] * R, cy - gp[1] * R); pen2 = true; } else ctx.lineTo(cx + gp[0] * R, cy - gp[1] * R);
        }
      }
      ctx.stroke();

      // dots
      ctx.fillStyle = '#ffffff';
      var e = Earth, px, py, pz, X, Y, Z, lit, al, sz;
      for (i = 0; i < N; i++) {
        X = pts[3 * i]; Y = pts[3 * i + 1]; Z = pts[3 * i + 2];
        px = e[0] * X + e[1] * Y + e[2] * Z;
        py = e[3] * X + e[4] * Y + e[5] * Z;
        pz = e[6] * X + e[7] * Y + e[8] * Z;
        if (pz < 0.03) continue;
        lit = px * Lx + py * Ly + pz * Lz; if (lit < 0) lit = 0;
        if (land[i]) {
          if (lights[i] && lit < 0.1 && pz > 0.15) { ctx.fillStyle = A(0.9); ctx.globalAlpha = 0.85; ctx.fillRect(cx + px * R - 0.9, cy - py * R - 0.9, 1.8, 1.8); ctx.fillStyle = '#ffffff'; continue; }
          al = (0.22 + 0.78 * lit) * (0.35 + 0.65 * pz); sz = 2.3 * (0.55 + 0.45 * pz);
        } else {
          al = (0.05 + 0.16 * lit) * (0.3 + 0.7 * pz); sz = 1.1;
        }
        ctx.globalAlpha = al;
        ctx.fillRect(cx + px * R - sz / 2, cy - py * R - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1;

      // rim light
      var rim = ctx.createLinearGradient(cx - R, cy - R, cx + R * 0.3, cy + R * 0.3);
      rim.addColorStop(0, 'rgba(255,255,255,0.65)'); rim.addColorStop(0.55, 'rgba(255,255,255,0.10)'); rim.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = rim; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();

      /* ---- spacecraft ---- */
      function advance(c) {
        var o = c.o, Mm = c.M0 + o.n * t, Ee = solveKepler(Mm, o.e), nu = trueAnomaly(Ee, o.e);
        var wpos = orbitPoint(o, nu), wnext = orbitPoint(o, nu + 0.02);
        var rr = o.a * (1 - o.e * Math.cos(Ee));
        var cp = apply(Cam, wpos[0], wpos[1], wpos[2]), cn = apply(Cam, wnext[0], wnext[1], wnext[2]);
        if (dt > 0) { c.trail.push(wpos); if (c.trail.length > c.tlen) c.trail.shift(); }
        var rkm = rr * RE, akm = o.a * RE;
        c.p = scr(cp); c.n = scr(cn); c.alt = (rr - 1) * RE;
        c.v = Math.sqrt(MU * (2 / rkm - 1 / akm));   // vis-viva equation
      }
      var ci;
      for (ci = 0; ci < crafts.length; ci++) advance(crafts[ci]);

      function drawTrail(c) {
        var L = c.trail.length, k8, from, to, pen3, base = c.accent ? 'rgba(255,79,46,' : 'rgba(255,255,255,';
        if (L < 3) return;
        for (k8 = 0; k8 < 8; k8++) {
          from = Math.floor((k8 / 8) * (L - 1)); to = Math.floor(((k8 + 1) / 8) * (L - 1)) + 1;
          ctx.strokeStyle = base + (0.85 * (k8 + 1) / 8).toFixed(3) + ')';
          ctx.lineWidth = 1 + k8 * 0.14; ctx.beginPath(); pen3 = false;
          for (var q = from; q <= Math.min(to, L - 1); q++) {
            var v = apply(Cam, c.trail[q][0], c.trail[q][1], c.trail[q][2]), p = scr(v);
            if (hidden(p)) { pen3 = false; continue; }
            if (!pen3) { ctx.moveTo(p.x, p.y); pen3 = true; } else ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }

      /* front halves of orbits */
      strokeOrbit(sC, true, 0.16);
      strokeOrbit(sA, true, 0.5);
      strokeOrbit(sB, true, 0.55, [3, 5]);
      for (ci = 0; ci < crafts.length; ci++) drawTrail(crafts[ci]);

      // apsides of orbit B
      [0, Math.PI].forEach(function (nu, idx) {
        var wp = orbitPoint(orbB, nu), p = scr(apply(Cam, wp[0], wp[1], wp[2]));
        if (hidden(p)) return;
        ctx.strokeStyle = W(0.55); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x - 4, p.y); ctx.lineTo(p.x + 4, p.y); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x, p.y + 4); ctx.stroke();
        U.text(ctx, idx ? 'Ap' : 'Pe', p.x + 8, p.y - 7, 9, W(0.45));
      });

      function drawCraft(c, scale) {
        var color = c.accent ? A(1) : W(1);
        var ang = Math.atan2(c.n.y - c.p.y, c.n.x - c.p.x);
        ctx.save(); ctx.translate(c.p.x, c.p.y); ctx.rotate(ang);
        ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.fillRect(-3 * scale, -3 * scale, 6 * scale, 6 * scale);
        ctx.globalAlpha = 0.85;
        ctx.strokeRect(-4 * scale, -12 * scale, 8 * scale, 7 * scale);
        ctx.strokeRect(-4 * scale, 5 * scale, 8 * scale, 7 * scale);
        ctx.beginPath(); ctx.moveTo(0, -3 * scale); ctx.lineTo(0, -5 * scale); ctx.moveTo(0, 3 * scale); ctx.lineTo(0, 5 * scale); ctx.stroke();
        ctx.globalAlpha = 1; ctx.restore();
        ctx.strokeStyle = c.accent ? A(0.35) : W(0.35);
        ctx.beginPath(); ctx.arc(c.p.x, c.p.y, 12 * scale + 3 * Math.sin(t * 2.4), 0, TAU); ctx.stroke();
      }

      var m_ = 30;
      for (ci = 0; ci < crafts.length; ci++) {
        var c = crafts[ci];
        if (hidden(c.p)) continue;
        drawCraft(c, c.accent ? 1 : 1.25);
        if (c.p.x < m_ || c.p.x > w - m_ || c.p.y < m_ || c.p.y > h - m_) continue;

        // gravity (white) + velocity (accent) vectors
        var gx = cx - c.p.x, gy = cy - c.p.y, gl = Math.hypot(gx, gy) || 1;
        var vx = c.n.x - c.p.x, vy = c.n.y - c.p.y, vl = Math.hypot(vx, vy) || 1;
        var ls = compact ? 0.7 : 1;
        ctx.strokeStyle = W(0.8); ctx.fillStyle = W(0.8); ctx.lineWidth = 1;
        U.arrow(ctx, c.p.x + (gx / gl) * 14, c.p.y + (gy / gl) * 14, c.p.x + (gx / gl) * 46 * ls, c.p.y + (gy / gl) * 46 * ls, 6);
        ctx.strokeStyle = A(0.95); ctx.fillStyle = A(0.95);
        U.arrow(ctx, c.p.x + (vx / vl) * 14, c.p.y + (vy / vl) * 14, c.p.x + (vx / vl) * 64 * ls, c.p.y + (vy / vl) * 64 * ls, 6);
        U.text(ctx, 'g', c.p.x + (gx / gl) * 57 * ls - 3, c.p.y + (gy / gl) * 57 * ls + 3, 9, W(0.6));
        U.text(ctx, 'v', c.p.x + (vx / vl) * 76 * ls - 3, c.p.y + (vy / vl) * 76 * ls + 3, 9, A(0.9));

        // telemetry tag
        var right = c.p.x < w - 200, dir = right ? 1 : -1, lx = c.p.x + dir * 46, ly = c.p.y - 40;
        ctx.strokeStyle = W(0.35); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c.p.x + dir * 8, c.p.y - 8); ctx.lineTo(lx, ly); ctx.lineTo(lx + dir * 14, ly); ctx.stroke();
        var al = right ? 'left' : 'right', tx = lx + dir * 20;
        U.text(ctx, c.name, tx, ly + 3, 10, c.accent ? A(1) : W(0.95), al);
        U.text(ctx, 'ALT ' + Math.round(c.alt).toLocaleString('en-US') + ' km', tx, ly + 17, 9, W(0.55), al);
        U.text(ctx, 'V   ' + c.v.toFixed(2) + ' km/s', tx, ly + 29, 9, W(0.55), al);
      }

      /* two tiny registration squares, like the reference */
      ctx.fillStyle = W(0.9);
      var rx = compact ? w * 0.7 : w * 0.672, ry = compact ? h * 0.2 : h * 0.168;
      ctx.fillRect(rx, ry, 3, 3); ctx.fillRect(rx + 9, ry, 3, 3);
    }

    return { init: init, draw: draw };
  };

})(typeof window !== 'undefined' ? window : globalThis);
