'use strict';
/* Run with: node tests/sim-structures.test.js   (no dependencies) */
const assert = require('assert');
require('../core.js'); require('../sim-structures.js');
const PF = globalThis.PF, SIM = PF.sim;
let n = 0; function ok(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);

console.log('structures');
ok('bridge: stiffness forces equal the method-of-joints forces (determinate truss)', () => {
  const B = SIM.bridge; B.setKind('car'); B.setPos(7.3);
  const mem = B.T.members.map(m => m.slice(0, 2)), loads = new Float64Array(B.T.nodes.length * 2);
  // rebuild the same loads the simulation used, via the joint solver's reactions
  const f = SIM.femTruss(B.T.nodes, mem, B.T.supports, (function () {
    const V = B.vehicle(), W = B.weight(); V.axles.forEach(ax => { const x = B.a + ax.dx, dx = B.L / B.n, bi = Math.min(B.n - 1, Math.floor(x / dx)), fr = (x - bi * dx) / dx; loads[2 * bi + 1] -= W * ax.w * (1 - fr); loads[2 * (bi + 1) + 1] -= W * ax.w * fr; }); return loads; })(), B.EA);
  assert.ok(f.ok);
  for (let k = 0; k < mem.length; k++) near(f.forces[k], B.forces[k], 1e-6, 'member ' + k);
});
ok('bridge: reactions carry the vehicle weight at any position on the span', () => {
  const B = SIM.bridge; ['car', 'pickup', 'truck'].forEach(kind => { B.setKind(kind); [3, 8, 12.5].forEach(a => { B.setPos(a); const sumR = B.reactions[1] + B.reactions[2]; near(sumR, B.weight(), 1e-6, kind + '@' + a); }); });
});
ok('bridge: vehicle off the span puts no load on it', () => {
  const B = SIM.bridge; B.setKind('car'); B.setPos(B.start()); near(B.maxT, 0, 1e-9); near(B.maxC, 0, 1e-9); near(B.midDefl, 0, 1e-12);
});
ok('bridge: heavier vehicle and heavier load both increase the response', () => {
  const B = SIM.bridge; B.setKind('car'); B.setLoad(1); B.setPos(8); const c1 = B.midDefl; B.setLoad(2); B.setPos(8); const c2 = B.midDefl; B.setKind('truck'); B.setLoad(1); B.setPos(8); const t = B.midDefl;
  assert.ok(c2 > c1 * 1.99 && c2 < c1 * 2.01, 'linear in load'); assert.ok(t > c2, 'truck heavier than loaded car');
});
ok('bridge: midspan movement is a plausible size (millimetres) and drawn deflection is bounded', () => {
  const B = SIM.bridge; ['car', 'pickup', 'truck'].forEach(k => { B.setKind(k); B.setLoad(2); B.setPos(8); assert.ok(B.midDefl > 0.0005 && B.midDefl < 0.02, k + ' real deflection ' + B.midDefl); const drawn = B.midDefl * B.exag(); assert.ok(drawn > 0.3 && drawn < 1, k + ' drawn ' + drawn); near(-B.deckDy(8) * 0 + B.deckDy(8), -B.fem.u[2 * 4 + 1] * -B.exag(), 1e-9); });
  B.setKind('car'); B.setLoad(1); B.setPos(8); console.log('        car@mid: ' + (B.midDefl * 1000).toFixed(2) + ' mm, drawn x' + B.exag() + ' = ' + (B.midDefl * B.exag()).toFixed(2) + ' m; maxT ' + B.maxT.toFixed(1) + ' kN');
});
ok('truss: every valid preset solves and is in equilibrium', () => {
  const T = SIM.truss;
  ['pratt', 'warren', 'howe', 'triangle', 'bracket'].forEach(key => {
    T.setPreset(key); assert.ok(T.res.ok, key + ' should solve: ' + T.res.message);
    let ry = 0, rx = 0; T.res.reactions.forEach(r => { if (r.axis) ry += r.value; else rx += r.value; });
    near(ry, T.mag, 1e-6, key + ' vertical'); near(rx, 0, 1e-6, key + ' horizontal');
    // moment about joint 0
    let M = -T.mag * (T.nodes[T.load].x - T.nodes[0].x); T.res.reactions.forEach(r => { if (r.axis) M += r.value * (T.nodes[r.node].x - T.nodes[0].x); else M -= r.value * (T.nodes[r.node].y - T.nodes[0].y); }); near(M, 0, 1e-6, key + ' moment');
  });
});
ok('truss: the unbraced frame is reported as a mechanism and shows no forces', () => {
  const T = SIM.truss; T.setPreset('frame'); assert.strictEqual(T.res.ok, false); assert.strictEqual(T.res.reason, 'mechanism'); assert.ok(/Unstable/.test(T.res.message)); assert.strictEqual(T.res.maxT, 0);
});
ok('truss: removing a member from a determinate truss makes it unstable; restoring fixes it', () => {
  const T = SIM.truss; T.setPreset('pratt'); T.toggleMember(8); assert.strictEqual(T.res.ok, false); T.toggleMember(8); assert.ok(T.res.ok);
});
ok('truss: moving the apex of a triangle onto the base line is caught', () => {
  const T = SIM.truss; T.setPreset('triangle'); T.moveNode(2, 6, 0); assert.strictEqual(T.res.ok, false, 'exactly collinear'); T.moveNode(2, 6, 0.01); assert.strictEqual(T.res.ok, false, 'almost collinear'); assert.ok(['mechanism', 'too-flexible'].includes(T.res.reason));
  T.moveNode(2, 6, 4); assert.ok(T.res.ok);
});
ok('truss: two joints on top of each other, and a joint with no members', () => {
  const T = SIM.truss; T.setPreset('triangle'); T.moveNode(2, 12, 0); assert.strictEqual(T.res.reason, 'zero-length');
  T.setPreset('triangle'); T.toggleMember(1); T.toggleMember(2); assert.strictEqual(T.res.reason, 'disconnected'); assert.ok(/Joint C/.test(T.res.message));
});
ok('truss: reset restores the original configuration of the preset', () => {
  const T = SIM.truss; T.setPreset('warren'); const x0 = T.nodes[7].x, y0 = T.nodes[7].y; T.moveNode(7, x0 + 1, y0 + 1); T.setMag(55); T.toggleMember(2); T.reset();
  near(T.nodes[7].x, x0, 1e-12); near(T.nodes[7].y, y0, 1e-12); assert.strictEqual(T.mag, 30); assert.ok(T.on.every(Boolean)); assert.ok(T.res.ok);
});
ok('truss: a symmetric Pratt truss under a central load gives symmetric reactions and a tensile bottom chord', () => {
  const T = SIM.truss; T.setPreset('pratt'); const r = T.res.reactions.filter(q => q.axis === 1); near(r[0].value, r[1].value, 1e-6); assert.ok(T.res.forces[3] > 0, 'bottom chord in tension'); assert.ok(T.res.maxC < 0 && T.res.maxT > 0);
});
console.log(n + ' passed');
