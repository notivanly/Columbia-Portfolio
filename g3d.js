/* ==========================================================================
   g3d.js
   A very small 3D layer on top of Canvas 2D. No WebGL, no dependencies.

   It exists so the scenes can have solid, lit surfaces and visible depth
   instead of only wireframes:
     camera    an orbit camera that projects world points to the screen
     Batch     a depth-sorted draw list (painter's algorithm, far first)
     face      a lit, flat-shaded polygon
     tube      a bar drawn as a cylinder (dark body + soft highlight)
     ball      a shaded sphere with a rim light
     grid      a ground grid whose lines fade with distance
     shadow    a soft contact shadow on the ground
     grain     fine static noise, which also hides banding in dark gradients

   World axes: x to the right, y up, z toward the viewer. Light comes from the
   upper left, slightly in front. A cool rim light comes from behind.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp;
  var G = (PF.g3d = {});

  var L = [-0.42, 0.78, 0.46], ll = Math.hypot(L[0], L[1], L[2]);
  L = [L[0] / ll, L[1] / ll, L[2] / ll];
  G.L = L;
  G.LS = [-0.55, -0.83];                        // the same light as a screen-space direction (up and to the left)

  /* ---------- colour ---------- */
  function rgba(r, g, b, a) {
    r = r < 0 ? 0 : r > 255 ? 255 : r | 0; g = g < 0 ? 0 : g > 255 ? 255 : g | 0; b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + (a == null ? 1 : +a.toFixed(3)) + ')';
  }
  G.rgba = rgba;
  G.shade = function (c, k, a) { return rgba(c[0] * k, c[1] * k, c[2] * k, a); };
  G.mix = function (a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; };
  // Materials, as base colours [r, g, b].
  G.MAT = {
    steel: [176, 186, 198], darkSteel: [74, 80, 88], concrete: [150, 146, 140], asphalt: [44, 46, 50],
    warm: [255, 138, 92], accent: [142, 201, 255], graphite: [52, 56, 62], glass: [150, 190, 220], paper: [18, 28, 38]
  };
  // Diffuse term for a face normal, with a soft ambient floor.
  G.lambert = function (nx, ny, nz) { var d = nx * L[0] + ny * L[1] + nz * L[2]; return 0.3 + 0.7 * (d > 0 ? d : 0); };

  /* ---------- camera ----------
     c: { tx, ty, tz  (look-at point), yaw, pitch, dist, f (focal length in px), cx, cy (screen centre), roll } */
  G.camera = function (c) {
    var cyw = Math.cos(c.yaw), syw = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    var cr = Math.cos(c.roll || 0), sr = Math.sin(c.roll || 0), tx = c.tx || 0, ty = c.ty || 0, tz = c.tz || 0, f = c.f, dist = c.dist, cx = c.cx, cy = c.cy;
    function P(x, y, z, o) {
      x -= tx; y -= ty; z -= tz;
      var x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw;
      var y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      var dz = dist - z2, k = f / (dz > 0.05 ? dz : 0.05), sx = x1 * k, sy = y2 * k;
      o = o || {};
      o.x = cx + sx * cr - sy * sr; o.y = cy - (sx * sr + sy * cr); o.d = dz; o.k = k; o.ok = dz > 0.3;
      return o;
    }
    P.eye = [tx - dist * cp * syw, ty + dist * sp, tz + dist * cp * cyw];
    P.cam = c;
    return P;
  };
  // True when a face with outward normal n, containing point p, faces the camera.
  G.facing = function (P, n, p) { var e = P.eye; return n[0] * (e[0] - p[0]) + n[1] * (e[1] - p[1]) + n[2] * (e[2] - p[2]) > 0; };

  /* ---------- depth-sorted draw list ---------- */
  function Batch() { this.items = []; this.n = 0; }
  Batch.prototype.add = function (d, fn) {
    var it = this.items[this.n];
    if (!it) { it = { d: 0, fn: null }; this.items[this.n] = it; }
    it.d = d; it.fn = fn; this.n++;
  };
  function byFar(a, b) { return b.d - a.d; }
  Batch.prototype.flush = function (ctx) {
    var a = this.items, n = this.n, i;
    if (a.length !== n) a.length = n;
    a.sort(byFar);
    for (i = 0; i < n; i++) a[i].fn(ctx);
    this.n = 0;
  };
  G.Batch = Batch;

  /* ---------- primitives ---------- */
  // A flat polygon with a fill and an optional hairline edge. pts: projected points.
  G.face = function (batch, pts, fill, edge, lw) {
    var d = 0, i, n = pts.length;
    for (i = 0; i < n; i++) { if (!pts[i].ok) return; d += pts[i].d; }
    d /= n;
    batch.add(d, function (ctx) {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (var j = 1; j < n; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
      if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = lw || 1; ctx.lineJoin = 'round'; ctx.stroke(); }
    });
  };

  // A hexahedron from 8 world corners (order: bottom z0 ring 0..3, top... see G.box). Lit per face, back faces skipped.
  var HF = [[4, 5, 6, 7], [0, 1, 2, 3], [1, 2, 6, 5], [0, 3, 7, 4], [3, 2, 6, 7], [0, 1, 5, 4]];
  G.hexa = function (batch, P, C, col, o) {
    o = o || {};
    var cen = [0, 0, 0], i, f, pp = [], n, a, b, d, fc, len, lit, fill;
    for (i = 0; i < 8; i++) { cen[0] += C[i][0] / 8; cen[1] += C[i][1] / 8; cen[2] += C[i][2] / 8; pp.push(P(C[i][0], C[i][1], C[i][2])); }
    for (f = 0; f < 6; f++) {
      var ix = HF[f]; a = C[ix[0]]; b = C[ix[1]]; d = C[ix[3]];
      var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; len = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / len, n[1] / len, n[2] / len];
      fc = [0, 0, 0]; for (i = 0; i < 4; i++) { fc[0] += C[ix[i]][0] / 4; fc[1] += C[ix[i]][1] / 4; fc[2] += C[ix[i]][2] / 4; }
      if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) < 0) n = [-n[0], -n[1], -n[2]];
      if (!G.facing(P, n, fc)) continue;
      lit = G.lambert(n[0], n[1], n[2]) * (o.k || 1);
      fill = G.shade(n[1] > 0.7 && o.top ? o.top : col, lit, o.alpha);
      G.face(batch, [pp[ix[0]], pp[ix[1]], pp[ix[2]], pp[ix[3]]], fill, o.edge == null ? 'rgba(255,255,255,0.10)' : o.edge, 1);
    }
  };
  G.box = function (batch, P, x0, x1, y0, y1, z0, z1, col, o) {
    G.hexa(batch, P, [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col, o);
  };
  // Interpolate two camera poses (focal length and distance geometrically, so zooms feel even).
  G.lerpPose = function (a, b, t) {
    var o = {}, k;
    for (k in a) if (typeof a[k] === 'number') o[k] = lerp(a[k], b[k] == null ? a[k] : b[k], t);
    o.f = a.f * Math.pow(b.f / a.f, t); o.dist = a.dist * Math.pow(b.dist / a.dist, t);
    return o;
  };

  // A bar drawn as a cylinder: dark body, lit core, thin specular line toward the light.
  // a, b: projected end points. rw: world radius. col: base colour. dash: optional [on, off] pattern (compression).
  G.tube = function (batch, a, b, rw, col, o) {
    if (!a.ok || !b.ok) return;
    o = o || {};
    var w = Math.max(1.2, 2 * rw * (a.k + b.k) / 2), d = (a.d + b.d) / 2 + (o.bias || 0);
    batch.add(d, function (ctx) {
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      if (nx * G.LS[0] + ny * G.LS[1] < 0) { nx = -nx; ny = -ny; }                 // offset toward the light
      var off = w * 0.18, lit = o.lit == null ? 1 : o.lit;
      ctx.lineCap = o.cap || 'round';
      ctx.strokeStyle = G.shade(col, 0.34 * lit); ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      if (o.dash) {                                               // compression: broken bars, so it is not colour alone
        ctx.setLineDash([o.dash[0] * (w > 6 ? 1 : 0.7), o.dash[1]]);
        ctx.strokeStyle = G.shade(col, 0.95 * lit); ctx.lineWidth = w * 0.86; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.lineCap = 'round';
      } else {
        ctx.strokeStyle = G.shade(col, 0.78 * lit); ctx.lineWidth = w * 0.74;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (w > 3.2) {
          ctx.strokeStyle = G.shade(col, 1.25 * lit, 0.8); ctx.lineWidth = Math.max(1, w * 0.2);
          ctx.beginPath(); ctx.moveTo(a.x + nx * off, a.y + ny * off); ctx.lineTo(b.x + nx * off, b.y + ny * off); ctx.stroke();
        }
      }
      ctx.lineCap = 'butt';
    });
  };

  // A sphere (or disc) with a lit side, a dark side and a cool rim. Drawn immediately.
  G.ball = function (ctx, x, y, r, col, o) {
    o = o || {};
    if (r < 0.6) return;
    var g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.44, r * 0.06, x - r * 0.1, y - r * 0.12, r * 1.12);
    g.addColorStop(0, G.shade(col, o.hi || 1.45)); g.addColorStop(0.5, G.shade(col, 0.82)); g.addColorStop(1, G.shade(col, o.lo == null ? 0.2 : o.lo));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (o.rim !== 0) {                                           // cool rim light from behind, lower right
      var rg = ctx.createRadialGradient(x + r * 0.5, y + r * 0.55, r * 0.55, x, y, r);
      rg.addColorStop(0, 'rgba(142,201,255,0)'); rg.addColorStop(0.82, 'rgba(142,201,255,0)'); rg.addColorStop(1, 'rgba(142,201,255,' + (o.rim == null ? 0.3 : o.rim) + ')');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    if (o.edge) { ctx.strokeStyle = o.edge; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  };

  // Ground grid on the plane y = y0. Lines fade with distance from the camera.
  var gb = [[], [], [], [], [], []];
  G.grid = function (ctx, P, y0, x0, x1, z0, z1, step, col, aMax, d0, d1) {
    var i, b, p, q, v, a, s;
    for (i = 0; i < gb.length; i++) gb[i].length = 0;
    function line(ax, az, bx, bz) {
      p = P(ax, y0, az); q = P(bx, y0, bz);
      if (!p.ok || !q.ok) return;
      var d = (p.d + q.d) / 2, f = clamp((d - d0) / (d1 - d0), 0, 1); a = aMax * (1 - f * f);
      b = Math.min(gb.length - 1, Math.floor(a / aMax * (gb.length - 1) + 0.5));
      if (a < 0.005) return;
      s = gb[b]; s.push(p.x, p.y, q.x, q.y);
    }
    for (v = z0; v <= z1 + 1e-6; v += step) line(x0, v, x1, v);
    for (v = x0; v <= x1 + 1e-6; v += step) line(v, z0, v, z1);
    ctx.lineWidth = 1;
    for (b = 0; b < gb.length; b++) {
      s = gb[b]; if (!s.length) continue;
      ctx.strokeStyle = rgba(col[0], col[1], col[2], aMax * (b / (gb.length - 1)));
      ctx.beginPath();
      for (i = 0; i < s.length; i += 4) { ctx.moveTo(s[i], s[i + 1]); ctx.lineTo(s[i + 2], s[i + 3]); }
      ctx.stroke();
    }
  };

  // Soft elliptical contact shadow on the plane y = y0 (three stacked layers).
  G.shadow = function (ctx, P, x, y0, z, rx, rz, a) {
    var layer, k, p;
    for (layer = 0; layer < 3; layer++) {
      k = 1 - layer * 0.28; ctx.fillStyle = 'rgba(0,0,0,' + (a * 0.34).toFixed(3) + ')'; ctx.beginPath();
      for (k = 0; k <= 20; k++) {
        var ang = (k / 20) * TAU, s = 1 - layer * 0.28;
        p = P(x + Math.cos(ang) * rx * s, y0, z + Math.sin(ang) * rz * s);
        if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.closePath(); ctx.fill();
    }
  };


  // Sky above the horizon of a level ground plane, ground below it. Assumes the camera is not rolled.
  G.sky = function (ctx, w, h, P, top, hor, ground) {
    var c = P.cam, hy = c.cy - c.f * Math.tan(c.pitch);
    ctx.fillStyle = G.rgba(ground[0], ground[1], ground[2], 1); ctx.fillRect(0, 0, w, h);
    if (hy > 0) {
      var y = Math.min(hy, h), g = ctx.createLinearGradient(0, 0, 0, y);
      g.addColorStop(0, G.rgba(top[0], top[1], top[2], 1)); g.addColorStop(1, G.rgba(hor[0], hor[1], hor[2], 1));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, y);
      var hg = ctx.createLinearGradient(0, y - 60, 0, y + 90);               // ground picks up a little of the horizon light
      hg.addColorStop(0, G.rgba(hor[0], hor[1], hor[2], 0.9)); hg.addColorStop(1, G.rgba(hor[0], hor[1], hor[2], 0));
      ctx.fillStyle = hg; ctx.fillRect(0, y - 60, w, 150);
    }
    return hy;
  };
  // A soft pool of light (used behind the subject).
  G.glow = function (ctx, x, y, r, col, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, G.rgba(col[0], col[1], col[2], a)); g.addColorStop(1, G.rgba(col[0], col[1], col[2], 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  };

  /* ---------- finishing ---------- */
  var grainPat = null;
  G.grain = function (ctx, w, h, a) {
    if (!grainPat) {
      var c = global.document.createElement('canvas'); c.width = c.height = 128;
      var cc = c.getContext('2d'), im = cc.createImageData(128, 128), r = U.rng(3), i, v;
      for (i = 0; i < 128 * 128; i++) { v = r() * 255; im.data[4 * i] = v; im.data[4 * i + 1] = v; im.data[4 * i + 2] = v; im.data[4 * i + 3] = 255; }
      cc.putImageData(im, 0, 0); grainPat = ctx.createPattern(c, 'repeat');
    }
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'overlay'; ctx.fillStyle = grainPat; ctx.fillRect(0, 0, w, h); ctx.restore();
  };
  G.vignette = function (ctx, w, h, s) {
    var g = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.hypot(w, h) * 0.56);
    g.addColorStop(0, 'rgba(8,9,10,0)'); g.addColorStop(1, 'rgba(8,9,10,' + s + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  };
  // A vertical wash from the scene's ground tone into the page charcoal (horizon haze).
  G.haze = function (ctx, w, y, h, col, a) {
    var g = ctx.createLinearGradient(0, y - h, 0, y + h * 0.4);
    g.addColorStop(0, rgba(col[0], col[1], col[2], 0)); g.addColorStop(0.7, rgba(col[0], col[1], col[2], a)); g.addColorStop(1, rgba(col[0], col[1], col[2], 0));
    ctx.fillStyle = g; ctx.fillRect(0, y - h, w, h * 1.4);
  };
})(typeof window !== 'undefined' ? window : globalThis);
