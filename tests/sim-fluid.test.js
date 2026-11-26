'use strict';
/* Run with: node tests/sim-fluid.test.js */
const assert = require('assert');
require('../core.js'); require('../sim-structures.js'); require('../sim-fluid.js');
const PF = globalThis.PF, W = PF.sim.wind;
let n = 0; function ok(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);
console.log('wind tunnel');
ok('sphere: panel solution matches the exact circle result (peak surface speed 2 U, stagnation at the poles)', () => {
  W.setKind('sphere'); const s = W.panels.surf; const mx = Math.max.apply(null, Array.from(s)), mn = Math.min.apply(null, Array.from(s));
  near(mx, 2, 0.03, 'peak'); assert.ok(mn < 0.08, 'stagnation ' + mn);
});
ok('sphere: no flow through the surface (normal velocity about zero at panel midpoints)', () => {
  const P = W.panels, t = { x: 0, y: 0 }; let worst = 0;   // free stream + the other panels + this panel's own sigma/2 must cancel
  for (let i = 0; i < P.n; i++) { P.vel(P.x[i], P.y[i], t, i); worst = Math.max(worst, Math.abs((1 + t.x) * P.nx[i] + t.y * P.ny[i] + 0.5 * P.sig[i])); }
  assert.ok(worst < 0.03, 'worst ' + worst);
});
ok('every object: field is finite everywhere, particles never sit inside the body', () => {
  W.ORDER.forEach(k => { W.setKind(k); [-10, 0, 15].forEach(a => { W.setAngle(a); W.warm(); W.step(0.03);
    W.parts.forEach(p => { assert.ok(isFinite(p.x) && isFinite(p.y), k + ' finite'); assert.ok(!W.inside(p.x, p.y) || k === 'airfoil', k + ' particle inside body'); });
    assert.ok(W.parts.length > 40, k + ' has flow (' + W.parts.length + ')'); }); });
});
ok('airfoil: lift grows with angle, stalls past 15 degrees, drag follows', () => {
  W.setKind('airfoil'); W.setSpeed(24); const cl = a => { W.setAngle(a); return W.c.cl; };
  assert.ok(cl(0) > 0.2 && cl(0) < 0.5, 'camber lift at 0: ' + cl(0)); assert.ok(cl(10) > cl(5) && cl(5) > cl(0)); near(cl(10) - cl(5), 2 * Math.PI * 5 * Math.PI / 180, 0.01, 'slope 2 pi');
  assert.ok(cl(20) < cl(15), 'stalled'); assert.ok(cl(20) > 0.35 * cl(15)); W.setAngle(20); assert.ok(W.stall > 0.9); W.setAngle(6); assert.strictEqual(W.stall, 0);
});
ok('forces scale with speed squared; Reynolds number scales with speed', () => {
  W.setKind('sphere'); W.setSpeed(10); const d1 = W.c.D, r1 = W.c.Re; W.setSpeed(20); near(W.c.D / d1, 4, 1e-9); near(W.c.Re / r1, 2, 1e-9);
  near(W.c.cd, 0.47, 1e-12); W.setSpeed(24); console.log('        sphere D=0.13 m @24 m/s: drag ' + W.c.D.toFixed(2) + ' N, Re ' + Math.round(W.c.Re));
});
ok('angle changes the cylinder area and the car and banana drag; the sphere ignores angle', () => {
  W.setKind('cylinder'); W.setAngle(0); assert.deepStrictEqual(W.range(), [0, 90]); const a0 = W.c.area; W.setAngle(90); assert.ok(W.c.area > a0 * 2.5, 'side-on cylinder has more area');
  W.setKind('car'); W.setAngle(0); const c0 = W.c.cd; W.setAngle(15); assert.ok(W.c.cd > c0); near(c0, 0.30, 1e-9);
  W.setKind('banana'); W.setAngle(0); const b0 = W.c.cd; W.setAngle(20); assert.ok(W.c.cd > b0); assert.ok(/estimate/.test(W.info().model));
  W.setKind('sphere'); W.setAngle(30); assert.strictEqual(W.angle, 0); assert.strictEqual(W.angleMatters(), false);
  W.setKind('car'); W.setAngle(9); W.setKind('banana'); W.setKind('car'); assert.strictEqual(W.angle, 9, 'remembers its own angle');
});
ok('lift is only reported for the airfoil', () => { W.ORDER.forEach(k => { W.setKind(k); if (k === 'airfoil') assert.ok(W.c.cl != null && W.c.L != null); else assert.strictEqual(W.c.cl, null); }); });
ok('an out-of-range Reynolds number produces a note instead of a silent wrong answer', () => { W.setKind('sphere'); W.setSpeed(40); assert.ok(/drops sharply/.test(W.c.note)); W.setSpeed(20); assert.strictEqual(W.c.note, ''); });
ok('rebuilding the flow after an angle change is fast enough to do while dragging a slider', () => {
  W.setKind('car'); const t0 = process.hrtime.bigint(); for (let i = 0; i < 40; i++) W.setAngle(i % 20); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 40; console.log('        panel solve: ' + ms.toFixed(2) + ' ms per angle change'); assert.ok(ms < 12);
  const t1 = process.hrtime.bigint(); for (let i = 0; i < 60; i++) W.step(1 / 60); const fm = Number(process.hrtime.bigint() - t1) / 1e6 / 60; console.log('        particle step: ' + fm.toFixed(2) + ' ms per frame (' + W.parts.length + ' particles)'); assert.ok(fm < 6);
});
console.log(n + ' passed');
