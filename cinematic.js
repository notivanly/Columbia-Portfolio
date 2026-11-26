/* ==========================================================================
   cinematic.js: optional decorative footage, played as a short intro.

   Nothing in this file is part of any calculation. The simulations, the input
   and the drawing of each scene do not know it exists. It does one thing:
   when a visitor first arrives at a scene, and a footage entry for that scene
   has been supplied, it lays that footage over the scene for a few seconds,
   labelled as decorative, then fades it away and never plays it again. After
   that the scene underneath is all there is: live, calculated, and editable.

   It is OFF unless the page opts in with
       <html data-cinematic="assets/cinematic/manifest.json">
   With no attribute there is no request, no footage and nothing on screen.
   With the attribute but a missing or broken manifest, or a file that fails to
   load, that entry is dropped without a trace: no empty frame, no placeholder,
   no error for the visitor. The procedural transitions in transitions.js are
   always the fallback, because they are what the film is made of.

   The footage may come from anywhere (a camera, a renderer, a generator). The
   page makes no claim about where, and this module never names a service.

   Manifest (all paths relative to the page, same origin):
   {
     "version": 1,
     "scenes": {
       "bridge": {
         "duration": 2.6,                                  seconds, 0.8 to 6
         "poster":   "assets/cinematic/bridge.webp",       a still, used on its own or while a clip loads
         "clip":     "assets/cinematic/bridge.mp4",        muted, plays once
         "sequence": { "pattern": "assets/cinematic/bridge-{n}.webp", "frames": 48, "fps": 24 }
       }
     }
   }
   Scene ids: home, bridge, wind, truss, sandbox, planets, orbital, learn, finale.
   An entry needs at least one of poster, clip or sequence. Preference when
   several are given: sequence, then clip, then poster.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, clamp = U.clamp;
  var IDS = ['home', 'bridge', 'wind', 'truss', 'sandbox', 'planets', 'orbital', 'learn', 'finale'];
  var FADE = 0.8, MAX_FRAMES = 120, LABEL = 'Decorative footage, not simulation output';
  var C = PF.cinematic = { enabled: false, loaded: false, entries: {}, label: LABEL };

  function safePath(p) {                                                 // same-origin, relative, no climbing out
    return typeof p === 'string' && p.length < 200 && !/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(p) && p.indexOf('..') < 0 ? p : null;
  }
  function clean(id, s) {
    if (IDS.indexOf(id) < 0 || !s || typeof s !== 'object') return null;
    var e = { id: id, duration: clamp(+s.duration || 2.6, 0.8, 6), poster: safePath(s.poster), clip: safePath(s.clip), seq: null,
              img: null, video: null, frames: null, state: 'idle', t: 0, ready: false, failed: false, played: false };
    var q = s.sequence;
    if (q && safePath(q.pattern) && q.pattern.indexOf('{n}') >= 0 && (q.frames | 0) > 1) e.seq = { pattern: q.pattern, frames: Math.min(MAX_FRAMES, q.frames | 0), fps: clamp(+q.fps || 24, 6, 60) };
    return e.poster || e.clip || e.seq ? e : null;
  }
  function loadImage(src, done) {
    var im = new global.Image(); im.decoding = 'async';
    im.onload = function () { done(im); }; im.onerror = function () { done(null); };
    im.src = src; return im;
  }

  /* Load what is needed, once, when a scene is about to be reached. Whatever fails is dropped. */
  function prepare(e) {
    if (e.state !== 'idle') return; e.state = 'loading';
    function fail() { e.failed = true; e.ready = false; }
    function usePoster(cb) { if (!e.poster) return cb(false); loadImage(e.poster, function (im) { e.img = im; cb(!!im); }); }
    if (e.seq) {
      var n = e.seq.frames, got = 0, bad = 0; e.frames = new Array(n);
      for (var k = 0; k < n; k++) (function (k) {
        loadImage(e.seq.pattern.replace('{n}', ('000' + (k + 1)).slice(-4)), function (im) { e.frames[k] = im; got++; if (!im) bad++; if (got === n) { if (bad === 0) e.ready = true; else { e.frames = null; usePoster(function (ok) { if (ok) e.ready = true; else fail(); }); } } });
      })(k);
    } else if (e.clip && global.document) {
      var v = global.document.createElement('video'); v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto'; v.loop = false;
      v.onloadeddata = function () { e.video = v; e.ready = true; };
      v.onerror = function () { e.video = null; usePoster(function (ok) { if (ok) e.ready = true; else fail(); }); };
      v.src = e.clip;
    } else usePoster(function (ok) { if (ok) e.ready = true; else fail(); });
  }

  C.enable = function (url) {
    if (C.enabled || !url || !safePath(url) || !global.fetch) return;
    C.enabled = true;
    global.fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (m) {
      if (!m || m.version !== 1 || !m.scenes || typeof m.scenes !== 'object') return;
      Object.keys(m.scenes).forEach(function (id) { var e = clean(id, m.scenes[id]); if (e) C.entries[id] = e; });
      C.loaded = true;
    }).catch(function () {});
  };
  /* The same thing from script, for a page that builds its own list. */
  C.add = function (id, spec) { var e = clean(id, spec); if (e) { C.entries[id] = e; C.loaded = true; C.enabled = true; } return !!e; };

  function stop(e) { if (e.video) { try { e.video.pause(); } catch (x) {} } e.state = 'done'; e.played = true; e.t = 0; }

  /* Called by the film each frame for the scene on screen.
     Returns true while this scene's footage is up, so the film can keep input off for those few seconds. */
  C.start = function (id, index) {
    if (!C.loaded) return false;
    var i, e, now = global.performance ? global.performance.now() : 0;
    for (i = 0; i < IDS.length; i++) { e = C.entries[IDS[i]]; if (e && !e.played && Math.abs(i - index) <= 1) prepare(e); }   // this scene and its neighbours get ready early
    e = C.entries[id]; if (!e || e.played) return false;
    if (PF.paused || PF.reduced || e.failed) { stop(e); return false; }   // reduced motion, paused, or a file that would not load: no footage
    if (e.state === 'playing') return true;
    if (!e.ready) {
      /* Footage that is not ready on arrival is skipped for good: it must never appear late, over a scene the visitor is already using.
         The opening scene alone may wait a moment, since nobody is editing anything there. */
      if (!e.asked) e.asked = now;
      if (id === 'home' && now - e.asked < 1500) return false;
      stop(e); return false;
    }
    e.state = 'playing'; e.t = 0;
    if (e.video) { try { e.video.currentTime = 0; var pr = e.video.play(); if (pr && pr.catch) pr.catch(function () { stop(e); }); } catch (x) { stop(e); return false; } }
    return true;
  };
  /* Leaving a scene (a transition began, or the visitor skipped): its footage ends and is not shown again. */
  C.settle = function () { for (var id in C.entries) if (C.entries[id].state === 'playing') stop(C.entries[id]); };
  C.skip = C.settle;

  function cover(ctx, src, sw, sh, w, h) {
    if (!sw || !sh) return; var k = Math.max(w / sw, h / sh), dw = sw * k, dh = sh * k;
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  /* Drawn after the scene and before the vignette, so it is part of the same frame and the same render loop. */
  C.draw = function (ctx, w, h, id, dt, side) {
    var e = C.entries[id]; if (!e || e.state !== 'playing') return;
    e.t += dt || 0;
    if (e.t >= e.duration) { stop(e); return; }
    var a = e.t > e.duration - FADE ? 1 - (e.t - (e.duration - FADE)) / FADE : Math.min(1, e.t / 0.25);       // quick in, slow settle
    ctx.save(); ctx.globalAlpha = clamp(a, 0, 1);
    if (e.frames) { var f = e.frames[Math.min(e.frames.length - 1, Math.floor(e.t * e.seq.fps))]; if (f) cover(ctx, f, f.naturalWidth, f.naturalHeight, w, h); }
    else if (e.video && e.video.readyState >= 2) cover(ctx, e.video, e.video.videoWidth, e.video.videoHeight, w, h);
    else if (e.img) cover(ctx, e.img, e.img.naturalWidth, e.img.naturalHeight, w, h);
    var fs = w < 760 ? 10 : 11, tw = LABEL.length * fs * 0.62 + 20, left = side < 0 && w >= 760;   // a small dark tag at the top, on the picture's side, clear of the text column's scrim
    var tx = left ? 12 : w - 12 - tw;
    ctx.fillStyle = 'rgba(14,15,16,0.8)'; ctx.fillRect(tx, 12, tw, fs + 14);
    U.text(ctx, LABEL, tx + 10, 12 + fs + 3, fs, 'rgba(245,245,242,0.95)', 'left', true);
    ctx.restore();
  };

  if (global.document && global.document.documentElement) {
    var url = global.document.documentElement.getAttribute('data-cinematic');
    if (url) C.enable(url);
  }
}(window));
