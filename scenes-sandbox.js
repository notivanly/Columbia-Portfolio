/* ==========================================================================
   scenes-sandbox.js
   Scene 4: the Physics sandbox.

   A small room in which balls and boxes obey PF.sim.physics (sim-motion.js: rigid
   bodies, contacts with friction and bounce, a soft constraint that holds whatever you
   grab). Drag a body and let go to throw it; tap an empty place to drop another.
   While the sandbox is paused a drag simply moves a body, so a stack or a row of
   dominoes can be set up before it runs. The count is capped (the panel says so).
   The picture is drawn from the simulation and never the other way round.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, A = U.A, Ph = PF.sim.physics;
  var MAT = [[176, 186, 198], [98, 124, 150], [196, 170, 140], [128, 138, 152]];       // four quiet materials; the light blue is kept for what you are holding

  function rr(ctx, x, y, w, h, r) { if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); } else { ctx.beginPath(); ctx.rect(x, y, w, h); } }

  S.sandbox = function () {
    var st = { sc: 1, ox: 0, oy: 0, touched: false, kind: 'ball', arr: null, trail: [], trailBody: null, V: null };
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;

    function frame(V) {
      var fr = V.free, sc = Math.min(fr.w / Ph.W, fr.h / Ph.H) * 0.97;
      return { sc: sc, ox: fr.cx - Ph.W * sc / 2, oy: fr.cy + Ph.H * sc / 2 };
    }
    function toS(F, x, y) { return [F.ox + x * F.sc, F.oy - y * F.sc]; }
    function toW(F, sx, sy) { return [(sx - F.ox) / F.sc, (F.oy - sy) / F.sc]; }

    function advance(dt) {
      Ph.step(dt);
      var b = Ph.hot;                                                   // a faint trail behind the body you last touched, so a throw can be read
      if (b !== st.trailBody) { st.trailBody = b; st.trail.length = 0; }
      if (b && !Ph.paused) { var sp = Math.hypot(b.vx, b.vy); st.trail.push([b.x, b.y, sp]); if (st.trail.length > 36) st.trail.shift(); }
      else if (st.trail.length) st.trail.shift();
    }

    function drawBody(ctx, F, b, held, V) {
      var p = toS(F, b.x, b.y), col = MAT[b.mat % MAT.length], isHot = b === Ph.hot && !st.touched && !Ph.paused;
      if (b.type === 'circle') {
        var r = b.r * F.sc;
        G.ball(ctx, p[0], p[1], r, col, { rim: 0.12 });
        ctx.strokeStyle = G.shade(col, 0.32); ctx.lineWidth = Math.max(1, r * 0.09); ctx.lineCap = 'round';          // a mark that turns, so spin is visible
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(-b.a) * r * 0.74, p[1] + Math.sin(-b.a) * r * 0.74); ctx.stroke(); ctx.lineCap = 'butt';
        ctx.fillStyle = G.shade(col, 0.32); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(1.2, r * 0.1), 0, TAU); ctx.fill();
        if (held || isHot) { ctx.strokeStyle = A(held ? 0.95 : 0.6 + 0.3 * Math.sin(V.t * 3)); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 4, 0, TAU); ctx.stroke(); }
        return;
      }
      var w = b.hx * 2 * F.sc, h = b.hy * 2 * F.sc;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-b.a);
      var g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, G.shade(col, 1.25)); g.addColorStop(0.55, G.shade(col, 0.82)); g.addColorStop(1, G.shade(col, 0.42));
      ctx.fillStyle = g; rr(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * 0.12); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; rr(ctx, -w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, Math.min(w, h) * 0.1); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(-w / 2 + w * 0.12, h / 2 - h * 0.18); ctx.lineTo(w / 2 - w * 0.12, h / 2 - h * 0.18); ctx.stroke();
      if (held || isHot) { ctx.strokeStyle = A(held ? 0.95 : 0.6 + 0.3 * Math.sin(V.t * 3)); ctx.lineWidth = 2; rr(ctx, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8, Math.min(w, h) * 0.2); ctx.stroke(); }
      ctx.restore();
    }

    function draw(ctx, V, o) {
      var F = frame(V), fr = V.free, i, rw = Ph.W * F.sc, rh = Ph.H * F.sc, x0 = F.ox, y0 = F.oy - rh;
      st.V = V; st.sc = F.sc; st.ox = F.ox; st.oy = F.oy;
      ctx.fillStyle = 'rgb(12,14,17)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, fr.cx, fr.cy, Math.max(V.w, V.h) * 0.5, [100, 140, 190], 0.1);

      /* the room: a lit back wall, a floor line, a metre grid */
      var bg = ctx.createLinearGradient(0, y0, 0, y0 + rh); bg.addColorStop(0, 'rgb(24,28,34)'); bg.addColorStop(1, 'rgb(17,20,25)');
      ctx.fillStyle = bg; rr(ctx, x0, y0, rw, rh, 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
      for (i = 1; i < Ph.W; i++) { ctx.moveTo(x0 + i * F.sc, y0); ctx.lineTo(x0 + i * F.sc, y0 + rh); }
      for (i = 1; i < Ph.H; i++) { ctx.moveTo(x0, y0 + i * F.sc); ctx.lineTo(x0 + rw, y0 + i * F.sc); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(142,201,255,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 + rh); ctx.lineTo(x0 + rw, y0 + rh); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.2; rr(ctx, x0, y0, rw, rh, 6); ctx.stroke();

      /* the path of the body you last touched */
      if (st.trail.length > 2) {
        ctx.lineCap = 'round';
        for (i = 1; i < st.trail.length; i++) {
          var a = st.trail[i - 1], b2 = st.trail[i], pa = toS(F, a[0], a[1]), pb = toS(F, b2[0], b2[1]), k = i / st.trail.length;
          ctx.strokeStyle = A(0.5 * k * clamp(b2[2] / 4, 0.15, 1)); ctx.lineWidth = 1 + 2 * k; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }

      /* a pendulum's rod and its pivot */
      Ph.rods.forEach(function (r) {
        var c = Math.cos(r.b.a), s = Math.sin(r.b.a), pb = toS(F, r.b.x + r.bx * c - r.by * s, r.b.y + r.bx * s + r.by * c), pa = r.a ? toS(F, r.a.x, r.a.y) : toS(F, r.ax, r.ay);
        ctx.strokeStyle = 'rgba(210,218,228,0.8)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
        if (!r.a) { G.ball(ctx, pa[0], pa[1], Math.max(4, F.sc * 0.07), [200, 208, 218], { rim: 0 }); }
      });

      /* the bodies */
      var held = Ph.grab ? Ph.grab.b : st.arr ? st.arr.b : null;
      for (i = 0; i < Ph.bodies.length; i++) { var bd = Ph.bodies[i]; if (bd.fixed) continue; drawBody(ctx, F, bd, bd === held, V); }

      /* the hand: a line from the point you grabbed to the pointer */
      if (Ph.grab) {
        var g = Ph.grab, c = Math.cos(g.b.a), s = Math.sin(g.b.a), ap = toS(F, g.b.x + g.lx * c - g.ly * s, g.b.y + g.lx * s + g.ly * c), tp = toS(F, g.tx, g.ty);
        ctx.strokeStyle = A(0.85); ctx.lineWidth = 1.6; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(tp[0], tp[1]); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = A(1); ctx.beginPath(); ctx.arc(ap[0], ap[1], 3.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(tp[0], tp[1], 5, 0, TAU); ctx.stroke();
      }

      /* the invitation, until something has been grabbed; the pause hint while paused */
      if (!o || !o.nolabels) {
        if (!st.touched && !Ph.paused) {
          var hb = Ph.hot; if (hb) {
            var hp = toS(F, hb.x, hb.y), ty = clamp(hp[1] - (hb.r ? hb.r * F.sc : hb.hy * F.sc) - 18, y0 + 20, y0 + rh - 20);
            U.text(ctx, 'Grab something and throw it.', clamp(hp[0], x0 + 120, x0 + rw - 120), ty, V.lod ? 12 : 14, 'rgba(255,255,255,0.95)', 'center', true);
          }
        }
        U.text(ctx, Ph.paused ? 'Paused: drag to arrange, then press Play.' : 'Room 9 m wide. Drag to hold, release to throw.', x0 + 8, y0 + rh + (V.lod ? 15 : 17), V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
        U.text(ctx, Ph.count() + ' / ' + Ph.MAX, x0 + rw - 6, y0 + rh + (V.lod ? 15 : 17), V.lod ? 10 : 11, Ph.count() >= Ph.MAX ? 'rgba(255,170,130,1)' : 'rgba(245,245,242,0.78)', 'right', true);
      }
    }

    /* ---------- input ---------- */
    function world(x, y) { return st.V ? toW(frame(st.V), x, y) : [0, 0]; }
    var input = {
      hit: function (x, y) { var w = world(x, y); return !!Ph.pick(w[0], w[1], coarse ? 0.3 : 0.12); },
      down: function (x, y) {
        var w = world(x, y), b = Ph.pick(w[0], w[1], coarse ? 0.3 : 0.12); if (!b) return;
        st.touched = true; Ph.hot = b;
        if (Ph.paused) st.arr = { b: b, dx: b.x - w[0], dy: b.y - w[1] };              // paused: the body simply follows the pointer
        else Ph.grabAt(b, w[0], w[1]);
      },
      move: function (x, y) {
        var w = world(x, y);
        if (st.arr) { var b = st.arr.b; b.x = clamp(w[0] + st.arr.dx, b.type === 'circle' ? b.r : 0.3, Ph.W - (b.type === 'circle' ? b.r : 0.3)); b.y = clamp(w[1] + st.arr.dy, b.type === 'circle' ? b.r : 0.3, Ph.H - (b.type === 'circle' ? b.r : 0.3)); b.vx = b.vy = b.w = 0; Ph.version++; }
        else { Ph.dragTo(w[0], w[1]); if (PF.paused) Ph.step(1 / 40, true); }                 // with page animation paused a drag still has to move the body
      },
      up: function () {
        if (st.arr) { st.arr = null; return; }
        Ph.release();
      },
      tap: function (x, y) {
        var w = world(x, y); if (w[0] < 0.2 || w[0] > Ph.W - 0.2 || w[1] < 0.2 || w[1] > Ph.H - 0.2) return;
        var b = Ph.spawn(st.kind, w[0], w[1]); if (b) { st.touched = true; Ph.hot = b; }
      },
      cursor: function (x, y) { return input.hit(x, y) ? (Ph.grab || st.arr ? 'grabbing' : 'grab') : ''; }
    };

    function room(V) { var F = frame(V), rw = Ph.W * F.sc, rh = Ph.H * F.sc; return { x: F.ox, y: F.oy - rh, w: rw, h: rh }; }
    return {
      id: 'sandbox', sim: Ph, side: 1, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      room: room,
      anchor: function (V) { var r = room(V); return { x: r.x + r.w / 2, y: r.y + r.h / 2, r: Math.min(r.w, r.h) / 2 }; },
      setKind: function (k) { st.kind = k; }, touched: function () { st.touched = true; }, resetHint: function () { st.touched = false; }
    };
  };

  /* ---------- the Sandbox panel ---------- */
  PF.labs.add('sandbox', function (root, h) {
    function scene() { return PF.film && PF.film.scenes && PF.film.scenes.sandbox; }
    function spawn(kind) { var s = scene(); if (s) s.setKind(kind); var b = Ph.spawn(kind); if (b) { Ph.hot = b; if (s) s.touched(); } }
    h.seg('preset', function (v) { Ph.load(v); var s = scene(); if (s) s.resetHint(); });
    h.seg('gravity', function (v) { Ph.setGravity(+v); });
    h.range('bounce', function (v) { Ph.setBounce(v); });
    h.range('friction', function (v) { Ph.setFriction(v); });
    h.btn('ball', function () { spawn('ball'); });
    h.btn('box', function () { spawn('box'); });
    h.btn('throw', function () { var b = Ph.throwOne(); if (b) { Ph.hot = b; var s = scene(); if (s) s.touched(); } });
    h.btn('shake', function () { Ph.shake(); });
    h.btn('remove', function () { if (Ph.hot) Ph.remove(Ph.hot); });
    h.btn('pause', function () { Ph.paused = !Ph.paused; Ph.version++; });
    h.btn('step', function () { Ph.stepOnce(); });
    h.btn('reset', function () { Ph.setGravity(9.81); Ph.setBounce(0.25); Ph.setFriction(0.5); Ph.load(Ph.preset); var s = scene(); if (s) s.resetHint(); });
    return {
      sync: function () {
        var full = Ph.count() >= Ph.MAX;
        h.setSeg('preset', Ph.preset);
        h.setSeg('gravity', [0, 1.62, 9.81, 24.8].reduce(function (best, v) { return Math.abs(v - Ph.g) < Math.abs(best - Ph.g) ? v : best; }, 9.81) + '');
        h.setRange('bounce', Ph.bounce, Math.round(Ph.bounce * 100) + '%');
        h.setRange('friction', Ph.friction, Ph.friction.toFixed(2));
        h.setBtn('pause', { pressed: Ph.paused, label: Ph.paused ? 'Play' : 'Pause' });
        h.setBtn('step', { disabled: !Ph.paused });
        h.setBtn('ball', { disabled: full }); h.setBtn('box', { disabled: full }); h.setBtn('throw', { disabled: full });
        h.setBtn('remove', { disabled: !Ph.hot });
        h.text('count', Ph.count() + ' of ' + Ph.MAX + ' objects');
        h.status(full ? 'Limit of ' + Ph.MAX + ' objects reached. Remove some, or reset.' : Ph.paused ? 'Paused. Drag to arrange, or press Step to advance a moment.' : '', full);
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
