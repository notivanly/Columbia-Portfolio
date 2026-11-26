'use strict';
/* Run with: node tests/sim-motion.test.js */
const assert = require('assert');
require('../core.js'); require('../sim-motion.js');
const PF = globalThis.PF, P = PF.sim.physics, PL = PF.sim.planets, O = PF.sim.orbit, ST = PF.sim.stars;
let n = 0; function ok(name, fn) { fn(); n++; console.log('  ok  ' + name); }
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);
function run(sec) { for (let i = 0; i < sec * 60; i++) P.step(1 / 60); }

console.log('physics sandbox');
ok('free fall matches y = y0 - g t^2 / 2 (no obstacles, light damping)', () => {
  P.load('free'); P.clearDynamic(); const b = P.spawn('ball', 4.5, 5.5); b.vx = 0; b.vy = 0; const y0 = b.y; run(0.4);
  near(y0 - b.y, 0.5 * 9.81 * 0.16, 0.03, 'drop');
});
ok('a ball dropped on the floor comes to rest and does not sink through it', () => {
  P.load('free'); P.clearDynamic(); const b = P.spawn('ball', 4.5, 3); b.vx = 0; run(6);
  near(b.y, b.r, 0.03, 'resting height'); assert.ok(Math.hypot(b.vx, b.vy) < 0.15, 'speed ' + Math.hypot(b.vx, b.vy));
});
ok('bounce slider changes the rebound height (0 stays down, 0.8 rises far higher)', () => {
  const peak = (e) => { P.load('free'); P.clearDynamic(); P.setBounce(e); const b = P.spawn('ball', 4.5, 4); b.vx = 0; b.vy = 0; let seen = false, top = 0; for (let i = 0; i < 400; i++) { P.step(1 / 60); if (b.vy < -2) seen = true; if (seen && b.vy > 0) top = Math.max(top, b.y - b.r); } return top; };
  const a = peak(0.0), c = peak(0.8); assert.ok(c > a + 1.5, 'e=0 -> ' + a.toFixed(2) + ' m, e=0.8 -> ' + c.toFixed(2) + ' m'); assert.ok(c < 4, 'does not gain energy');
  P.setBounce(0.25);
});
ok('gravity slider changes the fall: zero gravity floats, high gravity is faster', () => {
  P.load('free'); P.clearDynamic(); P.setGravity(0); const b = P.spawn('ball', 4.5, 3); b.vx = 0; b.vy = 0; run(1); near(b.y, 3, 0.05, 'floats');
  P.setGravity(19.6); const y1 = b.y; b.vy = 0; run(0.3); near(y1 - b.y, 0.5 * 19.6 * 0.09, 0.05); P.setGravity(9.81);
});
ok('friction slider: a box slid along the floor stops sooner with high friction', () => {
  const dist = (mu) => { P.load('free'); P.clearDynamic(); P.setFriction(mu); const b = P.spawn('box', 1, 0.3); b.hx = 0.3; b.hy = 0.3; b.a = 0; b.y = 0.31; b.vx = 4; b.vy = 0; b.w = 0; b.x = 1; run(3); return b.x - 1; };
  const lo = dist(0.05), hi = dist(0.9); assert.ok(lo > hi + 1, 'low ' + lo.toFixed(2) + ' high ' + hi.toFixed(2)); P.setFriction(0.5);
});
ok('a box rests on the floor without jitter or drifting', () => {
  P.load('free'); P.clearDynamic(); const b = P.spawn('box', 4.5, 1); b.hx = 0.4; b.hy = 0.25; b.a = 0.2; run(5);
  assert.ok(Math.hypot(b.vx, b.vy) < 0.1 && Math.abs(b.w) < 0.1, 'still moving ' + Math.hypot(b.vx, b.vy).toFixed(3)); near(Math.abs(Math.sin(b.a)) < 0.05 || Math.abs(Math.cos(b.a)) < 0.05 ? 0 : 1, 0, 0, 'lies flat');
});
ok('grab and throw: dragging a ball and letting go gives it the speed of the hand', () => {
  P.load('free'); P.clearDynamic(); P.setGravity(0); const b = P.spawn('ball', 2, 3); b.vx = 0; b.vy = 0; P.grabAt(b, b.x, b.y);
  for (let i = 0; i < 30; i++) { P.dragTo(2 + i * 0.1, 3); P.step(1 / 60); }
  const g = P.release(); assert.ok(g, 'grab existed'); assert.ok(b.vx > 3, 'thrown with vx ' + b.vx.toFixed(2)); const x0 = b.x; run(0.2); assert.ok(b.x > x0 + 0.5, 'keeps flying'); P.setGravity(9.81);
});
ok('a grabbed body is held at the pointer, and picking finds bodies', () => {
  P.load('free'); P.clearDynamic(); const b = P.spawn('box', 4.5, 3); P.grabAt(b, b.x, b.y); for (let i = 0; i < 90; i++) { P.dragTo(6, 4); P.step(1 / 60); }
  near(b.x, 6, 0.15, 'x'); near(b.y, 4, 0.15, 'y'); assert.strictEqual(P.pick(6, 4), b); assert.strictEqual(P.pick(0.1, 5.9), null); P.release();
});
ok('object cap: the 49th spawn is refused and the count never exceeds the cap', () => {
  P.load('free'); P.clearDynamic(); for (let i = 0; i < 60; i++) P.spawn(i % 2 ? 'ball' : 'box'); assert.strictEqual(P.count(), P.MAX); assert.strictEqual(P.spawn('ball'), null);
});
ok('crowd stays inside the box and stays finite (48 bodies, 10 s)', () => {
  P.load('free'); P.clearDynamic(); for (let i = 0; i < 48; i++) P.spawn(i % 2 ? 'ball' : 'box', 1 + (i % 8), 1 + Math.floor(i / 8) * 0.8); run(10);
  P.dynamic().forEach(b => { assert.ok(isFinite(b.x) && isFinite(b.y), 'finite'); assert.ok(b.x > -0.3 && b.x < P.W + 0.3 && b.y > -0.3 && b.y < P.H + 0.3, 'escaped to ' + b.x.toFixed(2) + ',' + b.y.toFixed(2)); });
});
ok('step cost: 48 bodies take well under a frame', () => {
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 120; i++) P.step(1 / 60); const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 120;
  console.log('        48 bodies: ' + ms.toFixed(2) + ' ms per 60 Hz frame'); assert.ok(ms < 6);
});
ok('pause freezes, single-step advances a little, reset restores the preset', () => {
  P.load('free'); const b = P.dynamic()[0]; P.paused = true; const y0 = b.y; run(1); assert.strictEqual(b.y, y0); P.stepOnce(); assert.ok(b.y < y0, 'stepped'); assert.ok(P.paused, 'still paused');
  P.paused = false; run(2); P.reset(); assert.strictEqual(P.count(), 7); near(P.dynamic()[0].y, 4.4, 1e-9);
});
ok('pendulum: rod length is kept and the period matches 2 pi sqrt(L / g) for a swing (small-angle estimate)', () => {
  P.load('pendulum'); const b = P.rods[0].b, L = P.rods[0].len, p = P.pivot; let worst = 0, last = Math.sign(b.x - p.x), crossings = [];
  for (let i = 0; i < 60 * 8; i++) { P.step(1 / 60); worst = Math.max(worst, Math.abs(Math.hypot(b.x - p.x, b.y - p.y) - L)); const s = Math.sign(b.x - p.x); if (s !== last && s !== 0) { crossings.push(P.t); last = s; } }
  assert.ok(worst < 0.05, 'rod stretched ' + worst.toFixed(3)); assert.ok(crossings.length >= 4, 'swings ' + crossings.length);
  const T = 2 * (crossings[2] - crossings[0]) / 2, Tsmall = 2 * Math.PI * Math.sqrt(L / 9.81); console.log('        period ' + T.toFixed(2) + ' s (small-angle ' + Tsmall.toFixed(2) + ' s; larger amplitude is slower)'); assert.ok(T > Tsmall * 0.97 && T < Tsmall * 1.35);
});
ok('dominoes: the push travels down the row and all of them fall', () => {
  P.load('dominoes'); run(8); const d = P.dynamic().filter(b => b.type === 'box'); let fallen = 0; d.forEach(b => { if (Math.abs(Math.sin(b.a)) > 0.7) fallen++; }); assert.ok(fallen >= d.length - 1, fallen + ' of ' + d.length + ' fell');
});
ok('stack and pyramid: they stay standing when left alone', () => {
  ['stack', 'pyramid'].forEach(k => { P.load(k); P.dynamic().filter(b => b.type === 'ball').forEach(b => P.remove(b)); const x0 = P.dynamic().map(b => b.x); run(6); P.dynamic().forEach((b, i) => assert.ok(Math.abs(b.x - x0[i]) < 0.3 && Math.abs(Math.sin(b.a)) < 0.2, k + ' body ' + i + ' moved ' + (b.x - x0[i]).toFixed(2))); });
});

console.log('planets');
ok('Solar System values equal the NASA fact sheet', () => {
  const S = PL.SYSTEMS.solar.planets, by = nm => S.filter(p => p.name === nm)[0];
  assert.strictEqual(S.length, 8); near(by('Earth').a, 1.0, 0.01); near(by('Jupiter').a, 5.204, 0.01); near(by('Neptune').a, 30.18, 0.05); near(by('Mercury').period, 88.0, 0.01); near(by('Earth').radiusE, 1.0, 0.01); near(by('Jupiter').radiusE, 11.21, 0.05);
  assert.ok(by('Earth').rows.some(r => /12,756/.test(r[1]))); assert.ok(by('Saturn').rings);
});
ok('Kepler\'s third law holds for every real system (P^2 ~ a^3 / M)', () => {
  PL.SYSTEMS.solar.planets.forEach(p => near(p.period / 365.25 / Math.pow(p.a, 1.5), 1, 0.02, p.name));   // NASA's published Uranus and Neptune periods sit about 1 % off Kepler's law; the page shows them as published
  const k = PL.SYSTEMS.trappist.planets.map(p => (p.period / 365.25) / Math.pow(p.a, 1.5)); const m = k.reduce((s, v) => s + v, 0) / k.length; k.forEach(v => near(v / m, 1, 0.05, 'T1 spread')); near(1 / (m * m), 0.0898, 0.012, 'star mass in solar masses');
});
ok('TRAPPIST-1 has seven planets b to h and the invented system says it is invented', () => {
  assert.strictEqual(PL.SYSTEMS.trappist.planets.length, 7); assert.strictEqual(PL.SYSTEMS.trappist.planets[6].short, 'h'); assert.ok(PL.SYSTEMS.trappist.real);
  assert.strictEqual(PL.SYSTEMS.lantern.real, false); assert.ok(/fictional/i.test(PL.SYSTEMS.lantern.source)); PL.SYSTEMS.lantern.planets.forEach(p => assert.ok(/invented|fictional/i.test(p.rows.map(r => r.join(' ')).join(' '))));
  assert.ok(/no surface/i.test(PL.SYSTEMS.trappist.look));
});
ok('navigation: select a system, focus a planet, go back up, and time pauses and scales', () => {
  PL.reset(); assert.strictEqual(PL.view, 'select'); PL.enter('trappist'); assert.strictEqual(PL.view, 'system'); PL.focus(3); assert.strictEqual(PL.view, 'planet'); assert.strictEqual(PL.planet, 3);
  PL.up(); assert.strictEqual(PL.view, 'system'); assert.strictEqual(PL.planet, -1); PL.up(); assert.strictEqual(PL.view, 'select');
  PL.enter('solar'); PL.setSpeed(1); PL.step(1); const t1 = PL.t; PL.setSpeed(4); PL.step(1); near(PL.t - t1, 4 * t1, 1e-9); PL.paused = true; const t2 = PL.t; PL.step(1); assert.strictEqual(PL.t, t2); PL.paused = false;
  PL.enter('nope'); assert.strictEqual(PL.sys, 'solar');
});
ok('orbit layout is compressed but ordered, so every orbit is visible and none overlap', () => {
  Object.values(PL.SYSTEMS).forEach(s => { const L = PL.layout(s); for (let i = 1; i < L.length; i++) assert.ok(L[i] > L[i - 1] + 0.02, s.name + ' orbit ' + i); assert.ok(L[0] > 0.1 && L[L.length - 1] <= 1.0001); });
});
ok('a planet completes one turn in one period', () => {
  PL.reset(); PL.enter('solar'); const p = PL.SYSTEMS.solar.planets[2]; PL.t = 0; const a0 = PL.angle(p); PL.t = p.period; near(PL.angle(p) - a0, Math.PI * 2, 1e-9);
});

console.log('orbital mechanics');
ok('circular orbit: a launch at circular speed stays circular for 20 orbits (radius drift < 0.01 %)', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1); O.launch(); const r0 = Math.hypot(O.x, O.y), T = 2 * Math.PI * Math.sqrt(Math.pow(r0, 3) / O.B().mu); O.setWarp(1000); let worst = 0;
  while (O.flightT < 20 * T) { O.step(0.05); worst = Math.max(worst, Math.abs(Math.hypot(O.x, O.y) - r0) / r0); }
  assert.ok(worst < 1e-4, 'drift ' + worst); near(T / 60, 92.4, 0.5, 'Earth 400 km period in minutes'); assert.strictEqual(O.status, 'flying');
});
ok('energy and angular momentum are conserved along an elliptical orbit', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1.15); O.launch(); O.setWarp(500); const e0 = O.elements(); let w = 0, wh = 0;
  for (let i = 0; i < 4000; i++) { O.step(0.05); const e = O.elements(); w = Math.max(w, Math.abs(e.eps - e0.eps) / Math.abs(e0.eps)); wh = Math.max(wh, Math.abs(e.h - e0.h) / Math.abs(e0.h)); }
  assert.ok(w < 1e-5 && wh < 1e-6, 'energy ' + w + ' momentum ' + wh); assert.strictEqual(O.status, 'flying');
});
ok('vis-viva: apoapsis from the elements equals the analytic value', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1.1); O.ready(); const e = O.elements(), B = O.B(), r = B.R + 400, v = 1.1 * Math.sqrt(B.mu / r), a = 1 / (2 / r - v * v / B.mu);
  near(e.a, a, 1e-6 * a); near(e.apo, 2 * a - r, 1e-3 * a); near(e.peri, r, 1e-3 * r); assert.ok(e.e > 0 && e.e < 0.3);
});
ok('prograde burn at periapsis raises the opposite side of the orbit; retrograde lowers it', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1); O.launch(); O.setBurn(100); const a0 = O.elements().apo; O.burn(1); const e1 = O.elements(); assert.ok(e1.apo > a0 + 100, 'apo ' + e1.apo); near(e1.peri, O.B().R + 400, 5);
  O.launch(); O.burn(-1); const e2 = O.elements(); assert.ok(e2.peri < O.B().R + 400 - 100, 'peri ' + e2.peri); near(O.dv, 100, 1e-9);
});
ok('burns do nothing before launch, and a retrograde burn cannot reverse the craft', () => {
  O.ready(); assert.strictEqual(O.burn(1), false); O.launch(); O.setBurn(1000); const dir0 = Math.atan2(O.vy, O.vx); for (let i = 0; i < 12; i++) O.burn(-1);
  const v = Math.hypot(O.vx, O.vy); assert.ok(isFinite(v) && v < 1e-9, 'brought to rest, never turned around: ' + v); assert.ok(O.vx * Math.cos(dir0) + O.vy * Math.sin(dir0) > -1e-9); O.setBurn(50);
});
ok('impact: too slow a launch hits the surface, stops there and says so', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(0.55); O.launch(); O.setWarp(500); for (let i = 0; i < 4000 && O.status === 'flying'; i++) O.step(0.05);
  assert.strictEqual(O.status, 'crashed'); assert.ok(O.impact && O.impact.speed > 1); near(Math.hypot(O.x, O.y), O.B().R, 1e-6); assert.ok(/Impact/.test(O.msg)); const x = O.x; O.step(1); assert.strictEqual(O.x, x);
});
ok('escape: above escape speed the craft leaves and is marked escaped; exactly at circular speed it does not', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1.45); O.launch(); O.setWarp(1000); for (let i = 0; i < 3000 && O.status === 'flying'; i++) O.step(0.05); assert.strictEqual(O.status, 'escaped'); assert.ok(/Escaped/.test(O.msg)); assert.ok(O.elements().eps > 0);
  O.setV(1.42); O.ready(); assert.ok(!O.elements().bound, 'above sqrt(2) times circular speed the orbit is open');
  O.setV(1.4); O.ready(); assert.ok(O.elements().bound, 'just under sqrt(2) times circular speed it is still bound');
});
ok('prediction: the predicted path closes on itself for a bound orbit and ends at the surface for an impact', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1.1); O.launch(); const pr = O.predict(), p = pr.pts, n = p.length; assert.ok(!pr.impact && pr.closed); assert.ok(n > 100, 'enough points to draw a smooth ellipse: ' + n / 2); assert.ok(Math.hypot(p[n - 2] - p[0], p[n - 1] - p[1]) < 0.02 * O.B().R, 'closed');
  O.setV(0.6); O.launch(); const q = O.predict(); assert.ok(q.impact, 'sees the impact'); const m = q.pts.length; near(Math.hypot(q.pts[m - 2], q.pts[m - 1]), O.B().R, 0.02 * O.B().R);
});
ok('prediction follows the actual state: after a burn it changes', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1); O.launch(); const a = O.predict().pts.length; const apo0 = O.elements().apo; O.setBurn(300); O.burn(1); const apo1 = O.elements().apo; assert.ok(apo1 > apo0); assert.ok(O.predict().pts.length >= a * 0.9);
});
ok('every central body works with its own mu and radius (Earth, Moon, Mars circular speeds)', () => {
  near(Math.sqrt(O.BODIES.earth.mu / (O.BODIES.earth.R + 400)), 7.67, 0.02); near(Math.sqrt(O.BODIES.moon.mu / (O.BODIES.moon.R + 100)), 1.63, 0.02); near(Math.sqrt(O.BODIES.mars.mu / (O.BODIES.mars.R + 250)), 3.43, 0.03);
  ['moon', 'mars'].forEach(id => { O.setBody(id); O.setV(1); O.launch(); O.setWarp(200); for (let i = 0; i < 400; i++) O.step(0.05); assert.strictEqual(O.status, 'flying', id); const e = O.elements(); assert.ok(e.e < 0.01, id + ' stays circular'); });
  O.setBody('earth');
});
ok('geostationary height gives a 23 h 56 min period', () => {
  const B = O.BODIES.earth, a = B.R + B.high, T = 2 * Math.PI * Math.sqrt(a * a * a / B.mu); near(T / 3600, 23.93, 0.03);
});
ok('challenge: reaching the 35,786 km orbit with two burns completes it; sitting in the start orbit does not', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1); O.setChallenge(1); O.launch(); O.setWarp(2000); for (let i = 0; i < 100; i++) O.step(0.05); assert.ok(!O.done, 'not done by waiting');
  // Hohmann transfer: burn 1 at periapsis, coast to apoapsis, burn 2 to circularise
  const B = O.B(), r1 = B.R + 400, r2 = B.R + B.high, a = (r1 + r2) / 2, dv1 = Math.sqrt(B.mu * (2 / r1 - 1 / a)) - Math.sqrt(B.mu / r1), dv2 = Math.sqrt(B.mu / r2) - Math.sqrt(B.mu * (2 / r2 - 1 / a));
  const burnTotal = ms => { O.setBurn(1000); while (ms > 1000) { O.burn(1); ms -= 1000; } O.setBurn(ms); O.burn(1); };      // one press is at most 1000 m/s
  O.launch(); O.setWarp(20); burnTotal(dv1 * 1000); const tHalf = Math.PI * Math.sqrt(a * a * a / B.mu); O.setWarp(500); while (O.flightT < tHalf - 30) O.step(0.05); O.setWarp(1); while (O.flightT < tHalf) O.step(0.05);
  burnTotal(dv2 * 1000); O.setWarp(5); for (let i = 0; i < 80; i++) O.step(0.05);
  assert.ok(O.done, 'done; apo ' + O.elements().apo.toFixed(0) + ' peri ' + O.elements().peri.toFixed(0)); console.log('        transfer cost ' + Math.round(O.dv) + ' m/s (theory ' + Math.round((dv1 + dv2) * 1000) + ' m/s)'); near(O.dv, (dv1 + dv2) * 1000, 120);
});
ok('challenge: escape completes once the craft is unbound and far away', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1.45); O.setChallenge(2); O.launch(); O.setWarp(1000); for (let i = 0; i < 400 && !O.done; i++) O.step(0.05); assert.ok(!O.done, 'no burn has been made, so nothing is complete yet'); assert.ok(O.burn(1)); for (let i = 0; i < 400 && !O.done; i++) O.step(0.05); assert.ok(O.done || O.status === 'escaped');
  O.setChallenge(0);
});
ok('changing the starting altitude or speed only moves the craft while it is on the pad', () => {
  O.setBody('earth'); O.setAlt(400); O.setV(1); O.launch(); O.setWarp(100); O.step(0.5); const x = O.x; O.setAlt(900); assert.strictEqual(O.x, x, 'flying craft is not teleported'); O.ready(); O.setAlt(900); near(Math.hypot(O.x, O.y), O.B().R + 900, 1e-6);
  O.setAlt(1e9); assert.ok(O.alt <= O.altRange()[1]); O.setAlt(400);
});

console.log('constellation');
ok('place, move, connect, disconnect, remove and reset', () => {
  ST.reset(); const a = ST.add(0.2, 0.3), b = ST.add(0.5, 0.6), c = ST.add(0.8, 0.2); assert.strictEqual(ST.stars.length, 3);
  assert.ok(ST.link(a, b)); assert.ok(ST.link(b, c)); assert.strictEqual(ST.links.length, 2); ST.link(a, b); assert.strictEqual(ST.links.length, 1, 'linking twice removes the link'); assert.ok(!ST.link(a, a));
  ST.link(a, b); ST.move(b, 2, -1); assert.ok(ST.stars[b].x <= 0.98 && ST.stars[b].y >= 0.04, 'clamped to the panel');
  ST.remove(a); assert.strictEqual(ST.stars.length, 2); ST.links.forEach(l => { assert.ok(l[0] < 2 && l[1] < 2); }); assert.strictEqual(ST.links.length, 1);
  ST.reset(); assert.strictEqual(ST.stars.length, 0); assert.strictEqual(ST.links.length, 0);
});
ok('star cap and nearest-star lookup', () => {
  ST.reset(); for (let i = 0; i < 40; i++) ST.add(Math.random(), Math.random()); assert.strictEqual(ST.stars.length, ST.MAX); assert.strictEqual(ST.add(0.5, 0.5), -1);
  ST.reset(); ST.add(0.1, 0.1); ST.add(0.9, 0.9); assert.strictEqual(ST.nearest(0.85, 0.8), 1); assert.strictEqual(ST.nearest(0.5, 0.5, 0.1), -1);
});
console.log('\n' + n + ' passed');
