/* ==========================================================================
   film.js
   One stage, one canvas, one camera for the whole page.

   The page is a sequence of 11 scenes (Home, nine projects, About/Contact) with a
   transition between each pair. Scroll position is the only input:

       timeline position s (in stage heights)
         [ hold 0 ][ transition 0->1 ][ hold 1 ][ transition 1->2 ] ... [ hold 10 ]

   During a hold the scene is settled and still live (the simulation keeps
   running) so the text beside it can be read and its links used. During a
   transition the film moves the camera and changes the objects' configuration.
   Everything is reversible because the picture is a pure function of s.

   main.js writes PF.film.target from the scroll position. The film follows it
   with a little damping so movement has weight, and snaps when paused.

   Transitions are decorative camera moves. They are never presented as physics:
   the caption says so while one is playing.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;

  var ORDER = ['home', 'bridge', 'wind', 'truss', 'sandbox', 'gravity', 'orbital', 'sat', 'amc', 'calc', 'finale'];
  var HOLD = [0.32, 0.46, 0.46, 0.46, 0.46, 0.46, 0.46, 0.46, 0.46, 0.46, 0.7];     // stable viewing, in stage heights
  var TRANS = [0.85, 0.95, 0.9, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85];        // between scene i and i + 1

  /* ---------- timeline ---------- */
  var TL = { hold: [], trans: [], total: 0 };
  (function () {
    var s = 0, i;
    for (i = 0; i < ORDER.length; i++) {
      TL.hold.push([s, s + HOLD[i]]); s += HOLD[i];
      if (i < TRANS.length) { TL.trans.push([s, s + TRANS[i]]); s += TRANS[i]; }
    }
    TL.total = s;
  })();

  function locate(s) {
    var i;
    s = clamp(s, 0, TL.total);
    for (i = 0; i < ORDER.length; i++) {
      if (s <= TL.hold[i][1]) return { i: i, u: 0 };
      if (i < TRANS.length && s < TL.trans[i][1]) return { i: i, u: (s - TL.trans[i][0]) / TRANS[i] };
    }
    return { i: ORDER.length - 1, u: 0 };
  }
  // How visible each scene's text should be (0..1) at timeline position s.
  function weights(s) {
    var loc = locate(s), w = [], i;
    for (i = 0; i < ORDER.length; i++) w.push(0);
    if (loc.u <= 0) { w[loc.i] = 1; return w; }
    w[loc.i] = 1 - smooth(loc.u / 0.2);                    // the leaving text clears early
    w[loc.i + 1] = smooth((loc.u - 0.8) / 0.2);           // the arriving text appears late
    return w;
  }

  var F = PF.film = {
    order: ORDER, TL: TL, target: 0, cur: 0, info: { i: 0, u: 0 }, locate: locate, weights: weights,
    sceneCenter: function (i) { return (TL.hold[i][0] + TL.hold[i][1]) / 2; },
    snap: function () { F.cur = F.target; },
    onUpdate: null, transitions: [], debug: {}
  };

  /* ---------- a placeholder for any scene that is not defined (never shown in the finished site) ---------- */
  function stub(name) {
    return {
      id: name, side: 1, sim: {}, init: function () {}, advance: function () {},
      draw: function (ctx, V) { ctx.fillStyle = 'rgb(14,15,16)'; ctx.fillRect(0, 0, V.w, V.h); U.text(ctx, name, V.free.cx, V.free.cy, 18, 'rgba(255,255,255,0.5)', 'center'); }
    };
  }

  /* ---------- the film visual ---------- */
  PF.visuals.film = function () {
    var shared = PF.BridgeModel ? PF.BridgeModel() : null, scenes = [], views = [], t = 0, lastW = 0, lastH = 0, frameNo = 0;
    ORDER.forEach(function (name) {
      var f = PF.scenes[name];
      scenes.push(f ? f({ model: shared }) : stub(name));
    });

    function init(w, h) {
      lastW = w; lastH = h;
      scenes.forEach(function (sc, i) {
        views[i] = PF.makeView(w, h, sc.side, 'film', sc.textFrac);
        if (sc.init) sc.init(views[i]);
      });
    }

    // Scenes that must be simulated this frame: the current one, and the next during a transition (each simulation once).
    function active() {
      var loc = F.info, a = [scenes[loc.i]];
      if (loc.u > 0) a.push(scenes[loc.i + 1]);
      return a;
    }
    function advance(dt, m) {
      t += dt; frameNo++;
      F.cur += (F.target - F.cur) * Math.min(1, dt * 7);                        // follow the scroll with a little inertia
      if (Math.abs(F.target - F.cur) < 0.0004) F.cur = F.target;
      F.info = locate(F.cur);
      var seen = [];
      active().forEach(function (sc) {
        if (seen.indexOf(sc.sim) >= 0) return; seen.push(sc.sim);
        if (sc.advance) sc.advance(dt, m);
      });
    }

    function draw(ctx, w, h, tt, dt, m) {
      if (dt === 0) F.cur = F.target;                                           // paused, resized or refreshed: no inertia
      if (w !== lastW || h !== lastH) init(w, h);
      var loc = locate(F.cur); F.info = loc;
      var i = loc.i, u = loc.u, A = scenes[i], B = scenes[i + 1], i2;
      for (i2 = 0; i2 < views.length; i2++) { views[i2].t = t; views[i2].m = m; }
      if (u <= 0) {
        A.draw(ctx, views[i], {});
      } else {
        var tr = F.transitions[i];
        if (tr) tr({ ctx: ctx, w: w, h: h, t: t, dt: dt, m: m, A: A, B: B, VA: views[i], VB: views[i + 1], scenes: scenes, views: views, i: i, through: through }, u);
        else {                                                                  // fallback: a plain crossfade
          A.draw(ctx, views[i], {});
          ctx.save(); ctx.globalAlpha = smooth((u - 0.25) / 0.5); B.draw(ctx, views[i + 1], {}); ctx.restore();
        }
      }
      var strength = (views[i] && views[i].lod) ? 0.4 : 0.5;
      G.vignette(ctx, w, h, strength);
      if (!(views[i] && views[i].lod)) G.grain(ctx, w, h, 0.05);
      if (F.onUpdate) F.onUpdate(loc, weights(F.cur));
    }

    return { init: init, advance: advance, draw: draw };
  };


  /* ---------- a single scene as an ordinary row (reduced motion, or the film is off) ---------- */
  PF.visuals.still = function (opts) {
    var make = PF.scenes[opts.key], sc = make ? make({}) : stub(opts.key), V = null;
    return {
      init: function (w, h) { V = PF.makeView(w, h, sc.side, 'still'); if (sc.init) sc.init(V); },
      advance: function (dt, m) { if (sc.advance) sc.advance(dt, m); },
      draw: function (ctx, w, h, t, dt, m) {
        if (!V) return;
        V.t = t; V.m = m; sc.draw(ctx, V, {});
        G.vignette(ctx, w, h, 0.4); if (!V.lod) G.grain(ctx, w, h, 0.05);
      }
    };
  };

  /* Draw a scene through a 2D camera: the point (fx, fy) of the scene lands on screen point (tx, ty),
     scaled by `zoom` and rolled by `roll` about that point. */
  function through(ctx, scene, V, o, zoom, roll, fx, fy, tx, ty) {
    ctx.save();
    ctx.translate(tx == null ? V.w / 2 : tx, ty == null ? V.h / 2 : ty);
    if (roll) ctx.rotate(roll);
    ctx.scale(zoom, zoom); ctx.translate(-fx, -fy);
    scene.draw(ctx, V, o || {});
    ctx.restore();
  }
  F.through = through;
})(typeof window !== 'undefined' ? window : globalThis);
