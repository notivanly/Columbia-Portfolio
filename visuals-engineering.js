/* ==========================================================================
   visuals-engineering.js
   Physics + engineering scenes. These are computed, not canned:
     bridge   - method-of-joints truss solver, moving vehicle load
     truss    - Pratt truss with live tension / compression readout
     wind     - potential flow around a Joukowski airfoil (Kutta condition)
     sandbox  - circle rigid bodies with gravity, collisions, a cursor well
     gravity  - spacetime-style grid warped by planetary masses
     orbital  - Hohmann transfer solved with the vis-viva equation
     nozzle   - rocket bell-nozzle wireframe with exhaust plume
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, W = U.W, A = U.A, R = U.R, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var V = PF.visuals;

  /* ======================================================================
     BRIDGE  (3D Warren truss, real member forces)
     ====================================================================== */
  V.bridge = function (opts) {
    var side = opts.side || 1;
    var n = 8, L = 16, H = 2.6, Wd = 3.6, P = 40;           // panels, span m, depth m, width m, vehicle kN
    var T = U.warren(n, L, H), dx = L / n;
    var loads = new Float64Array(T.nodes.length * 2);
    var st = { a: -2, forces: null, maxT: 0, maxC: 0 };
    var Fref = 32;

    function green(x, a) {               // simply supported beam, normalised to midspan
      var g = function (x_, a_) { return x_ * (L - a_) * (L * L - (L - a_) * (L - a_) - x_ * x_) / (6 * L); };
      return (x <= a ? g(x, a) : g(L - x, L - a)) / (L * L * L / 48);
    }

    function solve(a) {
      loads.fill(0);
      if (a >= 0 && a <= L) {
        var i = Math.min(n - 1, Math.floor(a / dx)), f = (a - i * dx) / dx;
        loads[2 * i + 1] = -(P / 2) * (1 - f);
        loads[2 * (i + 1) + 1] = -(P / 2) * f;
      }
      var r = U.solveTruss(T.nodes, T.members, T.supports, loads);
      st.forces = r.forces;
      var mx = 0, mn = 0, k;
      for (k = 0; k < r.forces.length; k++) { if (r.forces[k] > mx) mx = r.forces[k]; if (r.forces[k] < mn) mn = r.forces[k]; }
      st.maxT = mx; st.maxC = mn;
    }

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, side, opts.panel), cx = lay.cx - (lay.compact || lay.panel ? 0 : w * 0.015), cy = lay.cy + h * 0.05;
      var pxm = lay.compact ? w * 1.15 / L : lay.s * 1.44 / L;
      var yaw = (side > 0 ? -0.62 : 0.62) + Math.sin(t * 0.21) * 0.05 + m.nx * 0.12, pitch = 0.2 + m.ny * 0.04;
      var cam = U.camera(yaw, pitch, 46);
      function P3(x, y, z) { var p = cam(x - L / 2, y, z); return { x: cx + p.x * pxm, y: cy - p.y * pxm, z: p.z }; }

      /* vehicle position: auto-drive, or follow the cursor */
      var sx0 = P3(0, 0, 0).x, sxn = P3(L, 0, 0).x;
      if (m.active > 0.6 && dt > 0) {
        var target = clamp(L * (m.rx - sx0) / (sxn - sx0), -1, L + 1);
        st.a += (target - st.a) * Math.min(1, dt * 6);
      } else if (dt > 0) {
        st.a += 1.9 * dt; if (st.a > L + 3) st.a = -3;
      }
      var a = st.a;
      solve(a);
      var onSpan = a >= 0 && a <= L;
      var kd = smooth(Math.min(a, L - a) / 1.2);
      function dy(x) { return -0.5 * green(clamp(x, 0, L), clamp(a, 0, L)) * kd; }

      /* ground grid for depth */
      ctx.lineWidth = 1; ctx.strokeStyle = W(0.07); ctx.beginPath();
      var gx, gz;
      for (gx = -10; gx <= L + 10; gx += 3) { var g0 = P3(gx, -3.2, -9), g1 = P3(gx, -3.2, 9); ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); }
      for (gz = -9; gz <= 9; gz += 3) { var h0 = P3(-10, -3.2, gz), h1 = P3(L + 10, -3.2, gz); ctx.moveTo(h0.x, h0.y); ctx.lineTo(h1.x, h1.y); }
      ctx.stroke();

      /* abutments */
      function box(x0, x1, y0, y1, z0, z1, stroke) {
        var c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(function (q) { return P3(q[0], q[1], q[2]); });
        var e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        ctx.strokeStyle = stroke; ctx.beginPath();
        e.forEach(function (ed) { ctx.moveTo(c[ed[0]].x, c[ed[0]].y); ctx.lineTo(c[ed[1]].x, c[ed[1]].y); });
        ctx.stroke();
      }
      box(-3.2, 0.5, -3.2, -0.25, -Wd / 2 - 0.5, Wd / 2 + 0.5, W(0.28));
      box(L - 0.5, L + 3.2, -3.2, -0.25, -Wd / 2 - 0.5, Wd / 2 + 0.5, W(0.28));

      /* deflected node positions */
      var nodes = T.nodes.map(function (nd) { return { x: nd.x, y: nd.y + dy(nd.x) }; });

      /* gather segments, depth sorted */
      var segs = [], k, zi, zs = [-Wd / 2, Wd / 2], i;
      for (k = 0; k < T.members.length; k++) {
        for (zi = 0; zi < 2; zi++) {
          var A_ = nodes[T.members[k][0]], B_ = nodes[T.members[k][1]];
          var p0 = P3(A_.x, A_.y, zs[zi]), p1 = P3(B_.x, B_.y, zs[zi]);
          segs.push({ t: 'm', k: k, p0: p0, p1: p1, z: (p0.z + p1.z) / 2 });
        }
      }
      for (i = 0; i <= n; i++) {
        var q0 = P3(nodes[i].x, nodes[i].y, -Wd / 2), q1 = P3(nodes[i].x, nodes[i].y, Wd / 2);
        segs.push({ t: 'c', p0: q0, p1: q1, z: (q0.z + q1.z) / 2 });
      }
      for (i = 0; i < n; i++) {
        var tp = n + 1 + i, r0 = P3(nodes[tp].x, nodes[tp].y, -Wd / 2), r1 = P3(nodes[tp].x, nodes[tp].y, Wd / 2);
        segs.push({ t: 'c2', p0: r0, p1: r1, z: (r0.z + r1.z) / 2 });
        [-Wd / 4, Wd / 4].forEach(function (zz) {
          var d0 = P3(nodes[i].x, nodes[i].y, zz), d1 = P3(nodes[i + 1].x, nodes[i + 1].y, zz);
          segs.push({ t: 'd', p0: d0, p1: d1, z: (d0.z + d1.z) / 2 });
        });
      }
      segs.sort(function (s1, s2) { return s1.z - s2.z; });

      segs.forEach(function (s) {
        ctx.setLineDash([]);
        if (s.t === 'm') {
          var f = st.forces[s.k] / Fref, af = Math.min(1, Math.abs(f));
          if (f > 0.015) ctx.strokeStyle = W(0.5 + 0.5 * af);
          else if (f < -0.015) { ctx.strokeStyle = R(0.6 + 0.4 * af); ctx.setLineDash([7, 4]); }   // compression: warm and dashed
          else ctx.strokeStyle = W(0.2);
          ctx.lineWidth = 1 + 4.4 * af;
        } else if (s.t === 'c') { ctx.strokeStyle = W(0.22); ctx.lineWidth = 1; }
        else if (s.t === 'c2') { ctx.strokeStyle = W(0.13); ctx.lineWidth = 1; }
        else { ctx.strokeStyle = W(0.16); ctx.lineWidth = 1; }
        ctx.beginPath(); ctx.moveTo(s.p0.x, s.p0.y); ctx.lineTo(s.p1.x, s.p1.y); ctx.stroke();
      });
      ctx.setLineDash([]);

      /* joints */
      for (i = 0; i < nodes.length; i++) {
        zs.forEach(function (zz) {
          var p = P3(nodes[i].x, nodes[i].y, zz);
          ctx.fillStyle = 'rgba(20,21,23,0.9)'; ctx.strokeStyle = W(0.7); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.3, 0, TAU); ctx.fill(); ctx.stroke();
        });
      }

      /* vehicle */
      var vy = dy(clamp(a, 0, L)) + 0.12, vl = 1.3, vw = 0.75, vh = 1.0;
      var vc = [[a - vl, vy, -vw], [a + vl, vy, -vw], [a + vl, vy + vh, -vw], [a - vl, vy + vh, -vw], [a - vl, vy, vw], [a + vl, vy, vw], [a + vl, vy + vh, vw], [a - vl, vy + vh, vw]].map(function (q) { return P3(q[0], q[1], q[2]); });
      ctx.fillStyle = A(0.16); ctx.beginPath();
      [3, 2, 6, 7].forEach(function (ix, j) { if (!j) ctx.moveTo(vc[ix].x, vc[ix].y); else ctx.lineTo(vc[ix].x, vc[ix].y); });
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = A(0.95); ctx.lineWidth = 1.4; ctx.beginPath();
      [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (ed) { ctx.moveTo(vc[ed[0]].x, vc[ed[0]].y); ctx.lineTo(vc[ed[1]].x, vc[ed[1]].y); });
      ctx.stroke();
      if (onSpan) {
        var top = P3(a, vy + vh + 0.2, 0), lab = P3(a, vy + vh + 2.6, 0);
        ctx.strokeStyle = A(0.8); ctx.fillStyle = A(0.9); ctx.lineWidth = 1;
        U.arrow(ctx, lab.x, lab.y, top.x, top.y, 6);
        U.text(ctx, P + ' kN', lab.x, lab.y - 7, 10, A(0.95), 'center');
      }
    }

    function hud() {
      return [
        ['Vehicle load', P.toFixed(0) + ' kN'],
        ['Position', clamp(st.a, 0, L).toFixed(1) + ' m'],
        ['Peak tension', '+' + st.maxT.toFixed(1) + ' kN'],
        ['Peak compression', '\u2212' + Math.abs(st.maxC).toFixed(1) + ' kN']
      ];
    }
    return { draw: draw, hud: hud };
  };

  /* ======================================================================
     TRUSS ANALYZER  (2D blueprint, Pratt truss, labelled forces)
     ====================================================================== */
  V.truss = function (opts) {
    var side = opts.side || 1;
    var n = 6, L = 12, H = 3.6, P = 30;
    var T = U.pratt(n, L, H), dx = L / n, names = 'ABCDEFGHIJKL';
    var loads = new Float64Array(T.nodes.length * 2);
    var st = { resid: 0, maxT: 0, maxC: 0, R0: 0, Rn: 0 };
    var Fref = 32;

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, side, opts.panel), left, right, pxm, base;
      if (lay.compact || lay.panel) { left = w * 0.1; right = w * 0.9; } else { left = side > 0 ? w * 0.38 : w * 0.04; right = side > 0 ? w * 0.96 : w * 0.62; }
      pxm = (right - left) / L;
      base = lay.compact ? h * 0.72 : (lay.panel ? h * 0.5 + H * pxm * 0.5 : h * 0.55 + H * pxm * 0.5);
      function X(x) { return left + x * pxm; }
      function Y(y) { return base - y * pxm; }

      /* blueprint grid: 1 m crosses */
      ctx.strokeStyle = W(0.1); ctx.lineWidth = 1; ctx.beginPath();
      var gx, gy;
      for (gx = left - 2 * pxm; gx <= w + pxm; gx += pxm) for (gy = base % pxm - pxm; gy <= h + pxm; gy += pxm) {
        ctx.moveTo(gx - 3, gy); ctx.lineTo(gx + 3, gy); ctx.moveTo(gx, gy - 3); ctx.lineTo(gx, gy + 3);
      }
      ctx.stroke();

      /* load position: auto sweep or follow cursor */
      var a = L * (0.5 - 0.5 * Math.cos(t * 0.45));
      if (m.active > 0.5) a = clamp(L * (m.rx - left) / (right - left), 0, L);
      loads.fill(0);
      var bi = Math.min(n - 1, Math.floor(a / dx)), f = (a - bi * dx) / dx;
      loads[2 * bi + 1] = -P * (1 - f); loads[2 * (bi + 1) + 1] = -P * f;
      var sol = U.solveTruss(T.nodes, T.members, T.supports, loads);
      var Rsum = 0, k, mx = 0, mn = 0;
      sol.reactions.forEach(function (r) { if (r.axis === 1) Rsum += r.value; });
      st.resid = Rsum - P;
      for (k = 0; k < sol.forces.length; k++) { mx = Math.max(mx, sol.forces[k]); mn = Math.min(mn, sol.forces[k]); }
      st.maxT = mx; st.maxC = mn;
      st.R0 = sol.reactions[1].value; st.Rn = sol.reactions[2].value;

      /* members */
      var cxm = L / 2, cym = H / 2;
      for (k = 0; k < T.members.length; k++) {
        var mb = T.members[k], p = T.nodes[mb[0]], q = T.nodes[mb[1]], fk = sol.forces[k], af = Math.min(1, Math.abs(fk) / Fref);
        ctx.setLineDash([]);
        if (fk > 0.05) ctx.strokeStyle = W(0.55 + 0.45 * af); else if (fk < -0.05) { ctx.strokeStyle = R(0.65 + 0.35 * af); ctx.setLineDash([9, 5]); } else ctx.strokeStyle = W(0.22);
        ctx.lineWidth = 1.2 + 5.2 * af;
        ctx.beginPath(); ctx.moveTo(X(p.x), Y(p.y)); ctx.lineTo(X(q.x), Y(q.y)); ctx.stroke(); ctx.setLineDash([]);

        // value label, offset outward from the truss centre
        var mxp = (p.x + q.x) / 2, myp = (p.y + q.y) / 2, ux = q.x - p.x, uy = q.y - p.y, ul = Math.hypot(ux, uy);
        var nx = -uy / ul, ny = ux / ul; if (nx * (mxp - cxm) + ny * (myp - cym) < 0) { nx = -nx; ny = -ny; }
        var sgn = fk > 0.05 ? '+' : (fk < -0.05 ? '\u2212' : '');
        var lx = X(mxp) + nx * (15 + 7 * af), ly = Y(myp) - ny * (15 + 7 * af);
        U.text(ctx, fk > 0.05 ? 'T' : (fk < -0.05 ? 'C' : ''), lx, ly + 3, 10, fk < -0.05 ? R(0.9) : W(0.8), 'center');   // letter as well as line style
      }

      /* joints + names */
      T.nodes.forEach(function (nd, i) {
        ctx.fillStyle = 'rgba(22,23,25,1)'; ctx.strokeStyle = W(0.85); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(X(nd.x), Y(nd.y), 4, 0, TAU); ctx.fill(); ctx.stroke();
        var top = nd.y > 0.1;
        var edge = (i === 0 || i === n);
        U.text(ctx, names.charAt(i), X(nd.x) + (top ? 0 : (edge ? (i === 0 ? -16 : 16) : 0)), Y(nd.y) + (top ? -13 : (edge ? -9 : 19)), 10, W(0.55), 'center');
      });

      /* supports: pin (A) and roller (G) */
      function support(xm, roller) {
        var sx = X(xm), sy = Y(0) + 4;
        ctx.strokeStyle = W(0.75); ctx.lineWidth = 1.2; ctx.fillStyle = 'rgba(0,0,0,0.0)';
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 13, sy + 22); ctx.lineTo(sx + 13, sy + 22); ctx.closePath(); ctx.stroke();
        var gy2 = sy + 22 + (roller ? 8 : 0);
        if (roller) { ctx.beginPath(); ctx.arc(sx - 6, sy + 26, 3.2, 0, TAU); ctx.arc(sx + 6, sy + 26, 3.2, 0, TAU); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(sx - 20, gy2); ctx.lineTo(sx + 20, gy2); ctx.stroke();
        ctx.strokeStyle = W(0.3); ctx.beginPath();
        for (var hx = -18; hx <= 14; hx += 6) { ctx.moveTo(sx + hx, gy2); ctx.lineTo(sx + hx - 5, gy2 + 6); }
        ctx.stroke();
        return gy2 + 8;
      }
      var g0 = support(0, false), g1 = support(L, true);

      /* reactions (white, from below) */
      function reaction(xm, val, gy) {
        var len = clamp(val * 1.5, 8, 70), sx = X(xm);
        ctx.strokeStyle = W(0.85); ctx.fillStyle = W(0.85); ctx.lineWidth = 1.2;
        U.arrow(ctx, sx, gy + len, sx, gy + 2, 6);
        U.text(ctx, val.toFixed(1) + ' kN', sx, gy + len + 15, 9, W(0.7), 'center');
      }
      reaction(0, st.R0, g0); reaction(L, st.Rn, g1);

      /* applied load (accent, hanging) */
      var lx0 = X(a), ly0 = Y(0) + 8;
      ctx.strokeStyle = A(1); ctx.fillStyle = A(1); ctx.lineWidth = 1.6;
      U.arrow(ctx, lx0, ly0 + 62, lx0, ly0, 8);
      U.text(ctx, 'P = ' + P + ' kN', lx0, ly0 + 78, 10, A(1), 'center');

      /* dimensions */
      var dy0 = Y(0) + 118;
      if (dy0 < h - 24) {
        ctx.strokeStyle = W(0.35); ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(X(0), dy0); ctx.lineTo(X(L), dy0);
        ctx.moveTo(X(0), dy0 - 6); ctx.lineTo(X(0), dy0 + 6); ctx.moveTo(X(L), dy0 - 6); ctx.lineTo(X(L), dy0 + 6);
        ctx.stroke();
        U.text(ctx, L.toFixed(1) + ' m', X(L / 2), dy0 - 7, 9, W(0.5), 'center');
      }
      var hx0 = X(0) - 44;
      if (hx0 > 20) {
        ctx.strokeStyle = W(0.35); ctx.beginPath();
        ctx.moveTo(hx0, Y(0)); ctx.lineTo(hx0, Y(H)); ctx.moveTo(hx0 - 6, Y(0)); ctx.lineTo(hx0 + 6, Y(0)); ctx.moveTo(hx0 - 6, Y(H)); ctx.lineTo(hx0 + 6, Y(H));
        ctx.stroke();
        ctx.save(); ctx.translate(hx0 - 9, (Y(0) + Y(H)) / 2); ctx.rotate(-Math.PI / 2);
        U.text(ctx, H.toFixed(1) + ' m', 0, 0, 9, W(0.5), 'center'); ctx.restore();
      }
    }

    function hud() {
      var r = Math.abs(st.resid) < 0.0005 ? 0 : st.resid;
      return [
        ['Joints / members', T.nodes.length + ' / ' + T.members.length],
        ['Peak tension', '+' + st.maxT.toFixed(1) + ' kN'],
        ['Peak compression', '\u2212' + Math.abs(st.maxC).toFixed(1) + ' kN'],
        ['Sum of vertical forces', r.toFixed(3) + ' kN']
      ];
    }
    return { draw: draw, hud: hud };
  };

  /* ======================================================================
     WIND TUNNEL  (potential flow around a Joukowski airfoil)
     ====================================================================== */
  V.wind = function (opts) {
    var side = opts.side || 1;
    var c = 1, eps = 0.09, del = 0.06;                       // Joukowski parameters
    var z0x = -eps, z0y = del;
    var ra = Math.hypot(c + eps, del), beta = Math.asin(del / ra);
    var UREF = 2.4;                                          // free-stream, units / s
    var chord = 4.1;
    var st = { alpha: 6, cl: 1, parts: [], lanes: [], u: 100, cx: 0, cy: 0, X0: 0, X1: 0, wallT: 0, wallB: 0, ready: false };

    // Compute chord numerically from the outline.
    (function () {
      var mnx = 1e9, mxx = -1e9, i;
      for (i = 0; i < 360; i++) {
        var th = (i / 360) * TAU, zx = z0x + ra * Math.cos(th), zy = z0y + ra * Math.sin(th), d = zx * zx + zy * zy;
        var px = zx + c * c * zx / d; if (px < mnx) mnx = px; if (px > mxx) mxx = px;
      }
      chord = mxx - mnx;
    })();

    /* velocity in the display plane. Returns false when the point is inside the body. */
    var out = { x: 1, y: 0, q: 1 };
    function vel(X, Y, alpha, Gam) {
      var ca = Math.cos(alpha), sa = Math.sin(alpha);
      var zx = X * ca - Y * sa, zy = X * sa + Y * ca;                // display -> z-plane
      var z2x = zx * zx - zy * zy - 4 * c * c, z2y = 2 * zx * zy, mod = Math.hypot(z2x, z2y);
      var sx = Math.sqrt((mod + z2x) / 2), sy = Math.sqrt(Math.max(0, (mod - z2x) / 2)); if (z2y < 0) sy = -sy;
      var r1x = (zx + sx) / 2, r1y = (zy + sy) / 2, r2x = (zx - sx) / 2, r2y = (zy - sy) / 2;
      var d1 = Math.hypot(r1x - z0x, r1y - z0y), d2 = Math.hypot(r2x - z0x, r2y - z0y), zex, zey, d;
      if (d1 >= d2) { zex = r1x; zey = r1y; d = d1; } else { zex = r2x; zey = r2y; d = d2; }
      if (d < ra) return false;
      var qx = zex - z0x, qy = zey - z0y, q2 = qx * qx + qy * qy;
      var q2x = qx * qx - qy * qy, q2y = 2 * qx * qy, qq = q2x * q2x + q2y * q2y;
      // dw/dzeta = e^{-i a} - a^2 e^{i a} / q^2 + i G / (2 pi q)
      var t2r = ra * ra * (ca * q2x + sa * q2y) / qq, t2i = ra * ra * (sa * q2x - ca * q2y) / qq;
      var wr = ca - t2r + (Gam / (TAU * q2)) * qy, wi = -sa - t2i + (Gam / (TAU * q2)) * qx;
      // dz/dzeta = 1 - c^2 / zeta^2
      var e2x = zex * zex - zey * zey, e2y = 2 * zex * zey, ee = e2x * e2x + e2y * e2y;
      var jr = 1 - c * c * e2x / ee, ji = c * c * e2y / ee, jj = jr * jr + ji * ji;
      if (jj < 1e-6) { out.x = 1; out.y = 0; out.q = 1; return true; }
      var Wr = (wr * jr + wi * ji) / jj, Wi = (wi * jr - wr * ji) / jj;       // u - i v
      var u = Wr, v = -Wi, vx = u * ca + v * sa, vy = -u * sa + v * ca;       // back to display plane
      var q = Math.hypot(vx, vy);
      if (q > 3.6) { vx *= 3.6 / q; vy *= 3.6 / q; q = 3.6; }
      out.x = vx; out.y = vy; out.q = q;
      return true;
    }

    function gamma(alpha) { return 4 * Math.PI * ra * Math.sin(alpha + beta); }

    function spawn(p, lane) { p.x = st.X0; p.y = lane; p.trail = []; p.q = 1; }

    function step(dt, alpha) {
      var Gam = gamma(alpha), i, lane, p;
      for (i = 0; i < st.lanes.length; i++) {
        lane = st.lanes[i]; lane.t -= dt;
        if (lane.t <= 0) { lane.t += 0.42 + (i % 5) * 0.03; p = { x: 0, y: 0, trail: [], q: 1 }; spawn(p, lane.y); st.parts.push(p); }
      }
      for (i = st.parts.length - 1; i >= 0; i--) {
        p = st.parts[i];
        if (!vel(p.x, p.y, alpha, Gam)) { st.parts.splice(i, 1); continue; }
        var vx1 = out.x, vy1 = out.y;
        if (!vel(p.x + vx1 * UREF * dt * 0.5, p.y + vy1 * UREF * dt * 0.5, alpha, Gam)) { st.parts.splice(i, 1); continue; }
        p.q = out.q;
        p.x += out.x * UREF * dt; p.y += out.y * UREF * dt;
        p.trail.push(p.x, p.y); if (p.trail.length > 44) p.trail.splice(0, 2);
        if (p.x > st.X1 || p.y > st.Ytop + 0.5 || p.y < st.Ybot - 0.5) st.parts.splice(i, 1);
      }
    }

    function init(w, h) {
      var lay = U.layout(w, h, side, opts.panel);
      st.u = lay.compact ? lay.s * 0.24 : lay.s * 0.3;
      st.cx = lay.compact ? w * 0.5 : lay.cx; st.cy = lay.compact ? h * 0.7 : lay.cy;
      st.wallT = lay.compact ? h * 0.4 : h * 0.07; st.wallB = lay.compact ? h * 0.98 : h * 0.93;
      st.X0 = (0 - st.cx) / st.u - 0.4; st.X1 = (w - st.cx) / st.u + 0.4;
      st.Ytop = (st.cy - st.wallT) / st.u; st.Ybot = -(st.wallB - st.cy) / st.u;
      st.lanes = []; st.parts = [];
      var y, i = 0;
      for (y = st.Ybot + 0.08; y < st.Ytop - 0.05; y += 0.15) { st.lanes.push({ y: y, t: (i * 0.137) % 0.42 }); i++; }
      for (i = 0; i < 150; i++) step(1 / 30, st.alpha * Math.PI / 180);   // warm-up
    }

    function draw(ctx, w, h, t, dt, m) {
      var auto = 6 + 5.5 * Math.sin(t * 0.4);
      var mouseA = lerp(13, -2, clamp(m.y, 0, 1));
      st.alpha = lerp(auto, mouseA, m.active);
      var alpha = st.alpha * Math.PI / 180, Gam = gamma(alpha);
      st.cl = 2 * Gam / chord;
      if (dt > 0) step(dt, alpha);
      var u = st.u, cx = st.cx, cy = st.cy;

      /* tunnel walls */
      ctx.strokeStyle = W(0.38); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, st.wallT); ctx.lineTo(w, st.wallT); ctx.moveTo(0, st.wallB); ctx.lineTo(w, st.wallB); ctx.stroke();
      ctx.strokeStyle = W(0.16); ctx.beginPath();
      var tx, off = (t * 40) % 36;
      for (tx = -36 + off; tx < w; tx += 36) { ctx.moveTo(tx, st.wallT); ctx.lineTo(tx - 6, st.wallT + 7); ctx.moveTo(tx, st.wallB); ctx.lineTo(tx - 6, st.wallB - 7); }
      ctx.stroke();

      /* streamlines */
      ctx.save(); ctx.beginPath(); ctx.rect(0, st.wallT + 1, w, st.wallB - st.wallT - 2); ctx.clip();
      ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      var i, j, p, L, seg;
      for (i = 0; i < st.parts.length; i++) {
        p = st.parts[i]; L = p.trail.length / 2; if (L < 3) continue;
        var tt = clamp((p.q - 0.95) / 0.85, 0, 1);
        var col = 'rgba(' + Math.round(lerp(255, 142, tt)) + ',' + Math.round(lerp(255, 201, tt)) + ',255,';
        ctx.lineWidth = 1.1 + 1.8 * tt;                          // faster air: bluer and thicker, so speed is not colour alone
        for (seg = 0; seg < 3; seg++) {
          var a0 = Math.floor((seg / 3) * (L - 1)), a1 = Math.floor(((seg + 1) / 3) * (L - 1));
          ctx.strokeStyle = col + (0.16 + seg * 0.2 + tt * 0.2).toFixed(3) + ')';
          ctx.beginPath();
          for (j = a0; j <= a1; j++) { var px = cx + p.trail[2 * j] * u, py = cy - p.trail[2 * j + 1] * u; if (j === a0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
          ctx.stroke();
        }
      }
      ctx.restore(); ctx.lineCap = 'butt';

      /* airfoil outline */
      var ca = Math.cos(alpha), sa = Math.sin(alpha);
      function toScreen(zx, zy) { var X = zx * ca + zy * sa, Y = -zx * sa + zy * ca; return [cx + X * u, cy - Y * u]; }
      ctx.beginPath();
      var k;
      for (k = 0; k <= 160; k++) {
        var th = (k / 160) * TAU, zx = z0x + ra * Math.cos(th), zy = z0y + ra * Math.sin(th), d2 = zx * zx + zy * zy;
        var s = toScreen(zx + c * c * zx / d2, zy - c * c * zy / d2);
        if (k === 0) ctx.moveTo(s[0], s[1]); else ctx.lineTo(s[0], s[1]);
      }
      ctx.closePath();
      var fill = ctx.createLinearGradient(cx, cy - u, cx, cy + u);
      fill.addColorStop(0, 'rgba(30,31,34,0.97)'); fill.addColorStop(1, 'rgba(10,10,12,0.98)');
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = W(0.95); ctx.lineWidth = 1.6; ctx.stroke();

      // chord line + quarter-chord marker
      var le = toScreen(-2.1, 0), te = toScreen(2, 0);
      ctx.setLineDash([4, 5]); ctx.strokeStyle = W(0.35); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(le[0], le[1]); ctx.lineTo(te[0], te[1]); ctx.stroke(); ctx.setLineDash([]);
      var qc = toScreen(-1.1, 0);
      ctx.strokeStyle = W(0.7); ctx.beginPath(); ctx.arc(qc[0], qc[1], 4, 0, TAU); ctx.moveTo(qc[0] - 7, qc[1]); ctx.lineTo(qc[0] + 7, qc[1]); ctx.moveTo(qc[0], qc[1] - 7); ctx.lineTo(qc[0], qc[1] + 7); ctx.stroke();

      // lift vector (perpendicular to the free stream = straight up on screen)
      var ll = clamp(st.cl * 0.28 * u, -90, 190);
      ctx.strokeStyle = A(1); ctx.fillStyle = A(1); ctx.lineWidth = 1.8;
      U.arrow(ctx, qc[0], qc[1] - 8, qc[0], qc[1] - 8 - ll, 8);
      U.text(ctx, 'L', qc[0] + 10, qc[1] - 8 - ll + 8, 10, A(1));

      // free-stream arrow at the left
      var fx = Math.max(24, cx - 3.6 * u);
      ctx.strokeStyle = W(0.6); ctx.fillStyle = W(0.6); ctx.lineWidth = 1.2;
      if (fx < w * 0.9) { U.arrow(ctx, fx, st.wallT + 28, fx + 44, st.wallT + 28, 6); U.text(ctx, 'U\u221e', fx, st.wallT + 46, 9, W(0.55)); }
    }

    function hud() {
      return [
        ['Angle of attack', st.alpha.toFixed(1) + '\u00b0'],
        ['Free stream', '25 m/s'],
        ['Lift coefficient', st.cl.toFixed(2)]
      ];
    }
    return { init: init, draw: draw, hud: hud };
  };

  /* ======================================================================
     PHYSICS SANDBOX  (rigid circles, gravity, restitution, cursor well)
     ====================================================================== */
  V.sandbox = function (opts) {
    var side = opts.side || 1;
    var bodies = [], arena = { x0: 0, x1: 0, y0: 0, y1: 0 }, ppm = 110, g = 9.81 * 110, peak = 0, count = 0, shake = 4.5;

    function init(w, h) {
      var lay = U.layout(w, h, side, opts.panel), r = U.rng(21), i;
      ppm = Math.max(70, lay.s / 6.2); g = 9.81 * ppm;
      if (lay.compact) arena = { x0: w * 0.04, x1: w * 0.96, y0: -h * 0.4, y1: h * 0.97 };
      else if (lay.panel) arena = { x0: w * 0.06, x1: w * 0.94, y0: -h * 0.5, y1: h * 0.94 };
      else if (side > 0) arena = { x0: w * 0.36, x1: w - 6, y0: -h * 0.5, y1: h * 0.94 };
      else arena = { x0: 6, x1: w * 0.64, y0: -h * 0.5, y1: h * 0.94 };
      count = lay.compact ? 20 : 34; bodies = [];
      for (i = 0; i < count; i++) {
        var rad = ppm * (0.15 + Math.pow(r(), 2.2) * 0.5);
        bodies.push({
          x: arena.x0 + rad + r() * (arena.x1 - arena.x0 - 2 * rad), y: h * 0.05 + r() * h * 0.5,
          vx: (r() - 0.5) * 300, vy: (r() - 0.5) * 200, r: rad, m: rad * rad, rot: r() * TAU, trail: [], hot: i === 3 || i === 17
        });
      }
    }

    function stepPhysics(dt, m) {
      shake -= dt;
      if (shake <= 0) {                                   // a periodic "kick" keeps the sandbox alive
        shake = 6.5;
        bodies.forEach(function (q, ix) { q.vy -= (650 + (ix * 53) % 700) * (0.5 + 60 / (q.r + 30)) * Math.max(0.55, ppm / 110); q.vx += (((ix * 37) % 100) - 50) * 7; });
      }
      var sub = 3, ds = dt / sub, s, i, j, b, c;
      for (s = 0; s < sub; s++) {
        for (i = 0; i < bodies.length; i++) {
          b = bodies[i]; b.vy += g * ds;
          if (m.active > 0.15) {                          // the cursor is a gravity well
            var ddx = m.rx - b.x, ddy = m.ry - b.y, d = Math.hypot(ddx, ddy) + 1;
            var acc = (260000 / (d + 100)) * m.active;
            b.vx += (ddx / d) * acc * ds; b.vy += (ddy / d) * acc * ds;
            b.vx *= 1 - 0.6 * ds; b.vy *= 1 - 0.6 * ds;
          }
          b.x += b.vx * ds; b.y += b.vy * ds;
          if (b.x - b.r < arena.x0) { b.x = arena.x0 + b.r; b.vx = -b.vx * 0.8; }
          if (b.x + b.r > arena.x1) { b.x = arena.x1 - b.r; b.vx = -b.vx * 0.8; }
          if (b.y - b.r < arena.y0) { b.y = arena.y0 + b.r; b.vy = -b.vy * 0.8; }
          if (b.y + b.r > arena.y1) { b.y = arena.y1 - b.r; b.vy = -b.vy * 0.72; b.vx *= 1 - 1.4 * ds; }
        }
        for (i = 0; i < bodies.length; i++) for (j = i + 1; j < bodies.length; j++) {
          b = bodies[i]; c = bodies[j];
          var dx = c.x - b.x, dy = c.y - b.y, dist = Math.hypot(dx, dy), min = b.r + c.r;
          if (dist >= min || dist === 0) continue;
          var nx = dx / dist, ny = dy / dist, over = min - dist, tm = b.m + c.m;
          b.x -= nx * over * (c.m / tm); b.y -= ny * over * (c.m / tm);
          c.x += nx * over * (b.m / tm); c.y += ny * over * (b.m / tm);
          var rvn = (c.vx - b.vx) * nx + (c.vy - b.vy) * ny;
          if (rvn < 0) {
            var jn = -(1 + 0.78) * rvn / (1 / b.m + 1 / c.m);
            b.vx -= jn * nx / b.m; b.vy -= jn * ny / b.m; c.vx += jn * nx / c.m; c.vy += jn * ny / c.m;
          }
        }
      }
    }

    function draw(ctx, w, h, t, dt, m) {
      if (dt > 0) stepPhysics(Math.min(dt, 1 / 30), m);
      var i, b;

      /* arena: floor, left wall, ruler ticks */
      ctx.strokeStyle = W(0.4); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(arena.x0, arena.y1); ctx.lineTo(arena.x1 + 6, arena.y1);
      if (arena.x0 > 20) { ctx.moveTo(arena.x0, arena.y1); ctx.lineTo(arena.x0, Math.max(0, h * 0.06)); }
      if (arena.x1 < w - 20) { ctx.moveTo(arena.x1, arena.y1); ctx.lineTo(arena.x1, Math.max(0, h * 0.06)); }
      ctx.stroke();
      ctx.strokeStyle = W(0.14); ctx.beginPath();
      var tx, k = 0;
      for (tx = arena.x0; tx <= arena.x1; tx += ppm / 2, k++) { ctx.moveTo(tx, arena.y1); ctx.lineTo(tx, arena.y1 + (k % 2 === 0 ? 9 : 5)); }
      ctx.stroke();
      if (arena.y1 + 24 < h) U.text(ctx, '1 m', arena.x0 + ppm, arena.y1 + 22, 9, W(0.35), 'center');

      /* trails + bodies */
      peak = 0;
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        var sp = Math.hypot(b.vx, b.vy); if (sp / ppm > peak) peak = sp / ppm;
        if (dt > 0) { b.trail.push(b.x, b.y); if (b.trail.length > 18) b.trail.splice(0, 2); b.rot += (b.vx / b.r) * dt * 0.6; }
        if (sp > 160 && b.trail.length > 4) {
          ctx.strokeStyle = b.hot ? A(0.35) : W(0.18); ctx.lineWidth = Math.max(1, b.r * 0.12); ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.trail[0], b.trail[1]);
          for (var q = 2; q < b.trail.length; q += 2) ctx.lineTo(b.trail[q], b.trail[q + 1]);
          ctx.stroke(); ctx.lineCap = 'butt';
        }
      }
      for (i = 0; i < bodies.length; i++) {
        b = bodies[i];
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU);
        if (b.hot) { ctx.fillStyle = A(0.9); ctx.fill(); ctx.strokeStyle = A(1); }
        else { ctx.fillStyle = W(b.r > ppm * 0.4 ? 0.05 : 0.025); ctx.fill(); ctx.strokeStyle = W(0.6); }
        ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = b.hot ? 'rgba(20,10,8,0.7)' : W(0.35);
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + Math.cos(b.rot) * b.r, b.y + Math.sin(b.rot) * b.r); ctx.stroke();
        var spd = Math.hypot(b.vx, b.vy);
        if (spd > 90) {
          var vl = clamp(spd * 0.1, 6, 70), ang = Math.atan2(b.vy, b.vx);
          ctx.strokeStyle = A(0.9); ctx.fillStyle = A(0.9); ctx.lineWidth = 1.1;
          U.arrow(ctx, b.x, b.y, b.x + Math.cos(ang) * vl, b.y + Math.sin(ang) * vl, 5);
        }
      }

      /* cursor well */
      if (m.active > 0.15) {
        ctx.strokeStyle = A(0.5 * m.active); ctx.lineWidth = 1;
        var rr;
        for (rr = 0; rr < 3; rr++) { ctx.beginPath(); ctx.arc(m.rx, m.ry, 14 + rr * 12 + ((t * 30) % 12), 0, TAU); ctx.globalAlpha = 1 - rr * 0.3; ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }

    function hud() {
      return [['Bodies', String(count)], ['Gravity', '9.81 m/s\u00b2'], ['Peak speed', peak.toFixed(1) + ' m/s']];
    }
    return { init: init, draw: draw, hud: hud };
  };

  /* ======================================================================
     PLANETARY GRAVITY EXPLORER  (warped grid + surface gravity data)
     ====================================================================== */
  V.gravity = function (opts) {
    var side = opts.side || 1;
    var PL = [
      { name: 'Mercury', g: 3.70, ve: 4.25, r: 0.44, size: 0.0145, m: 0.0186, a0: 0.4, tone: 0.55 },
      { name: 'Venus', g: 8.87, ve: 10.36, r: 0.68, size: 0.0190, m: 0.0247, a0: 2.3, tone: 0.8 },
      { name: 'Earth', g: 9.81, ve: 11.19, r: 0.93, size: 0.0195, m: 0.0258, a0: 4.1, tone: 0.9 },
      { name: 'Mars', g: 3.71, ve: 5.03, r: 1.2, size: 0.0160, m: 0.0191, a0: 5.5, tone: 0, mars: true },
      { name: 'Jupiter', g: 24.79, ve: 59.5, r: 1.58, size: 0.047, m: 0.083, a0: 1.2, tone: 0.7, bands: true }
    ];
    var G = 1.95, NL = 31, NS = 76, active = 2;
    var segs = { x0: new Float32Array(NL * 2 * NS), y0: new Float32Array(NL * 2 * NS), x1: new Float32Array(NL * 2 * NS), y1: new Float32Array(NL * 2 * NS), b: new Uint8Array(NL * 2 * NS) };

    function planetPos(p, t) { var ang = p.a0 + t * 0.42 / Math.pow(p.r, 1.5); return [Math.cos(ang) * p.r, Math.sin(ang) * p.r]; }
    function surface(x, z, pp) {
      var y = -0.30 / Math.sqrt(x * x + z * z + 0.05), i;
      for (i = 0; i < PL.length; i++) { var dx = x - pp[i][0], dz = z - pp[i][1]; y -= PL[i].m / Math.sqrt(dx * dx + dz * dz + 0.012); }
      return y;
    }

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, side, opts.panel), pxm = lay.compact ? w * 0.27 : lay.s * 0.42;
      var cx = lay.cx, cy = lay.cy - (lay.compact ? h * 0.02 : h * 0.13);
      var yaw = 0.5 + t * 0.045 + m.nx * 0.2, pitch = 0.64 + m.ny * 0.05;
      var cam = U.camera(yaw, pitch, 6.4);
      function P3(x, y, z) { var p = cam(x, y, z); return { x: cx + p.x * pxm, y: cy - p.y * pxm, z: p.z, k: p.k }; }

      var pp = PL.map(function (p) { return planetPos(p, t); }), i, j, n = 0, ln;

      /* grid lines (two directions), bucketed by depth of the well */
      for (ln = 0; ln < NL; ln++) {
        var c0 = -G + (2 * G * ln) / (NL - 1);
        for (var dir = 0; dir < 2; dir++) {
          var prev = null;
          for (j = 0; j <= NS; j++) {
            var s0 = -G + (2 * G * j) / NS, gx = dir ? c0 : s0, gz = dir ? s0 : c0;
            var gy = surface(gx, gz, pp), p = P3(gx, gy, gz);
            if (prev) {
              segs.x0[n] = prev.x; segs.y0[n] = prev.y; segs.x1[n] = p.x; segs.y1[n] = p.y;
              var depth = -gy; segs.b[n] = depth < 0.15 ? 0 : depth < 0.4 ? 1 : depth < 0.9 ? 2 : 3; n++;
            }
            prev = p;
          }
        }
      }
      var alphas = [0.13, 0.26, 0.42, 0.7], widths = [1, 1, 1.1, 1.3], bk;
      for (bk = 0; bk < 4; bk++) {
        ctx.strokeStyle = bk === 3 ? A(0.55) : W(alphas[bk]); ctx.lineWidth = widths[bk]; ctx.beginPath();
        for (i = 0; i < n; i++) if (segs.b[i] === bk) { ctx.moveTo(segs.x0[i], segs.y0[i]); ctx.lineTo(segs.x1[i], segs.y1[i]); }
        ctx.stroke();
      }

      /* choose the active planet: nearest to the cursor, else cycle */
      var scr = PL.map(function (p, idx) { var q = P3(pp[idx][0], surface(pp[idx][0], pp[idx][1], pp) + 0.02, pp[idx][1]); q.idx = idx; return q; });
      if (m.active > 0.3) {
        var best = 1e9;
        scr.forEach(function (q) { var d = Math.hypot(q.x - m.rx, q.y - m.ry); if (d < best) { best = d; active = q.idx; } });
      } else active = Math.floor(t / 3.2) % PL.length;

      /* the star */
      var sun = P3(0, surface(0, 0, pp) + 0.06, 0), sr = lay.s * 0.045 * sun.k;
      var sg = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sr * 4);
      sg.addColorStop(0, 'rgba(255,236,224,1)'); sg.addColorStop(0.12, R(0.95)); sg.addColorStop(0.35, R(0.28)); sg.addColorStop(1, R(0));
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sun.x, sun.y, sr * 4, 0, TAU); ctx.fill();

      /* planets, far to near */
      var order = scr.slice().sort(function (a, b) { return a.z - b.z; });
      order.forEach(function (q) {
        var p = PL[q.idx], r = Math.max(4, lay.s * p.size * q.k * 1.55), on = q.idx === active;
        ctx.fillStyle = '#121315'; ctx.beginPath(); ctx.arc(q.x, q.y, r + 0.5, 0, TAU); ctx.fill();
        var gr = ctx.createRadialGradient(q.x - r * 0.4, q.y - r * 0.45, r * 0.1, q.x, q.y, r);
        if (p.mars) { gr.addColorStop(0, 'rgba(255,170,140,1)'); gr.addColorStop(0.55, R(0.95)); gr.addColorStop(1, 'rgba(60,16,8,1)'); }
        else { var v = Math.round(255 * p.tone); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(' + Math.round(v * 0.62) + ',' + Math.round(v * 0.63) + ',' + Math.round(v * 0.66) + ',1)'); gr.addColorStop(1, 'rgba(14,14,16,1)'); }
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill();
        if (p.bands) {
          ctx.save(); ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.clip(); ctx.strokeStyle = 'rgba(20,20,22,0.35)'; ctx.lineWidth = r * 0.12;
          for (var bnd = -2; bnd <= 2; bnd++) { ctx.beginPath(); ctx.moveTo(q.x - r, q.y + bnd * r * 0.32); ctx.lineTo(q.x + r, q.y + bnd * r * 0.32 + r * 0.05); ctx.stroke(); }
          ctx.restore();
        }
        if (on) { ctx.strokeStyle = W(0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(q.x, q.y, r + 7, 0, TAU); ctx.stroke(); }

        // label
        var right = q.x < w - 150, dir = right ? 1 : -1, lx = q.x + dir * (r + 14), ly = q.y - r - 16;
        ctx.strokeStyle = W(on ? 0.6 : 0.28); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(q.x + dir * (r * 0.7 + 3), q.y - r * 0.7 - 3); ctx.lineTo(lx, ly); ctx.lineTo(lx + dir * 10, ly); ctx.stroke();
        var al = right ? 'left' : 'right', tx = lx + dir * 14;
        U.text(ctx, p.name, tx, ly + 3, 10, W(on ? 1 : 0.55), al);
        U.text(ctx, p.g.toFixed(2) + ' m/s\u00b2', tx, ly + 16, 9, on ? A(1) : W(0.4), al);
      });
    }

    function hud() {
      var p = PL[active];
      return [['Body', p.name], ['Surface gravity', p.g.toFixed(2) + ' m/s\u00b2'], ['Escape velocity', p.ve.toFixed(2) + ' km/s'], ['Weight of 70 kg', Math.round(70 * p.g) + ' N']];
    }
    return { draw: draw, hud: hud };
  };

  /* ======================================================================
     ORBITAL MECHANICS  (Hohmann transfer, vis-viva, Kepler's 2nd law)
     ====================================================================== */
  V.orbital = function (opts) {
    var side = opts.side || 1, dir = side > 0 ? 1 : -1;
    var mu = 398600.4418, RE = 6378.137, r1 = 6778, r2 = 42164;
    var a = (r1 + r2) / 2, e = (r2 - r1) / (r2 + r1);
    var vc1 = Math.sqrt(mu / r1), vp = Math.sqrt(mu * (2 / r1 - 1 / a)), va = Math.sqrt(mu * (2 / r2 - 1 / a)), vc2 = Math.sqrt(mu / r2);
    var dv1 = vp - vc1, dv2 = vc2 - va, tof = Math.PI * Math.sqrt(a * a * a / mu);
    var D = [3.4, 7.2, 3.4, 1.8], TOTAL = D[0] + D[1] + D[2] + D[3];
    var trail = [], lastCycle = -1, st = { phase: 'Parking orbit', alt: 0, v: vc1 };
    var cx = 0, cy = 0, k = 1, phi0 = dir > 0 ? Math.PI : 0;

    function kepler(M) { var E = M, i; for (i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); return E; }
    function nuOf(E) { return 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)); }
    function rOf(nu) { return a * (1 - e * e) / (1 + e * Math.cos(nu)); }
    function P(r, ang) { return [cx + Math.cos(phi0 + ang) * r * k, cy - Math.sin(phi0 + ang) * r * k]; }

    function init(w, h) {
      var lay = U.layout(w, h, side, opts.panel);
      if (lay.panel) { cx = w * 0.5; cy = h * 0.5; k = Math.min(w * 0.44, h * 0.47) / r2; }
      else if (lay.compact) { cx = w * 0.5; cy = h * 0.7; k = (w * 0.46) / r2; }
      else { cx = w * (side > 0 ? 0.6 : 0.4); cy = h * 0.52; k = (side > 0 ? w * 0.96 - cx : cx - w * 0.04) / r2; }
      trail = []; lastCycle = -1;
    }

    function draw(ctx, w, h, t, dt, m) {
      var T = t % TOTAL, cyc = Math.floor(t / TOTAL), i, pos, ang = 0, r = r1, phase;
      if (cyc !== lastCycle) { trail = []; lastCycle = cyc; }
      var fade = 1;
      if (T < D[0]) { phase = 0; ang = TAU * (T / D[0]); r = r1; st.phase = 'Parking orbit'; st.v = vc1; }
      else if (T < D[0] + D[1]) {
        var p1 = (T - D[0]) / D[1]; var E = kepler(Math.PI * p1); ang = nuOf(E); r = rOf(ang);
        st.phase = 'Transfer ellipse'; st.v = Math.sqrt(mu * (2 / r - 1 / a));
      } else if (T < D[0] + D[1] + D[2]) {
        var p2 = (T - D[0] - D[1]) / D[2]; ang = Math.PI + TAU * 0.85 * p2; r = r2; st.phase = 'Target orbit'; st.v = vc2;
      } else { var p3 = (T - D[0] - D[1] - D[2]) / D[3]; ang = Math.PI + TAU * 0.85; r = r2; fade = 1 - p3; st.phase = 'Target orbit'; st.v = vc2; }
      st.alt = r - RE;
      pos = P(r, ang);
      if (dt > 0 && T < D[0] + D[1] + D[2]) trail.push(pos[0], pos[1]);

      /* Earth seen from the north pole: latitude rings + meridians */
      var er = RE * k;
      var eg = ctx.createRadialGradient(cx - er * 0.3, cy - er * 0.3, er * 0.1, cx, cy, er);
      eg.addColorStop(0, 'rgba(120,122,128,0.5)'); eg.addColorStop(1, 'rgba(18,19,21,0.96)');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(cx, cy, er, 0, TAU); ctx.fill();
      ctx.strokeStyle = W(0.14); ctx.lineWidth = 1; ctx.beginPath();
      [0.34, 0.67].forEach(function (f) { ctx.moveTo(cx + er * f, cy); ctx.arc(cx, cy, er * f, 0, TAU); });
      for (i = 0; i < 12; i++) { var aa = (i / 12) * TAU; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(aa) * er, cy + Math.sin(aa) * er); }
      ctx.stroke();
      ctx.strokeStyle = W(0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, er, 0, TAU); ctx.stroke();

      /* equal-area wedges on the transfer ellipse (Kepler's 2nd law) */
      var NW = 9, wi, s;
      for (wi = 0; wi < NW; wi++) {
        var M0 = (wi / NW) * Math.PI, M1 = ((wi + 1) / NW) * Math.PI;
        ctx.fillStyle = W(wi % 2 ? 0.07 : 0.035); ctx.beginPath(); ctx.moveTo(cx, cy);
        for (s = 0; s <= 14; s++) { var nu = nuOf(kepler(lerp(M0, M1, s / 14))), q = P(rOf(nu), nu); ctx.lineTo(q[0], q[1]); }
        ctx.closePath(); ctx.fill();
      }

      /* guide orbits */
      ctx.lineWidth = 1.2; ctx.strokeStyle = W(0.55); ctx.beginPath(); ctx.arc(cx, cy, r1 * k, 0, TAU); ctx.stroke();
      ctx.setLineDash([5, 7]); ctx.strokeStyle = W(0.28); ctx.beginPath(); ctx.arc(cx, cy, r2 * k, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = A(0.75); ctx.lineWidth = 1.3; ctx.beginPath();
      for (s = 0; s <= 120; s++) { var nu2 = (s / 120) * Math.PI, q2 = P(rOf(nu2), nu2); if (s === 0) ctx.moveTo(q2[0], q2[1]); else ctx.lineTo(q2[0], q2[1]); }
      ctx.stroke();
      ctx.setLineDash([3, 6]); ctx.strokeStyle = A(0.25); ctx.beginPath();
      for (s = 120; s <= 240; s++) { var nu3 = (s / 240) * TAU, q3 = P(rOf(nu3), nu3); if (s === 120) ctx.moveTo(q3[0], q3[1]); else ctx.lineTo(q3[0], q3[1]); }
      ctx.stroke(); ctx.setLineDash([]);

      /* burn markers */
      function burn(angB, rB, label, dv, flip) {
        var q = P(rB, angB);
        ctx.strokeStyle = A(1); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(q[0], q[1], 7, 0, TAU); ctx.stroke();
        ctx.fillStyle = A(1); ctx.beginPath(); ctx.arc(q[0], q[1], 2.2, 0, TAU); ctx.fill();
        var tx = q[0] + (flip ? -16 : 16), al = flip ? 'right' : 'left';
        U.text(ctx, label, tx, q[1] - 6, 10, A(1), al);
        U.text(ctx, '\u0394v ' + dv.toFixed(2) + ' km/s', tx, q[1] + 8, 9, W(0.6), al);
      }
      burn(0, r1, 'Burn 1', dv1, dir > 0);
      burn(Math.PI, r2, 'Burn 2', dv2, dir < 0);

      /* trail */
      var L = trail.length / 2;
      if (L > 2) {
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        var chunks = 6, c;
        for (c = 0; c < chunks; c++) {
          var f0 = Math.floor((c / chunks) * (L - 1)), f1 = Math.floor(((c + 1) / chunks) * (L - 1));
          ctx.strokeStyle = W((0.12 + 0.7 * (c + 1) / chunks) * fade); ctx.beginPath();
          for (i = f0; i <= f1; i++) { if (i === f0) ctx.moveTo(trail[2 * i], trail[2 * i + 1]); else ctx.lineTo(trail[2 * i], trail[2 * i + 1]); }
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }

      /* spacecraft + velocity vector */
      var nx = P(r, ang + 0.01), vx = nx[0] - pos[0], vy = nx[1] - pos[1], vl = Math.hypot(vx, vy) || 1;
      ctx.globalAlpha = fade;
      ctx.strokeStyle = A(1); ctx.fillStyle = A(1); ctx.lineWidth = 1.4;
      U.arrow(ctx, pos[0] + (vx / vl) * 9, pos[1] + (vy / vl) * 9, pos[0] + (vx / vl) * 46, pos[1] + (vy / vl) * 46, 6);
      ctx.fillStyle = '#fff'; ctx.fillRect(pos[0] - 3.5, pos[1] - 3.5, 7, 7);
      ctx.strokeStyle = W(0.5); ctx.beginPath(); ctx.arc(pos[0], pos[1], 11, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function hud() {
      var h_ = Math.floor(tof / 3600), mi = Math.round((tof % 3600) / 60);
      return [
        ['Phase', st.phase],
        ['Altitude', Math.round(st.alt).toLocaleString('en-US') + ' km'],
        ['Speed', st.v.toFixed(2) + ' km/s'],
        ['Total \u0394v', (dv1 + dv2).toFixed(2) + ' km/s'],
        ['Transfer time', h_ + ' h ' + mi + ' min']
      ];
    }
    return { init: init, draw: draw, hud: hud };
  };

  /* ======================================================================
     NOZZLE  (rocket bell nozzle, wireframe CAD with exhaust plume)
     ====================================================================== */
  V.nozzle = function (opts) {
    var side = opts.side || 1;
    var rc = 0.55, rt = 0.22, re = 0.95, zc = 0.7, zt = 1.2, ze = 2.7, zmid = 1.35;
    function prof(z) {
      if (z < zc) return rc;
      if (z < zt) return lerp(rc, rt, smooth((z - zc) / (zt - zc)));
      var u = (z - zt) / (ze - zt); return rt + (re - rt) * (1 - Math.pow(1 - u, 2.2));
    }
    var rings = [], zi;
    for (zi = 0; zi <= 27; zi++) rings.push(zi * 0.1);        // 0.0 .. 2.7
    var NR = 56, NLg = 36, rnd = U.rng(5), plume = [], i;
    for (i = 0; i < 130; i++) plume.push({ ph: rnd() * TAU, rr: Math.sqrt(rnd()), o: rnd() });
    var eps = (re * re) / (rt * rt);

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, side, opts.panel), pxm = lay.compact ? w * 0.24 : lay.s * 0.3;
      var cx = lay.cx, cy = lay.cy - (lay.compact ? 0 : h * 0.08);
      var yaw = t * 0.22 + m.nx * 0.5, pitch = 0.3 + m.ny * 0.1, roll = side > 0 ? -0.34 : 0.34;
      var cam = U.camera(yaw, pitch, 9), cr = Math.cos(roll), sr = Math.sin(roll);
      function P3(x, y, z) {
        var rx = x * cr - y * sr, ry = x * sr + y * cr;           // roll about the view axis
        var p = cam(rx, ry, z); return { x: cx + p.x * pxm, y: cy - p.y * pxm, z: p.z };
      }
      function wp(z, ang, rr) { return P3(rr * Math.cos(ang), zmid - z, rr * Math.sin(ang)); }

      var ang, r, p, q, k;
      /* longitudinal lines */
      for (k = 0; k < NLg; k++) {
        ang = (k / NLg) * TAU; ctx.beginPath();
        var zs = 0, zn = 0, mz = 0;
        for (i = 0; i < rings.length; i++) {
          p = wp(rings[i], ang, prof(rings[i])); mz += p.z; zn++;
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        zs = mz / zn;
        ctx.strokeStyle = W(clamp(0.2 + zs * 0.55, 0.06, 0.62)); ctx.lineWidth = 1; ctx.stroke();
      }
      /* rings */
      for (i = 0; i < rings.length; i++) {
        r = prof(rings[i]); ctx.beginPath();
        var back = [], front = [];
        for (k = 0; k <= NR; k++) { ang = (k / NR) * TAU; p = wp(rings[i], ang, r); (p.z >= 0 ? front : back).push(p); }
        ctx.strokeStyle = W(0.14); ctx.lineWidth = 1; ctx.beginPath();
        for (k = 0; k <= NR; k++) { ang = (k / NR) * TAU; p = wp(rings[i], ang, r); if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.stroke();
        ctx.strokeStyle = W(i % 5 === 0 ? 0.75 : 0.42); ctx.lineWidth = i % 5 === 0 ? 1.3 : 1; ctx.beginPath();
        var pen = false;
        for (k = 0; k <= NR; k++) {
          ang = (k / NR) * TAU; p = wp(rings[i], ang, r);
          if (p.z < 0) { pen = false; continue; }
          if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      /* injector plate */
      [0.18, 0.34, 0.5].forEach(function (rr) {
        ctx.strokeStyle = W(0.35); ctx.lineWidth = 1; ctx.beginPath();
        for (k = 0; k <= NR; k++) { ang = (k / NR) * TAU; p = wp(0, ang, rr); if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
        ctx.stroke();
      });
      ctx.strokeStyle = W(0.22); ctx.beginPath();
      for (k = 0; k < 12; k++) { ang = (k / 12) * TAU; p = wp(0, ang, 0.05); q = wp(0, ang, rc); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
      ctx.stroke();

      /* throat ring, highlighted */
      ctx.strokeStyle = A(0.95); ctx.lineWidth = 1.6; ctx.beginPath();
      for (k = 0; k <= NR; k++) { ang = (k / NR) * TAU; p = wp(zt, ang, rt); if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();

      /* exhaust plume */
      ctx.fillStyle = '#fff';
      for (i = 0; i < plume.length; i++) {
        var pl = plume[i], s = (t * 0.55 + pl.o) % 1, zz = ze + s * 1.5, rr = re * (0.55 + 0.55 * s) * pl.rr;
        p = wp(zz, pl.ph + t * 0.3, rr);
        var a_ = (1 - s) * 0.85;
        ctx.globalAlpha = a_ * (p.z < 0 ? 0.35 : 0.9);
        ctx.fillStyle = s < 0.35 ? '#fff' : 'rgb(255,150,100)';
        ctx.fillRect(p.x - 1, p.y - 1, 2.2, 2.2);
      }
      ctx.globalAlpha = 1;

      /* callouts */
      var thr = wp(zt, 0.0, rt), ex = wp(ze, 0.0, re), ths = P3(rt * Math.cos(0), zmid - zt, 0);
      function callout(pt, label, val, dx_, dy_, col) {
        var x2 = pt.x + dx_, y2 = pt.y + dy_;
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(x2, y2); ctx.lineTo(x2 + 36 * Math.sign(dx_), y2); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, TAU); ctx.fill();
        var al = dx_ > 0 ? 'left' : 'right', tx = x2 + 44 * Math.sign(dx_);
        U.text(ctx, label, tx, y2 + 3, 10, col === A(1) ? A(1) : W(0.9), al);
        U.text(ctx, val, tx, y2 + 16, 9, W(0.5), al);
      }
      var dirx = side > 0 ? 1 : -1;
      callout(thr, 'Throat', 'r = ' + rt.toFixed(2) + ' u', dirx * 70, -48, A(1));
      callout(ex, 'Exit', 'r = ' + re.toFixed(2) + ' u', dirx * 60, 34, W(0.7));
      var cp = wp(0.35, 0, rc);
      callout(cp, 'Chamber', 'r = ' + rc.toFixed(2) + ' u', dirx * 80, -40, W(0.7));
    }

    function hud() { return [['Area ratio \u03b5', eps.toFixed(1)], ['Contour rings', String(rings.length)]]; }
    return { draw: draw, hud: hud };
  };

})(typeof window !== 'undefined' ? window : globalThis);
