/* ==========================================================================
   input.js
   Pointer input for the scenes, kept separate from simulation and rendering.

   A scene offers  scene.input = { hit, down, move, up, tap, cursor }  in canvas pixels:
     hit(x, y)    true when a drag could start here (a joint, a vehicle, a ball...).
                  Only then is the page's scroll held for that touch, so everywhere else
                  a finger still scrolls the page.
     down/move/up a drag that began on a hit.
     tap(x, y)    a short press that did not move, for empty places (add a star).
     cursor(x, y) a CSS cursor for hovering.
   Nothing here is called unless the scene is settled (PF.film.live === its index),
   so a transition can never be interrupted or edited by a stray touch.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF = global.PF || {};
  var I = PF.input = {};

  function pos(canvas, cx, cy) { var r = canvas.getBoundingClientRect(); return { x: (cx - r.left) * (canvas.clientWidth / (r.width || 1)), y: (cy - r.top) * (canvas.clientHeight / (r.height || 1)) }; }
  function repaint(canvas) {                                                // show the change at once, also while animation is paused
    if (canvas._host && PF.paused) canvas._host.refresh();
    else if (PF.start) PF.start();
  }
  I.repaint = function (canvas) { repaint(canvas || I.canvas); };

  /* resolve() returns the scene that is live on this canvas, or null */
  I.attach = function (canvas, resolve) {
    var drag = null, TAP_MS = 600, TAP_PX = 9;
    I.canvas = I.canvas || canvas;
    function scene() { var s = resolve(); return s && s.input ? s : null; }

    canvas.addEventListener('pointerdown', function (e) {
      var sc = scene(); if (!sc) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var p = pos(canvas, e.clientX, e.clientY), h = sc.input, grab = !!(h.hit && h.hit(p.x, p.y, e));
      drag = { id: e.pointerId, sc: sc, grab: grab, x0: p.x, y0: p.y, t0: e.timeStamp, moved: false };
      if (grab) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers cannot be captured */ }
        if (h.down) h.down(p.x, p.y, e);
        e.preventDefault(); repaint(canvas);
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      var sc = scene();
      if (!drag || drag.id !== e.pointerId) {                                // hovering
        if (sc && sc.input.cursor && e.pointerType === 'mouse') { var q = pos(canvas, e.clientX, e.clientY); canvas.style.cursor = sc.input.cursor(q.x, q.y) || ''; }
        return;
      }
      if (!sc || sc !== drag.sc) { drag = null; return; }                    // the scene changed under the pointer (a transition began)
      var p = pos(canvas, e.clientX, e.clientY);
      if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > TAP_PX) drag.moved = true;
      if (drag.grab) { if (drag.sc.input.move) drag.sc.input.move(p.x, p.y, e); repaint(canvas); e.preventDefault(); }
    });
    function finish(e, cancelled) {
      if (!drag || drag.id !== e.pointerId) return;
      var d = drag; drag = null; var p = pos(canvas, e.clientX, e.clientY), sc = scene();
      if (d.grab) { if (d.sc.input.up) d.sc.input.up(p.x, p.y, e, cancelled); }
      else if (!cancelled && !d.moved && e.timeStamp - d.t0 < TAP_MS && sc === d.sc && sc.input.tap) sc.input.tap(p.x, p.y, e);
      repaint(canvas);
    }
    canvas.addEventListener('pointerup', function (e) { finish(e, false); });
    canvas.addEventListener('pointercancel', function (e) { finish(e, true); });
    canvas.addEventListener('lostpointercapture', function (e) { if (drag && drag.id === e.pointerId && drag.grab) finish(e, true); });
    canvas.addEventListener('pointerleave', function () { canvas.style.cursor = ''; });
    // a touch that starts on something draggable must not scroll the page; any other touch scrolls as usual
    canvas.addEventListener('touchstart', function (e) {
      var sc = scene(); if (!sc || !sc.input.hit || e.touches.length !== 1) return;
      var t = e.touches[0], p = pos(canvas, t.clientX, t.clientY);
      if (sc.input.hit(p.x, p.y, e)) e.preventDefault();
    }, { passive: false });
  };
})(typeof window !== 'undefined' ? window : globalThis);
