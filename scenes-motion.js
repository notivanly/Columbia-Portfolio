/* ==========================================================================
   scenes-motion.js
   Scenes 4 to 6: Physics Sandbox, Planetary Gravity, Orbital Mechanics.

   As before, the calculations are the original ones: circle collisions with an
   impulse, a warped-sheet surface from point masses, and the Hohmann transfer
   solved with Kepler's equation and the vis-viva equation. Rods, a spring and
   a pendulum are new in the sandbox; they are simple constraints, drawn to
   suggest the joints the linked simulator offers.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp;
  var W = U.W, A = U.A, R = U.R;

  /* ======================================================================
     PHYSICS SANDBOX  (2D bodies, gravity, collisions, rods, a spring, a pendulum)
     ====================================================================== */
  S.sandbox = function () {
    var st = { bodies: [], rods: [], springs: [], arena: { x0: 0, x1: 0, floor: 0, top: 0 }, ppm: 100, g: 981, shake: 3.8, pivot: null, hot: null, fr: null };
    var MAT = [[176, 186, 198], [98, 106, 116], [150, 146, 140], [128, 138, 152]];

    function body(x, y, r, o) { var b = { x: x, y: y, vx: 0, vy: 0, r: r, m: r * r, rot: 0, mat: 0, fixed: false, hot: false }; for (var k in o) b[k] = o[k]; st.bodies.push(b); return b; }

    function init(V) {
      var fr = V.free, rnd = U.rng(21), i;
      st.fr = fr;
      var ppm = st.ppm = clamp(fr.h / 6.2, 60, 118); st.g = 9.81 * ppm;
      st.arena = { x0: fr.x0 + 12, x1: fr.x1 - 12, floor: fr.y1 - fr.h * 0.075, top: fr.y0 + fr.h * 0.035 };
      var a = st.arena; st.bodies = []; st.rods = []; st.springs = [];
      // a double pendulum hanging from a pin on the gantry
      var px = fr.x0 + fr.w * 0.42, py = a.top + 9;
      var pv = body(px, py, 9, { fixed: true, mat: 1 }); st.pivot = pv;
      var L1 = ppm * 1.35, L2 = ppm * 1.1;
      var b1 = body(px + Math.sin(1.15) * L1, py + Math.cos(1.15) * L1, ppm * 0.2, { mat: 1 });
      var b2 = body(b1.x + Math.sin(1.9) * L2, b1.y + Math.cos(1.9) * L2, ppm * 0.26, { mat: 0 });
      st.rods.push({ a: pv, b: b1, len: L1 }, { a: b1, b: b2, len: L2 });
      // two bodies joined by a spring
      var sA = body(fr.x0 + fr.w * 0.14, a.floor - ppm * 2.2, ppm * 0.3, { mat: 2 }), sB = body(fr.x0 + fr.w * 0.14 + ppm * 1.6, a.floor - ppm * 2.6, ppm * 0.22, { mat: 1 });
      st.springs.push({ a: sA, b: sB, rest: ppm * 1.25, k: 46 });
      // a dumbbell: two bodies on a rod
      var dA = body(fr.x0 + fr.w * 0.74, a.floor - ppm * 2.4, ppm * 0.24, { mat: 3 }), dB = body(fr.x0 + fr.w * 0.74 + ppm * 0.9, a.floor - ppm * 2.9, ppm * 0.24, { mat: 3 });
      st.rods.push({ a: dA, b: dB, len: ppm * 0.9 });
      // free bodies; one is accent coloured
      var n = V.lod ? 7 : 12;
      for (i = 0; i < n; i++) {
        var rad = ppm * (0.16 + Math.pow(rnd(), 2) * 0.3);
        var bb = body(a.x0 + rad + rnd() * (a.x1 - a.x0 - 2 * rad), a.top + ppm * 2.4 + rnd() * ppm * 1.6, rad, { mat: i % 4, hot: i === 0 });
        bb.vx = (rnd() - 0.5) * 260; bb.vy = (rnd() - 0.5) * 120;
        if (bb.hot) { st.hot = bb; bb.r = ppm * 0.3; bb.m = bb.r * bb.r; }
      }
      for (i = 0; i < 160; i++) step(1 / 30, { active: 0 });
    }

    function step(dt, m) {
      var a = st.arena, bodies = st.bodies, sub = 4, ds = dt / sub, s, i, j, b, c, k;
      st.shake -= dt;
      if (st.shake <= 0) {                                        // a periodic kick keeps the playground alive
        st.shake = 4.4;
        bodies.forEach(function (q, ix) { if (!q.fixed) { q.vy -= (420 + (ix * 53) % 360) * Math.max(0.6, st.ppm / 100); q.vx += (((ix * 37) % 100) - 50) * 5; } });
      }
      for (s = 0; s < sub; s++) {
        for (i = 0; i < bodies.length; i++) {
          b = bodies[i]; if (b.fixed) continue;
          b.vy += st.g * ds;
          if (m && m.active > 0.15) {                             // the cursor is a gravity well
            var ddx = m.rx - b.x, ddy = m.ry - b.y, d = Math.hypot(ddx, ddy) + 1, acc = (200000 / (d + 100)) * m.active;
            b.vx += (ddx / d) * acc * ds; b.vy += (ddy / d) * acc * ds; b.vx *= 1 - 0.6 * ds; b.vy *= 1 - 0.6 * ds;
          }
        }
        for (k = 0; k < st.springs.length; k++) {                // Hooke spring with a little damping
          var sp = st.springs[k], dx = sp.b.x - sp.a.x, dy = sp.b.y - sp.a.y, dl = Math.hypot(dx, dy) || 1, nx = dx / dl, ny = dy / dl;
          var rv = (sp.b.vx - sp.a.vx) * nx + (sp.b.vy - sp.a.vy) * ny, f = sp.k * (dl - sp.rest) + 0.9 * rv;
          sp.a.vx += nx * f / sp.a.m * ds * 40; sp.a.vy += ny * f / sp.a.m * ds * 40; sp.b.vx -= nx * f / sp.b.m * ds * 40; sp.b.vy -= ny * f / sp.b.m * ds * 40;
        }
        for (i = 0; i < bodies.length; i++) {
          b = bodies[i]; if (b.fixed) continue;
          b.x += b.vx * ds; b.y += b.vy * ds;
          if (b.x - b.r < a.x0) { b.x = a.x0 + b.r; b.vx = -b.vx * 0.8; }
          if (b.x + b.r > a.x1) { b.x = a.x1 - b.r; b.vx = -b.vx * 0.8; }
          if (b.y - b.r < a.top + 14) { b.y = a.top + 14 + b.r; b.vy = -b.vy * 0.5; }
          if (b.y + b.r > a.floor) { b.y = a.floor - b.r; b.vy = -b.vy * 0.66; b.vx *= 1 - 1.4 * ds; }
        }
        for (i = 0; i < bodies.length; i++) for (j = i + 1; j < bodies.length; j++) {
          b = bodies[i]; c = bodies[j];
          var cx = c.x - b.x, cy = c.y - b.y, dist = Math.hypot(cx, cy), min = b.r + c.r;
          if (dist >= min || dist === 0) continue;
          var nx2 = cx / dist, ny2 = cy / dist, over = min - dist, wb = b.fixed ? 0 : 1 / b.m, wc = c.fixed ? 0 : 1 / c.m, ws = wb + wc;
          if (ws === 0) continue;
          b.x -= nx2 * over * wb / ws; b.y -= ny2 * over * wb / ws; c.x += nx2 * over * wc / ws; c.y += ny2 * over * wc / ws;
          var rv2 = (c.vx - b.vx) * nx2 + (c.vy - b.vy) * ny2;
          if (rv2 < 0) { var jn = -(1 + 0.7) * rv2 / ws; b.vx -= jn * nx2 * wb; b.vy -= jn * ny2 * wb; c.vx += jn * nx2 * wc; c.vy += jn * ny2 * wc; }
        }
        for (var it = 0; it < 5; it++) for (k = 0; k < st.rods.length; k++) {   // rods: keep the length, remove the stretching speed
          var rd = st.rods[k], rx = rd.b.x - rd.a.x, ry = rd.b.y - rd.a.y, rl = Math.hypot(rx, ry) || 1, wa2 = rd.a.fixed ? 0 : 1 / rd.a.m, wb2 = rd.b.fixed ? 0 : 1 / rd.b.m, wsum = wa2 + wb2;
          if (!wsum) continue;
          var diff = (rl - rd.len) / rl;
          rd.a.x += rx * diff * wa2 / wsum; rd.a.y += ry * diff * wa2 / wsum; rd.b.x -= rx * diff * wb2 / wsum; rd.b.y -= ry * diff * wb2 / wsum;
          var ux = rx / rl, uy = ry / rl, rvr = (rd.b.vx - rd.a.vx) * ux + (rd.b.vy - rd.a.vy) * uy;
          rd.a.vx += ux * rvr * wa2 / wsum; rd.a.vy += uy * rvr * wa2 / wsum; rd.b.vx -= ux * rvr * wb2 / wsum; rd.b.vy -= uy * rvr * wb2 / wsum;
        }
      }
      for (i = 0; i < bodies.length; i++) { b = bodies[i]; b.vx *= 0.9995; b.vy *= 0.9995; b.rot += b.vx / b.r * dt * 0.6; }
    }

    function advance(dt, m) { step(Math.min(dt, 1 / 30), m); }

    function bar(ctx, ax, ay, bx, by, w, col) {                 // a lit rod, drawn like the tubes in the 3D scenes
      var dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      if (nx * G.LS[0] + ny * G.LS[1] < 0) { nx = -nx; ny = -ny; }
      ctx.lineCap = 'round'; ctx.strokeStyle = G.shade(col, 0.35); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = G.shade(col, 0.8); ctx.lineWidth = w * 0.72; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = G.shade(col, 1.25, 0.8); ctx.lineWidth = Math.max(1, w * 0.2); ctx.beginPath(); ctx.moveTo(ax + nx * w * 0.2, ay + ny * w * 0.2); ctx.lineTo(bx + nx * w * 0.2, by + ny * w * 0.2); ctx.stroke();
      ctx.lineCap = 'butt';
    }

    function draw(ctx, V, o) {
      o = o || {};
      var a = st.arena, fr = st.fr || V.free, t = V.t, m = V.m || { active: 0 }, i, k, b;
      /* backdrop: a warm neutral wall with a peg grid, and a solid floor slab */
      ctx.fillStyle = 'rgb(25,27,30)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, fr.cx, fr.y0 + fr.h * 0.35, Math.max(fr.w, fr.h) * 0.75, [150, 150, 140], 0.1);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      var gs = Math.max(22, st.ppm * 0.3), gx, gy;
      for (gx = a.x0; gx < a.x1; gx += gs) for (gy = a.top + 20; gy < a.floor; gy += gs) ctx.fillRect(gx, gy, 1.6, 1.6);
      var fg = ctx.createLinearGradient(0, a.floor, 0, V.h);
      fg.addColorStop(0, 'rgb(58,61,66)'); fg.addColorStop(0.12, 'rgb(36,38,42)'); fg.addColorStop(1, 'rgb(16,17,19)');
      ctx.fillStyle = fg; ctx.fillRect(0, a.floor, V.w, V.h - a.floor);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, a.floor + 0.5); ctx.lineTo(V.w, a.floor + 0.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath();
      var tick = 0; for (gx = a.x0; gx <= a.x1; gx += st.ppm / 2, tick++) { ctx.moveTo(gx, a.floor + 3); ctx.lineTo(gx, a.floor + (tick % 2 ? 8 : 13)); }
      ctx.stroke();
      /* gantry across the top */
      var gg = ctx.createLinearGradient(0, a.top, 0, a.top + 14);
      gg.addColorStop(0, 'rgb(170,178,190)'); gg.addColorStop(0.45, 'rgb(104,112,124)'); gg.addColorStop(1, 'rgb(46,50,56)');
      ctx.fillStyle = gg; ctx.fillRect(a.x0 - 8, a.top, a.x1 - a.x0 + 16, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(a.x0 - 8, a.top, a.x1 - a.x0 + 16, 1.4);

      /* contact shadows */
      for (i = 0; i < st.bodies.length; i++) {
        b = st.bodies[i]; if (b.fixed) continue;
        var gap = a.floor - (b.y + b.r);
        if (gap < b.r * 2.4) {
          var sa = 0.5 * (1 - clamp(gap / (b.r * 2.4), 0, 1)), sw = b.r * (1.1 + gap / (b.r * 6));
          var sh = ctx.createRadialGradient(b.x, a.floor + 1, 0, b.x, a.floor + 1, sw);
          sh.addColorStop(0, 'rgba(0,0,0,' + sa.toFixed(3) + ')'); sh.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(b.x, a.floor + 2, sw, sw * 0.18, 0, 0, TAU); ctx.fill();
        }
      }
      /* rods and springs */
      for (k = 0; k < st.rods.length; k++) bar(ctx, st.rods[k].a.x, st.rods[k].a.y, st.rods[k].b.x, st.rods[k].b.y, 5, [176, 186, 198]);
      for (k = 0; k < st.springs.length; k++) {
        var sp = st.springs[k], dx = sp.b.x - sp.a.x, dy = sp.b.y - sp.a.y, dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl, nz = 11;
        ctx.strokeStyle = 'rgba(200,208,218,0.95)'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(sp.a.x, sp.a.y);
        for (i = 1; i < 14; i++) { var u = (i + 0.5) / 14, sg = i % 2 ? 1 : -1; ctx.lineTo(sp.a.x + dx * u + nx * nz * sg, sp.a.y + dy * u + ny * nz * sg); }
        ctx.lineTo(sp.b.x, sp.b.y); ctx.stroke();
      }
      /* bodies, then the pin */
      for (i = 0; i < st.bodies.length; i++) {
        b = st.bodies[i]; if (b.fixed) continue;
        var col = b.hot ? [142, 201, 255] : MAT[b.mat % MAT.length];
        G.ball(ctx, b.x, b.y, b.r, col, { rim: b.hot ? 0.45 : 0.25, hi: b.hot ? 1.25 : 1.45 });
        ctx.strokeStyle = b.hot ? 'rgba(6,18,29,0.7)' : 'rgba(10,12,14,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(b.rot) * b.r * 0.85, b.y + Math.sin(b.rot) * b.r * 0.85); ctx.stroke();
      }
      var pv = st.pivot;
      G.ball(ctx, pv.x, pv.y, 12, [190, 198, 208], { rim: 0.2 });
      ctx.fillStyle = 'rgba(10,12,14,0.85)'; ctx.beginPath(); ctx.arc(pv.x, pv.y, 4.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(142,201,255,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(pv.x, pv.y, 16, 0, TAU); ctx.stroke();
      /* cursor well */
      if (m.active > 0.15 && o.well !== false) {
        ctx.strokeStyle = A(0.5 * m.active); ctx.lineWidth = 1;
        for (k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(m.rx, m.ry, 14 + k * 12 + ((t * 30) % 12), 0, TAU); ctx.globalAlpha = 1 - k * 0.3; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }

    return { init: init, advance: advance, draw: draw, side: 1, id: 'sandbox', sim: st, st: st,
      pin: function () { var p = st.pivot; return { x: p.x, y: p.y, r: 12 }; },
      ball: function () { var b = st.hot; return { x: b.x, y: b.y, r: b.r, vx: b.vx, vy: b.vy }; },
      floorY: function () { return st.arena.floor; } };
  };

  /* ======================================================================
     PLANETARY GRAVITY  (a sheet that bends around masses; solid planets resting in the dips)
     ====================================================================== */
  S.gravity = function () {
    var PL = [
      { name: 'Mercury', r: 0.44, R: 0.095, m: 0.0186, a0: 0.4, col: [168, 166, 162] },
      { name: 'Venus', r: 0.68, R: 0.13, m: 0.0247, a0: 2.3, col: [222, 204, 166] },
      { name: 'Earth', r: 0.93, R: 0.15, m: 0.0258, a0: 4.1, col: [96, 146, 206] },
      { name: 'Mars', r: 1.2, R: 0.115, m: 0.0191, a0: 5.5, col: [255, 138, 92] },
      { name: 'Jupiter', r: 1.58, R: 0.28, m: 0.083, a0: 1.2, col: [206, 186, 160], bands: true }
    ];
    var GR = 1.95, NL = 29, NS = 70, st = { t: 0, active: 2, earth: { x: 0, y: 0, r: 0 }, pose: null };
    var segs = { x0: new Float32Array(NL * 2 * NS), y0: new Float32Array(NL * 2 * NS), x1: new Float32Array(NL * 2 * NS), y1: new Float32Array(NL * 2 * NS), b: new Uint8Array(NL * 2 * NS) };
    function planetPos(p, t) { var ang = p.a0 + t * 0.42 / Math.pow(p.r, 1.5); return [Math.cos(ang) * p.r, Math.sin(ang) * p.r]; }
    function surface(x, z, pp) {
      var y = -0.30 / Math.sqrt(x * x + z * z + 0.05), i;
      for (i = 0; i < PL.length; i++) { var dx = x - pp[i][0], dz = z - pp[i][1]; y -= PL[i].m / Math.sqrt(dx * dx + dz * dz + 0.012); }
      return y;
    }
    function settled(V, t) {
      var fr = V.free, dist = 7, yaw = 0.5 + (t || 0) * 0.045, pxm = Math.min(fr.w * 0.94 / 5.0, fr.h * 1.02 / 3.2);
      return { tx: 0, ty: -0.5, tz: 0, yaw: yaw, pitch: 0.5, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.cy + fr.h * 0.02, roll: 0 };
    }
    function advance(dt) { st.t += dt; }

    function draw(ctx, V, o) {
      o = o || {};
      var m = V.m || { nx: 0, ny: 0, active: 0 }, pose = o.pose || settled(V, st.t);
      if (!o.pose) { pose.yaw += (m.nx || 0) * 0.15; pose.pitch += (m.ny || 0) * 0.04; }
      var P = G.camera(pose), t = st.t, i, j, ln, n = 0;
      st.pose = pose;
      var pp = PL.map(function (p) { return planetPos(p, t); });
      ctx.fillStyle = 'rgb(9,10,13)'; ctx.fillRect(0, 0, V.w, V.h);
      var sc = P(0, -0.6, 0); G.glow(ctx, sc.x, sc.y, Math.max(V.w, V.h) * 0.55, [255, 150, 110], 0.1);

      for (ln = 0; ln < NL; ln++) {
        var c0 = -GR + (2 * GR * ln) / (NL - 1);
        for (var dir = 0; dir < 2; dir++) {
          var prev = null;
          for (j = 0; j <= NS; j++) {
            var s0 = -GR + (2 * GR * j) / NS, gx = dir ? c0 : s0, gz = dir ? s0 : c0, gy = surface(gx, gz, pp), p = P(gx, gy, gz);
            if (prev) { segs.x0[n] = prev.x; segs.y0[n] = prev.y; segs.x1[n] = p.x; segs.y1[n] = p.y; var depth = -gy; segs.b[n] = depth < 0.15 ? 0 : depth < 0.4 ? 1 : depth < 0.9 ? 2 : 3; n++; }
            prev = { x: p.x, y: p.y };
          }
        }
      }
      var alphas = [0.16, 0.3, 0.46, 0.75], widths = [1, 1, 1.1, 1.35], bk;
      for (bk = 0; bk < 4; bk++) {
        ctx.strokeStyle = bk === 3 ? A(0.6) : W(alphas[bk]); ctx.lineWidth = widths[bk]; ctx.beginPath();
        for (i = 0; i < n; i++) if (segs.b[i] === bk) { ctx.moveTo(segs.x0[i], segs.y0[i]); ctx.lineTo(segs.x1[i], segs.y1[i]); }
        ctx.stroke();
      }

      /* the star at the centre, then the planets from far to near */
      var sy = surface(0, 0, pp), sun = P(0, sy + 0.12, 0), sr = 0.17 * sun.k;
      var sg = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sr * 4.5);
      sg.addColorStop(0, 'rgba(255,240,228,1)'); sg.addColorStop(0.15, R(0.95)); sg.addColorStop(0.4, R(0.26)); sg.addColorStop(1, R(0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sun.x, sun.y, sr * 4.5, 0, TAU); ctx.fill();

      var scr = PL.map(function (p, idx) { var gy2 = surface(pp[idx][0], pp[idx][1], pp), q = P(pp[idx][0], gy2 + p.R * 0.95, pp[idx][1], {}); q.idx = idx; q.gy = gy2; return q; });
      if (m.active > 0.3 && !o.pose) { var best = 1e9; scr.forEach(function (q) { var d = Math.hypot(q.x - m.rx, q.y - m.ry); if (d < best) { best = d; st.active = q.idx; } }); }
      else if (!o.pose) st.active = Math.floor(t / 3.2) % PL.length;
      scr.slice().sort(function (a, b) { return b.d - a.d; }).forEach(function (q) {
        var p = PL[q.idx], r = Math.max(3, p.R * q.k), on = q.idx === st.active;
        G.shadow(ctx, P, pp[q.idx][0] + 0.03, q.gy + 0.005, pp[q.idx][1] + 0.03, p.R * 1.15, p.R * 1.15, 0.9);
        G.ball(ctx, q.x, q.y, r, p.col, { rim: p.name === 'Earth' ? 0.4 : 0.28 });
        if (p.bands) {
          ctx.save(); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(40,30,24,0.28)'; ctx.lineWidth = r * 0.13;
          for (var bnd = -2; bnd <= 2; bnd++) { ctx.beginPath(); ctx.moveTo(q.x - r, q.y + bnd * r * 0.34); ctx.lineTo(q.x + r, q.y + bnd * r * 0.34 + r * 0.05); ctx.stroke(); }
          ctx.restore();
        }
        if (q.idx === 2) { st.earth.x = q.x; st.earth.y = q.y; st.earth.r = r; }
        if (on && !o.pose) { ctx.strokeStyle = W(0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, r + 7, 0, TAU); ctx.stroke(); }
        if (!o.nolabels) {
          var right = q.x < V.w - 150, dir2 = right ? 1 : -1, lx = q.x + dir2 * (r + 14), ly = q.y - r - 14;
          ctx.strokeStyle = W(on ? 0.6 : 0.26); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x + dir2 * (r * 0.7 + 3), q.y - r * 0.7 - 3); ctx.lineTo(lx, ly); ctx.lineTo(lx + dir2 * 10, ly); ctx.stroke();
          U.text(ctx, p.name, lx + dir2 * 14, ly + 3, 10, W(on ? 1 : 0.55), right ? 'left' : 'right');
        }
      });
    }
    return { init: function () {}, advance: advance, draw: draw, settled: settled, side: -1, id: 'gravity', sim: st, st: st,
      earth: function () { return { x: st.earth.x, y: st.earth.y, r: st.earth.r }; }, EARTH: PL[2].col };
  };

  /* ======================================================================
     ORBITAL MECHANICS  (a Hohmann transfer around a solid, lit Earth)
     The transfer is solved with Kepler's equation and the vis-viva equation, as before.
     ====================================================================== */
  S.orbital = function () {
    var mu = 398600.4418, RE = 6378.137, r1 = 6778, r2 = 42164, a = (r1 + r2) / 2, e = (r2 - r1) / (r2 + r1);
    var D = [3.4, 7.2, 3.4, 1.8], TOTAL = D[0] + D[1] + D[2] + D[3];
    var st = { t: 0, trail: [], cyc: -1, craft: null, P: null, earth: { x: 0, y: 0, r: 10 }, pose: null }, EARTH = [96, 146, 206];
    void mu;

    function kepler(M) { var E = M, i; for (i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
    function nuOf(E) { return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)); }
    function rOf(nu) { return a * (1 - e * e) / (1 + e * Math.cos(nu)); }
    function W3(r, ang) { return [Math.cos(Math.PI + ang) * r / 1000, 0, -Math.sin(Math.PI + ang) * r / 1000]; }     // world units: thousands of km

    function state(t) {
      var T = t % TOTAL, ang = 0, r = r1, fade = 1, E;
      if (T < D[0]) { ang = TAU * (T / D[0]); r = r1; }
      else if (T < D[0] + D[1]) { E = kepler(Math.PI * (T - D[0]) / D[1]); ang = nuOf(E); r = rOf(ang); }
      else if (T < D[0] + D[1] + D[2]) { ang = Math.PI + TAU * 0.85 * (T - D[0] - D[1]) / D[2]; r = r2; }
      else { ang = Math.PI + TAU * 0.85; r = r2; fade = 1 - (T - D[0] - D[1] - D[2]) / D[3]; }
      return { r: r, ang: ang, fade: fade, T: T, cyc: Math.floor(t / TOTAL), moving: T < D[0] + D[1] + D[2] };
    }
    function advance(dt) {
      st.t += dt; var s = state(st.t);
      if (s.cyc !== st.cyc) { st.trail = []; st.cyc = s.cyc; }
      if (s.moving) { var w = W3(s.r, s.ang); st.trail.push(w[0], w[2]); if (st.trail.length > 400) st.trail.splice(0, 2); }
      st.craft = s;
    }
    function settled(V) {
      var fr = V.free, dist = 70, pitch = 0.78, pxm = Math.min(fr.w * 0.49, fr.h * 0.5 / Math.sin(pitch)) / 42.16;
      return { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx - fr.w * 0.02, cy: fr.cy, roll: 0 };
    }

    function draw(ctx, V, o) {
      o = o || {};
      var pose = o.pose || settled(V), P = G.camera(pose), i, s, cr = st.craft || state(st.t);
      st.P = P; st.pose = pose;
      if (!o.nobg) { ctx.fillStyle = 'rgb(7,8,10)'; ctx.fillRect(0, 0, V.w, V.h); }
      var c0 = P(0, 0, 0);
      if (!o.nobg) G.glow(ctx, c0.x, c0.y, Math.max(V.w, V.h) * 0.6, [90, 130, 190], 0.12);
      var re = RE / 1000 * c0.k;
      st.earth.x = c0.x; st.earth.y = c0.y; st.earth.r = re;
      function orbitLine(rr, far, dash, col, lw) {                // one half of a circle: far (behind Earth) or near
        ctx.setLineDash(dash || []); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); var pen = false;
        for (var k = 0; k <= 120; k++) {
          var an = (k / 120) * TAU, w3 = W3(rr, an - Math.PI), isFar = w3[2] < 0, p = P(w3[0], 0, w3[2]);
          if (isFar !== far) { pen = false; continue; }
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke(); ctx.setLineDash([]);
      }
      function transfer(far) {
        ctx.strokeStyle = A(0.8); ctx.lineWidth = 1.5; ctx.beginPath(); var pen = false;
        for (var k = 0; k <= 120; k++) {
          var nu = (k / 120) * Math.PI, w3 = W3(rOf(nu), nu), isFar = w3[2] < 0, p = P(w3[0], 0, w3[2]);
          if (isFar !== far) { pen = false; continue; }
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      /* far halves, equal-area wedges, then Earth */
      orbitLine(r1, true, null, W(0.5), 1.2); orbitLine(r2, true, [5, 7], W(0.28), 1.1); transfer(true);
      var NW = 9, wi;
      for (wi = 0; wi < NW; wi++) {
        var M0 = (wi / NW) * Math.PI, M1 = ((wi + 1) / NW) * Math.PI;
        ctx.fillStyle = W(wi % 2 ? 0.075 : 0.035); ctx.beginPath(); ctx.moveTo(c0.x, c0.y);
        for (s = 0; s <= 14; s++) { var nu = nuOf(kepler(lerp(M0, M1, s / 14))), w3 = W3(rOf(nu), nu), p = P(w3[0], 0, w3[2]); ctx.lineTo(p.x, p.y); }
        ctx.closePath(); ctx.fill();
      }
      var ag = ctx.createRadialGradient(c0.x, c0.y, re * 0.95, c0.x, c0.y, re * 1.22);              // thin atmosphere
      ag.addColorStop(0, 'rgba(142,201,255,0.35)'); ag.addColorStop(1, 'rgba(142,201,255,0)'); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(c0.x, c0.y, re * 1.22, 0, TAU); ctx.fill();
      G.ball(ctx, c0.x, c0.y, re, EARTH, { rim: 0.4, lo: 0.1 });
      // latitude rings and meridians on the sphere, only where they face the camera
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.beginPath();
      var ex = P.eye, RW = RE / 1000;
      function sph(la, lo) { var x = RW * Math.cos(la) * Math.cos(lo), y = RW * Math.sin(la), z = RW * Math.cos(la) * Math.sin(lo); return [x, y, z, x * (ex[0] - x) + y * (ex[1] - y) + z * (ex[2] - z) > 0]; }
      [-60, -30, 0, 30, 60].forEach(function (lat) { var pen = false; for (var k = 0; k <= 72; k++) { var q = sph(lat * Math.PI / 180, (k / 72) * TAU); if (!q[3]) { pen = false; continue; } var p = P(q[0], q[1], q[2]); if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y); } });
      for (i = 0; i < 12; i++) { var pen2 = false; for (var k2 = 0; k2 <= 36; k2++) { var q2 = sph(-Math.PI / 2 + (k2 / 36) * Math.PI, (i / 12) * TAU); if (!q2[3]) { pen2 = false; continue; } var p2 = P(q2[0], q2[1], q2[2]); if (!pen2) { ctx.moveTo(p2.x, p2.y); pen2 = true; } else ctx.lineTo(p2.x, p2.y); } }
      ctx.stroke();
      /* near halves, burn markers, trail, spacecraft */
      orbitLine(r1, false, null, W(0.55), 1.2); orbitLine(r2, false, [5, 7], W(0.3), 1.1); transfer(false);
      [[0, r1, 1], [Math.PI, r2, 2]].forEach(function (bm) {
        var w3 = W3(bm[1], bm[0]), p = P(w3[0], 0, w3[2]);
        ctx.strokeStyle = A(1); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TAU); ctx.stroke(); ctx.fillStyle = A(1); ctx.beginPath(); ctx.arc(p.x, p.y, 2.3, 0, TAU); ctx.fill();
        U.text(ctx, 'Burn ' + bm[2], p.x + 14, p.y - 6, 10, A(1), 'left');
      });
      var L = st.trail.length / 2;
      if (L > 2) {
        ctx.lineWidth = 2.2; ctx.lineCap = 'round';
        for (var c = 0; c < 6; c++) {
          var f0 = Math.floor((c / 6) * (L - 1)), f1 = Math.floor(((c + 1) / 6) * (L - 1));
          ctx.strokeStyle = W((0.1 + 0.7 * (c + 1) / 6) * cr.fade); ctx.beginPath();
          for (i = f0; i <= f1; i++) { var tp = P(st.trail[2 * i], 0, st.trail[2 * i + 1]); if (i === f0) ctx.moveTo(tp.x, tp.y); else ctx.lineTo(tp.x, tp.y); }
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
      var cw = W3(cr.r, cr.ang), cp = P(cw[0], 0, cw[2]), nw = W3(cr.r, cr.ang + 0.01), np = P(nw[0], 0, nw[2]);
      var vx = np.x - cp.x, vy = np.y - cp.y, vl = Math.hypot(vx, vy) || 1, ux = vx / vl, uy = vy / vl;
      ctx.globalAlpha *= cr.fade;
      ctx.strokeStyle = A(1); ctx.fillStyle = A(1); ctx.lineWidth = 1.5; U.arrow(ctx, cp.x + ux * 12, cp.y + uy * 12, cp.x + ux * 52, cp.y + uy * 52, 7);
      // the spacecraft: a small lit body between two solar panels
      ctx.save(); ctx.translate(cp.x, cp.y); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = 'rgb(60,96,128)'; ctx.fillRect(-3, -15, 6, 10); ctx.fillRect(-3, 5, 6, 10);
      ctx.strokeStyle = 'rgba(142,201,255,0.9)'; ctx.lineWidth = 1; ctx.strokeRect(-3, -15, 6, 10); ctx.strokeRect(-3, 5, 6, 10);
      var bg = ctx.createLinearGradient(0, -5, 0, 5); bg.addColorStop(0, 'rgb(230,236,244)'); bg.addColorStop(1, 'rgb(120,130,144)'); ctx.fillStyle = bg; ctx.fillRect(-6, -5, 12, 10);
      ctx.restore();
    }

    // n points spread along the two circular orbits and the transfer ellipse, in screen space (for the Orbital to SAT transition)
    function ringPoints(n) {
      var P = st.P, out = [], k, q = Math.round(n * 0.3), h = Math.round(n * 0.4), rest = n - q - h;
      if (!P) return out;
      for (k = 0; k < q; k++) { var w = W3(r1, (k / q) * TAU), p = P(w[0], 0, w[2]); out.push([p.x, p.y]); }
      for (k = 0; k < h; k++) { var nu = (k / (h - 1)) * Math.PI, w2 = W3(rOf(nu), nu), p2 = P(w2[0], 0, w2[2]); out.push([p2.x, p2.y]); }
      for (k = 0; k < rest; k++) { var w3 = W3(r2, (k / rest) * TAU), p3 = P(w3[0], 0, w3[2]); out.push([p3.x, p3.y]); }
      return out;
    }
    return { init: function () {}, advance: advance, draw: draw, settled: settled, side: 1, id: 'orbital', sim: st, st: st,
      earth: function () { return { x: st.earth.x, y: st.earth.y, r: st.earth.r }; }, ringPoints: ringPoints, EARTH: EARTH };
  };
})(typeof window !== 'undefined' ? window : globalThis);
