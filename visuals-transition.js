/* ==========================================================================
   visuals-transition.js
   One scroll-linked transition between the first two projects.

   It does not re-implement anything. It runs the existing bridge and wind
   visuals unchanged, and only moves the camera around them:

     1. The camera dollies into the bridge's middle bottom-chord member, rolling
        so the member lies flat, until it fills the frame as a bar.
     2. That bar opens like an aperture. Inside it the wind-tunnel flow is
        already running (its streamlines are horizontal too, like the bar).
     3. The aperture widens to the whole frame while the camera pulls back from
        the airfoil's upper surface to the settled wind-tunnel view.

   PF.seq.target (0..1) is written by main.js from the scroll position. The
   camera follows it with a little damping so the movement has weight, and it
   is fully reversible. Nothing here changes a calculation in either visual.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, W = U.W, V = PF.visuals, clamp = U.clamp, lerp = U.lerp;

  function inOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }   // slow, fast, slow
  function out3(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }                                           // fast, then settles
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  var T_IN = 0.40;        // end of the dolly-in
  var T_OPEN = 0.34;      // the aperture starts to open (slightly before the dolly-in ends, so the two overlap)

  V.bridgewind = function (opts) {
    var B = V.bridge(opts), Wn = V.wind(opts), cur = 0, scratch = null, sctx = null;
    var idle = { x: 0.5, y: 0.5, nx: 0, ny: 0, px: 0, py: 0, rx: -9999, ry: -9999, active: 0 };

    function init(w, h) { if (Wn.init) Wn.init(w, h); }

    // Draw a visual through a camera aimed at screen point f, rolled and scaled about the middle of the frame.
    function through(ctx, vis, z, roll, f, w, h, t, dt, m) {
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.rotate(roll); ctx.scale(z, z); ctx.translate(-f.x, -f.y);
      vis.draw(ctx, w, h, t, dt, m);
      ctx.restore();
    }
    // The camera needs each visual's focus point, which exists after its first frame.
    // Keep the wind-tunnel flow running off screen while the camera approaches, so it is already developed when the aperture opens.
    function keepWarm(w, h, t, dt) {
      if (!global.document) return;
      if (!scratch) { scratch = global.document.createElement('canvas'); sctx = scratch.getContext('2d'); }
      if (scratch.width !== w || scratch.height !== h) { scratch.width = w; scratch.height = h; }
      Wn.draw(sctx, w, h, t, dt, idle);
    }
    function seed(ctx, vis, w, h, t) { if (!vis.focus()) { vis.draw(ctx, w, h, t, 0, idle); ctx.clearRect(0, 0, w, h); } }

    function draw(ctx, w, h, t, dt, m) {
      var target = (PF.seq && PF.seq.target) || 0;
      cur = dt > 0 ? cur + (target - cur) * Math.min(1, dt * 7) : target;      // follow the scroll with a little inertia
      if (Math.abs(target - cur) < 0.0004) cur = target;
      var tp = cur;

      if (tp <= 0.0005) { B.draw(ctx, w, h, t, dt, m); return; }              // settled on the bridge
      if (tp >= 0.9995) { Wn.draw(ctx, w, h, t, dt, m); return; }             // settled on the wind tunnel

      seed(ctx, B, w, h, t); if (tp > T_OPEN) seed(ctx, Wn, w, h, t); else if (dt > 0) keepWarm(w, h, t, dt);
      var fb = B.focus();

      // 1. dolly into the member, rolling it level
      var zi = inOut(tp / T_IN);
      var ZB = clamp(0.2 * h / fb.lw, 8, 40);                                  // the member ends up about a fifth of the frame tall
      var zb = Math.exp(zi * Math.log(ZB)), rb = -fb.ang * zi;
      var band = fb.lw * ZB;

      // 2 and 3. the member's silhouette becomes an aperture that opens to the full frame
      var open = inOut((tp - T_OPEN) / (1 - T_OPEN));
      var ap = lerp(band, h * 1.2, open), top = h / 2 - ap / 2;

      if (open < 0.96) through(ctx, B, zb, rb, fb, w, h, t, dt, idle);

      if (tp > T_OPEN) {
        var fw = Wn.focus(), e3 = out3((tp - T_OPEN) / (1 - T_OPEN));
        var zw = Math.exp(lerp(Math.log(ZB * 0.45), 0, e3)), rw = -fw.ang * (1 - e3);   // pull back from the airfoil surface
        var mix = smooth((tp - T_OPEN) / 0.10);                                          // the bar dissolves into the flow inside the aperture
        ctx.save();
        ctx.beginPath(); ctx.rect(0, top, w, ap); ctx.clip();
        ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,' + mix.toFixed(3) + ')'; ctx.fillRect(0, top, w, ap);
        ctx.globalCompositeOperation = 'source-over';
        through(ctx, Wn, zw, rw, fw, w, h, t, dt, idle);
        ctx.restore();
        // the member's two edges stay as bright lines and travel outward with the aperture
        ctx.strokeStyle = W(0.9 * (1 - open)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.moveTo(0, top + ap); ctx.lineTo(w, top + ap); ctx.stroke();
      }
    }

    return { init: init, draw: draw, hud: null };
  };
})(typeof window !== 'undefined' ? window : globalThis);
