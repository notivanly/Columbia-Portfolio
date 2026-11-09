/* ==========================================================================
   transitions.js
   The ten transitions of the film. Each is a function (X, u) of the progress u
   in 0..1 through one transition; scroll position is the only thing that moves u,
   so every transition is reversible.

   Every transition begins exactly on the settled first scene and ends exactly on
   the settled next scene, and connects them through a shared shape, a shared
   camera framing, or a change of scale, rather than a fade:

     0  Home -> Bridge        the parts come together into the bridge as the camera moves in
     1  Bridge -> Wind        the camera dollies along a chord member until it is a bar; the bar opens onto the airflow
     2  Wind -> Truss         the wing section is cut away; its ribs are the truss, and move into place
     3  Truss -> Sandbox      a joint fills the frame, then opens into the pin of a pendulum
     4  Sandbox -> Gravity    a ball is followed as the floor curves into the limb of a planet
     5  Gravity -> Orbital    the camera dives into Earth and comes back out above it
     6  Orbital -> SAT        points on the orbits settle into the grid of questions
     7  SAT -> AMC            the camera drops onto one question's figure, which becomes the construction
     8  AMC -> Calculus III   the construction's rings lift into the surface
     9  Calculus III -> End   the surface flattens and the camera settles

   These are decorative camera moves. None of them is a physical process, and
   the caption says so while one is playing.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, F = PF.film, U = PF.util, G = PF.g3d;
  var clamp = U.clamp, lerp = U.lerp, smooth = U.smooth, inOut = U.inOut, out3 = U.out3, seg = U.seg, TAU = U.TAU;
  var BG = 'rgb(14,15,16)', T = F.transitions;

  /* Draw a scene once into an offscreen canvas, so that the positions it reports (anchors) exist. */
  var scratch = null, sctx = null;
  function warm(X, scene, V) {
    if (!global.document) return;
    if (!scratch) { scratch = global.document.createElement('canvas'); sctx = scratch.getContext('2d'); }
    if (scratch.width !== X.w || scratch.height !== X.h) { scratch.width = X.w; scratch.height = X.h; }
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, X.w, X.h);
    scene.draw(sctx, V, {});
  }
  function bg(X, col) { X.ctx.fillStyle = col || BG; X.ctx.fillRect(0, 0, X.w, X.h); }
  function alpha(ctx, a, fn) { if (a <= 0.003) return; ctx.save(); ctx.globalAlpha = clamp(a, 0, 1); fn(); ctx.restore(); }

  /* ---- 0. Home -> Bridge: the parts come together ---- */
  T[0] = function (X, u) {
    var m = X.B.model, e = inOut(u);
    var pose = G.lerpPose(m.wide(X.VA), m.settled(X.VB), e);
    var ex = function (xf) { var q = clamp((u * 1.3 - 0.08 - xf * 0.4) / 0.5, 0, 1); return 1 - inOut(q); };     // the parts dock from left to right
    X.B.draw(X.ctx, X.VB, { pose: pose, ex: ex });
  };

  /* ---- 1. Bridge -> Wind: along a chord member, then through it ---- */
  T[1] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, m = X.A.model, B = X.B, T_IN = 0.42, T_OPEN = 0.34;
    bg(X);
    var ch = m.chord(), rw = 0.045 + 0.06 * Math.min(1, Math.abs(ch.force)), band = 0.2 * h, dEnd = 3.4, kEnd = band / (2 * rw);
    var p0 = m.settled(X.VA), p1 = { tx: ch.x, ty: ch.y, tz: ch.z, yaw: 0, pitch: 0, dist: dEnd, f: kEnd * dEnd, cx: w / 2, cy: h / 2, roll: 0 };
    var pose = G.lerpPose(p0, p1, inOut(u / T_IN));
    var open = inOut((u - T_OPEN) / (1 - T_OPEN)), ap = lerp(band, h * 1.2, open), top = h / 2 - ap / 2;
    if (open < 0.96) X.A.draw(ctx, X.VA, { pose: pose });
    if (u > T_OPEN) {
      if (!B.st.focus) warm(X, B, X.VB);
      var fw = B.focus(), e3 = out3((u - T_OPEN) / (1 - T_OPEN)), zw = Math.exp(lerp(Math.log(7), 0, e3)), rl = -fw.ang * (1 - e3), mix = smooth((u - T_OPEN) / 0.1);
      ctx.save(); ctx.beginPath(); ctx.rect(0, top, w, ap); ctx.clip();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,' + mix.toFixed(3) + ')'; ctx.fillRect(0, top, w, ap);
      ctx.globalCompositeOperation = 'source-over';
      X.through(ctx, B, X.VB, {}, zw, rl, fw.x, fw.y, lerp(w / 2, fw.x, e3), lerp(h / 2, fw.y, e3));
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - open)).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.moveTo(0, top + ap); ctx.lineTo(w, top + ap); ctx.stroke();
    }
  };

  /* ---- 2. Wind -> Truss: cut away the wing section; its ribs are the truss ---- */
  function wingRange(cap) {                                  // screen-space leading and trailing edge of the section
    var lo = 1e9, hi = -1e9, i;
    for (i = 0; i < cap.length; i++) { if (cap[i][0] < lo) lo = cap[i][0]; if (cap[i][0] > hi) hi = cap[i][0]; }
    return [lo, hi];
  }
  function surfaceAt(cap, x) {                               // upper and lower surface y at screen x
    var up = 1e9, lo = -1e9, i;
    for (i = 0; i < cap.length - 1; i++) {
      var a = cap[i], b = cap[i + 1];
      if ((a[0] - x) * (b[0] - x) <= 0 && a[0] !== b[0]) { var f = (x - a[0]) / (b[0] - a[0]), y = a[1] + f * (b[1] - a[1]); if (y < up) up = y; if (y > lo) lo = y; }
    }
    return up === 1e9 ? null : [up, lo];
  }
  T[2] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, tr = B.geom, i;
    bg(X);
    // the camera swings to look straight down the span, the wing levels, the flow and the glass fade
    var e1 = inOut(seg(u, 0, 0.32)), p0 = A.settled(X.VA), pose = { tx: p0.tx, ty: p0.ty, tz: 0, yaw: lerp(p0.yaw, 0, e1), pitch: lerp(p0.pitch, 0, e1), dist: p0.dist, f: p0.f * lerp(1, 1.3, e1), cx: p0.cx, cy: p0.cy, roll: 0 };
    var wingA = 1 - smooth(seg(u, 0.62, 0.9));
    alpha(ctx, wingA, function () { A.draw(ctx, X.VA, { pose: pose, alphaDeg: lerp(A.st.alpha, 0, e1), flow: 1 - seg(u, 0, 0.28), walls: 1 - 0.8 * e1 }); });
    var cap = A.cap(); if (!cap) return;
    var rng = wingRange(cap), c0 = rng[0], c1 = rng[1], chord = c1 - c0;
    // the truss nodes: inside the section (screen space), and in their final place
    var dest = B.nodesScreen(X.VB), src = tr.T.nodes.map(function (nd) {
      var s = nd.x / tr.L, t = nd.y / tr.H, xx = c0 + (0.06 + 0.88 * s) * chord, sf = surfaceAt(cap, xx) || [X.VA.free.cy - 20, X.VA.free.cy + 20], th = sf[1] - sf[0];
      return [xx, lerp(sf[1] - th * 0.14, sf[0] + th * 0.14, t)];
    });
    var sweepE = inOut(seg(u, 0.26, 0.6)), sweepX = lerp(c0 - 4, c1 + 6, sweepE), mph = inOut(seg(u, 0.58, 0.94));
    var forces = B.forces();
    function lattice(clipX) {
      ctx.save();
      if (clipX != null) {                                   // only the part the cut has passed
        ctx.beginPath(); ctx.moveTo(cap[0][0], cap[0][1]); for (i = 1; i < cap.length; i++) ctx.lineTo(cap[i][0], cap[i][1]); ctx.closePath(); ctx.clip();
        ctx.beginPath(); ctx.rect(0, 0, clipX, h); ctx.clip();
        ctx.fillStyle = 'rgb(9,13,18)'; ctx.fillRect(0, 0, w, h);
      }
      var pos = src.map(function (s, k) { return [lerp(s[0], dest[k][0], mph), lerp(s[1], dest[k][1], mph)]; }), lw = lerp(2.2, 6, mph);
      ctx.lineCap = 'round';
      tr.T.members.forEach(function (mb, k) {
        var f = forces[k]; ctx.strokeStyle = f < -0.05 ? 'rgba(236,146,112,0.95)' : f > 0.05 ? 'rgba(190,205,225,0.95)' : 'rgba(120,134,150,0.9)'; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(pos[mb[0]][0], pos[mb[0]][1]); ctx.lineTo(pos[mb[1]][0], pos[mb[1]][1]); ctx.stroke();
      });
      pos.forEach(function (p) { G.ball(ctx, p[0], p[1], lerp(3, 7, mph), [200, 208, 218], { rim: 0.1 }); });
      ctx.restore();
    }
    if (u > 0.24 && u < 0.62) {
      lattice(sweepX);
      ctx.save(); ctx.beginPath(); ctx.moveTo(cap[0][0], cap[0][1]); for (i = 1; i < cap.length; i++) ctx.lineTo(cap[i][0], cap[i][1]); ctx.closePath(); ctx.clip();
      ctx.strokeStyle = 'rgba(142,201,255,0.95)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sweepX, 0); ctx.lineTo(sweepX, h); ctx.stroke(); ctx.restore();
    } else if (u >= 0.62) lattice(null);
    // the section's outline stays a moment, then lets go
    var ol = (1 - smooth(seg(u, 0.55, 0.85))) * smooth(seg(u, 0.2, 0.3));
    if (ol > 0.01) { ctx.strokeStyle = 'rgba(142,201,255,' + (0.8 * ol).toFixed(3) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cap[0][0], cap[0][1]); for (i = 1; i < cap.length; i++) ctx.lineTo(cap[i][0], cap[i][1]); ctx.closePath(); ctx.stroke(); }
    alpha(ctx, smooth(seg(u, 0.8, 1)), function () { B.draw(ctx, X.VB, {}); });
  };

  /* ---- 3. Truss -> Sandbox: a joint fills the frame and opens onto a pendulum's pin ---- */
  T[3] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, T_IN = 0.4, T_OPEN = 0.34;
    bg(X);
    if (!A.st.joints) warm(X, A, X.VA);
    var jt = A.st.joints[9], jr = Math.max(3, 0.2 * jt.k), zIn = 0.34 * h / jr, z1 = Math.exp(inOut(u / T_IN) * Math.log(zIn));
    var open = inOut((u - T_OPEN) / (1 - T_OPEN)), ir0 = 0.34 * h, ir = lerp(ir0, Math.hypot(w, h) * 0.56, open);
    if (open < 0.96) X.through(ctx, A, X.VA, {}, z1, 0, jt.x, jt.y);
    if (u > T_OPEN) {
      var pin = B.pin(), e3 = out3((u - T_OPEN) / (1 - T_OPEN)), zs = Math.exp(lerp(Math.log(ir0 / pin.r), 0, e3)), mix = smooth((u - T_OPEN) / 0.12);
      ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, ir, 0, TAU); ctx.clip();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,' + mix.toFixed(3) + ')'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      X.through(ctx, B, X.VB, { well: false }, zs, 0, pin.x, pin.y, lerp(w / 2, pin.x, e3), lerp(h / 2, pin.y, e3));
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - open)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2, h / 2, ir, 0, TAU); ctx.stroke();
    }
  };

  /* ---- 4. Sandbox -> Gravity: follow a ball as the floor curves into the limb of a planet ---- */
  var STARS = (function () { var r = U.rng(5), a = [], i; for (i = 0; i < 70; i++) a.push([r(), r(), 0.3 + r() * 0.7]); return a; })();
  T[4] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, ball = A.ball(), floorY = A.floorY();
    var sandA = 1 - smooth(seg(u, 0.18, 0.55));
    bg(X, 'rgb(' + Math.round(lerp(10, 25, sandA)) + ',' + Math.round(lerp(11, 27, sandA)) + ',' + Math.round(lerp(14, 30, sandA)) + ')');   // the surround matches the sandbox wall, then space
    var ez = inOut(seg(u, 0, 0.55)), z = lerp(1, 0.6, ez);
    var tx = lerp(ball.x, w * 0.5, ez), ty = lerp(ball.y, h * 0.4, ez);
    // stars appear as the view rises
    ctx.fillStyle = '#fff'; STARS.forEach(function (s) { ctx.globalAlpha = 0.5 * s[2] * smooth(seg(u, 0.15, 0.55)); ctx.fillRect(s[0] * w, s[1] * h * 0.8, 1.6, 1.6); }); ctx.globalAlpha = 1;
    alpha(ctx, 1 - smooth(seg(u, 0.18, 0.55)), function () { X.through(ctx, A, X.VA, { well: false }, z, 0, ball.x, ball.y, tx, ty); });
    // the floor line bends into the limb of a planet
    if (!B.earth().r) warm(X, B, X.VB);
    var floorS = ty + (floorY - ball.y) * z, earth = B.earth(), rEnd = h * 0.95;
    var el = inOut(seg(u, 0.1, 0.6)), R1 = Math.exp(lerp(Math.log(h * 30), Math.log(rEnd), el));
    var mv = inOut(seg(u, 0.6, 0.96)), cx = lerp(tx, earth.x, mv), cy = lerp(floorS + R1, earth.y, mv), R = lerp(R1, earth.r, mv);
    var gA = Math.max(smooth(seg(u, 0.55, 0.9)), 0);
    alpha(ctx, gA, function () { B.draw(ctx, X.VB, {}); });
    alpha(ctx, smooth(seg(u, 0.12, 0.35)) * (1 - smooth(seg(u, 0.92, 1))), function () {
      var ag = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.05); ag.addColorStop(0, 'rgba(142,201,255,0.35)'); ag.addColorStop(1, 'rgba(142,201,255,0)');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, R * 1.05, 0, TAU); ctx.fill();
      G.ball(ctx, cx, cy, R, B.EARTH, { rim: 0.4 });
    });
    // the ball keeps going, now a small body above the limb, and fades into the planet's shadow
    var tb = seg(u, 0.3, 1), rb = lerp(ball.r * z, Math.max(5, earth.r * 0.45), tb), th = -Math.PI / 2 + 0.2 - tb * 2.4, od = R + rb * 2.2;
    alpha(ctx, smooth(seg(u, 0.2, 0.4)) * (1 - smooth(seg(u, 0.78, 0.95))), function () { G.ball(ctx, cx + Math.cos(th) * od, cy + Math.sin(th) * od, rb, [142, 201, 255], { rim: 0.45 }); });
  };

  /* ---- 5. Gravity -> Orbital: dive into Earth and pull back out above it ---- */
  T[5] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B;
    bg(X, 'rgb(8,9,12)');
    if (!A.earth().r) warm(X, A, X.VA);
    if (!B.st.P) warm(X, B, X.VB);
    var ea = A.earth(), eb = B.earth(), swap = 0.62 * h, zA = swap / Math.max(4, ea.r);
    var za = Math.exp(inOut(u / 0.52) * Math.log(zA));
    alpha(ctx, 1 - smooth(seg(u, 0.4, 0.62)), function () { X.through(ctx, A, X.VA, { nolabels: true }, za, 0, ea.x, ea.y); });
    var eb3 = out3(seg(u, 0.42, 1)), zb = Math.exp(lerp(Math.log(swap / Math.max(4, eb.r)), 0, eb3));
    alpha(ctx, smooth(seg(u, 0.4, 0.62)), function () { X.through(ctx, B, X.VB, {}, zb, 0, eb.x, eb.y, lerp(w / 2, eb.x, eb3), lerp(h / 2, eb.y, eb3)); });
  };

  /* ---- 6. Orbital -> SAT: points on the orbits settle into the grid of questions ---- */
  T[6] = function (X, u) {
    var ctx = X.ctx, A = X.A, B = X.B, N = B.count;
    bg(X, 'rgb(10,11,14)');
    if (!A.st.P) warm(X, A, X.VA);
    if (!B.tokens().length) warm(X, B, X.VB);
    var ring = A.ringPoints(N), toks = B.tokens(), k;
    alpha(ctx, 1 - smooth(seg(u, 0.05, 0.5)), function () { A.draw(ctx, X.VA, {}); });
    alpha(ctx, smooth(seg(u, 0.62, 0.96)), function () { B.draw(ctx, X.VB, {}); });
    var out = 1 - smooth(seg(u, 0.8, 1)), fadeIn = smooth(seg(u, 0.04, 0.2));
    for (k = 0; k < N && k < toks.length; k++) {
      var q = inOut(seg(u, 0.1 + (k / N) * 0.22, 0.68 + (k / N) * 0.12)), x = lerp(ring[k][0], toks[k].x, q), y = lerp(ring[k][1], toks[k].y, q), r = lerp(2.8, Math.max(3, toks[k].r * 0.9), q * q);
      ctx.fillStyle = 'rgba(' + Math.round(lerp(245, 142, q)) + ',' + Math.round(lerp(245, 201, q)) + ',' + Math.round(lerp(242, 255, q)) + ',' + (0.95 * out * fadeIn).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  };

  /* ---- 7. SAT -> AMC: drop onto one question's figure, which is the construction ---- */
  T[7] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B;
    bg(X, 'rgb(12,14,17)');
    var sw = A.selWorld(), pB = B.settled(X.VB), PB = G.camera(pB), O = PB(0, 0, 0), figR = sw.R * 0.82, k = (3 * O.k) / figR, dist = pB.dist;
    var pA = A.settled(X.VA), pEnd = { tx: sw.x, ty: sw.y, tz: sw.z, yaw: 0, pitch: pB.pitch, dist: dist, f: k * dist, cx: O.x, cy: O.y, roll: 0 };
    var pose = G.lerpPose(pA, pEnd, inOut(seg(u, 0, 0.64)));
    alpha(ctx, 1 - smooth(seg(u, 0.5, 0.76)), function () { A.draw(ctx, X.VA, { pose: pose, nobg: false }); });
    var det = smooth(seg(u, 0.62, 1));
    alpha(ctx, smooth(seg(u, 0.46, 0.72)), function () { B.draw(ctx, X.VB, { detail: det, slab: det }); });
  };

  /* ---- 8. AMC -> Calculus III: the construction's rings lift into the surface ---- */
  T[8] = function (X, u) {
    var ctx = X.ctx, A = X.A, B = X.B, e = inOut(u);
    bg(X, 'rgb(11,13,16)');
    var pose = G.lerpPose(A.settled(X.VA), B.settled(X.VB), e), c0 = G.camera(pose)(0, 0, 0);
    G.glow(ctx, c0.x, c0.y, Math.max(X.w, X.h) * 0.55, [100, 140, 190], 0.13);
    alpha(ctx, 1 - smooth(seg(u, 0.12, 0.55)), function () { A.draw(ctx, X.VA, { pose: pose, nobg: true, detail: 1 - seg(u, 0, 0.35), slab: 1 - seg(u, 0, 0.4) }); });
    B.draw(ctx, X.VB, { pose: pose, nobg: true, amp: inOut(seg(u, 0.2, 0.9)), fill: smooth(seg(u, 0.45, 0.95)), lines: smooth(seg(u, 0, 0.3)), tangent: seg(u, 0.75, 1), floor: seg(u, 0.7, 1) });
  };

  /* ---- 9. Calculus III -> End: the surface flattens and the camera settles ---- */
  T[9] = function (X, u) {
    var e = inOut(u), pose = G.lerpPose(X.A.settled(X.VA), X.B.settled(X.VB), e);
    X.A.draw(X.ctx, X.VA, { pose: pose, amp: 1 - inOut(seg(u, 0, 0.75)), fill: 1 - smooth(seg(u, 0.1, 0.7)), lines: lerp(1, 0.5, e), tangent: 1 - seg(u, 0, 0.35), floor: 1 - seg(u, 0, 0.4), ground: smooth(seg(u, 0.4, 1)) });
  };
})(typeof window !== 'undefined' ? window : globalThis);
