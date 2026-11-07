/* ==========================================================================
   visuals-math.js
   Mathematics scenes plus two atmosphere scenes used by About / Contact.
     fourier        - rotating-circle (epicycle) construction of a square wave
     riemann        - left Riemann sums converging on an integral
     lorenz         - the Lorenz attractor, integrated with RK4
     constellation  - drifting network of "projects" that reacts to the cursor
     signal         - expanding radar rings for the contact scene
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, W = U.W, A = U.A, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp;
  var V = PF.visuals;

  /* ======================================================================
     FOURIER  (square wave from odd harmonics)
     ====================================================================== */
  V.fourier = function () {
    var wave = [], K = 1, lastK = 0, over = 0, speed = 150;

    function overshoot(k) {                       // Gibbs phenomenon, measured
      var mx = 0, i, j;
      for (i = 1; i < 500; i++) {
        var th = (i / 500) * Math.PI, s = 0;
        for (j = 0; j < k; j++) { var n = 2 * j + 1; s += (4 / (Math.PI * n)) * Math.sin(n * th); }
        if (s > mx) mx = s;
      }
      return (mx - 1) / 2 * 100;           // as a share of the jump (the textbook ~9 %)
    }

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, 1);
      var R = lay.compact ? w * 0.13 : lay.s * 0.2;
      var cx = lay.compact ? w * 0.27 : w * 0.46, cy = lay.cy;
      K = 1 + Math.floor((t * 0.42) % 9);
      if (K !== lastK) { lastK = K; over = overshoot(K); }
      var theta = t * 1.05, x = cx, y = cy, k, n, r, nx, ny;
      var wx0 = cx + R * 1.27 + (lay.compact ? 34 : 90);

      /* reference square wave, dashed */
      ctx.setLineDash([3, 6]); ctx.strokeStyle = W(0.2); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(wx0, cy - R); ctx.lineTo(w, cy - R); ctx.moveTo(wx0, cy + R); ctx.lineTo(w, cy + R); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = W(0.14); ctx.beginPath(); ctx.moveTo(cx - R * 1.6, cy); ctx.lineTo(w, cy); ctx.stroke();

      /* the epicycle chain */
      for (k = 0; k < K; k++) {
        n = 2 * k + 1; r = R * 4 / (Math.PI * n);
        nx = x + r * Math.cos(n * theta); ny = y - r * Math.sin(n * theta);
        ctx.strokeStyle = W(0.22); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = W(0.75); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
        ctx.fillStyle = W(0.9); ctx.beginPath(); ctx.arc(nx, ny, 2.2, 0, TAU); ctx.fill();
        x = nx; y = ny;
      }

      /* connector + traced wave */
      if (dt > 0) wave.push([y, t]);
      while (wave.length && wx0 + (t - wave[0][1]) * speed > w + 4) wave.shift();
      ctx.setLineDash([2, 4]); ctx.strokeStyle = A(0.7); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(wx0, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = W(0.95); ctx.lineWidth = 1.8; ctx.lineJoin = 'round'; ctx.beginPath();
      for (var i = wave.length - 1; i >= 0; i--) {
        var px = wx0 + (t - wave[i][1]) * speed;
        if (i === wave.length - 1) ctx.moveTo(px, wave[i][0]); else ctx.lineTo(px, wave[i][0]);
      }
      ctx.stroke();
      ctx.fillStyle = A(1); ctx.beginPath(); ctx.arc(wx0, y, 3.4, 0, TAU); ctx.fill();
    }

    function hud() { return [['Harmonics', String(K)], ['Series', 'sin x + sin 3x / 3 + \u2026'], ['Gibbs overshoot', over.toFixed(1) + ' %']]; }
    return { draw: draw, hud: hud };
  };

  /* ======================================================================
     RIEMANN  (left sums converge on the integral)
     ====================================================================== */
  V.riemann = function () {
    var a0 = 0, b0 = 6.4, ladder = [3, 4, 6, 8, 12, 16, 24, 32, 48, 64], n = 3, sum = 0, exact;
    function f(x) { return 1.5 + 0.9 * Math.sin(1.25 * x) + 0.4 * Math.sin(2.9 * x + 0.8); }
    (function () { var N = 4000, dx = (b0 - a0) / N, s = 0, i; for (i = 0; i < N; i++) s += f(a0 + (i + 0.5) * dx) * dx; exact = s; })();

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, 1), left, right, base, sy;
      if (lay.compact) { left = w * 0.06; right = w * 0.94; base = h * 0.9; sy = w * 0.2; }
      else { left = w * 0.36; right = w * 1.03; base = lay.cy + lay.s * 0.4; sy = lay.s * 0.3; }
      var sx = (right - left) / (b0 - a0);
      function X(x) { return left + (x - a0) * sx; }
      function Y(v) { return base - v * sy; }
      n = ladder[Math.floor(t / 1.7) % ladder.length];
      var dx = (b0 - a0) / n, i;
      sum = 0;

      /* axes */
      ctx.strokeStyle = W(0.4); ctx.lineWidth = 1; ctx.beginPath();
      ctx.moveTo(left - 20, base); ctx.lineTo(w, base); ctx.moveTo(left, base + 8); ctx.lineTo(left, Y(3.2)); ctx.stroke();
      ctx.strokeStyle = W(0.16); ctx.beginPath();
      for (i = 0; i <= 6; i++) { ctx.moveTo(X(i), base); ctx.lineTo(X(i), base + 6); }
      for (i = 1; i <= 3; i++) { ctx.moveTo(left, Y(i)); ctx.lineTo(w, Y(i)); }
      ctx.stroke();

      /* area under the curve */
      ctx.fillStyle = W(0.045); ctx.beginPath(); ctx.moveTo(X(a0), base);
      for (i = 0; i <= 160; i++) ctx.lineTo(X(a0 + (i / 160) * (b0 - a0)), Y(f(a0 + (i / 160) * (b0 - a0))));
      ctx.lineTo(X(b0), base); ctx.closePath(); ctx.fill();

      /* rectangles and the error between rectangle and curve */
      for (i = 0; i < n; i++) {
        var x0 = a0 + i * dx, fh = f(x0); sum += fh * dx;
        ctx.fillStyle = A(0.2); ctx.beginPath(); ctx.moveTo(X(x0), Y(fh)); ctx.lineTo(X(x0 + dx), Y(fh));
        var q;
        for (q = 8; q >= 0; q--) ctx.lineTo(X(x0 + (q / 8) * dx), Y(f(x0 + (q / 8) * dx)));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = W(0.07); ctx.fillRect(X(x0), Y(fh), X(x0 + dx) - X(x0), base - Y(fh));
        ctx.strokeStyle = W(n > 24 ? 0.25 : 0.42); ctx.lineWidth = 1;
        ctx.strokeRect(X(x0), Y(fh), X(x0 + dx) - X(x0), base - Y(fh));
      }

      /* the function */
      ctx.strokeStyle = W(0.98); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.beginPath();
      for (i = 0; i <= 240; i++) { var xx = a0 + (i / 240) * (b0 - a0); if (i === 0) ctx.moveTo(X(xx), Y(f(xx))); else ctx.lineTo(X(xx), Y(f(xx))); }
      ctx.stroke();
      U.text(ctx, 'f(x)', X(b0) - 70, Y(f(b0 - 0.4)) - 18, 11, W(0.7));
    }

    function hud() {
      return [['Rectangles', String(n)], ['Riemann sum', sum.toFixed(3)], ['Exact area', exact.toFixed(3)], ['Error', (Math.abs(sum - exact) / exact * 100).toFixed(2) + ' %']];
    }
    return { draw: draw, hud: hud };
  };

  /* ======================================================================
     LORENZ  (RK4 integration of the Lorenz system)
     ====================================================================== */
  V.lorenz = function () {
    var sg = 10, rho = 28, bt = 8 / 3, N = 3400;
    var buf = new Float32Array(N * 3), head = 0, count = 0, s = [1, 1.2, 1.05];
    function d(x, y, z) { return [sg * (y - x), x * (rho - z) - y, x * y - bt * z]; }
    function rk4(h) {
      var k1 = d(s[0], s[1], s[2]);
      var k2 = d(s[0] + h / 2 * k1[0], s[1] + h / 2 * k1[1], s[2] + h / 2 * k1[2]);
      var k3 = d(s[0] + h / 2 * k2[0], s[1] + h / 2 * k2[1], s[2] + h / 2 * k2[2]);
      var k4 = d(s[0] + h * k3[0], s[1] + h * k3[1], s[2] + h * k3[2]);
      s[0] += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      s[1] += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      s[2] += h / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      buf[head * 3] = s[0]; buf[head * 3 + 1] = s[1]; buf[head * 3 + 2] = s[2];
      head = (head + 1) % N; if (count < N) count++;
    }
    var i; for (i = 0; i < 4200; i++) rk4(0.005);

    function draw(ctx, w, h, t, dt, m) {
      var lay = U.layout(w, h, 1), steps = dt > 0 ? Math.max(1, Math.round(dt * 420)) : 0, k;
      for (k = 0; k < steps; k++) rk4(0.005);
      var pxm = lay.compact ? w * 0.9 / 46 : lay.s * 0.98 / 46;
      var cam = U.camera(t * 0.12 + m.nx * 0.45, 0.28 + m.ny * 0.1, 140);
      function P(idx) {
        var j = ((head - count + idx) % N + N) % N, p = cam(buf[j * 3], buf[j * 3 + 2] - 25, buf[j * 3 + 1]);
        return [lay.cx + p.x * pxm, lay.cy - p.y * pxm];
      }
      var chunks = 16, c, a, b, q, pt;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (c = 0; c < chunks; c++) {
        a = Math.floor((c / chunks) * (count - 1)); b = Math.floor(((c + 1) / chunks) * (count - 1));
        ctx.strokeStyle = W(0.04 + 0.78 * Math.pow((c + 1) / chunks, 1.6)); ctx.lineWidth = 0.8 + 1.1 * (c / chunks);
        ctx.beginPath();
        for (q = a; q <= b; q++) { pt = P(q); if (q === a) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]); }
        ctx.stroke();
      }
      var hd = P(count - 1), gl = ctx.createRadialGradient(hd[0], hd[1], 0, hd[0], hd[1], 26);
      gl.addColorStop(0, A(0.9)); gl.addColorStop(1, A(0));
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(hd[0], hd[1], 26, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(hd[0], hd[1], 2.8, 0, TAU); ctx.fill();
      ctx.lineCap = 'butt';
    }

    function hud() { return [['System', 'Lorenz'], ['\u03c3, \u03c1, \u03b2', '10, 28, 8/3'], ['x, y, z', s[0].toFixed(1) + ', ' + s[1].toFixed(1) + ', ' + s[2].toFixed(1)]]; }
    return { draw: draw, hud: hud };
  };

  /* ======================================================================
     CONSTELLATION  (a network of projects)
     ====================================================================== */
  V.constellation = function () {
    var nodes = [], reg = { x0: 0, y0: 0, x1: 0, y1: 0 }, th = 200;
    function init(w, h) {
      var lay = U.layout(w, h, 1), r = U.rng(9), i;
      reg = lay.compact ? { x0: w * 0.06, x1: w * 0.94, y0: h * 0.5, y1: h * 0.94 } : { x0: w * 0.5, x1: w * 0.95, y0: h * 0.14, y1: h * 0.86 };
      th = lay.compact ? w * 0.34 : lay.s * 0.4; nodes = [];
      for (i = 0; i < 22; i++) {
        var ang = r() * TAU, sp = 10 + r() * 16;
        nodes.push({ x: lerp(reg.x0, reg.x1, r()), y: lerp(reg.y0, reg.y1, r()), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r: 2 + r() * 2.4, ring: r() < 0.3 });
      }
    }
    function draw(ctx, w, h, t, dt, m) {
      var i, j, a, b, d;
      if (dt > 0) for (i = 0; i < nodes.length; i++) {
        a = nodes[i];
        if (m.active > 0.2) {
          var dx = m.rx - a.x, dy = m.ry - a.y, dd = Math.hypot(dx, dy);
          if (dd < 280 && dd > 1) { a.vx += (dx / dd) * 34 * dt * m.active; a.vy += (dy / dd) * 34 * dt * m.active; }
        }
        var sp = Math.hypot(a.vx, a.vy); if (sp > 34) { a.vx *= 34 / sp; a.vy *= 34 / sp; }
        a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < reg.x0 || a.x > reg.x1) { a.vx = -a.vx; a.x = clamp(a.x, reg.x0, reg.x1); }
        if (a.y < reg.y0 || a.y > reg.y1) { a.vy = -a.vy; a.y = clamp(a.y, reg.y0, reg.y1); }
      }
      ctx.lineWidth = 1;
      for (i = 0; i < nodes.length; i++) for (j = i + 1; j < nodes.length; j++) {
        a = nodes[i]; b = nodes[j]; d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < th) { ctx.strokeStyle = W(0.34 * (1 - d / th)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      if (m.active > 0.2) {
        for (i = 0; i < nodes.length; i++) {
          a = nodes[i]; d = Math.hypot(a.x - m.rx, a.y - m.ry);
          if (d < th * 1.3) { ctx.strokeStyle = A(0.55 * (1 - d / (th * 1.3)) * m.active); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(m.rx, m.ry); ctx.stroke(); }
        }
      }
      for (i = 0; i < nodes.length; i++) {
        a = nodes[i]; var hot = i === 7;
        ctx.fillStyle = hot ? A(1) : W(0.9); ctx.beginPath(); ctx.arc(a.x, a.y, hot ? a.r + 1.5 : a.r, 0, TAU); ctx.fill();
        if (a.ring || hot) { ctx.strokeStyle = hot ? A(0.6) : W(0.3); ctx.beginPath(); ctx.arc(a.x, a.y, a.r + 8 + 2 * Math.sin(t * 1.5 + i), 0, TAU); ctx.stroke(); }
        if (i % 3 === 0) U.text(ctx, 'P' + (i < 9 ? '0' : '') + (i + 1), a.x + 10, a.y - 8, 9, W(0.3));
      }
    }
    return { init: init, draw: draw };
  };

  /* ======================================================================
     SIGNAL  (radar rings for the contact scene)
     ====================================================================== */
  V.signal = function () {
    function draw(ctx, w, h, t, dt, m) {
      var compact = w < 760 || h > w * 1.05;
      var ox = (compact ? w * 0.5 : w * 0.84) - m.nx * 16, oy = compact ? h * 0.93 : h * 1.0 - m.ny * 8;
      var maxR = Math.max(w, h) * (compact ? 1.0 : 0.95), i, k;

      /* polar spokes (upper half-plane) */
      ctx.lineWidth = 1;
      for (i = 0; i <= 24; i++) {
        var ang = Math.PI + (i / 24) * Math.PI, major = i % 4 === 0;
        ctx.strokeStyle = W(major ? 0.1 : 0.05);
        ctx.beginPath(); ctx.moveTo(ox + Math.cos(ang) * 40, oy + Math.sin(ang) * 40); ctx.lineTo(ox + Math.cos(ang) * maxR, oy + Math.sin(ang) * maxR); ctx.stroke();
      }
      /* expanding rings */
      for (k = 0; k < 9; k++) {
        var p = (t * 0.07 + k / 9) % 1, r = p * maxR;
        ctx.strokeStyle = W(Math.pow(1 - p, 1.5) * 0.62); ctx.beginPath(); ctx.arc(ox, oy, r, Math.PI, TAU); ctx.stroke();
      }
      /* a pulse travelling along one ring */
      var rr = maxR * 0.33, pa = Math.PI + ((t * 0.18) % 1) * Math.PI;
      ctx.strokeStyle = W(0.12); ctx.beginPath(); ctx.arc(ox, oy, rr, Math.PI, TAU); ctx.stroke();
      ctx.fillStyle = A(1); ctx.beginPath(); ctx.arc(ox + Math.cos(pa) * rr, oy + Math.sin(pa) * rr, 3.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = A(0.35); ctx.beginPath(); ctx.arc(ox + Math.cos(pa) * rr, oy + Math.sin(pa) * rr, 9 + 3 * Math.sin(t * 4), 0, TAU); ctx.stroke();
      /* source */
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ox, oy, 4, 0, TAU); ctx.fill();
    }
    return { draw: draw };
  };

})(typeof window !== 'undefined' ? window : globalThis);
