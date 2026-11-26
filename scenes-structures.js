/* ==========================================================================
   scenes-structures.js
   Scenes 0 and 1: Home and the Bridge experiment.

   A scene is a factory returning { init(V), advance(dt, m), draw(ctx, V, o), input }.
   V is the view (see PF.makeView). o carries what a transition needs to change: a camera
   pose, an explode amount. A scene never knows about scrolling.

   The numbers on the Bridge come from PF.sim.bridge (sim-structures.js): the member
   forces from the method-of-joints solver in core.js, the joint movements from the
   stiffness solver. This file only draws them. The vehicle's suspension is drawn
   separately and is decorative; it has no effect on the forces.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var A = U.A, M = G.MAT, Sim = PF.sim.bridge;

  /* ======================================================================
     BRIDGE MODEL  (3D Warren truss; the response of the real solution)
     Shared by the Home scene (parts exploded) and the Bridge scene (assembled).
     ====================================================================== */
  function BridgeModel() {
    var n = Sim.n, L = Sim.L, H = Sim.H, Wd = Sim.Wd, T = Sim.T, dx = L / n;
    var st = { sx0: null, sxn: null, segs: [], vbox: null, P: null, susp: { y: 0, v: 0, p: 0, pv: 0, lastSlope: 0 }, drag: false, grab: 0, hover: -1, exag: 1, wheel: 0 };
    var batch = new G.Batch(), mid = { x: 0, y: 0 };

    /* Camera poses. Both are computed from the free area of the view. */
    function settled(V) {
      var fr = V.free, yaw = -0.5, pitch = 0.2, dist = 42;
      var pxm = Math.min(fr.w * 0.95 / ((L + 6.4) * Math.cos(-yaw) + (Wd + 1) * Math.sin(-yaw)), fr.h / (H + 3.4));
      return { tx: L / 2, ty: -0.2, tz: 0, yaw: yaw, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx - fr.w * 0.03, cy: fr.cy - fr.h * 0.0, roll: 0 };
    }
    function wide(V) {                                              // the establishing shot used by Home
      var fr = V.free, yaw = -0.5, pitch = 0.27, dist = 70;
      var pxm = Math.min(fr.w * 1.06 / ((L + 13) * Math.cos(-yaw) + 11 * Math.sin(-yaw)), fr.h / (H + 4.4));
      return { tx: L / 2, ty: 0.9, tz: 0, yaw: yaw, pitch: pitch, dist: dist, f: dist * pxm, cx: fr.cx + fr.w * 0.035, cy: fr.cy + fr.h * 0.03, roll: 0 };
    }

    /* the decorative suspension: a spring and damper driven by changes in the road's slope under the wheels.
       It moves the body a few centimetres and tilts it a little; it never touches the structural solution. */
    function suspension(dt, slope) {
      var s = st.susp, spd = Sim.playing ? Sim.speed : 0, drive = (slope - s.lastSlope) / Math.max(dt, 1e-3) * spd * 0.06;
      s.lastSlope = slope; dt = Math.min(dt, 0.04);
      s.v += (-60 * s.y - 9 * s.v + drive * 4) * dt; s.y = clamp(s.y + s.v * dt, -0.07, 0.07);
      s.pv += (-45 * s.p - 7 * s.pv + (Sim.playing ? 0.0035 * Math.sin(Sim.a * 6.2) * spd : 0)) * dt; s.p = clamp(s.p + s.pv * dt, -0.025, 0.025);
    }

    function advance(dt, m) {
      Sim.step(dt);
      var V = Sim.vehicle(), f = Sim.a + V.axles[0].dx, r = Sim.a + V.axles[V.axles.length - 1].dx;
      suspension(dt, Math.atan2(Sim.deckDy(f) - Sim.deckDy(r), Math.max(0.1, f - r)));
      st.wheel = (Sim.a - Sim.start()) / V.wheelR;                  // the wheels turn exactly as far as the vehicle has moved
    }

    /* o: { pose, ex (explode, number or function of x/L), t } */
    function draw(ctx, V, o) {
      o = o || {};
      var t = V.t, pose = o.pose || settled(V), Pj = G.camera(pose), i, k, zs, veh = Sim.vehicle();
      var Ef = typeof o.ex === 'function' ? o.ex : function () { return o.ex || 0; };
      var a = Sim.a, ex = Sim.exag(), u = Sim.fem && Sim.fem.ok ? Sim.fem.u : null, sel = Sim.sel;
      var cxm = L / 2, cym = H * 0.5;
      st.P = Pj; st.exag = ex;
      var nodes = T.nodes.map(function (nd, idx) {                   // joints, moved by the solution (exaggerated, and labelled as such)
        var e = Ef(nd.x / L), k_ = ex * (1 - e);
        return { x: nd.x + (u ? u[2 * idx] * k_ : 0), y: nd.y + (u ? u[2 * idx + 1] * k_ : 0) };
      });
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
      function deckY(x) {                                            // height of the road surface at x along the span (follows the displaced bottom chord)
        var xc = clamp(x, 0, L), j = Math.min(n - 1, Math.floor(xc / dx)), f = (xc - nodes[j].x) / Math.max(1e-6, nodes[j + 1].x - nodes[j].x);
        return lerp(nodes[j].y, nodes[j + 1].y, clamp(f, 0, 1));
      }

      /* ---- sky, ground, water, grid ---- */
      var gy = -3.2, hy = G.sky(ctx, V.w, V.h, Pj, [13, 14, 16], [38, 44, 52], [22, 24, 27]);
      G.glow(ctx, pose.cx, Math.max(40, hy + 30), V.w * 0.55, [120, 160, 200], o.ex ? 0.10 : 0.12);
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
      var s0 = Pj(0, 0, 0), sn = Pj(L, 0, 0); st.sx0 = s0.x; st.sxn = sn.x;

      /* ---- abutments: the road continues on each side, and the deck rests on a pedestal ---- */
      var eL = Ef(0), eR = Ef(1), road = [58, 61, 66];
      G.box(batch, Pj, -9 - 3 * eL, -0.02 - 3 * eL, gy, 0, -Wd / 2 - 0.6, Wd / 2 + 0.6, M.concrete, { top: road, k: 0.78 });
      G.box(batch, Pj, L + 0.02 + 3 * eR, L + 9 + 3 * eR, gy, 0, -Wd / 2 - 0.6, Wd / 2 + 0.6, M.concrete, { top: road, k: 0.78 });
      G.box(batch, Pj, -0.02 - 3 * eL, 0.6 - 3 * eL, gy, -0.34, -Wd / 2 - 0.6, Wd / 2 + 0.6, M.concrete, { k: 0.72 });
      G.box(batch, Pj, L - 0.6 + 3 * eR, L + 0.02 + 3 * eR, gy, -0.34, -Wd / 2 - 0.6, Wd / 2 + 0.6, M.concrete, { k: 0.72 });

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
      var segs = [], fref = Sim.fref;
      for (zs = -1; zs <= 1; zs += 2) {
        for (k = 0; k < T.members.length; k++) {
          var en = ends(k, zs), p0 = Pj(en[0][0], en[0][1], en[0][2]), p1 = Pj(en[1][0], en[1][1], en[1][2]);
          var f = Sim.forces[k] / fref, af = Math.min(1, Math.abs(f)), rw = 0.045 + 0.06 * af, col, dash = null, isSel = k === sel;
          if (f > 0.015) col = [188, 198, 210]; else if (f < -0.015) { col = [236, 146, 112]; dash = [7, 5]; } else col = [104, 112, 122];
          if (isSel) { col = G.mix(col, [142, 201, 255], 0.7); rw += 0.035; }
          G.tube(batch, p0, p1, rw, col, { dash: dash });
          if (zs === 1) segs.push({ k: k, x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, ok: p0.ok && p1.ok });
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
      mid.k = 3;
      if (!o.pose) st.segs = segs;

      /* ---- the vehicle ---- */
      var ev = Ef(0.5), exploded = ev > 0.02, vx = lerp(a, L * 0.5, ev), ax0 = veh.axles[0].dx, ax1 = veh.axles[veh.axles.length - 1].dx;
      var yf = deckY(a + ax0), yr = deckY(a + ax1), slope = Math.atan2(yf - yr, Math.max(0.1, (ax0 - ax1))), base = (yf + yr) / 2;      // off the span the road is level at height 0 (the end joints do not move)
      var vo = { x: vx, y: base + 3.6 * ev + bob(77, ev) * 3, slope: exploded ? 0 : slope, z: 0, rot: st.wheel, bodyDy: st.susp.y, bodyPitch: st.susp.p, shadow: !exploded };
      PF.vehicles.draw(batch, Pj, Sim.kind, vo);
      if (!o.pose) st.vbox = PF.vehicles.bounds(Pj, Sim.kind, vo);
      batch.flush(ctx);

      /* ---- on the picture: the exaggeration label, and the selected member ---- */
      if (!o.pose && !exploded) {
        var lab = 'Deflection drawn x' + Math.round(ex) + '. Real movement is far smaller.';
        U.text(ctx, lab, V.free.x0 + 8, V.free.y1 - 6, V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
        if (sel >= 0 && segs[sel] && segs[sel].ok) {
          var sg = segs[sel], mi = Sim.memberInfo(sel), mx = (sg.x0 + sg.x1) / 2, my = (sg.y0 + sg.y1) / 2 - 14;
          var txt = mi.a + '-' + mi.b + ': ' + Math.abs(mi.force).toFixed(1) + ' kN ' + mi.state;
          ctx.font = '500 ' + (V.lod ? 11 : 12) + 'px ' + U.MONO; var tw = ctx.measureText(txt).width + 14;
          ctx.fillStyle = 'rgba(14,15,16,0.88)'; ctx.strokeStyle = A(0.8); ctx.lineWidth = 1; ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(mx - tw / 2, my - 15, tw, 22, 6); else ctx.rect(mx - tw / 2, my - 15, tw, 22);
          ctx.fill(); ctx.stroke(); U.text(ctx, txt, mx, my, V.lod ? 11 : 12, '#fff', 'center', true);
        }
      }
    }

    function chordMember() { var mb = T.members[3]; return { x: (T.nodes[mb[0]].x + T.nodes[mb[1]].x) / 2, y: 0, z: Wd / 2, force: Sim.forces[3] / Sim.fref }; }

    /* screen x -> position along the span, by bisection on the projected road line (the camera is in perspective) */
    function screenToA(sx) {
      if (!st.P) return Sim.a;
      var lo = Sim.start(), hi = Sim.end(), j, mi;
      for (j = 0; j < 30; j++) { mi = (lo + hi) / 2; if (st.P(mi, 0, 0).x < sx) lo = mi; else hi = mi; }
      return (lo + hi) / 2;
    }
    function nearestMember(x, y, maxD) {
      var best = -1, bd = maxD, i;
      for (i = 0; i < st.segs.length; i++) {
        var s = st.segs[i]; if (!s.ok) continue;
        var vx = s.x1 - s.x0, vy = s.y1 - s.y0, l2 = vx * vx + vy * vy || 1, tt = clamp(((x - s.x0) * vx + (y - s.y0) * vy) / l2, 0, 1), d = Math.hypot(x - (s.x0 + vx * tt), y - (s.y0 + vy * tt));
        if (d < bd) { bd = d; best = s.k; }
      }
      return best;
    }
    var input = {
      hit: function (x, y) { var b = st.vbox, p = 14; return !!b && x >= b.x0 - p && x <= b.x1 + p && y >= b.y0 - p && y <= b.y1 + p; },
      down: function (x) { Sim.play(false); st.drag = true; st.grab = screenToA(x) - Sim.a; },
      move: function (x) { if (st.drag) Sim.setPos(screenToA(x) - st.grab); },
      up: function () { st.drag = false; },
      tap: function (x, y) { var k = nearestMember(x, y, 14); Sim.select(k === Sim.sel ? -1 : k); },
      cursor: function (x, y) { return input.hit(x, y) ? (st.drag ? 'grabbing' : 'grab') : nearestMember(x, y, 12) >= 0 ? 'pointer' : ''; }
    };
    return { draw: draw, advance: advance, settled: settled, wide: wide, chord: chordMember, geom: { n: n, L: L, H: H, Wd: Wd, T: T }, st: st, input: input };
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
      },
      anchor: function (V) { var p = G.camera(model.wide(V))(PF.sim.bridge.L / 2, 0.6, 0); return { x: p.x, y: p.y, r: 30 }; }
    };
  };

  /* ---------- Bridge ---------- */
  S.bridge = function (opts) {
    var model = (opts && opts.model) || BridgeModel();
    return {
      id: 'bridge', sim: model, model: model, side: -1,
      init: function () {},
      advance: function (dt, m) { model.advance(dt, m); },
      draw: function (ctx, V, o) { o = o || {}; model.draw(ctx, V, { pose: o.pose, ex: o.ex || 0 }); },
      input: model.input,
      anchor: function (V) { var p = G.camera(model.settled(V))(PF.sim.bridge.L / 2, 1.2, 0); return { x: p.x, y: p.y, r: 30 }; }
    };
  };

  /* ---------- the Bridge panel ---------- */
  PF.labs.add('bridge', function (root, h) {
    h.seg('vehicle', function (v) { Sim.setKind(v); });
    h.range('load', function (v) { Sim.setLoad(v); });
    h.range('speed', function (v) { Sim.setSpeed(v); });
    h.range('pos', function (v) { Sim.setPos(v); });
    h.btn('play', function () { Sim.play(); });
    h.btn('reset', function () { Sim.setKind('car'); Sim.setLoad(1); Sim.setSpeed(2.4); Sim.reset(); Sim.play(true); });
    h.pick('member', function (v) { Sim.select(+v); });
    return {
      sync: function () {
        var veh = Sim.vehicle(), tonnes = veh.tonnes * Sim.load, mi = Sim.memberInfo(Sim.sel), r = Sim.reactions, onSpan = Sim.a + veh.axles[0].dx >= 0 && Sim.a + veh.axles[veh.axles.length - 1].dx <= Sim.L;
        h.setSeg('vehicle', Sim.kind);
        h.setRange('load', Sim.load, '×' + Sim.load.toFixed(1) + ' (' + tonnes.toFixed(tonnes < 10 ? 1 : 0) + ' t)');
        h.setRange('speed', Sim.speed, Sim.speed.toFixed(1) + ' m/s');
        h.setRange('pos', Sim.a, Sim.a.toFixed(1) + ' m', Sim.start().toFixed(1), Sim.end().toFixed(1));
        h.setBtn('play', { pressed: Sim.playing, label: Sim.playing ? 'Pause' : 'Play' });
        var opts = [['-1', 'None (tap a bar on the bridge)']]; Sim.T.members.forEach(function (m_, k) { var q = Sim.memberInfo(k); opts.push([String(k), q.a + '-' + q.b + ' (' + q.kind + ')']); });
        h.setPick('member', Sim.sel, opts);
        h.text('member-r', mi ? mi.a + '-' + mi.b + ', ' + mi.kind + ': ' + Math.abs(mi.force).toFixed(1) + ' kN, ' + mi.state : 'No bar selected');
        h.text('worst', 'Largest tension ' + Sim.maxT.toFixed(1) + ' kN, largest compression ' + Math.abs(Sim.maxC).toFixed(1) + ' kN');
        h.text('defl', onSpan ? 'Midspan sag ' + (Sim.midDefl * 1000).toFixed(2) + ' mm (drawn ×' + Math.round(Sim.exag()) + ')' : 'Vehicle is off the span: no load');
        h.text('react', 'Support reactions ' + (r[1] || 0).toFixed(1) + ' kN left, ' + (r[2] || 0).toFixed(1) + ' kN right');
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
