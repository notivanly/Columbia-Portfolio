/* ==========================================================================
   scenes-structures.js
   Scenes 0 to 3: Home, Bridge, Wind tunnel, Truss.

   A scene is a factory returning { init(V), advance(dt, m), draw(ctx, V, o), ... }.
   V is the view (see PF.makeView). o carries what a transition needs to change:
   a camera pose, an explode amount, an opacity. A scene never knows about
   scrolling; the film (film.js) decides what to draw and where the camera is.

   The calculations are the ones from the original previews, unchanged:
   the method-of-joints solver (core.js), the simply supported beam deflection,
   and potential flow around a Joukowski airfoil.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var W = U.W, A = U.A, R = U.R, M = G.MAT;

  /* ======================================================================
     BRIDGE MODEL  (3D Warren truss; real member forces for a moving load)
     Shared by the Home scene (parts exploded) and the Bridge scene (assembled).
     ====================================================================== */
  function BridgeModel() {
    var n = 8, L = 16, H = 2.6, Wd = 3.6, P = 40;                 // panels, span m, depth m, width m, vehicle kN
    var T = U.warren(n, L, H), dx = L / n;
    var loads = new Float64Array(T.nodes.length * 2);
    var st = { a: -2, forces: null, maxT: 0, maxC: 0, sx0: null, sxn: null };
    var Fref = 32, batch = new G.Batch(), mid = { x: 0, y: 0 };

    function green(x, a) {                                         // simply supported beam, normalised to midspan
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
    solve(st.a);

    /* Camera poses. Both are computed from the free area of the view. */
    function settled(V) {
      var fr = V.free, yaw = -0.5, pitch = 0.24, dist = 42;
      var pxm = Math.min(fr.w * 0.95 / ((L + 6.4) * Math.cos(-yaw) + (Wd + 1) * Math.sin(-yaw)), fr.h / 5.6);
      return { tx: L / 2, ty: -0.6, tz: 0, yaw: yaw, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx - fr.w * 0.03, cy: fr.cy - fr.h * 0.02, roll: 0 };
    }
    function wide(V) {                                              // the establishing shot used by Home
      var fr = V.free, yaw = -0.5, pitch = 0.27, dist = 70;
      var pxm = Math.min(fr.w * 1.06 / ((L + 13) * Math.cos(-yaw) + 11 * Math.sin(-yaw)), fr.h / 7);
      return { tx: L / 2, ty: 0.9, tz: 0, yaw: yaw, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx + fr.w * 0.035, cy: fr.cy + fr.h * 0.03, roll: 0 };
    }

    function advance(dt, m) {
      if (m && m.active > 0.6 && st.sx0 != null && st.sxn > st.sx0 + 10) {
        var target = clamp(L * (m.rx - st.sx0) / (st.sxn - st.sx0), -1, L + 1);
        st.a += (target - st.a) * Math.min(1, dt * 6);
      } else { st.a += 1.9 * dt; if (st.a > L + 3) st.a = -3; }
      solve(st.a);
    }

    /* o: { pose, ex (explode, number or function of x/L), flow, t } */
    function draw(ctx, V, o) {
      o = o || {};
      var t = V.t, pose = o.pose || settled(V), Pj = G.camera(pose), i, k, zs;
      var Ef = typeof o.ex === 'function' ? o.ex : function () { return o.ex || 0; };
      var a = st.a, onSpan = a >= 0 && a <= L, kd = smooth(Math.min(a, L - a) / 1.2);
      var cxm = L / 2, cym = H * 0.5;
      function dy(x, e) { return -0.5 * green(clamp(x, 0, L), clamp(a, 0, L)) * kd * (1 - e); }
      var nodes = T.nodes.map(function (nd) { return { x: nd.x, y: nd.y + dy(nd.x, Ef(nd.x / L)) }; });
      function bob(s, e) { return Math.sin(t * 0.7 + s * 1.9) * 0.09 * e; }
      function joint(i_, z_) {
        var nd = nodes[i_], e = Ef(nd.x / L), ddx = nd.x - cxm, ddy = nd.y - cym, l = Math.hypot(ddx, ddy) || 1;
        return [nd.x + ddx / l * 2.3 * e, nd.y + ddy / l * 2.3 * e + bob(i_, e), z_ * (Wd / 2 + 2.4 * e)];
      }
      function ends(k_, z_) {
        var mb = T.members[k_], A_ = nodes[mb[0]], B_ = nodes[mb[1]], mx = (A_.x + B_.x) / 2, my = (A_.y + B_.y) / 2, e = Ef(mx / L);
        var ddx = mx - cxm, ddy = my - cym, l = Math.hypot(ddx, ddy) || 1, ox = ddx / l * 1.5 * e, oy = ddy / l * 1.5 * e + bob(k_ + 20, e), s = 0.13 * e, zz = z_ * (Wd / 2 + 2.4 * e);
        return [[lerp(A_.x, mx, s) + ox, lerp(A_.y, my, s) + oy, zz], [lerp(B_.x, mx, s) + ox, lerp(B_.y, my, s) + oy, zz]];
      }

      /* ---- sky, ground, water, grid ---- */
      var gy = -3.2, hy = G.sky(ctx, V.w, V.h, Pj, [13, 14, 16], [38, 44, 52], [22, 24, 27]);
      G.glow(ctx, pose.cx, Math.max(40, hy - pose.f * 0.0 + 30), V.w * 0.55, [120, 160, 200], o.ex ? 0.10 : 0.12);
      G.grid(ctx, Pj, gy, -34, L + 34, -40, 20, 3, [180, 190, 200], 0.16, pose.dist * 0.5, pose.dist * 1.9);
      // a river runs under the span: a low, dark plane with slow specular streaks
      var wy = -2.55, wq = [[0.5, wy, -400], [L - 0.5, wy, -400], [L - 0.5, wy, 20], [0.5, wy, 20]].map(function (c) { return Pj(c[0], c[1], c[2]); });
      if (wq.every(function (p) { return p.ok; })) {
        var wg = ctx.createLinearGradient(0, hy, 0, V.h);
        wg.addColorStop(0, 'rgb(30,42,54)'); wg.addColorStop(1, 'rgb(16,25,34)');
        ctx.fillStyle = wg; ctx.beginPath(); ctx.moveTo(wq[0].x, wq[0].y);
        for (i = 1; i < 4; i++) ctx.lineTo(wq[i].x, wq[i].y);
        ctx.closePath(); ctx.fill();
        ctx.lineCap = 'round';
        for (k = 0; k < 22; k++) {
          var zz = -26 + k * 1.9, x0 = 1.5 + ((k * 5.3 + t * 0.9) % (L - 4)), p0 = Pj(x0, wy, zz), p1 = Pj(x0 + 1.6 + (k % 3), wy, zz);
          if (!p0.ok || !p1.ok) continue;
          ctx.strokeStyle = 'rgba(142,201,255,' + (0.10 + 0.07 * ((k * 7) % 3)).toFixed(3) + ')'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
      // the screen position of the span, used to let the pointer place the vehicle
      var s0 = Pj(0, 0, 0), sn = Pj(L, 0, 0); st.sx0 = s0.x; st.sxn = sn.x;

      /* ---- abutments ---- */
      var eL = Ef(0), eR = Ef(1);
      G.box(batch, Pj, -3.4 - 3 * eL, 0.5 - 3 * eL, gy, -0.32, -Wd / 2 - 0.6, Wd / 2 + 0.6, M.concrete, { k: 0.78 });
      G.box(batch, Pj, L - 0.5 + 3 * eR, L + 3.4 + 3 * eR, gy, -0.32, -Wd / 2 - 0.6, Wd / 2 + 0.6, M.concrete, { k: 0.78 });

      /* ---- deck ---- */
      for (i = 0; i < n; i++) {
        var e = Ef((nodes[i].x + nodes[i + 1].x) / 2 / L), yo = -1.9 * e + bob(i + 40, e), zw = Wd / 2 + 0.12;
        var y0 = nodes[i].y + yo, y1 = nodes[i + 1].y + yo, th = 0.34;
        G.hexa(batch, Pj, [[nodes[i].x, y0 - th, -zw], [nodes[i + 1].x, y1 - th, -zw], [nodes[i + 1].x, y1, -zw], [nodes[i].x, y0, -zw],
          [nodes[i].x, y0 - th, zw], [nodes[i + 1].x, y1 - th, zw], [nodes[i + 1].x, y1, zw], [nodes[i].x, y0, zw]], [128, 124, 118], { top: [52, 55, 60], k: 0.9 });
        if (Pj.eye[1] > y0) {                                       // lane marking, only when seen from above
          var d0 = Pj(nodes[i].x + dx * 0.22, y0 + (y1 - y0) * 0.22 + 0.01, 0), d1 = Pj(nodes[i].x + dx * 0.62, y0 + (y1 - y0) * 0.62 + 0.01, 0);
          if (d0.ok && d1.ok) batch.add((d0.d + d1.d) / 2 - 0.04, (function (p, q_) { return function (c) { c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = Math.max(1, 0.07 * p.k * 2); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q_.x, q_.y); c.stroke(); }; })(d0, d1));
        }
      }

      /* ---- cross ties between the two trusses ---- */
      var tieCol = M.darkSteel;
      for (i = 0; i <= n; i++) { var ja = joint(i, -1), jb = joint(i, 1); G.tube(batch, Pj(ja[0], ja[1], ja[2]), Pj(jb[0], jb[1], jb[2]), 0.035, tieCol, { bias: 0.2 }); }
      for (i = 0; i < n; i++) { var ta = joint(n + 1 + i, -1), tb = joint(n + 1 + i, 1); G.tube(batch, Pj(ta[0], ta[1], ta[2]), Pj(tb[0], tb[1], tb[2]), 0.035, tieCol, { bias: 0.2 }); }

      /* ---- members, coloured by force; compression is also drawn as broken bars ---- */
      var memberScreen = null;
      for (zs = -1; zs <= 1; zs += 2) {
        for (k = 0; k < T.members.length; k++) {
          var en = ends(k, zs), p0 = Pj(en[0][0], en[0][1], en[0][2]), p1 = Pj(en[1][0], en[1][1], en[1][2]);
          var f = st.forces[k] / Fref, af = Math.min(1, Math.abs(f)), rw = 0.045 + 0.06 * af, col, dash = null;
          if (f > 0.015) col = [188, 198, 210]; else if (f < -0.015) { col = [236, 146, 112]; dash = [7, 5]; } else col = [104, 112, 122];
          G.tube(batch, p0, p1, rw, col, { dash: dash });
          // assembly guides: where each end of a member will dock into its joint
          var e0 = Ef((nodes[T.members[k][0]].x + nodes[T.members[k][1]].x) / 2 / L);
          if (e0 > 0.04) {
            [[0, T.members[k][0]], [1, T.members[k][1]]].forEach(function (pr) {
              var jj = joint(pr[1], zs), pj = Pj(jj[0], jj[1], jj[2]), pe = pr[0] ? p1 : p0;
              if (!pj.ok || !pe.ok) return;
              batch.add((pj.d + pe.d) / 2 + 0.6, function (c) { c.setLineDash([3, 5]); c.strokeStyle = 'rgba(142,201,255,' + (0.4 * Math.min(1, e0 * 2.5)).toFixed(3) + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(pe.x, pe.y); c.lineTo(pj.x, pj.y); c.stroke(); c.setLineDash([]); });
            });
          }
        }
        for (i = 0; i < nodes.length; i++) {
          var jp = joint(i, zs), pq = Pj(jp[0], jp[1], jp[2]);
          if (pq.ok) (function (pp) { batch.add(pp.d - 0.15, function (c) { G.ball(c, pp.x, pp.y, Math.max(2.2, 0.15 * pp.k), [176, 186, 198], { rim: 0.12, lo: 0.3 }); }); })(pq);
        }
      }
      // keep the screen position of one bottom-chord member of the near truss for the transition camera
      mid.k = 3;

      /* ---- vehicle ---- */
      var ev = Ef(0.5), vxp = lerp(a, L * 0.5, ev), vy = dy(clamp(a, 0, L), ev) + 0.14 + 3.6 * ev + bob(77, ev) * 3, vl = 1.3, vw = 0.75, vh = 0.55;
      var vcol = [118, 184, 242];
      G.box(batch, Pj, vxp - vl, vxp + vl, vy, vy + vh, -vw, vw, vcol, { k: 1 });
      G.box(batch, Pj, vxp - 0.15, vxp + 1.0, vy + vh, vy + vh + 0.5, -vw * 0.86, vw * 0.86, [210, 232, 250], { k: 0.9 });
      [-0.85, 0.85].forEach(function (wx) {
        var wp = Pj(vxp + wx, vy + 0.02, vw + 0.01);
        if (wp.ok) batch.add(wp.d - 0.1, function (c) { c.fillStyle = 'rgb(16,17,19)'; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.arc(wp.x, wp.y, Math.max(2, 0.26 * wp.k), 0, TAU); c.fill(); c.stroke(); });
      });
      if (onSpan && ev < 0.4) {
        var ta_ = Pj(vxp, vy + vh + 0.8, 0), tb_ = Pj(vxp, vy + vh + 3.2, 0);
        if (ta_.ok && tb_.ok) batch.add(0.1, function (c) { c.strokeStyle = A(0.9 * (1 - ev * 2.5)); c.fillStyle = A(0.9 * (1 - ev * 2.5)); c.lineWidth = 1.6; U.arrow(c, tb_.x, tb_.y, ta_.x, ta_.y, 7); });
      }
      batch.flush(ctx);
    }

    /* world position of the middle bottom-chord member on the near truss (the camera target for the Wind transition) */
    function chordMember() { var mb = T.members[3]; return { x: (T.nodes[mb[0]].x + T.nodes[mb[1]].x) / 2, y: 0, z: Wd / 2, force: st.forces[3] / Fref }; }

    return { draw: draw, advance: advance, settled: settled, wide: wide, chord: chordMember, geom: { n: n, L: L, H: H, Wd: Wd, T: T }, st: st };
  }
  PF.BridgeModel = BridgeModel;

  /* ---------- Home: the exploded bridge in a wide establishing shot ---------- */
  S.home = function (opts) {
    var model = (opts && opts.model) || BridgeModel();
    return {
      id: 'home', sim: model, model: model, side: 1, textFrac: 0.34,
      init: function () {},
      advance: function (dt, m) { model.advance(dt, m); },
      draw: function (ctx, V, o) {
        o = o || {};
        model.draw(ctx, V, { pose: o.pose || model.wide(V), ex: o.ex == null ? 1 : o.ex });
      }
    };
  };

  /* ---------- Bridge ---------- */
  S.bridge = function (opts) {
    var model = (opts && opts.model) || BridgeModel();
    return {
      id: 'bridge', sim: model, model: model, side: -1,
      init: function () {},
      advance: function (dt, m) { model.advance(dt, m); },
      draw: function (ctx, V, o) { o = o || {}; model.draw(ctx, V, { pose: o.pose, ex: o.ex || 0 }); }
    };
  };

  /* ======================================================================
     WIND TUNNEL  (potential flow around a Joukowski airfoil, shown as a solid wing)
     The flow maths (vel, gamma, step) is the original, now in world units:
     the display plane is x (flow) and y, and z runs along the wing.
     ====================================================================== */
  S.wind = function () {
    var c = 1, eps = 0.09, del = 0.06;                          // Joukowski parameters
    var z0x = -eps, z0y = del, ra = Math.hypot(c + eps, del), beta = Math.asin(del / ra);
    var UREF = 2.4, chord = 4.1, SW = 1.5;                       // free stream (units/s), wing half-span
    var st = { alpha: 6, cl: 1, parts: [], lanes: [], X0: -8, X1: 8, Ytop: 2.05, Ybot: -2.05, cap: null, focus: null, qc: [0, 0] };
    var tmp = { x: 0, y: 0, d: 0, k: 0, ok: true }, tmp2 = { x: 0, y: 0, d: 0, k: 0, ok: true };

    (function () {                                               // chord, measured from the outline
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
      var zx = X * ca - Y * sa, zy = X * sa + Y * ca;
      var z2x = zx * zx - zy * zy - 4 * c * c, z2y = 2 * zx * zy, mod = Math.hypot(z2x, z2y);
      var sx = Math.sqrt((mod + z2x) / 2), sy = Math.sqrt(Math.max(0, (mod - z2x) / 2)); if (z2y < 0) sy = -sy;
      var r1x = (zx + sx) / 2, r1y = (zy + sy) / 2, r2x = (zx - sx) / 2, r2y = (zy - sy) / 2;
      var d1 = Math.hypot(r1x - z0x, r1y - z0y), d2 = Math.hypot(r2x - z0x, r2y - z0y), zex, zey, d;
      if (d1 >= d2) { zex = r1x; zey = r1y; d = d1; } else { zex = r2x; zey = r2y; d = d2; }
      if (d < ra) return false;
      var qx = zex - z0x, qy = zey - z0y, q2 = qx * qx + qy * qy;
      var q2x = qx * qx - qy * qy, q2y = 2 * qx * qy, qq = q2x * q2x + q2y * q2y;
      var t2r = ra * ra * (ca * q2x + sa * q2y) / qq, t2i = ra * ra * (sa * q2x - ca * q2y) / qq;
      var wr = ca - t2r + (Gam / (TAU * q2)) * qy, wi = -sa - t2i + (Gam / (TAU * q2)) * qx;
      var e2x = zex * zex - zey * zey, e2y = 2 * zex * zey, ee = e2x * e2x + e2y * e2y;
      var jr = 1 - c * c * e2x / ee, ji = c * c * e2y / ee, jj = jr * jr + ji * ji;
      if (jj < 1e-6) { out.x = 1; out.y = 0; out.q = 1; return true; }
      var Wr = (wr * jr + wi * ji) / jj, Wi = (wi * jr - wr * ji) / jj;
      var u = Wr, v = -Wi, vx = u * ca + v * sa, vy = -u * sa + v * ca;
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
        p.trail.push(p.x, p.y); if (p.trail.length > 40) p.trail.splice(0, 2);
        if (p.x > st.X1 || p.y > st.Ytop + 0.5 || p.y < st.Ybot - 0.5) st.parts.splice(i, 1);
      }
    }
    function init(V) {
      st.lanes = []; st.parts = [];
      var y, i = 0, sp = V && V.lod ? 0.3 : 0.21;
      for (y = st.Ybot + 0.1; y < st.Ytop - 0.05; y += sp) { st.lanes.push({ y: y, t: (i * 0.137) % 0.42 }); i++; }
      for (i = 0; i < 260; i++) step(1 / 30, st.alpha * Math.PI / 180);   // warm-up so the flow is already developed
    }
    function settled(V) {
      var fr = V.free, yaw = 0.3, pitch = 0.13, dist = 26, pxm = Math.min(fr.w * 0.64 / 4.1, fr.h * 0.97 / 4.5);
      return { tx: 0.35, ty: -0.05, tz: 0, yaw: yaw, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.cy, roll: 0 };
    }
    function advance(dt, m) {
      var t = advance.t = (advance.t || 0) + dt;
      var auto = 6 + 5.5 * Math.sin(t * 0.4), mouseA = lerp(13, -2, clamp(m ? m.y : 0.5, 0, 1));
      st.alpha = lerp(auto, mouseA, m ? m.active : 0);
      var alpha = st.alpha * Math.PI / 180;
      st.cl = 2 * gamma(alpha) / chord;
      step(Math.min(dt, 0.05), alpha);
    }

    /* o: { pose, flow (0..1 opacity of the streamlines), alphaDeg (override angle), walls (0..1) } */
    function draw(ctx, V, o) {
      o = o || {};
      var t = V.t, pose = o.pose || settled(V), P = G.camera(pose), i, k;
      var alphaDeg = o.alphaDeg == null ? st.alpha : o.alphaDeg, alpha = alphaDeg * Math.PI / 180, ca = Math.cos(alpha), sa = Math.sin(alpha);
      var X0 = st.X0, X1 = st.X1, Yt = st.Ytop, Yb = st.Ybot, flow = o.flow == null ? 1 : o.flow, wl = o.walls == null ? 1 : o.walls;
      var batch = new G.Batch();

      /* lab backdrop: cool light behind the wing */
      ctx.fillStyle = 'rgb(11,15,19)'; ctx.fillRect(0, 0, V.w, V.h);
      var cp = P(0, 0, -SW); G.glow(ctx, cp.x, cp.y, Math.max(V.w, V.h) * 0.5, [90, 140, 190], 0.2 * wl + 0.05);

      /* back wall, floor, glass roof */
      function quad(pts, fill, edge, lw) {
        var pp = pts.map(function (q) { return P(q[0], q[1], q[2]); });
        for (var j = 0; j < pp.length; j++) if (!pp[j].ok) return;
        ctx.beginPath(); ctx.moveTo(pp[0].x, pp[0].y); for (var j2 = 1; j2 < pp.length; j2++) ctx.lineTo(pp[j2].x, pp[j2].y); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = lw || 1; ctx.stroke(); }
      }
      var bw = P(0, Yb, -SW), bt = P(0, Yt, -SW), wg = ctx.createLinearGradient(0, bt.y, 0, bw.y);
      wg.addColorStop(0, 'rgba(34,48,62,' + (0.95 * wl) + ')'); wg.addColorStop(1, 'rgba(18,26,34,' + (0.95 * wl) + ')');
      quad([[X0, Yb, -SW], [X1, Yb, -SW], [X1, Yt, -SW], [X0, Yt, -SW]], wg);
      if (wl > 0.02) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.05 * wl) + ')'; ctx.lineWidth = 1; ctx.beginPath();
        for (k = X0; k <= X1; k += 2) { var a1 = P(k, Yb, -SW), a2 = P(k, Yt, -SW); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); }
        ctx.stroke();
      }
      quad([[X0, Yb, -SW], [X1, Yb, -SW], [X1, Yb, SW + 5], [X0, Yb, SW + 5]], 'rgba(18,25,32,' + wl + ')');
      if (wl > 0.02) G.grid(ctx, P, Yb, X0, X1, -SW, SW + 5, 1, [150, 190, 220], 0.1 * wl, pose.dist * 0.7, pose.dist * 1.5);
      var fa = P(X0, Yb, SW), fb = P(X1, Yb, SW);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.28 * wl) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fa.x, fa.y); ctx.lineTo(fb.x, fb.y); ctx.stroke();
      // glass roof and the long tunnel edges: faint tint, bright edges, ticks that slide with the flow
      quad([[X0, Yt, -SW], [X1, Yt, -SW], [X1, Yt, SW], [X0, Yt, SW]], 'rgba(150,190,220,' + (0.07 * wl) + ')', 'rgba(220,240,255,' + (0.42 * wl) + ')', 1.4);
      quad([[X0, Yb, -SW], [X1, Yb, -SW], [X1, Yb, SW], [X0, Yb, SW]], null, 'rgba(220,240,255,' + (0.3 * wl) + ')', 1.2);
      if (wl > 0.02) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.2 * wl) + ')'; ctx.beginPath();
        var off = (t * 0.9) % 1.2;
        for (k = X0 - 1.2 + off; k < X1; k += 1.2) { var r1 = P(k, Yt, SW), r2 = P(k - 0.22, Yt - 0.2, SW), r3 = P(k, Yb, SW), r4 = P(k - 0.22, Yb + 0.2, SW); ctx.moveTo(r1.x, r1.y); ctx.lineTo(r2.x, r2.y); ctx.moveTo(r3.x, r3.y); ctx.lineTo(r4.x, r4.y); }
        ctx.stroke();
        // front posts of the glass wall
        ctx.strokeStyle = 'rgba(220,240,255,' + (0.16 * wl) + ')'; ctx.beginPath();
        for (k = Math.ceil(X0 / 4) * 4; k <= X1; k += 4) { var s1 = P(k, Yb, SW), s2 = P(k, Yt, SW); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); }
        ctx.stroke();
      }

      /* streamlines, in two planes behind the wing: the middle of the wing and a dimmer one toward the back wall */
      if (flow > 0.01) {
        ctx.lineCap = 'round';
        var planes = V.lod ? [0] : [-0.75, 0];
        for (var pi = 0; pi < planes.length; pi++) {
          var zp = planes[pi], pa = pi === planes.length - 1 ? 1 : 0.5;
          for (i = 0; i < st.parts.length; i++) {
            if (pi === 0 && planes.length > 1 && (i & 1)) continue;
            var p = st.parts[i], Ln = p.trail.length / 2; if (Ln < 3) continue;
            var tt = clamp((p.q - 0.95) / 0.85, 0, 1), col = 'rgba(' + Math.round(lerp(255, 142, tt)) + ',' + Math.round(lerp(255, 201, tt)) + ',255,';
            ctx.lineWidth = (0.9 + 1.6 * tt) * (pa < 1 ? 0.8 : 1) * Math.min(1.5, pose.f / 2600 + 0.5);
            for (var sg = 0; sg < 3; sg++) {
              var a0 = Math.floor((sg / 3) * (Ln - 1)), a1_ = Math.floor(((sg + 1) / 3) * (Ln - 1));
              ctx.strokeStyle = col + ((0.07 + sg * 0.13 + tt * 0.3) * pa * flow).toFixed(3) + ')';
              ctx.beginPath();
              for (var j = a0; j <= a1_; j++) { P(p.trail[2 * j], p.trail[2 * j + 1], zp, tmp); if (j === a0) ctx.moveTo(tmp.x, tmp.y); else ctx.lineTo(tmp.x, tmp.y); }
              ctx.stroke();
            }
          }
        }
        ctx.lineCap = 'butt';
      }

      /* the wing: an extruded Joukowski section, lit per strip with a specular sheen */
      var outl = [], K = V.lod ? 90 : 150, cx0 = 0, cy0 = 0;
      for (k = 0; k <= K; k++) {
        var th = (k / K) * TAU, zx = z0x + ra * Math.cos(th), zy = z0y + ra * Math.sin(th), d2 = zx * zx + zy * zy;
        var fx = zx + c * c * zx / d2, fy = zy - c * c * zy / d2;
        outl.push([fx * ca + fy * sa, -fx * sa + fy * ca]);                 // display plane
      }
      for (k = 0; k < K; k++) { cx0 += outl[k][0] / K; cy0 += outl[k][1] / K; }
      var wingCol = [78, 90, 106], e = P.eye;
      for (k = 0; k < K; k++) {
        var p0 = outl[k], p1 = outl[k + 1], ex = p1[0] - p0[0], ey = p1[1] - p0[1], el = Math.hypot(ex, ey) || 1, nx = ey / el, ny = -ex / el;
        if (nx * (p0[0] - cx0) + ny * (p0[1] - cy0) < 0) { nx = -nx; ny = -ny; }
        var mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
        var vx = e[0] - mx, vy = e[1] - my, vz = e[2], vl = Math.hypot(vx, vy, vz);
        if ((nx * vx + ny * vy) / vl < -0.02) continue;                    // faces away
        var lit = G.lambert(nx, ny, 0), hx = G.L[0] + vx / vl, hy = G.L[1] + vy / vl, hz = G.L[2] + vz / vl, hl = Math.hypot(hx, hy, hz) || 1;
        var sp = Math.pow(Math.max(0, (nx * hx + ny * hy) / hl), 22) * 0.9;
        var q0 = P(p0[0], p0[1], -SW), q1 = P(p1[0], p1[1], -SW), q2 = P(p1[0], p1[1], SW), q3 = P(p0[0], p0[1], SW);
        var fill = G.shade([wingCol[0] + 150 * sp, wingCol[1] + 150 * sp, wingCol[2] + 150 * sp], lit * 1.15);
        G.face(batch, [q0, q1, q2, q3], fill, fill, 1);
      }
      var cap = outl.map(function (q) { return P(q[0], q[1], SW); }), capOK = cap.every(function (q) { return q.ok; });
      st.cap = cap.map(function (q) { return [q.x, q.y]; });
      if (capOK) {
        var cd = cap[0].d - 0.01 - SW;                                      // the near end face is drawn after the strips
        batch.add(cd, function (cx_) {
          cx_.beginPath(); cx_.moveTo(cap[0].x, cap[0].y); for (var j3 = 1; j3 < cap.length; j3++) cx_.lineTo(cap[j3].x, cap[j3].y); cx_.closePath();
          var bb = P(0, 0, SW), gr = cx_.createLinearGradient(bb.x, bb.y - pose.f * 0.2, bb.x, bb.y + pose.f * 0.2);
          gr.addColorStop(0, 'rgb(132,146,162)'); gr.addColorStop(1, 'rgb(60,68,80)'); cx_.fillStyle = gr; cx_.fill();
          cx_.strokeStyle = 'rgba(142,201,255,0.75)'; cx_.lineWidth = 1.6; cx_.lineJoin = 'round'; cx_.stroke();
          // two spars hinted on the section face (lines from the lower to the upper surface)
          cx_.strokeStyle = 'rgba(10,14,18,0.35)'; cx_.lineWidth = 1.4; cx_.beginPath();
          [-0.55, 0.9].forEach(function (xc) {
            var up = null, lo = null, j4;
            for (j4 = 0; j4 < K; j4++) {
              var qa = outl[j4], qb = outl[j4 + 1];
              if ((qa[0] - xc) * (qb[0] - xc) <= 0 && qa[0] !== qb[0]) { var f_ = (xc - qa[0]) / (qb[0] - qa[0]), yy = qa[1] + f_ * (qb[1] - qa[1]); if (!up || yy > up) up = yy; if (!lo || yy < lo) lo = yy; }
            }
            if (up != null) { var u1 = P(xc, up, SW), l1 = P(xc, lo, SW); cx_.moveTo(u1.x, u1.y); cx_.lineTo(l1.x, l1.y); }
          });
          cx_.stroke();
        });
      }
      batch.flush(ctx);

      /* faint reflection of the near end face in the glossy floor */
      if (capOK && wl > 0.3) {
        ctx.save(); ctx.globalAlpha = 0.09 * wl; ctx.fillStyle = 'rgb(150,170,190)'; ctx.beginPath();
        for (k = 0; k < K; k++) { var rp = P(outl[k][0], 2 * Yb - outl[k][1], SW); if (k === 0) ctx.moveTo(rp.x, rp.y); else ctx.lineTo(rp.x, rp.y); }
        ctx.closePath(); ctx.fill(); ctx.restore();
      }

      /* anchors for the transitions: the top of the upper surface (middle of the span) and its tangent */
      var topK = 0, mids = outl.map(function (q) { return P(q[0], q[1], 0); });
      for (k = 1; k <= K; k++) if (mids[k].y < mids[topK].y) topK = k;
      var ta = mids[Math.max(0, topK - 3)], tb = mids[Math.min(K, topK + 3)], wang = Math.atan2(tb.y - ta.y, tb.x - ta.x);
      if (wang > Math.PI / 2) wang -= Math.PI; if (wang < -Math.PI / 2) wang += Math.PI;
      st.focus = { x: mids[topK].x, y: mids[topK].y, ang: wang };

      /* lift vector at the quarter chord, and the free-stream arrow */
      var qcw = [-1.1 * ca + 0 * sa, 1.1 * sa], qp = P(qcw[0], qcw[1], 0);
      if (o.vectors !== false && qp.ok) {
        var ll = clamp(st.cl * 0.3 * qp.k, -90, 200);
        ctx.strokeStyle = A(0.95 * flow); ctx.fillStyle = A(0.95 * flow); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(qp.x, qp.y, 4, 0, TAU); ctx.stroke();
        U.arrow(ctx, qp.x, qp.y - 10, qp.x, qp.y - 10 - ll, 8);
        U.text(ctx, 'L', qp.x + 11, qp.y - 10 - ll + 10, 11, A(flow));
        var fp = P(-6.2, Yt - 0.5, SW), fq = P(-5.2, Yt - 0.5, SW);
        if (fp.ok) { ctx.strokeStyle = W(0.6 * flow); ctx.fillStyle = W(0.6 * flow); ctx.lineWidth = 1.3; U.arrow(ctx, fp.x, fp.y, fq.x, fq.y, 7); U.text(ctx, 'U\u221e', fp.x, fp.y + 17, 10, W(0.55 * flow)); }
      }
    }

    return { init: init, advance: advance, draw: draw, settled: settled, side: 1, id: 'wind', sim: st, st: st, focus: function () { return st.focus; }, cap: function () { return st.cap; }, outline: function (alphaDeg) { return null; } };
  };


  /* ======================================================================
     TRUSS ANALYZER  (Pratt truss solved by the method of joints, drawn as a lit plate
     in front of a blueprint wall)
     ====================================================================== */
  S.truss = function () {
    var n = 6, L = 12, H = 3.6, P = 30, TH = 0.5;                  // panels, span m, depth m, load kN, bar thickness m
    var T = U.pratt(n, L, H), dx = L / n, names = 'ABCDEFGHIJKL';
    var loads = new Float64Array(T.nodes.length * 2);
    var st = { resid: 0, maxT: 0, maxC: 0, R0: 0, Rn: 0, forces: null, a: 3, sx0: null, sxn: null };
    var Fref = 32, tmp = {};

    function solveAt(a) {
      loads.fill(0);
      var bi = Math.min(n - 1, Math.floor(a / dx)), f = (a - bi * dx) / dx;
      loads[2 * bi + 1] = -P * (1 - f); loads[2 * (bi + 1) + 1] = -P * f;
      var sol = U.solveTruss(T.nodes, T.members, T.supports, loads), Rsum = 0, k, mx = 0, mn = 0;
      sol.reactions.forEach(function (r) { if (r.axis === 1) Rsum += r.value; });
      st.resid = Rsum - P;
      for (k = 0; k < sol.forces.length; k++) { mx = Math.max(mx, sol.forces[k]); mn = Math.min(mn, sol.forces[k]); }
      st.maxT = mx; st.maxC = mn; st.R0 = sol.reactions[1].value; st.Rn = sol.reactions[2].value; st.forces = sol.forces;
      return sol;
    }
    solveAt(st.a);

    function settled(V) {
      var fr = V.free, dist = 30, yaw = 0.22, pitch = 0.07, pxm = Math.min(fr.w * 0.84 / (L + 1.6), fr.h * 0.72 / (H + 4.2));
      return { tx: L / 2, ty: H / 2 - 0.9, tz: 0, yaw: yaw, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx, cy: fr.cy, roll: 0 };
    }
    // screen positions of the joints on the front face, for the Wind to Truss transition
    function nodesScreen(V, pose) {
      var Pj = G.camera(pose || settled(V));
      return T.nodes.map(function (nd) { var p = Pj(nd.x, nd.y, TH / 2); return [p.x, p.y]; });
    }

    function advance(dt, m) {
      var t = advance.t = (advance.t || 0) + dt, a = L * (0.5 - 0.5 * Math.cos(t * 0.45));
      if (m && m.active > 0.5 && st.sxn > st.sx0 + 10) a = clamp(L * (m.rx - st.sx0) / (st.sxn - st.sx0), 0, L);
      st.a = a; solveAt(a);
    }

    /* o: { pose, alpha (overall opacity of the plate, 0..1), parts (0..1 how much of the surrounding detail shows) } */
    function draw(ctx, V, o) {
      o = o || {};
      var pose = o.pose || settled(V), Pj = G.camera(pose), batch = new G.Batch(), i, k, plate = o.plate == null ? 1 : o.plate, parts = o.parts == null ? 1 : o.parts;
      var gz = -1.7;                                                 // the blueprint wall

      /* wall: paper tone, a 1 m grid with heavier lines every 5 m, and a soft light pool */
      ctx.fillStyle = 'rgb(11,17,24)'; ctx.fillRect(0, 0, V.w, V.h);
      var wc = Pj(L / 2, H / 2, gz); G.glow(ctx, wc.x, wc.y, Math.max(V.w, V.h) * 0.55, [70, 120, 170], 0.22 * plate + 0.04);
      var wq = [[-60, -40, gz], [L + 60, -40, gz], [L + 60, H + 40, gz], [-60, H + 40, gz]].map(function (c) { return Pj(c[0], c[1], c[2]); });
      if (wq.every(function (p) { return p.ok; })) {
        ctx.fillStyle = 'rgba(15,26,38,' + (0.9 * plate) + ')'; ctx.beginPath(); ctx.moveTo(wq[0].x, wq[0].y); for (i = 1; i < 4; i++) ctx.lineTo(wq[i].x, wq[i].y); ctx.closePath(); ctx.fill();
      }
      ctx.lineWidth = 1;
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? 'rgba(142,201,255,' + (0.2 * plate) + ')' : 'rgba(142,201,255,' + (0.08 * plate) + ')'; ctx.beginPath();
        var stp = pass ? 5 : 1, gx, gy;
        for (gx = -5; gx <= L + 5; gx += stp) if (pass || gx % 5) { var a0 = Pj(gx, -5, gz), a1 = Pj(gx, H + 5, gz); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); }
        for (gy = -5; gy <= H + 5; gy += stp) if (pass || gy % 5) { var b0 = Pj(-5, gy, gz), b1 = Pj(L + 5, gy, gz); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); }
        ctx.stroke();
      }
      var s0 = Pj(0, 0, TH / 2), sn = Pj(L, 0, TH / 2); st.sx0 = s0.x; st.sxn = sn.x;

      /* soft shadow of the bars on the wall (offset along the light) */
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0,0,0,' + (0.38 * plate) + ')';
      for (k = 0; k < T.members.length; k++) {
        var mb = T.members[k], na = T.nodes[mb[0]], nb = T.nodes[mb[1]], sa_ = Pj(na.x + 0.55, na.y - 0.45, gz + 0.02), sb_ = Pj(nb.x + 0.55, nb.y - 0.45, gz + 0.02);
        ctx.lineWidth = Math.max(2, 0.2 * sa_.k); ctx.beginPath(); ctx.moveTo(sa_.x, sa_.y); ctx.lineTo(sb_.x, sb_.y); ctx.stroke();
      }
      ctx.lineCap = 'butt';

      /* supports: a pin under joint A and a roller under joint G, each a solid wedge on a base plate */
      function support(xm, roller) {
        var y0 = -0.95, hw = 0.62;
        G.box(batch, Pj, xm - 1.15, xm + 1.15, y0 - 0.22, y0, -TH / 2 - 0.1, TH / 2 + 0.1, [96, 104, 114], { k: 0.9 });
        var tri = [Pj(xm, -0.12, TH / 2), Pj(xm - hw, y0, TH / 2), Pj(xm + hw, y0, TH / 2)], back = [Pj(xm, -0.12, -TH / 2), Pj(xm - hw, y0, -TH / 2), Pj(xm + hw, y0, -TH / 2)];
        G.face(batch, [back[0], back[1], tri[1], tri[0]], G.shade([150, 160, 172], 0.55), 'rgba(255,255,255,0.1)');
        G.face(batch, tri, G.shade([150, 160, 172], 1.0), 'rgba(255,255,255,0.35)');
        if (roller) [-0.28, 0.28].forEach(function (wx) { var wp = Pj(xm + wx, y0 + 0.1, TH / 2 + 0.05); batch.add(wp.d - 0.2, function (c) { G.ball(c, wp.x, wp.y, 0.14 * wp.k, [190, 198, 208], { rim: 0.1 }); }); });
        // ground hatching under the plate
        var h0 = Pj(xm - 1.3, y0 - 0.22, TH / 2 + 0.1), h1 = Pj(xm + 1.3, y0 - 0.22, TH / 2 + 0.1);
        batch.add(h0.d + 1, function (c) { c.strokeStyle = 'rgba(142,201,255,0.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(h0.x, h0.y); c.lineTo(h1.x, h1.y); for (var q = 0; q <= 6; q++) { var fx = h0.x + (h1.x - h0.x) * q / 6, fy = h0.y + (h1.y - h0.y) * q / 6; c.moveTo(fx, fy); c.lineTo(fx - 7, fy + 8); } c.stroke(); });
      }
      support(0, false); support(L, true);

      /* bars: flat steel sections lit per face; compression bars carry cross-hatching as well as the warm tint */
      var order = [];
      for (k = 0; k < T.members.length; k++) order.push(k);
      for (k = 0; k < order.length; k++) {
        var m_ = T.members[order[k]], A_ = T.nodes[m_[0]], B_ = T.nodes[m_[1]], f = st.forces[order[k]] / Fref, af = Math.min(1, Math.abs(f));
        var ex = B_.x - A_.x, ey = B_.y - A_.y, el = Math.hypot(ex, ey), nx = -ey / el, ny = ex / el, hw_ = (0.07 + 0.09 * af), z1 = TH / 2, z0 = -TH / 2;
        var col = f > 0.05 ? [178, 194, 214] : f < -0.05 ? [238, 150, 116] : [96, 108, 122];
        G.hexa(batch, Pj, [[A_.x - nx * hw_, A_.y - ny * hw_, z0], [B_.x - nx * hw_, B_.y - ny * hw_, z0], [B_.x + nx * hw_, B_.y + ny * hw_, z0], [A_.x + nx * hw_, A_.y + ny * hw_, z0],
          [A_.x - nx * hw_, A_.y - ny * hw_, z1], [B_.x - nx * hw_, B_.y - ny * hw_, z1], [B_.x + nx * hw_, B_.y + ny * hw_, z1], [A_.x + nx * hw_, A_.y + ny * hw_, z1]], col, { k: 1, edge: 'rgba(255,255,255,0.22)' });
        if (f < -0.05) {                                              // hatching across the compressed bar
          var pa = Pj(A_.x, A_.y, z1 + 0.01), pb = Pj(B_.x, B_.y, z1 + 0.01), hwp = hw_ * pa.k, dxp = pb.x - pa.x, dyp = pb.y - pa.y, lp = Math.hypot(dxp, dyp) || 1;
          batch.add((pa.d + pb.d) / 2 - 0.05, (function (a_, b_, hwp_, lp_, dxp_, dyp_) { return function (c) {
            var nn = Math.max(3, Math.floor(lp_ / 11)), q, px = -dyp_ / lp_, py = dxp_ / lp_;
            c.strokeStyle = 'rgba(20,10,6,0.55)'; c.lineWidth = 1.3; c.beginPath();
            for (q = 1; q < nn; q++) { var u = q / nn, cx_ = a_.x + (b_.x - a_.x) * u, cy_ = a_.y + (b_.y - a_.y) * u; c.moveTo(cx_ - px * hwp_, cy_ - py * hwp_); c.lineTo(cx_ + px * hwp_, cy_ + py * hwp_); }
            c.stroke(); }; })(pa, pb, hwp, lp, dxp, dyp));
        }
      }
      /* joints: steel pins on the front face */
      var jscr = [];
      T.nodes.forEach(function (nd, ix) {
        var p = Pj(nd.x, nd.y, TH / 2 + 0.04); jscr.push(p);
        batch.add(p.d - 0.3, function (c) { G.ball(c, p.x, p.y, Math.max(3, 0.2 * p.k), [200, 208, 218], { rim: 0.15, lo: 0.3 }); c.fillStyle = 'rgba(10,12,14,0.85)'; c.beginPath(); c.arc(p.x, p.y, Math.max(1.2, 0.07 * p.k), 0, TAU); c.fill(); });
      });
      batch.flush(ctx);
      st.joints = jscr;

      /* labels: tension (T) and compression (C), then joint names; letters, so it is not colour alone */
      if (parts > 0.05) {
        var cxm = L / 2, cym = H / 2;
        for (k = 0; k < T.members.length; k++) {
          var mm = T.members[k], pA = T.nodes[mm[0]], pB = T.nodes[mm[1]], ff = st.forces[k];
          if (Math.abs(ff) < 0.05) continue;
          var mxp = (pA.x + pB.x) / 2, myp = (pA.y + pB.y) / 2, ux = pB.x - pA.x, uy = pB.y - pA.y, ul = Math.hypot(ux, uy), nnx = -uy / ul, nny = ux / ul;
          if (nnx * (mxp - cxm) + nny * (myp - cym) < 0) { nnx = -nnx; nny = -nny; }
          var lp2 = Pj(mxp + nnx * 0.55, myp + nny * 0.55, TH / 2);
          if (lp2.ok) U.text(ctx, ff > 0 ? 'T' : 'C', lp2.x, lp2.y + 4, 11, (ff < 0 ? R(0.95) : W(0.8)) .replace(/[\d.]+\)$/, (parts * 0.95).toFixed(2) + ')'), 'center');
        }
        T.nodes.forEach(function (nd, ix) {
          var up = nd.y > 0.1, p = Pj(nd.x + (ix === 0 ? -0.5 : ix === n ? 0.5 : 0), nd.y + (up ? 0.5 : -0.5), TH / 2);
          if (p.ok) U.text(ctx, names.charAt(ix), p.x, p.y + 4, 10, 'rgba(255,255,255,' + (0.5 * parts).toFixed(2) + ')', 'center');
        });
        // reactions (upward, from below) and the applied load (downward, hanging from the bottom chord)
        ctx.lineWidth = 1.6;
        [[0, st.R0], [L, st.Rn]].forEach(function (r) {
          var p = Pj(r[0], -1.35, TH / 2), len = clamp(r[1] * 0.07 * p.k, 18, 70);
          ctx.strokeStyle = W(0.85 * parts); ctx.fillStyle = W(0.85 * parts); U.arrow(ctx, p.x, p.y + len, p.x, p.y + 3, 7);
        });
        var lq = Pj(st.a, 0, TH / 2 + 0.05);
        ctx.strokeStyle = A(parts); ctx.fillStyle = A(parts); ctx.lineWidth = 2; U.arrow(ctx, lq.x, lq.y + 6, lq.x, lq.y + 6 + 0.9 * lq.k + 30, 9);
        U.text(ctx, 'P', lq.x + 12, lq.y + 6 + 0.9 * lq.k + 36, 12, A(parts), 'left');
      }
    }

    return { init: function () {}, advance: advance, draw: draw, settled: settled, nodesScreen: nodesScreen, side: -1, id: 'truss', sim: st, st: st,
      geom: { n: n, L: L, H: H, T: T, TH: TH }, forces: function () { return st.forces; } };
  };

})(typeof window !== 'undefined' ? window : globalThis);
