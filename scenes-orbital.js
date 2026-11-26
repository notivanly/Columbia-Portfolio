/* ==========================================================================
   scenes-orbital.js
   Scene 6: Orbital mechanics.

   A craft in orbit around Earth, the Moon or Mars, seen from above. PF.sim.orbit
   integrates its motion (inverse-square gravity, fourth-order Runge-Kutta, in km and
   km/s) from the actual position and velocity. Burns add or remove speed along the
   direction of travel, and the dashed path is the orbit the craft would follow from
   where it is right now, so a burn changes the prediction at once. Impact and escape end
   the flight with a message; Reset returns to the launch point. Two settings (starting
   height and speed) can be dragged on the picture before launch, or set in the panel.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth, A = U.A, Orb = PF.sim.orbit;
  var FLASH = { t: 0, dir: 0 };                                          // a short engine flame after a burn (shared by the picture and the panel)

  function kmText(v) { return v >= 1e5 ? Math.round(v / 1000) + ' thousand km' : Math.round(v).toLocaleString('en-US') + ' km'; }
  function niceLen(km) { var p = Math.pow(10, Math.floor(Math.log10(km))), m = km / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; }
  function bodyArt(id) {
    var P = PF.sim.planets.SYSTEMS.solar.planets;
    if (id === 'earth') return P[2]; if (id === 'mars') return P[3];
    return { name: 'Moon', color: [172, 172, 168], radiusE: 0.27 };
  }

  S.orbital = function () {
    var st = { range: 0, sc: 1, cx: 0, cy: 0, drag: null, pred: null, predAt: -1, frame: 0, freeze: 0, V: null, lastBody: '' };
    var stars = (function () { var r = U.rng(41), a = [], i; for (i = 0; i < 70; i++) a.push([r(), r(), 0.4 + r() * 0.9, 0.12 + r() * 0.3]); return a; })();
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;

    function targetRange() {                                              // how much of space is shown: the whole current orbit, never less than the body
      var B = Orb.B(), el = Orb.elements(), want = Math.max(el.r * 1.28, B.R * 1.7);
      if (Orb.status === 'ready') { var pr = predict(); if (pr) want = Math.max(want, pr.maxR * 1.15); }
      else if (el.bound) want = Math.max(want, el.apo * 1.14);
      else want = Math.max(want, el.r * 1.3);
      return clamp(want, B.R * 1.6, B.R * 34);
    }
    function predict() {
      var key = Orb.version + ':' + Orb.body + ':' + (Orb.status === 'flying' && !Orb.paused ? Math.floor(st.frame / 3) : 0);
      if (st.predKey === key && st.pred) return st.pred;
      var p = Orb.predict(null, Orb.status === 'flying' ? 260 : 360), i, mx = 0;
      for (i = 0; i < p.pts.length; i += 2) mx = Math.max(mx, Math.hypot(p.pts[i], p.pts[i + 1]));
      p.maxR = mx; st.pred = p; st.predKey = key; return p;
    }

    function advance(dt) {
      st.frame++; Orb.step(dt); FLASH.t = Math.max(0, FLASH.t - dt);
      var tgt = targetRange(); if (!st.range || st.lastBody !== Orb.body) { st.range = tgt; st.lastBody = Orb.body; }
      if (!st.drag) st.range = Math.exp(lerp(Math.log(st.range), Math.log(tgt), Math.min(1, dt * 2.2)));
    }

    function frame(V) {
      var fr = V.free, range = st.freeze || st.range || Orb.B().R * 2, sc = Math.min(fr.w, fr.h) / 2 * 0.9 / range;
      return { cx: fr.cx, cy: fr.cy, sc: sc, range: range };
    }
    function toS(F, x, y) { return [F.cx + x * F.sc, F.cy - y * F.sc]; }

    function drawPath(ctx, F, pts, from) {
      ctx.beginPath(); var i, p = toS(F, pts[from || 0], pts[(from || 0) + 1]); ctx.moveTo(p[0], p[1]);
      for (i = (from || 0) + 2; i < pts.length; i += 2) { p = toS(F, pts[i], pts[i + 1]); ctx.lineTo(p[0], p[1]); }
    }

    function draw(ctx, V, o) {
      o = o || {}; st.V = V;
      var fr = V.free, B = Orb.B(), art = bodyArt(Orb.body), i;
      if (PF.paused || !st.range || st.lastBody !== Orb.body) { st.range = targetRange(); st.lastBody = Orb.body; }
      var F = frame(V), Rpx = B.R * F.sc, c0 = [F.cx, F.cy], el = Orb.elements();
      st.sc = F.sc; st.cx = F.cx; st.cy = F.cy;
      ctx.fillStyle = 'rgb(10,12,15)'; ctx.fillRect(0, 0, V.w, V.h);
      stars.forEach(function (s) { ctx.fillStyle = 'rgba(220,232,255,' + s[3] + ')'; ctx.fillRect(s[0] * V.w, s[1] * V.h, s[2], s[2]); });

      /* the goal of the current challenge */
      var ch = Orb.CH()[Orb.challenge];
      if (ch.kind === 'circ') {
        ctx.strokeStyle = Orb.done ? 'rgba(150,235,185,0.95)' : 'rgba(150,235,185,0.5)'; ctx.lineWidth = Orb.done ? 2.4 : 1.4; ctx.setLineDash(Orb.done ? [] : [3, 6]);
        ctx.beginPath(); ctx.arc(c0[0], c0[1], (B.R + ch.alt) * F.sc, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        if (!o.nolabels) U.text(ctx, 'Goal: ' + ch.alt.toLocaleString('en-US') + ' km', c0[0] + (B.R + ch.alt) * F.sc * 0.71 + 6, c0[1] - (B.R + ch.alt) * F.sc * 0.71 - 4, V.lod ? 10 : 11, 'rgba(150,235,185,1)', 'left', true);
      }

      /* the body, with a thin atmosphere on Earth and Mars */
      if (Orb.body !== 'moon') G.glow(ctx, c0[0], c0[1], Rpx * 1.35, Orb.body === 'earth' ? [110, 170, 240] : [230, 150, 110], 0.22);
      PF.planetArt.paint(ctx, art, 'solar', c0[0], c0[1], Math.max(3, Rpx), 1);
      if (Orb.body !== 'moon') { ctx.strokeStyle = Orb.body === 'earth' ? 'rgba(130,190,255,0.35)' : 'rgba(255,170,130,0.28)'; ctx.lineWidth = Math.max(1, Rpx * 0.025); ctx.beginPath(); ctx.arc(c0[0], c0[1], Rpx * 1.02, 0, TAU); ctx.stroke(); }

      /* the predicted path from the actual state, and the path already flown */
      var pr = Orb.status === 'crashed' || Orb.status === 'escaped' ? null : predict();
      if (pr && pr.pts.length > 3) {
        ctx.strokeStyle = A(0.78); ctx.lineWidth = 1.6; ctx.setLineDash([6, 5]); drawPath(ctx, F, pr.pts); ctx.stroke(); ctx.setLineDash([]);
        if (pr.impact) { var ip = toS(F, pr.pts[pr.pts.length - 2], pr.pts[pr.pts.length - 1]); ctx.strokeStyle = 'rgba(255,130,100,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ip[0], ip[1], 6, 0, TAU); ctx.moveTo(ip[0] - 9, ip[1]); ctx.lineTo(ip[0] + 9, ip[1]); ctx.moveTo(ip[0], ip[1] - 9); ctx.lineTo(ip[0], ip[1] + 9); ctx.stroke(); }
      }
      if (Orb.trail.length > 4) {
        ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; drawPath(ctx, F, Orb.trail); var tp = toS(F, Orb.x, Orb.y); ctx.lineTo(tp[0], tp[1]); ctx.stroke();
      }

      /* lowest and highest points of the current orbit */
      if (el.bound && Orb.status === 'flying' && !o.nolabels) {
        [[el.peri, el.w, 'Low'], [el.apo, el.w + Math.PI, 'High']].forEach(function (q) {
          if (q[0] < B.R || q[0] > F.range * 1.25) return;
          var p = toS(F, Math.cos(q[1]) * q[0], Math.sin(q[1]) * q[0]); ctx.fillStyle = 'rgba(245,245,242,0.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, TAU); ctx.fill();
          if (el.e > 0.02) U.text(ctx, q[2] + ' ' + Math.round(q[0] - B.R).toLocaleString('en-US') + ' km', p[0] + (Math.cos(q[1]) >= 0 ? 8 : -8), p[1] + 4, V.lod ? 9 : 10.5, 'rgba(245,245,242,0.85)', Math.cos(q[1]) >= 0 ? 'left' : 'right', true);
        });
      }

      /* the craft */
      var cp = toS(F, Orb.x, Orb.y), vx = Orb.vx, vy = Orb.vy, head = Orb.status === 'crashed' ? Math.atan2(Orb.y, Orb.x) : Math.atan2(-vy, vx), sz = V.lod ? 8 : 10.5;
      if (Orb.status === 'crashed' && Orb.impact) {
        var t = clamp((Orb.flightT - Orb.impact.t) / 40 + 1, 0, 1); ctx.strokeStyle = 'rgba(255,150,110,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cp[0], cp[1], 9 + 5 * t, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,170,120,0.55)'; ctx.beginPath(); ctx.arc(cp[0], cp[1], 5, 0, TAU); ctx.fill();
      } else {
        G.glow(ctx, cp[0], cp[1], sz * 2.4, [142, 201, 255], 0.35);
        ctx.save(); ctx.translate(cp[0], cp[1]); ctx.rotate(head);
        if (FLASH.t > 0) { var fl = FLASH.t / 0.5 * 16 * (0.6 + 0.4 * Math.sin(V.t * 60)); ctx.fillStyle = 'rgba(255,190,120,0.9)'; ctx.beginPath(); if (FLASH.dir > 0) { ctx.moveTo(-sz * 0.7, -sz * 0.3); ctx.lineTo(-sz * 0.7 - fl, 0); ctx.lineTo(-sz * 0.7, sz * 0.3); } else { ctx.moveTo(sz * 0.9, -sz * 0.3); ctx.lineTo(sz * 0.9 + fl * 0.7, 0); ctx.lineTo(sz * 0.9, sz * 0.3); } ctx.closePath(); ctx.fill(); }
        ctx.fillStyle = '#eef3f9'; ctx.strokeStyle = A(1); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.7, -sz * 0.62); ctx.lineTo(-sz * 0.35, 0); ctx.lineTo(-sz * 0.7, sz * 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore();
      }

      /* before launch: a handle on the craft (height) and an arrow (speed) that can be dragged */
      if (Orb.status === 'ready') {
        var k = arrowK(), tip = [cp[0], cp[1] - Orb.v0() * k];
        ctx.strokeStyle = A(0.95); ctx.fillStyle = A(0.95); ctx.lineWidth = 2; U.arrow(ctx, cp[0], cp[1] - 10, tip[0], tip[1], 8);
        ctx.beginPath(); ctx.arc(tip[0], tip[1], 6.5, 0, TAU); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cp[0], cp[1], 13, 0, TAU); ctx.stroke();
        if (!o.nolabels) {
          U.text(ctx, 'Drag the craft for height', cp[0] + 18, cp[1] + 14, V.lod ? 10 : 11, 'rgba(245,245,242,0.85)', 'left', true);
          U.text(ctx, 'Drag the arrow for speed', Math.min(tip[0] + 14, fr.x1 - 8), tip[1] + 4, V.lod ? 10 : 11, 'rgba(245,245,242,0.85)', tip[0] + 14 > fr.x1 - 150 ? 'right' : 'left', true);
        }
      }

      /* labels */
      if (!o.nolabels) {
        U.text(ctx, 'Seen from above. Dashed: predicted path. Solid: path flown.', fr.x0 + 8, fr.y1 - 4, V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
        var bar = niceLen(F.range * 0.3), bw = bar * F.sc, up = V.lod || fr.w < 560 ? 16 : 0;                     // on a narrow screen the scale bar rides above the caption
        ctx.strokeStyle = 'rgba(245,245,242,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fr.x1 - 10 - bw, fr.y1 - 14 - up); ctx.lineTo(fr.x1 - 10, fr.y1 - 14 - up); ctx.moveTo(fr.x1 - 10 - bw, fr.y1 - 18 - up); ctx.lineTo(fr.x1 - 10 - bw, fr.y1 - 10 - up); ctx.moveTo(fr.x1 - 10, fr.y1 - 18 - up); ctx.lineTo(fr.x1 - 10, fr.y1 - 10 - up); ctx.stroke();
        U.text(ctx, kmText(bar), fr.x1 - 10, fr.y1 - 22 - up, V.lod ? 10 : 11, 'rgba(245,245,242,0.85)', 'right', true);
        var msg = Orb.status === 'crashed' ? Orb.msg : Orb.status === 'escaped' ? Orb.msg : Orb.done ? Orb.msg : '';
        if (msg) {
          ctx.font = '500 ' + (V.lod ? 12 : 14) + 'px Hanken Grotesk, system-ui, sans-serif'; var bw2 = Math.min(fr.w * 0.92, ctx.measureText(msg).width + 28);
          ctx.fillStyle = Orb.status === 'crashed' ? 'rgba(48,22,16,0.92)' : 'rgba(14,32,26,0.92)'; ctx.strokeStyle = Orb.status === 'crashed' ? 'rgba(255,138,92,0.9)' : 'rgba(150,235,185,0.9)'; ctx.lineWidth = 1.3;
          ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(fr.cx - bw2 / 2, fr.y0 + 4, bw2, 30, 8); else ctx.rect(fr.cx - bw2 / 2, fr.y0 + 4, bw2, 30); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(msg.length > 90 && V.lod ? msg.slice(0, 88) + '…' : msg, fr.cx, fr.y0 + 24, bw2 - 12);
        }
      }
    }

    /* ---------- input: before launch, drag the craft (height) or the arrow (speed) ---------- */
    function arrowK() { return 56 / Math.max(0.5, Orb.vc(Orb.B().low)); }          // pixels per km/s: a circular-speed arrow is about 56 px long
    function craftScr() { return [st.cx + Orb.x * st.sc, st.cy - Orb.y * st.sc]; }
    function which(x, y) {
      if (Orb.status !== 'ready' || !st.V) return '';
      var cp = craftScr(), tip = [cp[0], cp[1] - Orb.v0() * arrowK()], pad = coarse ? 26 : 16;
      if (Math.hypot(x - tip[0], y - tip[1]) < pad) return 'speed';
      if (Math.hypot(x - cp[0], y - cp[1]) < pad) return 'alt';
      return '';
    }
    var input = {
      hit: function (x, y) { return !!which(x, y); },
      down: function (x, y) { var w = which(x, y); st.drag = w ? { w: w } : null; st.freeze = st.range; },
      move: function (x, y) {
        if (!st.drag) return;
        if (st.drag.w === 'alt') Orb.setAlt(Math.hypot(x - st.cx, y - st.cy) / st.sc - Orb.B().R);
        else { var cp = craftScr(), vv = (cp[1] - y) / arrowK(); Orb.setV(clamp(vv / Orb.vc(), 0.2, 1.6)); }
        Orb.ready();
      },
      up: function () { st.drag = null; st.freeze = 0; },
      cursor: function (x, y) { var w = which(x, y); return w ? (st.drag ? 'grabbing' : 'grab') : ''; }
    };
    return {
      id: 'orbital', sim: Orb, side: 1, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      anchor: function (V) { var F = frame(V); return { x: F.cx, y: F.cy, r: Math.max(8, Orb.B().R * F.sc) }; }
    };
  };

  /* ---------- the Orbit panel ---------- */
  var WMAX = 20000;
  function warpToSlider(w) { return Math.round(Math.log(clamp(w, 1, WMAX)) / Math.log(WMAX) * 100); }
  function sliderToWarp(v) { return Math.max(1, Math.round(Math.pow(WMAX, v / 100))); }
  function fmtSpeed(v) { return v.toFixed(2) + ' km/s'; }
  function fmtTime(s) { return s >= 7200 ? (s / 3600).toFixed(1) + ' h' : s >= 120 ? (s / 60).toFixed(0) + ' min' : s.toFixed(0) + ' s'; }

  PF.labs.add('orbit', function (root, h) {
    function restart(set) { var was = Orb.status; set(); if (was === 'flying') Orb.launch(); else Orb.ready(); }
    h.seg('body', function (v) { Orb.setBody(v); Orb.launch(); });
    h.range('alt', function (v) { restart(function () { Orb.setAlt(v); }); });
    h.range('vel', function (v) { restart(function () { Orb.setV(v / 100); }); });
    h.btn('launch', function () { Orb.launch(); });
    h.btn('pro', function () { if (Orb.burn(1)) { FLASH.t = 0.5; FLASH.dir = 1; } });
    h.btn('retro', function () { if (Orb.burn(-1)) { FLASH.t = 0.5; FLASH.dir = -1; } });
    h.range('burn', function (v) { Orb.setBurn(v); });
    h.btn('pause', function () { Orb.paused = !Orb.paused; Orb.version++; });
    h.btn('reset', function () { Orb.setBurn(50); Orb.setWarp(300); Orb.setAlt(Orb.B().low); Orb.setV(1); Orb.reset(); });
    h.range('warp', function (v) { Orb.setWarp(sliderToWarp(v)); });
    h.pick('challenge', function (v) { Orb.setChallenge(+v); });
    return {
      sync: function () {
        var B = Orb.B(), el = Orb.elements(), ar = Orb.altRange(), fl = Orb.status === 'flying', cls = Orb.classify();
        h.setSeg('body', Orb.body);
        h.setRange('alt', Orb.alt, Math.round(Orb.alt).toLocaleString('en-US') + ' km', ar[0], ar[1]);
        h.setRange('vel', Math.round(Orb.vrel * 100), Math.round(Orb.vrel * 100) + '% (' + fmtSpeed(Orb.v0()) + ')', 20, 160);
        h.setBtn('launch', { label: fl ? 'Launch again' : 'Launch', disabled: false });
        h.setBtn('pro', { disabled: !fl }); h.setBtn('retro', { disabled: !fl });
        h.setRange('burn', Orb.burnSize, Orb.burnSize + ' m/s');
        h.setBtn('pause', { pressed: Orb.paused, label: Orb.paused ? 'Play' : 'Pause', disabled: !fl });
        h.setRange('warp', warpToSlider(Orb.warp), 'x' + Orb.warp.toLocaleString('en-US'));
        h.setPick('challenge', Orb.challenge, Orb.CH().map(function (c, i) { return [String(i), c.title]; }));
        var state = Orb.status === 'ready' ? 'Ready to launch' : Orb.status === 'crashed' ? 'Crashed' : Orb.status === 'escaped' ? 'Escaped' : cls === 'orbit' ? 'In orbit' : cls === 'suborbital' ? 'Falling back: this path meets the surface' : 'Escaping';
        h.text('state', state + (Orb.done ? ' - challenge complete' : ''));
        h.text('alt-r', 'Height ' + Math.max(0, el.alt).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km, speed ' + fmtSpeed(el.v));
        h.text('orbit-r', el.bound ? 'Lowest ' + Math.max(0, el.peri - B.R).toFixed(0) + ' km, highest ' + (el.apo - B.R).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km, one orbit ' + fmtTime(el.period) : 'Not bound to ' + B.name + ': speed left over ' + fmtSpeed(el.vinf || 0));
        h.text('dv', 'Change of speed used: ' + Math.round(Orb.dv) + ' m/s');
        h.text('t-r', 'Flight time ' + fmtTime(Orb.flightT));
        h.text('tech-mu', 'Gravity of ' + B.name + ': GM = ' + B.mu.toLocaleString('en-US') + ' km³/s², radius ' + B.R.toLocaleString('en-US') + ' km');
        h.text('tech-e', 'Eccentricity ' + el.e.toFixed(3) + ', specific energy ' + el.eps.toFixed(2) + ' km²/s²');
        h.status(Orb.status === 'crashed' || Orb.status === 'escaped' || Orb.done ? Orb.msg : '', Orb.status === 'crashed');
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
