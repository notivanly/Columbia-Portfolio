/* ==========================================================================
   scenes-planets.js
   Scene 5: the Planet explorer.

   Three systems: the Solar System and TRAPPIST-1 (real data, see PF.sim.planets for the
   sources) and Lantern (invented, and labelled as such on screen). Choose a system, see
   it from above, click a planet to look at it, and return. The picture is always
   conceptual: orbit distances are compressed on a logarithmic scale and the planets are
   enlarged so that all of them can be seen. The focused view shows each planet's true
   size next to an Earth. Colours and features of the Solar System's planets follow what
   spacecraft images show; no surface has been observed on any TRAPPIST-1 planet, so
   those are drawn as plain tinted spheres.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth, A = U.A, Pl = PF.sim.planets;

  function hash(str) { var h = 2166136261, i; for (i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  /* ---------- how each planet looks ----------
     'kind' picks the painter; the details are drawn from a seeded generator so a planet
     always looks the same. Only the Solar System's planets get features (they are seen in
     images); TRAPPIST-1's are plain on purpose. */
  var KIND = { Moon: 'cratered', Mercury: 'cratered', Venus: 'clouds', Earth: 'earth', Mars: 'mars', Jupiter: 'bands', Saturn: 'bands', Uranus: 'ice', Neptune: 'ice',
    Ember: 'lava', Tarn: 'ocean', Hollow: 'cratered', Vesper: 'bands', Rime: 'ice' };
  var LOOKS = {};
  function lookOf(p, sysId) {
    var key = sysId + ':' + p.name; if (LOOKS[key]) return LOOKS[key];
    var rnd = U.rng(hash(key) % 90000 + 7), L = { kind: sysId === 'trappist' ? 'plain' : (KIND[p.name] || 'plain'), things: [], bands: [] }, i, n;
    if (L.kind === 'cratered') for (i = 0; i < 16; i++) { var a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.86; L.things.push([Math.cos(a) * d, Math.sin(a) * d, 0.05 + rnd() * 0.1]); }
    if (L.kind === 'earth' || L.kind === 'mars' || L.kind === 'ocean' || L.kind === 'lava') {
      n = L.kind === 'earth' ? 6 : 5;
      for (i = 0; i < n; i++) {                                                                      // a landmass: a cluster of small discs, so the coast is irregular
        var a2 = rnd() * TAU, d2 = Math.sqrt(rnd()) * 0.6, cx = Math.cos(a2) * d2, cy = Math.sin(a2) * d2, tone = rnd(), j, cr = 0.1 + rnd() * 0.14;
        for (j = 0; j < 9; j++) { var a3 = rnd() * TAU, d3 = Math.sqrt(rnd()) * cr * 1.6; L.things.push([cx + Math.cos(a3) * d3, cy + Math.sin(a3) * d3 * 0.8, 0.045 + rnd() * 0.075, tone]); }
      }
      for (i = 0; i < 9; i++) L.bands.push([-0.8 + rnd() * 1.6, (rnd() - 0.5) * 0.5, 0.18 + rnd() * 0.3, (rnd() - 0.5) * 1.1]);       // cloud streaks: latitude, bend, length, sideways position
    }
    if (L.kind === 'bands' || L.kind === 'ice' || L.kind === 'clouds') { n = L.kind === 'bands' ? 11 : 6; for (i = 0; i < n; i++) L.bands.push([-1 + (i + rnd() * 0.5) * 2 / n, (rnd() - 0.5) * 0.25, 0.5 + rnd() * 0.5, rnd() < 0.5 ? 0.82 : 1.14]); }
    return (LOOKS[key] = L);
  }

  /* one planet at (x, y) with radius r; detail only when it is big enough to show */
  function paintPlanet(ctx, p, sysId, x, y, r, alpha) {
    var L = lookOf(p, sysId), col = p.color, detail = r >= 9, g;
    ctx.save(); if (alpha != null) ctx.globalAlpha *= alpha;
    if (p.rings) ringsPart(ctx, x, y, r, col, 'back');
    G.ball(ctx, x, y, r, col, { rim: 0.2, lo: 0.16 });
    if (detail && L.kind !== 'plain') {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.995, 0, TAU); ctx.clip();
      if (L.kind === 'bands' || L.kind === 'ice' || L.kind === 'clouds') {
        L.bands.forEach(function (b) {
          var by = y + b[0] * r, bh = r * (L.kind === 'bands' ? 0.1 : 0.14);
          ctx.fillStyle = G.shade(col, b[3], L.kind === 'ice' ? 0.16 : 0.36); ctx.fillRect(x - r, by, r * 2, bh);
        });
        if (p.spot) { ctx.fillStyle = 'rgba(196,92,64,0.78)'; ctx.beginPath(); ctx.ellipse(x + r * 0.26, y + r * 0.34, r * 0.17, r * 0.1, 0, 0, TAU); ctx.fill(); }
        if (L.kind === 'clouds') { ctx.strokeStyle = 'rgba(255,246,220,0.3)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; L.bands.forEach(function (b) { ctx.beginPath(); ctx.moveTo(x - r * 0.9, y + b[0] * r); ctx.quadraticCurveTo(x, y + b[0] * r + b[1] * r * 1.5, x + r * 0.9, y + b[0] * r + b[1] * 0.4 * r); ctx.stroke(); }); }
      } else if (L.kind === 'cratered') {
        L.things.forEach(function (c) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(x + c[0] * r, y + c[1] * r, c[2] * r, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = Math.max(0.8, r * 0.02); ctx.stroke(); });
      } else {
        var land = L.kind === 'earth' ? [[84, 118, 76], [128, 116, 82]] : L.kind === 'mars' ? [[96, 58, 46], [150, 92, 66]] : L.kind === 'lava' ? [[62, 30, 26], [250, 150, 70]] : [[214, 232, 242], [166, 204, 218]];
        L.things.forEach(function (b) {
          ctx.fillStyle = G.shade(land[b[3] < 0.5 ? 0 : 1], 1, L.kind === 'ocean' ? 0.45 : L.kind === 'mars' ? 0.75 : 0.94); ctx.beginPath(); ctx.arc(x + b[0] * r, y + b[1] * r, b[2] * r, 0, TAU); ctx.fill();
        });
        if (L.kind !== 'mars') {
          ctx.strokeStyle = L.kind === 'lava' ? 'rgba(255,190,120,0.3)' : 'rgba(255,255,255,0.3)'; ctx.lineWidth = r * 0.04; ctx.lineCap = 'round';
          L.bands.forEach(function (b) { var cx0 = x + b[3] * r, cy0 = y + b[0] * r; ctx.beginPath(); ctx.moveTo(cx0 - r * b[2], cy0); ctx.quadraticCurveTo(cx0, cy0 + b[1] * r, cx0 + r * b[2], cy0 - b[1] * r * 0.4); ctx.stroke(); });
        }
        if (L.kind === 'mars' || L.kind === 'earth') { ctx.fillStyle = 'rgba(245,248,252,0.85)'; ctx.beginPath(); ctx.ellipse(x, y - r * 0.97, r * 0.38, r * 0.17, 0, 0, TAU); ctx.fill(); }
      }
      g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.4, r * 0.1, x, y, r * 1.02);                    // put the sphere's shading back over the features
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, 'rgba(0,0,0,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.restore();
    }
    if (p.rings) ringsPart(ctx, x, y, r, col, 'front');
    ctx.restore();
  }
  function ringsPart(ctx, x, y, r, col, part) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.32); ctx.scale(1, 0.3);
    var k, a0 = part === 'back' ? Math.PI : 0, a1 = part === 'back' ? TAU : Math.PI;
    for (k = 0; k < 4; k++) {
      var rad = r * (1.42 + k * 0.2); ctx.strokeStyle = G.shade(col, 0.95 - k * 0.12, 0.55 - k * 0.08); ctx.lineWidth = Math.max(1, r * 0.13);
      ctx.beginPath(); ctx.arc(0, 0, rad, a0, a1); ctx.stroke();
    }
    ctx.restore();
  }
  function paintStar(ctx, sys, x, y, r, a) {
    var c = sys.star.color; G.glow(ctx, x, y, r * 5.5, c, 0.34 * a);
    ctx.save(); ctx.globalAlpha *= a; G.ball(ctx, x, y, r, c, { rim: 0, hi: 1.2, lo: 0.6 }); ctx.restore();
  }

  PF.planetArt = { paint: paintPlanet, star: paintStar };

  S.planets = function () {
    var st = { v: 0, pf: 0, pt: 0, hover: -1, cardHover: -1, cards: [], V: null, geo: null };
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;

    function advance(dt) {
      Pl.step(dt); st.pt += Math.min(dt, 0.05);
      var tv = Pl.view === 'select' ? 0 : 1, tp = Pl.view === 'planet' ? 1 : 0, k = Math.min(1, dt * 6);
      st.v += (tv - st.v) * k; st.pf += (tp - st.pf) * k;
      if (Math.abs(tv - st.v) < 0.002) st.v = tv; if (Math.abs(tp - st.pf) < 0.002) st.pf = tp;
    }

    function cardsLayout(V) {
      var fr = V.free, n = Pl.ORDER.length, gap = V.lod ? 8 : 18, cw = (fr.w - gap * (n - 1)) / n, ch = Math.min(fr.h * 0.86, cw * (V.lod ? 1.5 : 1.25)), y = fr.cy - ch / 2;
      return Pl.ORDER.map(function (id, i) { return { id: id, x: fr.x0 + i * (cw + gap), y: y, w: cw, h: ch }; });
    }
    function geoOf(V) {
      var fr = V.free, tilt = clamp(fr.h / fr.w * 0.9, 0.4, 0.92), Rx = Math.min(fr.w * 0.46, fr.h * 0.44 / tilt), unit = clamp(Rx / 250, 0.62, 1.3);
      return { cx: fr.cx, cy: fr.cy, Rx: Rx, tilt: tilt, unit: unit };
    }
    function pr(p, unit) { return clamp(4 + 4.2 * Math.log2(1 + p.radiusE * 1.2), 4, 22) * unit; }
    function planetPos(G_, sys, i, fr) { var ang = Pl.angle(sys.planets[i]), R = fr[i] * G_.Rx; return { x: G_.cx + Math.cos(ang) * R, y: G_.cy + Math.sin(ang) * R * G_.tilt, back: Math.sin(ang) < 0, R: R }; }

    /* ----- the three systems, side by side, before one is chosen ----- */
    function drawCards(ctx, V, a) {
      var cards = cardsLayout(V); st.cards = cards;
      cards.forEach(function (c, ci) {
        var sys = Pl.SYSTEMS[c.id], hov = st.cardHover === ci, f = Pl.layout(sys), pr_ = Math.min(c.w, c.h * 0.62) * 0.44, ccx = c.x + c.w / 2, ccy = c.y + c.h * 0.42, i;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = hov ? 'rgba(142,201,255,0.08)' : 'rgba(255,255,255,0.035)'; rr(ctx, c.x, c.y, c.w, c.h, 12); ctx.fill();
        ctx.strokeStyle = hov ? A(0.85) : 'rgba(255,255,255,0.14)'; ctx.lineWidth = hov ? 1.6 : 1; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
        for (i = 0; i < sys.planets.length; i++) { ctx.beginPath(); ctx.arc(ccx, ccy, f[i] * pr_, 0, TAU); ctx.stroke(); }
        paintStar(ctx, sys, ccx, ccy, Math.max(3, pr_ * 0.13), 1);
        for (i = 0; i < sys.planets.length; i++) {
          var p = sys.planets[i], ang = p.phase + TAU * (st.pt * sys.days) / p.period, rad = f[i] * pr_;
          paintPlanet(ctx, p, sys.id, ccx + Math.cos(ang) * rad, ccy + Math.sin(ang) * rad, Math.max(1.6, pr(p, 1) * pr_ / 260), 1);
        }
        U.text(ctx, sys.name, ccx, c.y + c.h - (V.lod ? 36 : 44), V.lod ? 12 : 15, '#fff', 'center', true);
        U.text(ctx, sys.blurb, ccx, c.y + c.h - (V.lod ? 22 : 26), V.lod ? 9 : 11, 'rgba(245,245,242,0.72)', 'center', true);
        var tag = sys.real ? 'Real data' : 'Fictional', tw = tag.length * (V.lod ? 5.6 : 6.6) + 14;
        ctx.fillStyle = sys.real ? 'rgba(142,201,255,0.14)' : 'rgba(255,170,120,0.16)'; rr(ctx, ccx - tw / 2, c.y + c.h - (V.lod ? 15 : 17) - 2, tw, V.lod ? 13 : 15, 7); ctx.fill();
        U.text(ctx, tag, ccx, c.y + c.h - (V.lod ? 5 : 6), V.lod ? 8.5 : 10, sys.real ? A(1) : 'rgba(255,184,140,1)', 'center', true);
        ctx.restore();
      });
    }

    /* ----- one system from above ----- */
    function drawSystem(ctx, V, sys, v, pf) {
      var G_ = geoOf(V), fr = V.free, f = Pl.layout(sys), i, order = [], unit = G_.unit, a = smooth(v);
      var idx = Pl.ORDER.indexOf(sys.id), c = st.cards[idx], from = c ? { x: c.x + c.w / 2, y: c.y + c.h * 0.42, s: Math.min(c.w, c.h * 0.62) * 0.44 / G_.Rx } : { x: fr.cx, y: fr.cy, s: 0.3 };
      var s = lerp(from.s, 1, a), cx = lerp(from.x, fr.cx, a), cy = lerp(from.y, fr.cy, a), dim = 1 - 0.82 * smooth(pf);
      ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-fr.cx, -fr.cy); ctx.globalAlpha = a * dim;
      G.glow(ctx, G_.cx, G_.cy, G_.Rx * 0.9, sys.star.color, 0.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1 / Math.max(0.3, s);
      for (i = 0; i < sys.planets.length; i++) { ctx.strokeStyle = st.hover === i && pf < 0.5 ? A(0.6) : 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(G_.cx, G_.cy, f[i] * G_.Rx, f[i] * G_.Rx * G_.tilt, 0, 0, TAU); ctx.stroke(); }
      for (i = 0; i < sys.planets.length; i++) order.push([i, planetPos(G_, sys, i, f)]);
      order.sort(function (p, q) { return p[1].y - q[1].y; });
      var starDone = false;
      function star() { paintStar(ctx, sys, G_.cx, G_.cy, 14 * unit, 1); starDone = true; }
      order.forEach(function (o) {
        if (!starDone && o[1].y > G_.cy) star();
        var p = sys.planets[o[0]], r = pr(p, unit), hov = st.hover === o[0] && pf < 0.5;
        if (hov) { ctx.strokeStyle = A(0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(o[1].x, o[1].y, r + 5, 0, TAU); ctx.stroke(); }
        paintPlanet(ctx, p, sys.id, o[1].x, o[1].y, r, 1);
        if (pf < 0.5 && (!V.lod || hov || sys.planets.length <= 8)) U.text(ctx, p.short || p.name, o[1].x, o[1].y + r + (V.lod ? 11 : 14), V.lod ? 9 : 11, hov ? '#fff' : 'rgba(245,245,242,0.74)', 'center', true);
      });
      if (!starDone) star();
      ctx.restore();
      if (a > 0.9 && pf < 0.5) {
        ctx.save(); ctx.globalAlpha = (a - 0.9) * 10 * (1 - pf * 2);
        U.text(ctx, sys.star.name + (sys.real ? '' : ' (fictional)'), G_.cx, G_.cy - 14 * unit - 12, V.lod ? 10 : 12, 'rgba(255,255,255,0.88)', 'center', true);
        U.text(ctx, 'Not to scale: sizes enlarged, distances compressed.', fr.x0 + 8, fr.y1 - 4, V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
        if (!sys.real) U.text(ctx, 'Fictional system. Everything here is invented.', fr.x1 - 8, fr.y0 + 14, V.lod ? 10 : 11, 'rgba(255,184,140,1)', 'right', true);
        ctx.restore();
      }
      st.geo = { G: G_, f: f, sys: sys, s: s };
    }

    /* ----- one planet, large, beside an Earth at the same scale ----- */
    function drawPlanet(ctx, V, sys, i, pf) {
      var p = sys.planets[i], fr = V.free, G_ = geoOf(V), f = Pl.layout(sys), a = smooth(pf), rel = Math.max(0.1, p.radiusE), gap = fr.w * 0.07;
      var k = Math.min((fr.w * 0.9 - gap) / (2 * (rel + 1)), fr.h * 0.4 / Math.max(rel, 1)), R = rel * k, rE = k, tot = 2 * R + gap + 2 * rE, x0 = fr.cx - tot / 2, py = fr.cy - fr.h * 0.01;
      var tx = x0 + R, ty = py, from = planetPos(G_, sys, i, f), px = lerp(from.x, tx, a), pyy = lerp(from.y, ty, a), r = lerp(pr(p, G_.unit), R, a);
      ctx.save(); ctx.globalAlpha = 0.25 + 0.75 * a;
      G.glow(ctx, px, pyy, r * 2.2, p.color, 0.1 * a);
      paintPlanet(ctx, p, sys.id, px, pyy, r, 1);
      ctx.restore();
      if (a > 0.6) {
        var al = (a - 0.6) / 0.4; ctx.save(); ctx.globalAlpha = al;
        var ex = x0 + 2 * R + gap + rE, ey = py + R - rE, earth = Pl.SYSTEMS.solar.planets[2];
        paintPlanet(ctx, earth, 'solar', ex, ey, rE, 1);
        U.text(ctx, 'Earth, same scale', ex, Math.min(ey + rE + 16, fr.y1 - 6), V.lod ? 10 : 11, 'rgba(245,245,242,0.8)', 'center', true);
        U.text(ctx, p.name, px, Math.max(fr.y0 + 18, pyy - R - 12), V.lod ? 13 : 17, '#fff', 'center', true);
        if (!sys.real) U.text(ctx, 'Fictional. Size and look are invented.', px, Math.max(fr.y0 + 34, pyy - R + 6), V.lod ? 10 : 11, 'rgba(255,184,140,1)', 'center', true);
        else if (sys.id === 'trappist') U.text(ctx, 'Colour only tells the planets apart: no surface has been seen.', fr.cx, fr.y1 - (V.lod ? 20 : 24), V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'center', true);
        /* a small map of where it is on its orbit now (time controls move it) */
        var ix = fr.x1 - 62, iy = fr.y0 + 62, ir = 46;
        if (Math.hypot(ix - px, iy - pyy) > R + ir + 8) {
          ctx.fillStyle = 'rgba(14,15,16,0.7)'; rr(ctx, ix - 56, iy - 52, 112, 106, 10); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(ix, iy - 4, ir * 0.9, ir * 0.9 * 0.55, 0, 0, TAU); ctx.stroke();
          paintStar(ctx, sys, ix, iy - 4, 4, 1);
          var ang = Pl.angle(p); ctx.fillStyle = 'rgb(' + p.color.join(',') + ')'; ctx.beginPath(); ctx.arc(ix + Math.cos(ang) * ir * 0.9, iy - 4 + Math.sin(ang) * ir * 0.9 * 0.55, 3.4, 0, TAU); ctx.fill();
          U.text(ctx, 'Its orbit now', ix, iy + 44, 9.5, 'rgba(245,245,242,0.74)', 'center', true);
        }
        ctx.restore();
      }
    }

    function draw(ctx, V, o) {
      o = o || {}; st.V = V;
      if (PF.paused) { st.v = Pl.view === 'select' ? 0 : 1; st.pf = Pl.view === 'planet' ? 1 : 0; }               // no easing while animation is paused: show the state as it is
      ctx.fillStyle = 'rgb(12,14,17)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, V.free.cx, V.free.cy, Math.max(V.w, V.h) * 0.5, [100, 140, 190], 0.1);
      var sys = Pl.system(), v = smooth(st.v), pf = smooth(st.pf);
      if (st.v < 0.999 || !sys) { st.cards = cardsLayout(V); drawCards(ctx, V, sys ? 1 - v : 1); }
      if (sys && st.v > 0.001) { drawSystem(ctx, V, sys, st.v, st.pf); if (st.pf > 0.001 && Pl.planet >= 0) drawPlanet(ctx, V, sys, Pl.planet, st.pf); }
      if ((st.v < 0.5 || !sys) && !(o && o.nolabels)) {
        U.text(ctx, 'Choose a system.', V.free.cx, Math.max(V.free.y0 + 14, (st.cards[0] ? st.cards[0].y : V.free.cy) - 14), V.lod ? 12 : 14, 'rgba(255,255,255,0.92)', 'center', true);
      }
    }

    /* ---------- input: taps and hover only, so touch scrolling is never taken over ---------- */
    function planetAt(x, y) {
      var g = st.geo; if (!g || Pl.view !== 'system' || !st.V) return -1;
      var best = -1, bd = coarse ? 28 : 18, i;
      for (i = 0; i < g.sys.planets.length; i++) { var p = planetPos(g.G, g.sys, i, g.f), d = Math.hypot(x - p.x, y - p.y) - pr(g.sys.planets[i], g.G.unit); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function cardAt(x, y) { var i; for (i = 0; i < st.cards.length; i++) { var c = st.cards[i]; if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i; } return -1; }
    var input = {
      tap: function (x, y) {
        if (Pl.view === 'select') { var ci = cardAt(x, y); if (ci >= 0) Pl.enter(st.cards[ci].id); }
        else if (Pl.view === 'system') { var pi = planetAt(x, y); if (pi >= 0) Pl.focus(pi); }
      },
      cursor: function (x, y) {
        var ci = Pl.view === 'select' ? cardAt(x, y) : -1, pi = Pl.view === 'system' ? planetAt(x, y) : -1;
        if (ci !== st.cardHover || pi !== st.hover) { st.cardHover = ci; st.hover = pi; if (PF.input && PF.input.repaint) PF.input.repaint(); }
        return ci >= 0 || pi >= 0 ? 'pointer' : '';
      }
    };
    return {
      id: 'planets', sim: Pl, side: -1, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      anchor: function (V) { var g = geoOf(V); return { x: g.cx, y: g.cy, r: g.Rx * 0.5 }; }
    };
  };

  /* ---------- the Planet panel ---------- */
  function clock(days, sys) {
    if (sys && sys.id === 'trappist') return days < 1 ? (days * 24).toFixed(1) + ' hours' : days.toFixed(1) + ' days';
    return days >= 730 ? (days / 365.25).toFixed(1) + ' years' : Math.round(days) + ' days';
  }
  PF.labs.add('planets', function (root, h) {
    h.seg('system', function (v) { Pl.enter(v); });
    h.pick('planet', function (v) { if (Pl.view === 'select') return; if (+v < 0) Pl.overview(); else Pl.focus(+v); });
    h.btn('back', function () { Pl.up(); });
    h.range('speed', function (v) { Pl.setSpeed(v); });
    h.btn('pause', function () { Pl.paused = !Pl.paused; Pl.version++; });
    return {
      sync: function () {
        var sys = Pl.system(), inSys = Pl.view !== 'select' && sys, p = inSys && Pl.planet >= 0 ? sys.planets[Pl.planet] : null, opts = [['-1', inSys ? 'Overview of ' + sys.name : 'Choose a system first']];
        if (inSys) sys.planets.forEach(function (q, i) { opts.push([String(i), q.name]); });
        h.setSeg('system', inSys ? Pl.sys : '');
        h.setPick('planet', p ? Pl.planet : -1, opts);
        h.setBtn('back', { disabled: !inSys, label: Pl.view === 'planet' ? 'Back to the overview' : 'Back to the systems' });
        h.setRange('speed', Pl.speed, 'x' + Pl.speed.toFixed(Pl.speed < 1 ? 1 : 0));
        h.rangeDisabled('speed', !inSys);
        h.setBtn('pause', { pressed: Pl.paused, label: Pl.paused ? 'Play' : 'Pause', disabled: !inSys });
        h.text('time', inSys ? 'Elapsed ' + clock(Pl.t, sys) + (Pl.paused ? ' (paused)' : '') : '');
        if (p) {
          h.html('facts', '<dl>' + p.rows.map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('') + '</dl>');
          h.show('facts', true);
        } else h.show('facts', false);
        h.text('source', inSys ? (sys.real ? 'Source: ' : '') + sys.source : '');
        h.text('look', inSys ? sys.look : '');
        h.text('scale', inSys ? (Pl.view === 'planet' ? 'The planet and the Earth beside it are drawn at the same scale.' : 'Sizes are enlarged and distances compressed so every planet can be seen. Not to scale.') : 'Real systems use published data. The third is invented and says so.');
        h.status(inSys && !sys.real ? 'Fictional system: everything in it is invented.' : '', false);
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
