/* ==========================================================================
   transitions.js
   The eight transitions of the film. Each is a function (X, u) of the progress u
   in 0..1 through one transition; scroll position is the only thing that moves u,
   so every transition is reversible.

   Every transition begins exactly on the settled first scene and ends exactly on
   the settled next scene, and connects them through a shared shape, a shared
   camera framing, or a change of scale, rather than a fade. They are written
   against what each scene reports about itself (scene.anchor(V), outlineScreen(V),
   focus(V)), not against fixed geometry, because what is on screen depends on what
   the visitor has done: the wind tunnel may hold a sphere or a banana, the truss may
   have been dragged out of shape, the planet explorer may show any system.

     0  Home -> Bridge        the parts come together into the bridge as the camera moves in
     1  Bridge -> Wind        the camera dollies along a chord member until it is a bar; the bar opens onto the airflow
     2  Wind -> Truss         the object's own outline grows into a window onto the truss
     3  Truss -> Sandbox      the loaded joint fills the frame, then opens onto the sandbox
     4  Sandbox -> Planets    the room drops away and the view lifts into space
     5  Planets -> Orbital    the camera dives into the system and comes out above a planet
     6  Orbital -> Learning   a ring grows out of the body and opens onto the showcase
     7  Learning -> Finale    the showcase settles back into a night sky

   These are decorative camera moves. None of them is a physical process, and
   the caption says so while one is playing. While one plays, the scenes take no input.
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
  function where(scene, V) { return (scene.focus ? scene.focus(V) : null) || scene.anchor(V); }       // the point of a scene a transition aims at

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
      if (!B.st.cx) warm(X, B, X.VB);
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

  /* ---- 2. Wind -> Truss: the object's outline grows into a window onto the truss ---- */
  T[2] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, e = inOut(seg(u, 0.1, 0.9)), poly = A.outlineScreen ? A.outlineScreen(X.VA) : null;
    bg(X); A.draw(ctx, X.VA, {});
    if (!poly || poly.length < 3) { poly = []; var an = A.anchor(X.VA), q; for (q = 0; q < 24; q++) poly.push([an.x + Math.cos(q / 24 * TAU) * an.r, an.y + Math.sin(q / 24 * TAU) * an.r]); }
    var cx = 0, cy = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, i;
    for (i = 0; i < poly.length; i++) { cx += poly[i][0]; cy += poly[i][1]; minx = Math.min(minx, poly[i][0]); maxx = Math.max(maxx, poly[i][0]); miny = Math.min(miny, poly[i][1]); maxy = Math.max(maxy, poly[i][1]); }
    cx /= poly.length; cy /= poly.length;
    var half = Math.max(6, Math.min(maxx - minx, maxy - miny) / 2), kmax = Math.hypot(w, h) / half * 0.8, k = Math.exp(lerp(0, Math.log(kmax), e));
    if (e >= 0.995) { bg(X); B.draw(ctx, X.VB, {}); return; }
    ctx.save(); ctx.beginPath();
    for (i = 0; i < poly.length; i++) { var px = cx + (poly[i][0] - cx) * k, py = cy + (poly[i][1] - cy) * k; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath(); ctx.clip();
    bg(X); X.through(ctx, B, X.VB, {}, lerp(1.25, 1, out3(e)), 0, w / 2, h / 2, w / 2, h / 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(142,201,255,' + (0.9 * (1 - e)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath();
    for (i = 0; i < poly.length; i++) { var qx = cx + (poly[i][0] - cx) * k, qy = cy + (poly[i][1] - cy) * k; if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy); }
    ctx.closePath(); ctx.stroke();
  };

  /* ---- 3. Truss -> Sandbox: the loaded joint fills the frame, then opens onto the sandbox ---- */
  T[3] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, T_IN = 0.4, T_OPEN = 0.34, a = where(A, X.VA), b = where(B, X.VB);
    bg(X);
    var ar = Math.max(4, a.r), zIn = 0.34 * h / ar, z1 = Math.exp(inOut(u / T_IN) * Math.log(zIn));
    var open = inOut((u - T_OPEN) / (1 - T_OPEN)), ir0 = 0.34 * h, ir = lerp(ir0, Math.hypot(w, h) * 0.56, open);
    if (open < 0.96) X.through(ctx, A, X.VA, {}, z1, 0, a.x, a.y);
    if (u > T_OPEN) {
      var e3 = out3((u - T_OPEN) / (1 - T_OPEN)), zs = Math.exp(lerp(Math.log(clamp(ir0 / Math.max(6, b.r), 1, 14)), 0, e3)), mix = smooth((u - T_OPEN) / 0.12);
      ctx.save(); ctx.beginPath(); ctx.arc(w / 2, h / 2, ir, 0, TAU); ctx.clip();
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,' + mix.toFixed(3) + ')'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      X.through(ctx, B, X.VB, {}, zs, 0, b.x, b.y, lerp(w / 2, b.x, e3), lerp(h / 2, b.y, e3));
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - open)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2, h / 2, ir, 0, TAU); ctx.stroke();
    }
  };

  /* ---- 4. Sandbox -> Planets: the room drops away and the view lifts into space ---- */
  var STARS = (function () { var r = U.rng(5), a = [], i; for (i = 0; i < 70; i++) a.push([r(), r(), 0.3 + r() * 0.7]); return a; })();
  T[4] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, a = A.anchor(X.VA), b = B.anchor(X.VB), leave = 1 - smooth(seg(u, 0.15, 0.55)), arrive = smooth(seg(u, 0.35, 0.85));
    bg(X, 'rgb(' + Math.round(lerp(10, 14, leave)) + ',' + Math.round(lerp(11, 16, leave)) + ',' + Math.round(lerp(14, 20, leave)) + ')');
    ctx.fillStyle = '#fff'; STARS.forEach(function (s) { ctx.globalAlpha = 0.5 * s[2] * smooth(seg(u, 0.15, 0.6)); ctx.fillRect(s[0] * w, s[1] * h, 1.6, 1.6); }); ctx.globalAlpha = 1;
    alpha(ctx, leave, function () { X.through(ctx, A, X.VA, {}, lerp(1, 0.5, inOut(seg(u, 0, 0.6))), 0, a.x, a.y, w / 2, lerp(a.y, h * 0.7, inOut(seg(u, 0, 0.6)))); });
    alpha(ctx, arrive, function () { X.through(ctx, B, X.VB, {}, lerp(1.7, 1, out3(seg(u, 0.3, 1))), 0, b.x, b.y, w / 2 + (b.x - w / 2) * out3(seg(u, 0.3, 1)), b.y); });
  };

  /* ---- 5. Planets -> Orbital: dive into the system, come out above a planet ---- */
  T[5] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, a = A.anchor(X.VA), b = B.anchor(X.VB), e1 = inOut(seg(u, 0, 0.55)), e2 = out3(seg(u, 0.45, 1));
    bg(X, 'rgb(10,12,15)');
    alpha(ctx, 1 - smooth(seg(u, 0.35, 0.62)), function () { X.through(ctx, A, X.VA, {}, Math.exp(e1 * Math.log(6)), 0, a.x, a.y, w / 2, h / 2); });
    alpha(ctx, smooth(seg(u, 0.42, 0.85)), function () { X.through(ctx, B, X.VB, {}, lerp(0.2, 1, e2), 0, b.x, b.y, lerp(w / 2, b.x, e2), lerp(h / 2, b.y, e2)); });
  };

  /* ---- 6. Orbital -> Learning: a ring grows out of the body and opens onto the showcase ---- */
  T[6] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, a = A.anchor(X.VA), e = inOut(seg(u, 0.1, 0.92)), r0 = Math.max(10, a.r * 1.2), ir = lerp(r0, Math.hypot(w, h), e);
    bg(X, 'rgb(10,12,15)'); A.draw(ctx, X.VA, {});
    if (e >= 0.995) { bg(X, 'rgb(12,14,17)'); B.draw(ctx, X.VB, {}); return; }
    ctx.save(); ctx.beginPath(); ctx.arc(a.x, a.y, ir, 0, TAU); ctx.clip();
    bg(X, 'rgb(12,14,17)'); X.through(ctx, B, X.VB, {}, lerp(0.7, 1, out3(e)), 0, w / 2, h / 2, w / 2, h / 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(142,201,255,' + (0.9 * (1 - e)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(a.x, a.y, ir, 0, TAU); ctx.stroke();
  };

  /* ---- 7. Learning -> Finale: the showcase settles back into a night sky ---- */
  T[7] = function (X, u) {
    var ctx = X.ctx, w = X.w, h = X.h, A = X.A, B = X.B, e = inOut(u), a = A.anchor(X.VA), b = B.anchor(X.VB);
    bg(X, 'rgb(10,12,15)');
    alpha(ctx, 1 - smooth(seg(u, 0.1, 0.65)), function () { X.through(ctx, A, X.VA, {}, lerp(1, 0.86, e), 0, a.x, a.y, a.x, lerp(a.y, a.y - h * 0.05, e)); });
    alpha(ctx, smooth(seg(u, 0.3, 0.9)), function () { X.through(ctx, B, X.VB, {}, lerp(1.08, 1, out3(seg(u, 0.3, 1))), 0, b.x, b.y, b.x, b.y); });
  };
})(typeof window !== 'undefined' ? window : globalThis);
