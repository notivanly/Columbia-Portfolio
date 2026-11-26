/* ==========================================================================
   scenes-flow.js
   Scene 2: the Wind Tunnel experiment.

   The picture is a side view of the test section. The air, the forces and the
   coefficients come from PF.sim.wind (sim-fluid.js): potential flow around the
   chosen silhouette, with an illustrative wake and textbook approximate drag
   (and, for the airfoil only, lift) coefficients. It is not CFD, and the page says so.
   Each object has its own model: the airfoil's lift is not applied to a sphere.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var A = U.A, Wd = PF.sim.wind;

  S.wind = function () {
    var st = { cx: 0, cy: 0, sc: 1, drag: false, a0: 0, y0: 0, body: null };

    function layout(V) {
      var fr = V.free, span = V.compact ? 11.6 : 16.6, sc = Math.min(fr.w / span, fr.h / 4.7);
      return { sc: sc, cx: fr.cx, cy: fr.cy };
    }
    function resampleLoop(pts, n) {                                       // n points at equal steps along the outline
      var m = pts.length, tot = 0, seg = [], i, j, out = [];
      for (i = 0; i < m; i++) { var a = pts[i], b = pts[(i + 1) % m], l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push(l); tot += l; }
      var step = tot / n, acc = 0, k = 0, target = 0;
      for (j = 0; j < n; j++) {
        target = j * step; while (acc + seg[k] < target && k < m - 1) { acc += seg[k]; k++; }
        var f = seg[k] ? (target - acc) / seg[k] : 0, p = pts[k], q = pts[(k + 1) % m]; out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
      }
      return out;
    }
    function path(ctx, pts, L, k) {                                      // world outline (y up) -> screen path, scaled about the origin by k
      var i; ctx.beginPath();
      for (i = 0; i < pts.length; i++) { var x = L.cx + pts[i][0] * k * L.sc, y = L.cy - pts[i][1] * k * L.sc; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath();
    }

    /* the body, shaded as what it is */
    function paintBody(ctx, kind, pts, L, k, alpha, ang) {
      var b = Wd.bounds(), sc = L.sc, i, g;
      ctx.save(); ctx.globalAlpha = alpha;
      path(ctx, pts, L, k);
      var x0 = L.cx + b.x0 * sc, y0 = L.cy - b.y1 * sc, y1 = L.cy - b.y0 * sc, x1 = L.cx + b.x1 * sc;
      if (kind === 'sphere') { var r = 1.3 * sc * k; g = ctx.createRadialGradient(L.cx - r * 0.4, L.cy - r * 0.45, r * 0.08, L.cx - r * 0.1, L.cy - r * 0.1, r * 1.1); g.addColorStop(0, 'rgb(236,242,250)'); g.addColorStop(0.5, 'rgb(150,164,182)'); g.addColorStop(1, 'rgb(34,40,50)'); }
      else if (kind === 'banana') { g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgb(250,226,110)'); g.addColorStop(0.55, 'rgb(236,196,64)'); g.addColorStop(1, 'rgb(150,112,36)'); }
      else if (kind === 'car') { g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgb(170,208,244)'); g.addColorStop(0.5, 'rgb(104,160,220)'); g.addColorStop(1, 'rgb(40,72,112)'); }
      else if (kind === 'cylinder') { g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgb(220,226,234)'); g.addColorStop(0.35, 'rgb(150,160,174)'); g.addColorStop(1, 'rgb(48,54,64)'); }
      else { g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, 'rgb(232,238,246)'); g.addColorStop(0.5, 'rgb(150,162,178)'); g.addColorStop(1, 'rgb(52,60,72)'); }
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.save(); path(ctx, pts, L, k); ctx.clip();
      if (kind === 'banana') {                                            // the dark stem end and a few freckles
        ctx.fillStyle = 'rgba(70,48,18,0.85)'; ctx.beginPath(); ctx.arc(x1 - 2 * sc * 0.02, L.cy - (b.y0 + b.y1) / 2 * sc, sc * 0.17 * k, 0, TAU); ctx.fill();
        var rr = U.rng(4); ctx.fillStyle = 'rgba(96,66,24,0.55)'; for (i = 0; i < 9; i++) { var px = x0 + (x1 - x0) * (0.2 + 0.6 * rr()), py = y0 + (y1 - y0) * (0.2 + 0.6 * rr()); ctx.beginPath(); ctx.arc(px, py, sc * (0.03 + 0.03 * rr()), 0, TAU); ctx.fill(); }
      } else if (kind === 'car') {                                        // glass and lamps, in the car's own frame
        ctx.translate(L.cx, L.cy); ctx.rotate(ang * Math.PI / 180); ctx.scale(sc * k, -sc * k);
        ctx.fillStyle = 'rgba(14,22,34,0.9)'; ctx.beginPath(); ctx.moveTo(-0.92, 0.5); ctx.lineTo(-0.4, 0.69); ctx.lineTo(0.26, 0.71); ctx.lineTo(0.82, 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.fillRect(-0.08, 0.5, 0.04, 0.2);
        ctx.fillStyle = 'rgba(255,246,214,0.95)'; ctx.fillRect(1.98, -0.05, 0.2, 0.1); ctx.fillStyle = 'rgba(226,64,56,0.95)'; ctx.fillRect(-2.2, 0.0, 0.1, 0.12);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(-1.5, -0.55); ctx.lineTo(1.5, -0.55); ctx.stroke();
      } else if (kind === 'cylinder') {                                   // the two end rims of the can
        ctx.translate(L.cx, L.cy); ctx.rotate(ang * Math.PI / 180); ctx.scale(sc * k, -sc * k);
        ctx.strokeStyle = 'rgba(20,26,34,0.5)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(1.55, -0.75); ctx.lineTo(1.55, 0.75); ctx.moveTo(-1.55, -0.75); ctx.lineTo(-1.55, 0.75); ctx.stroke();
      } else if (kind === 'airfoil') {                                    // the chord line, to read the angle against
        ctx.translate(L.cx, L.cy); ctx.rotate(ang * Math.PI / 180); ctx.scale(sc * k, -sc * k);
        ctx.strokeStyle = 'rgba(20,26,34,0.35)'; ctx.lineWidth = 0.025; ctx.setLineDash([0.12, 0.1]); ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(2, 0); ctx.stroke();
      }
      ctx.restore(); ctx.restore();
    }

    function advance(dt) { Wd.step(dt); }

    /* o: { flow (0..1, streamline opacity), walls (0..1), nolabels } */
    function draw(ctx, V, o) {
      o = o || {};
      var L = layout(V), sc = L.sc, i, k, j, t = V.t, flow = o.flow == null ? 1 : o.flow, wl = o.walls == null ? 1 : o.walls;
      st.cx = L.cx; st.cy = L.cy; st.sc = sc;
      ctx.fillStyle = 'rgb(11,15,19)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, L.cx, L.cy, Math.max(V.w, V.h) * 0.5, [90, 140, 190], 0.16 * wl + 0.04);

      /* the test section: glass walls, floor line and ticks that slide with the air */
      var tx0 = L.cx + Wd.X0 * sc, tx1 = L.cx + Wd.X1 * sc, ty0 = L.cy - Wd.Ytop * sc, ty1 = L.cy - Wd.Ybot * sc;
      if (wl > 0.02) {
        var wg = ctx.createLinearGradient(0, ty0, 0, ty1); wg.addColorStop(0, 'rgba(150,190,220,' + (0.09 * wl) + ')'); wg.addColorStop(0.5, 'rgba(150,190,220,' + (0.02 * wl) + ')'); wg.addColorStop(1, 'rgba(150,190,220,' + (0.08 * wl) + ')');
        ctx.fillStyle = wg; ctx.fillRect(tx0, ty0, tx1 - tx0, ty1 - ty0);
        ctx.strokeStyle = 'rgba(220,240,255,' + (0.42 * wl) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx1, ty0); ctx.moveTo(tx0, ty1); ctx.lineTo(tx1, ty1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.18 * wl) + ')'; ctx.lineWidth = 1; ctx.beginPath();
        var per = 1.2 * sc, shift = (t * Wd.uref() * sc) % per;
        for (k = tx0 - per + shift; k < tx1; k += per) { ctx.moveTo(k, ty0); ctx.lineTo(k - 0.2 * sc, ty0 + 0.2 * sc); ctx.moveTo(k, ty1); ctx.lineTo(k - 0.2 * sc, ty1 - 0.2 * sc); }
        ctx.stroke();
      }

      /* the wake (where the air is slow and unsteady): illustrative, drawn before the streamlines */
      var wk = Wd.wake;
      if (wk && flow > 0.02 && !o.nowake) {
        var amp = (1 - wk.floor) * (Wd.kind === 'airfoil' ? 0.12 + 0.2 * Wd.stall : 0.2), N = 22;
        ctx.beginPath();
        for (i = 0; i <= N; i++) { var d = i / N * wk.len, half = wk.w0 * (0.85 + 0.25 * d / wk.len) * wk.k * Math.sqrt(1 - d / wk.len + 0.0001); ctx.lineTo(L.cx + (wk.xs + d) * sc, L.cy - (wk.yc + half) * sc); }
        for (i = N; i >= 0; i--) { var d2 = i / N * wk.len, half2 = wk.w0 * (0.85 + 0.25 * d2 / wk.len) * wk.k * Math.sqrt(1 - d2 / wk.len + 0.0001); ctx.lineTo(L.cx + (wk.xs + d2) * sc, L.cy - (wk.yc - half2) * sc); }
        ctx.closePath(); var wgr = ctx.createLinearGradient(L.cx + wk.xs * sc, 0, L.cx + (wk.xs + wk.len) * sc, 0);
        wgr.addColorStop(0, 'rgba(255,170,120,' + (amp * flow).toFixed(3) + ')'); wgr.addColorStop(1, 'rgba(255,170,120,0)'); ctx.fillStyle = wgr; ctx.fill();
      }

      /* streamlines: thicker and brighter where the air is faster */
      if (flow > 0.01) {
        ctx.lineCap = 'round';
        var ps = Wd.parts, buckets = [[], [], []], q;
        for (i = 0; i < ps.length; i++) { q = ps[i].q; buckets[q < 0.85 ? 0 : q < 1.12 ? 1 : 2].push(ps[i]); }
        var cols = [[120, 170, 214], [142, 201, 255], [236, 246, 255]], wds = [1.1, 1.5, 2.1];
        for (j = 0; j < 3; j++) {
          var bj = buckets[j]; if (!bj.length) continue;
          for (var half = 0; half < 2; half++) {
            ctx.strokeStyle = 'rgba(' + cols[j].join(',') + ',' + ((half ? 0.8 : 0.28) * flow).toFixed(3) + ')'; ctx.lineWidth = wds[j] * (V.lod ? 0.9 : 1); ctx.beginPath();
            for (i = 0; i < bj.length; i++) {
              var tr = bj[i].trail, n2 = tr.length; if (n2 < 4) continue;
              var mid = Math.floor(n2 / 4) * 2, a0 = half ? mid - 2 : 0, a1 = half ? n2 : mid;
              ctx.moveTo(L.cx + tr[a0] * sc, L.cy - tr[a0 + 1] * sc); for (k = a0 + 2; k < a1; k += 2) ctx.lineTo(L.cx + tr[k] * sc, L.cy - tr[k + 1] * sc);
            }
            ctx.stroke();
          }
        }
        ctx.lineCap = 'butt';
      }

      /* the body, switching smoothly from the one before (a short cross-scale fade) */
      var m = Wd.morph, e = smooth(m), ang = Wd.angle * (Wd.kind === 'sphere' ? 0 : 1);
      if (Wd.prev && m < 1) { paintBody(ctx, Wd.prev.kind, Wd.prev.outline, L, 1 + 0.2 * e, 1 - e, 0); }
      paintBody(ctx, Wd.kind, Wd.outline, L, 0.82 + 0.18 * e, Wd.prev ? e : 1, ang);
      var b = Wd.bounds(); st.body = { x: L.cx + (b.x0 + b.x1) / 2 * sc, y: L.cy - (b.y0 + b.y1) / 2 * sc, r: Math.max(b.w, b.h) / 2 * sc };

      /* forces: drag along the flow, and lift across it (the airfoil only) */
      var c = Wd.c;
      if (c && flow > 0.3 && !o.noforces) {
        var cx0 = st.body.x, cy0 = st.body.y;
        var fmax = 1.9 * sc;
        function arrow(len, dx_, dy_, col, label) {
          len = clamp(len, 6, fmax); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.4;
          var sx = cx0 + dx_ * (st.body.r + 8), sy = cy0 + dy_ * (st.body.r + 8);
          U.arrow(ctx, sx, sy, sx + dx_ * len, sy + dy_ * len, 8);
          U.text(ctx, label, sx + dx_ * len + (dx_ ? 6 : 0), sy + dy_ * len + (dy_ ? (dy_ < 0 ? -6 : 14) : 4), V.lod ? 10 : 11, col, dx_ ? 'left' : 'center', true);
        }
        var dl = Math.sqrt(c.D) * sc * 0.28;                    // arrow length grows as the square root of the force, so both stay readable
        arrow(dl, 1, 0, 'rgba(255,138,92,0.95)', 'Drag');
        if (c.L != null && Math.abs(c.L) > 0.05) { var ll = Math.sqrt(Math.abs(c.L)) * sc * 0.28; arrow(ll, 0, c.L > 0 ? -1 : 1, A(0.95), 'Lift'); }
      }
      if (!o.nolabels) {
        U.text(ctx, 'Illustrative airflow, not CFD. Coefficients are approximate.', V.free.x0 + 8, V.free.y1 - 6, V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
        U.text(ctx, 'Wind →', tx0 + 10, ty0 + 16, V.lod ? 10 : 11, 'rgba(245,245,242,0.6)', 'left', true);
      }
    }

    var input = {
      hit: function (x, y) { var b = st.body; return !!b && Math.hypot(x - b.x, y - b.y) < b.r * 1.15 + 10 && Wd.angleMatters(); },
      down: function (x, y) { st.drag = true; st.a0 = Wd.angle; st.y0 = y; },
      move: function (x, y) { if (st.drag) Wd.setAngle(st.a0 + (st.y0 - y) * 0.22); },
      up: function () { st.drag = false; },
      cursor: function (x, y) { return input.hit(x, y) ? 'ns-resize' : ''; }
    };
    return {
      id: 'wind', sim: Wd, side: 1, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      anchor: function (V) { var L = layout(V); return { x: L.cx, y: L.cy, r: Math.max(8, Wd.bounds().h / 2 * L.sc) }; },
      outlineScreen: function (V) { var L = layout(V); return Wd.outline.map(function (p) { return [L.cx + p[0] * L.sc, L.cy - p[1] * L.sc]; }); },
      focus: function () { return { x: st.cx, y: st.cy, ang: 0 }; }
    };
  };

  /* ---------- the Wind Tunnel panel ---------- */
  PF.labs.add('wind', function (root, h) {
    h.seg('object', function (v) { Wd.setKind(v); });
    h.range('speed', function (v) { Wd.setSpeed(v); });
    h.range('angle', function (v) { Wd.setAngle(v); });
    h.btn('reset', function () { Wd.reset(); });
    function f1(x) { return Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1); }
    return {
      sync: function () {
        var o = Wd.OBJECTS[Wd.kind], c = Wd.c, r = Wd.range(), kmh = Wd.speed * 3.6;
        h.setSeg('object', Wd.kind);
        h.setRange('speed', Wd.speed, Wd.speed.toFixed(0) + ' m/s (' + kmh.toFixed(0) + ' km/h)');
        h.setRange('angle', Wd.angle, Wd.angleMatters() ? Wd.angle.toFixed(0) + '°' : 'no effect', r[0], Math.max(r[1], r[0] + 0.001));
        h.rangeDisabled('angle', !Wd.angleMatters());
        h.text('angle-n', o.angleName);
        h.text('cd', 'Drag coefficient ' + c.cd.toFixed(2) + ' (approximate)');
        h.text('cl', c.cl == null ? 'Lift: none modelled for this shape' : 'Lift coefficient ' + c.cl.toFixed(2) + ' (approximate)');
        h.text('forces', 'Drag ' + f1(c.D) + ' N' + (c.L == null ? '' : ', lift ' + f1(c.L) + ' N') + ' at ' + Wd.speed.toFixed(0) + ' m/s');
        h.text('re', 'Reynolds number about ' + (c.Re >= 1e5 ? (c.Re / 1e5).toFixed(1) + '×10⁵' : Math.round(c.Re / 100) * 100));
        h.text('note', c.note || (Wd.kind === 'banana' ? 'A banana is not a standard test shape, so this drag value is an estimate.' : ''));
        h.show('note', !!(c.note || Wd.kind === 'banana'));
        h.text('model', o.model);
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
