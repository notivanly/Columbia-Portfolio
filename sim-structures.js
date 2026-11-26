/* ==========================================================================
   sim-structures.js
   Simulation state and calculations for the Bridge and Truss experiments.
   No DOM, no canvas, no input handling: renderers read this state and the
   controls call its methods, so the numbers never depend on how they are drawn.

   femTruss     direct stiffness method for a 2D pin-jointed truss. Returns joint
                movements, member forces (tension +) and reactions, or a reason the
                structure cannot be solved (mechanism, loose joint, no support).
   SIM.bridge   a Warren truss bridge with a vehicle on it. Member forces come from the
                method-of-joints solver in core.js; joint movements from femTruss.
   SIM.truss    an editable truss: presets, dragging joints, removing members,
                a load of chosen size at a chosen joint.

   Units: metres and kilonewtons. Member stiffness EA is one shared, assumed value.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF = global.PF || {}, U = PF.util, SIM = PF.sim = PF.sim || {};
  var clamp = U.clamp;
  var NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  /* ---------- direct stiffness solver ---------- */
  function fail(reason, extra) { var r = { ok: false, reason: reason }; for (var k in extra) r[k] = extra[k]; return r; }

  function femTruss(nodes, members, supports, loads, EA) {
    var N = nodes.length, D = 2 * N, m = members.length, i, j, k, a, b;
    var fixed = new Uint8Array(D), K = new Float64Array(D * D), lens = new Float64Array(m), cs = new Float64Array(m), sn = new Float64Array(m);
    supports.forEach(function (s) { if (s.rx) fixed[2 * s.node] = 1; if (s.ry) fixed[2 * s.node + 1] = 1; });
    var anyFixed = false; for (i = 0; i < D; i++) if (fixed[i]) anyFixed = true;
    if (!anyFixed) return fail('no-support');
    for (k = 0; k < m; k++) {
      a = members[k][0]; b = members[k][1];
      var dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y, L = Math.hypot(dx, dy);
      if (L < 0.05) return fail('zero-length', { member: k });
      lens[k] = L; cs[k] = dx / L; sn[k] = dy / L;
    }
    // every joint must be tied to a support through members
    var seen = new Uint8Array(N), queue = [], adj = [];
    for (i = 0; i < N; i++) adj.push([]);
    members.forEach(function (mb) { adj[mb[0]].push(mb[1]); adj[mb[1]].push(mb[0]); });
    for (i = 0; i < N; i++) if (fixed[2 * i] || fixed[2 * i + 1]) { seen[i] = 1; queue.push(i); }
    while (queue.length) { var q = queue.pop(); adj[q].forEach(function (w) { if (!seen[w]) { seen[w] = 1; queue.push(w); } }); }
    for (i = 0; i < N; i++) if (!seen[i]) return fail('disconnected', { node: i });
    // assemble
    for (k = 0; k < m; k++) {
      a = members[k][0]; b = members[k][1];
      var c = cs[k], s = sn[k], kk = EA / lens[k], idx = [2 * a, 2 * a + 1, 2 * b, 2 * b + 1], g = [c * c, c * s, -c * c, -c * s, c * s, s * s, -c * s, -s * s, -c * c, -c * s, c * c, c * s, -c * s, -s * s, c * s, s * s];
      for (i = 0; i < 4; i++) for (j = 0; j < 4; j++) K[idx[i] * D + idx[j]] += kk * g[i * 4 + j];
    }
    // reduce to the free joint movements and solve  Kff u = Ff  (Gaussian elimination, partial pivoting)
    var free = [], nf, dmax = 0;
    for (i = 0; i < D; i++) if (!fixed[i]) { free.push(i); if (K[i * D + i] > dmax) dmax = K[i * D + i]; }
    nf = free.length;
    var A = [], x = new Float64Array(D);
    for (i = 0; i < nf; i++) { var row = new Float64Array(nf + 1); for (j = 0; j < nf; j++) row[j] = K[free[i] * D + free[j]]; row[nf] = loads[free[i]]; A.push(row); }
    var tol = 1e-9 * (dmax || 1), mech = 0;
    for (i = 0; i < nf; i++) {
      var piv = i, best = Math.abs(A[i][i]);
      for (j = i + 1; j < nf; j++) if (Math.abs(A[j][i]) > best) { best = Math.abs(A[j][i]); piv = j; }
      if (best < tol) { mech++; continue; }
      if (piv !== i) { var tmp = A[i]; A[i] = A[piv]; A[piv] = tmp; }
      for (j = i + 1; j < nf; j++) {
        var f = A[j][i] / A[i][i]; if (f === 0) continue;
        for (k = i; k <= nf; k++) A[j][k] -= f * A[i][k];
      }
    }
    if (mech) return fail('mechanism', { count: mech });
    var uf = new Float64Array(nf);
    for (i = nf - 1; i >= 0; i--) { var sum = A[i][nf]; for (j = i + 1; j < nf; j++) sum -= A[i][j] * uf[j]; uf[i] = sum / A[i][i]; }
    for (i = 0; i < nf; i++) x[free[i]] = uf[i];
    // results
    var forces = new Float64Array(m), reactions = [], maxDisp = 0, size = 0;
    for (k = 0; k < m; k++) {
      a = members[k][0]; b = members[k][1];
      forces[k] = EA / lens[k] * (cs[k] * (x[2 * b] - x[2 * a]) + sn[k] * (x[2 * b + 1] - x[2 * a + 1]));
    }
    for (i = 0; i < D; i++) if (fixed[i]) {
      var rs = -loads[i]; for (j = 0; j < D; j++) rs += K[i * D + j] * x[j];
      reactions.push({ node: i >> 1, axis: i & 1, value: rs });
    }
    for (i = 0; i < N; i++) {
      maxDisp = Math.max(maxDisp, Math.hypot(x[2 * i], x[2 * i + 1]));
      for (j = i + 1; j < N; j++) size = Math.max(size, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y));
    }
    return { ok: true, u: x, forces: forces, reactions: reactions, maxDisp: maxDisp, size: size, lens: lens };
  }

  /* ======================================================================
     BRIDGE  (Warren truss, a vehicle crossing, the response to where it is)
     ====================================================================== */
  var VEH = {
    car:    { name: 'Car',         exag: 400, tonnes: 1.5, len: 4.4, wheelR: 0.33, axles: [{ dx: 1.35, w: 0.55 }, { dx: -1.3, w: 0.45 }] },
    pickup: { name: 'Pickup',      exag: 250, tonnes: 2.5, len: 5.4, wheelR: 0.38, axles: [{ dx: 1.75, w: 0.5 }, { dx: -1.55, w: 0.5 }] },
    truck:  { name: 'Heavy truck', exag: 40,  tonnes: 18,  len: 8.6, wheelR: 0.5,  axles: [{ dx: 2.9, w: 0.3 }, { dx: -1.7, w: 0.35 }, { dx: -3.0, w: 0.35 }] }
  };

  function BridgeSim() {
    var n = 8, L = 16, H = 3.4, Wd = 3.6, T = U.warren(n, L, H), dx = L / n;
    var loads = new Float64Array(T.nodes.length * 2);
    var S = {
      n: n, L: L, H: H, Wd: Wd, T: T, EA: 6.0e5, VEH: VEH,
      kind: 'car', load: 1, speed: 2.4, playing: true, a: -3, sel: -1,
      forces: null, reactions: [0, 0, 0], maxT: 0, maxC: 0, maxIdx: 0, minIdx: 0, midDefl: 0, maxDefl: 0, fem: null, fref: 40, version: 0
    };
    S.vehicle = function () { return VEH[S.kind]; };
    /* How much the drawn movement is exaggerated. Fixed for each vehicle (so a heavier load still looks bigger) and always shown as a label. */
    S.exag = function () { return VEH[S.kind].exag; };
    S.weight = function () { return VEH[S.kind].tonnes * 9.81 * S.load; };           // kN
    S.start = function () { return -VEH[S.kind].len / 2 - 1.5; };
    S.end = function () { return L + VEH[S.kind].len / 2 + 1.5; };

    function solve() {
      var V = VEH[S.kind], W = S.weight(), i;
      loads.fill(0);
      V.axles.forEach(function (ax) {
        var x = S.a + ax.dx;
        if (x < 0 || x > L) return;
        var bi = Math.min(n - 1, Math.floor(x / dx)), f = (x - bi * dx) / dx, P = W * ax.w;
        loads[2 * bi + 1] -= P * (1 - f); loads[2 * (bi + 1) + 1] -= P * f;
      });
      var r = U.solveTruss(T.nodes, T.members, T.supports, loads), mx = 0, mn = 0;
      S.forces = r.forces;
      S.reactions = r.reactions.map(function (q) { return q.value; });
      for (i = 0; i < r.forces.length; i++) { if (r.forces[i] > mx) { mx = r.forces[i]; S.maxIdx = i; } if (r.forces[i] < mn) { mn = r.forces[i]; S.minIdx = i; } }
      S.maxT = mx; S.maxC = mn;
      S.fem = femTruss(T.nodes, T.members.map(function (m_) { return m_.slice(0, 2); }), T.supports, loads, S.EA);
      S.midDefl = 0; S.maxDefl = 0;
      if (S.fem.ok) {
        for (i = 0; i <= n; i++) { var d = -S.fem.u[2 * i + 1]; if (d > S.maxDefl) S.maxDefl = d; }
        S.midDefl = -S.fem.u[2 * (n / 2) + 1];
      }
      S.fref += (Math.max(30, Math.abs(mx), Math.abs(mn)) - S.fref) * 0.35;
      S.version++;
    }
    /* drawn deck height change at position x (metres along the span), with the exaggeration applied */
    S.deckDy = function (x) {
      if (!S.fem || !S.fem.ok) return 0;
      var xc = clamp(x, 0, L), i = Math.min(n - 1, Math.floor(xc / dx)), f = (xc - i * dx) / dx;
      var y0 = S.fem.u[2 * i + 1], y1 = S.fem.u[2 * (i + 1) + 1];
      return (y0 + (y1 - y0) * f) * S.exag();
    };
    S.memberInfo = function (k) {
      if (k < 0 || !S.forces) return null;
      var mb = T.members[k], f = S.forces[k], kind = k < n ? 'bottom chord' : k < 2 * n - 1 ? 'top chord' : 'diagonal';
      return { k: k, force: f, state: Math.abs(f) < 0.05 ? 'zero force' : f > 0 ? 'tension' : 'compression', kind: kind, a: NAMES.charAt(mb[0]), b: NAMES.charAt(mb[1]) };
    };
    S.setKind = function (kind) {
      if (!VEH[kind] || kind === S.kind) return;
      var frac = (S.a - S.start()) / (S.end() - S.start());
      S.kind = kind; S.a = S.start() + frac * (S.end() - S.start()); solve();
    };
    S.setLoad = function (v) { S.load = clamp(+v || 1, 0.5, 2); solve(); };
    S.setSpeed = function (v) { S.speed = clamp(+v || 1, 0.5, 6); };
    S.setPos = function (a) { S.playing = false; S.a = clamp(a, S.start(), S.end()); solve(); };
    S.play = function (p) { S.playing = p == null ? !S.playing : !!p; if (S.playing && S.a >= S.end() - 0.01) { S.a = S.start(); solve(); } };
    S.reset = function () { S.a = S.start(); S.playing = false; S.sel = -1; solve(); };
    S.select = function (k) { S.sel = k; S.version++; };
    S.step = function (dt) {
      if (!S.playing) return;
      S.a += S.speed * Math.min(dt, 0.05);
      if (S.a > S.end()) S.a = S.start();                       // the vehicle comes round again
      solve();
    };
    solve();
    S.solve = solve;
    return S;
  }
  SIM.bridge = BridgeSim();

  /* ======================================================================
     TRUSS  (editable)
     ====================================================================== */
  function howe(n, L, H) {
    var nodes = [], members = [], i;
    for (i = 0; i <= n; i++) nodes.push({ x: i * L / n, y: 0 });
    for (i = 1; i < n; i++) nodes.push({ x: i * L / n, y: H });
    for (i = 0; i < n; i++) members.push([i, i + 1]);
    for (i = 1; i < n - 1; i++) members.push([n + i, n + i + 1]);
    members.push([0, n + 1]); members.push([n, 2 * n - 1]);
    for (i = 1; i < n; i++) members.push([i, n + i]);
    for (i = 1; i < n / 2; i++) members.push([i, n + i + 1]);
    for (i = n / 2 + 1; i < n; i++) members.push([i, n + i - 1]);
    return { nodes: nodes, members: members, supports: [{ node: 0, rx: true, ry: true }, { node: n, ry: true }] };
  }
  var PRESETS = {
    pratt:    { label: 'Pratt',    make: function () { var t = U.pratt(6, 12, 3.6); return { nodes: t.nodes, members: t.members, supports: t.supports, load: 3, mag: 30 }; } },
    warren:   { label: 'Warren',   make: function () { var t = U.warren(6, 12, 3.6); return { nodes: t.nodes, members: t.members, supports: t.supports, load: 3, mag: 30 }; } },
    howe:     { label: 'Howe',     make: function () { var t = howe(6, 12, 3.6); t.load = 3; t.mag = 30; return t; } },
    triangle: { label: 'Triangle', make: function () {
      return { nodes: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 6, y: 5 }], members: [[0, 1], [0, 2], [1, 2]], supports: [{ node: 0, rx: true, ry: true }, { node: 1, ry: true }], load: 2, mag: 20 }; } },
    bracket:  { label: 'Bracket',  make: function () {
      return { nodes: [{ x: 0, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 8, y: 0 }, { x: 8, y: 3 }],
        members: [[0, 2], [2, 4], [1, 3], [3, 5], [2, 3], [4, 5], [0, 3], [2, 5]],
        supports: [{ node: 0, rx: true, ry: true }, { node: 1, rx: true, ry: true }], load: 4, mag: 15 }; } },
    frame:    { label: 'Unbraced frame', warn: true, make: function () {
      return { nodes: [{ x: 1, y: 0 }, { x: 11, y: 0 }, { x: 11, y: 4 }, { x: 1, y: 4 }], members: [[0, 1], [1, 2], [2, 3], [3, 0]],
        supports: [{ node: 0, rx: true, ry: true }, { node: 1, ry: true }], load: 2, mag: 15 }; } }
  };

  function TrussSim() {
    var S = { PRESETS: PRESETS, key: 'pratt', nodes: [], members: [], on: [], supports: [], load: 3, mag: 30, sel: -1, selNode: -1, EA: 1.2e5, res: null, version: 0, bounds: null, orig: null, dragging: -1, EXAG_MAX: 4000 };
    function copyNodes(a) { return a.map(function (p) { return { x: p.x, y: p.y }; }); }
    S.name = function (i) { return NAMES.charAt(i % 26); };
    S.memberName = function (k) { var m = S.members[k]; return S.name(m[0]) + S.name(m[1]); };
    S.setPreset = function (key) {
      var p = PRESETS[key]; if (!p) return;
      var d = p.make(), xs = d.nodes.map(function (q) { return q.x; }), ys = d.nodes.map(function (q) { return q.y; });
      S.key = key; S.orig = { nodes: copyNodes(d.nodes), members: d.members.map(function (m) { return m.slice(); }), supports: d.supports, load: d.load, mag: d.mag };
      S.bounds = { x0: Math.min.apply(null, xs) - 2, x1: Math.max.apply(null, xs) + 2, y0: Math.min.apply(null, ys) - 2.2, y1: Math.max.apply(null, ys) + 2.6, w: Math.max.apply(null, xs) - Math.min.apply(null, xs), h: Math.max.apply(null, ys) - Math.min.apply(null, ys) };
      S.reset();
    };
    S.reset = function () {                                       // back to the original configuration of the current preset
      var o = S.orig;
      S.nodes = copyNodes(o.nodes); S.members = o.members.map(function (m) { return m.slice(); }); S.supports = o.supports;
      S.on = S.members.map(function () { return true; }); S.load = o.load; S.mag = o.mag; S.sel = -1; S.selNode = -1; S.dragging = -1;
      S.solve();
    };
    S.moveNode = function (i, x, y) {
      var b = S.bounds; if (!S.nodes[i]) return;
      S.nodes[i].x = clamp(x, b.x0, b.x1); S.nodes[i].y = clamp(y, b.y0, b.y1); S.solve();
    };
    S.setLoadNode = function (i) { if (S.nodes[i]) { S.load = i; S.solve(); } };
    S.setMag = function (v) { S.mag = clamp(+v || 0, 0, 80); S.solve(); };
    S.selectMember = function (k) { S.sel = k; if (k >= 0) S.selNode = -1; S.version++; };
    S.selectNode = function (i) { S.selNode = i; if (i >= 0) S.sel = -1; S.version++; };
    S.toggleMember = function (k) { if (k >= 0 && k < S.on.length) { S.on[k] = !S.on[k]; S.solve(); } };
    S.memberInfo = function (k) {
      if (k < 0 || !S.members[k]) return null;
      var m = S.members[k], a = S.nodes[m[0]], b = S.nodes[m[1]], r = S.res, f = r && r.ok ? r.forces[k] : null;
      return { k: k, name: S.memberName(k), len: Math.hypot(b.x - a.x, b.y - a.y), force: f, on: S.on[k], state: !S.on[k] ? 'removed' : f == null ? 'unknown' : Math.abs(f) < 0.05 ? 'zero force' : f > 0 ? 'tension' : 'compression' };
    };
    S.message = function (r) {
      switch (r.reason) {
        case 'zero-length': return 'Two joints are on top of each other. Move one of them apart.';
        case 'disconnected': return 'Joint ' + S.name(r.node) + ' is not connected to a support.';
        case 'no-support': return 'There is no support, so the structure floats free.';
        case 'mechanism': return 'Unstable: this arrangement can move without stretching any member. Add a member back, or move a joint off a straight line.';
        case 'too-flexible': return 'Almost unstable: the joints would move too far for this small-movement model. Move a joint away from a straight line.';
      }
      return 'This structure cannot be solved.';
    };
    S.solve = function () {
      var idx = [], k, mem = [], i;
      for (k = 0; k < S.members.length; k++) if (S.on[k]) { idx.push(k); mem.push(S.members[k]); }
      var loads = new Float64Array(S.nodes.length * 2); loads[2 * S.load + 1] = -S.mag;
      var r = femTruss(S.nodes, mem, S.supports, loads, S.EA);
      if (r.ok && r.maxDisp > 0.015 * Math.max(1, r.size)) r = { ok: false, reason: 'too-flexible' };
      if (!r.ok) { S.res = { ok: false, reason: r.reason, message: S.message(r), forces: new Float64Array(S.members.length), reactions: [], maxT: 0, maxC: 0, exag: 1, maxDisp: 0 }; S.version++; return S.res; }
      var forces = new Float64Array(S.members.length), mx = 0, mn = 0;
      for (i = 0; i < idx.length; i++) { forces[idx[i]] = r.forces[i]; if (r.forces[i] > mx) mx = r.forces[i]; if (r.forces[i] < mn) mn = r.forces[i]; }
      var exag = r.maxDisp > 1e-12 ? Math.min(S.EXAG_MAX, 0.45 / r.maxDisp) : 1;
      S.res = { ok: true, message: '', forces: forces, reactions: r.reactions, u: r.u, maxT: mx, maxC: mn, maxDisp: r.maxDisp, exag: exag };
      S.version++; return S.res;
    };
    S.setPreset('pratt');
    return S;
  }
  SIM.truss = TrussSim();
  SIM.femTruss = femTruss;
  SIM.NAMES = NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
