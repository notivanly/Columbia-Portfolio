/* ==========================================================================
   scenes-truss.js
   Scene 3: the Truss experiment.

   The truss is edited directly: drag a joint, tap a bar to inspect it, choose where
   the load acts and how big it is, take a bar away or put it back. Every change is
   recomputed by PF.sim.truss (sim-structures.js, a stiffness-method solver) and shown
   at once. When the arrangement cannot carry a load (it can move without stretching a
   bar, a joint is loose, or it is nearly unstable) the picture says so in a short
   message and shows no forces, instead of a result that does not exist.
   Every drag also has a button or slider alternative in the panel.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF, U = PF.util, G = PF.g3d, S = PF.scenes, TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth;
  var A = U.A, Tr = PF.sim.truss;

  function wrap(ctx, txt, maxW) {
    var words = txt.split(' '), lines = [], cur = '', i;
    for (i = 0; i < words.length; i++) { var t = cur ? cur + ' ' + words[i] : words[i]; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }

  S.truss = function () {
    var st = { sc: 1, cx: 0, cy: 0, mx: 0, my: 0, drag: -1, pts: [], segs: [], hoverNode: -1, joints: null, V: null };

    function frame(V) {
      var b = Tr.bounds, fr = V.free, w = b.x1 - b.x0, h = b.y1 - b.y0, sc = Math.min(fr.w * 0.96 / w, fr.h * 0.9 / h);
      return { sc: sc, mx: (b.x0 + b.x1) / 2, my: (b.y0 + b.y1) / 2, cx: fr.cx, cy: fr.cy };
    }
    function toS(F, x, y) { return [F.cx + (x - F.mx) * F.sc, F.cy - (y - F.my) * F.sc]; }
    function toW(F, sx, sy) { return [F.mx + (sx - F.cx) / F.sc, F.my - (sy - F.cy) / F.sc]; }

    function support(ctx, x, y, kind, sc, a) {                              // a pin (triangle on a hatched base) or a roller (triangle on a circle)
      var s = Math.max(10, sc * 0.34);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = 'rgba(245,245,242,0.85)'; ctx.fillStyle = 'rgba(245,245,242,0.08)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - s * 0.62, y + s); ctx.lineTo(x + s * 0.62, y + s); ctx.closePath(); ctx.fill(); ctx.stroke();
      var by = y + s;
      if (kind === 'roller') { ctx.beginPath(); ctx.arc(x - s * 0.3, by + s * 0.2, s * 0.17, 0, TAU); ctx.arc(x + s * 0.3, by + s * 0.2, s * 0.17, 0, TAU); ctx.stroke(); by += s * 0.4; }
      ctx.beginPath(); ctx.moveTo(x - s * 0.9, by); ctx.lineTo(x + s * 0.9, by); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); for (var i = -3; i <= 3; i++) { ctx.moveTo(x + i * s * 0.28, by); ctx.lineTo(x + i * s * 0.28 - s * 0.22, by + s * 0.28); } ctx.stroke();
      ctx.restore();
    }

    function advance() {}

    function draw(ctx, V, o) {
      o = o || {};
      var F = frame(V), sc = F.sc, i, k, N = Tr.nodes, res = Tr.res, ok = res && res.ok, ex = ok ? res.exag : 0, fr = V.free, al = o.alpha == null ? 1 : o.alpha;
      st.V = V; st.sc = sc; st.cx = F.cx; st.cy = F.cy; st.mx = F.mx; st.my = F.my;
      ctx.fillStyle = 'rgb(12,14,17)'; ctx.fillRect(0, 0, V.w, V.h);
      G.glow(ctx, F.cx, F.cy, Math.max(V.w, V.h) * 0.5, [100, 140, 190], 0.1);

      /* drafting grid, one metre per square */
      var b = Tr.bounds, gx;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
      for (gx = Math.ceil(b.x0); gx <= b.x1; gx++) { var a1 = toS(F, gx, b.y0), a2 = toS(F, gx, b.y1); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(a2[0], a2[1]); }
      for (gx = Math.ceil(b.y0); gx <= b.y1; gx++) { var c1 = toS(F, b.x0, gx), c2 = toS(F, b.x1, gx); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); }
      ctx.stroke();

      /* the displaced positions of the joints (the shape under load, exaggerated and labelled) */
      var pos = N.map(function (n_, idx) { var dxu = ok ? res.u[2 * idx] * ex : 0, dyu = ok ? res.u[2 * idx + 1] * ex : 0; return toS(F, n_.x + dxu, n_.y + dyu); });
      var rest = N.map(function (n_) { return toS(F, n_.x, n_.y); });
      st.pts = rest;

      /* supports sit on the undeformed joints */
      Tr.supports.forEach(function (s_) { support(ctx, rest[s_.node][0], rest[s_.node][1], s_.rx ? 'pin' : 'roller', sc, al); });

      /* the original outline, faint, so the movement can be read against it */
      if (ok && ex > 1.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath();
        Tr.members.forEach(function (m_, kk) { if (!Tr.on[kk]) return; ctx.moveTo(rest[m_[0]][0], rest[m_[0]][1]); ctx.lineTo(rest[m_[1]][0], rest[m_[1]][1]); });
        ctx.stroke(); ctx.setLineDash([]);
      }

      /* the bars */
      var fmax = Math.max(1, res ? Math.max(res.maxT, -res.maxC) : 1), segs = [];
      ctx.lineCap = 'round';
      Tr.members.forEach(function (m_, kk) {
        var p = pos[m_[0]], q = pos[m_[1]], on = Tr.on[kk], f = ok ? res.forces[kk] : 0, isSel = kk === Tr.sel;
        if (on) segs.push({ k: kk, x0: p[0], y0: p[1], x1: q[0], y1: q[1] });
        else segs.push({ k: kk, x0: rest[m_[0]][0], y0: rest[m_[0]][1], x1: rest[m_[1]][0], y1: rest[m_[1]][1] });
        if (!on) {                                                        // a removed bar stays visible as a ghost that can be put back
          ctx.strokeStyle = isSel ? A(0.9) : 'rgba(255,255,255,0.28)'; ctx.lineWidth = isSel ? 2.4 : 1.4; ctx.setLineDash([2, 6]);
          ctx.beginPath(); ctx.moveTo(rest[m_[0]][0], rest[m_[0]][1]); ctx.lineTo(rest[m_[1]][0], rest[m_[1]][1]); ctx.stroke(); ctx.setLineDash([]); return;
        }
        var w = ok ? 3 + 5 * Math.min(1, Math.abs(f) / fmax) : 3.2, col = !ok ? 'rgba(150,158,168,0.8)' : f > 0.05 ? 'rgba(196,208,224,0.96)' : f < -0.05 ? 'rgba(240,150,114,0.98)' : 'rgba(120,134,150,0.9)';
        if (isSel) { ctx.strokeStyle = A(0.35); ctx.lineWidth = w + 7; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
        ctx.strokeStyle = col; ctx.lineWidth = w;
        if (ok && f < -0.05) ctx.setLineDash([Math.max(7, w * 1.6), 5]);                       // compression is also drawn as broken bars, so colour is not the only cue
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.setLineDash([]);
      });
      ctx.lineCap = 'butt'; st.segs = segs;

      /* loads and reactions */
      if (ok) {
        var ln = pos[Tr.load], maxR = 1; res.reactions.forEach(function (r) { maxR = Math.max(maxR, Math.abs(r.value)); });
        var kf = Math.min(fr.h * 0.24, 110) / Math.max(Tr.mag, maxR, 1);
        if (Tr.mag > 0.01) {
          var L1 = Math.max(18, Tr.mag * kf); ctx.strokeStyle = A(0.95); ctx.fillStyle = A(0.95); ctx.lineWidth = 2.6;
          U.arrow(ctx, ln[0], ln[1] - 12 - L1, ln[0], ln[1] - 10, 9);
          U.text(ctx, Tr.mag.toFixed(0) + ' kN', ln[0], Math.max(fr.y0 + 12, ln[1] - 22 - L1), V.lod ? 11 : 12, A(1), 'center', true);
        }
        res.reactions.forEach(function (r) {
          if (Math.abs(r.value) < 0.05) return;
          var p = rest[r.node], len = Math.max(14, Math.abs(r.value) * kf), sgn = r.value > 0 ? 1 : -1;
          ctx.strokeStyle = 'rgba(160,230,190,0.95)'; ctx.fillStyle = 'rgba(160,230,190,0.95)'; ctx.lineWidth = 2.2;
          var gap = r.axis === 1 ? Math.max(10, sc * 0.34) * 1.9 : 10;
          if (r.axis === 1) {                                              // vertical reaction: an arrow under the support, pointing up when it pushes up
            var top = p[1] + gap, bot = p[1] + gap + len;
            if (sgn > 0) U.arrow(ctx, p[0], bot, p[0], top, 8); else U.arrow(ctx, p[0], top, p[0], bot, 8);
            U.text(ctx, Math.abs(r.value).toFixed(1) + ' kN', p[0] + 9, p[1] + gap + len * 0.55, V.lod ? 10 : 11, 'rgba(160,230,190,1)', 'left', true);
          }
          else { U.arrow(ctx, p[0] - sgn * (len + 12), p[1], p[0] - sgn * 12, p[1], 8); U.text(ctx, Math.abs(r.value).toFixed(1) + ' kN', p[0] - sgn * (len + 12), p[1] - 8, V.lod ? 10 : 11, 'rgba(160,230,190,1)', sgn > 0 ? 'left' : 'right', true); }
        });
      } else {
        var lp = rest[Tr.load];                                            // the load is still shown where it is, but no result is drawn
        ctx.strokeStyle = 'rgba(142,201,255,0.5)'; ctx.fillStyle = 'rgba(142,201,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); U.arrow(ctx, lp[0], lp[1] - 62, lp[0], lp[1] - 10, 8); ctx.setLineDash([]);
      }

      /* joints, with their letters */
      for (i = 0; i < N.length; i++) {
        var p = pos[i], isLoad = i === Tr.load, isSelN = i === Tr.selNode, r = V.lod ? 6 : 7;
        if (isSelN || st.drag === i) { ctx.strokeStyle = A(0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r + 6, 0, TAU); ctx.stroke(); }
        G.ball(ctx, p[0], p[1], r, isLoad ? [142, 201, 255] : [200, 208, 218], { rim: 0.1 });
        U.text(ctx, Tr.name(i), p[0] - r - 5, p[1] - r - 3, V.lod ? 10 : 11, 'rgba(245,245,242,0.8)', 'right', true);
      }

      /* the selected bar's reading */
      if (Tr.sel >= 0 && Tr.members[Tr.sel]) {
        var sg = segs[Tr.sel], mi = Tr.memberInfo(Tr.sel), mx = (sg.x0 + sg.x1) / 2, my = (sg.y0 + sg.y1) / 2 - 18;
        var txt = mi.name + ': ' + (mi.state === 'removed' ? 'removed' : mi.force == null || !ok ? 'no result' : Math.abs(mi.force).toFixed(1) + ' kN ' + mi.state);
        ctx.font = '500 ' + (V.lod ? 11 : 12) + 'px ' + U.MONO; var tw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = 'rgba(14,15,16,0.9)'; ctx.strokeStyle = A(0.8); ctx.lineWidth = 1; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(mx - tw / 2, my - 15, tw, 22, 6); else ctx.rect(mx - tw / 2, my - 15, tw, 22); ctx.fill(); ctx.stroke();
        U.text(ctx, txt, mx, my, V.lod ? 11 : 12, '#fff', 'center', true);
      }

      /* an invalid arrangement: say so plainly, show no forces */
      if (!ok && res) {
        ctx.font = '500 ' + (V.lod ? 12 : 14) + 'px ' + 'Hanken Grotesk, system-ui, sans-serif';
        var lines = wrap(ctx, res.message, Math.min(fr.w * 0.9, 460)), lh = V.lod ? 17 : 20, bw = Math.min(fr.w * 0.94, 480), bh = lines.length * lh + 22, bx = fr.cx - bw / 2, by = fr.y0 + 8;
        ctx.fillStyle = 'rgba(40,20,14,0.94)'; ctx.strokeStyle = 'rgba(255,138,92,0.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 10); else ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], fr.cx, by + 22 + i * lh);
      } else if (!o.nolabels) {
        U.text(ctx, ex > 1.5 ? 'Movement drawn x' + Math.round(ex) + '. Real movement is far smaller.' : 'Bars: solid light = tension, broken orange = compression.', fr.x0 + 8, fr.y1 - 6, V.lod ? 10 : 11, 'rgba(245,245,242,0.78)', 'left', true);
      }
      st.joints = rest.map(function (p, idx) { return { x: p[0], y: p[1], k: sc }; });
    }

    function nearestNode(x, y, maxD) { var best = -1, bd = maxD, i; for (i = 0; i < st.pts.length; i++) { var d = Math.hypot(x - st.pts[i][0], y - st.pts[i][1]); if (d < bd) { bd = d; best = i; } } return best; }
    function nearestSeg(x, y, maxD) {
      var best = -1, bd = maxD, i;
      for (i = 0; i < st.segs.length; i++) { var s = st.segs[i], vx = s.x1 - s.x0, vy = s.y1 - s.y0, l2 = vx * vx + vy * vy || 1, t = clamp(((x - s.x0) * vx + (y - s.y0) * vy) / l2, 0, 1), d = Math.hypot(x - (s.x0 + vx * t), y - (s.y0 + vy * t)); if (d < bd) { bd = d; best = s.k; } }
      return best;
    }
    var coarse = global.matchMedia && global.matchMedia('(pointer: coarse)').matches;
    var input = {
      hit: function (x, y) { return nearestNode(x, y, coarse ? 26 : 16) >= 0; },
      down: function (x, y) { var i = nearestNode(x, y, coarse ? 26 : 16); st.drag = i; Tr.selectNode(i); },
      move: function (x, y) {
        if (st.drag < 0 || !st.V) return;
        var w = toW(frame(st.V), x, y); Tr.moveNode(st.drag, Math.round(w[0] * 20) / 20, Math.round(w[1] * 20) / 20);       // to the nearest 5 cm
      },
      up: function () { st.drag = -1; Tr.version++; },
      tap: function (x, y) { var k = nearestSeg(x, y, coarse ? 16 : 11); if (k >= 0) Tr.selectMember(k === Tr.sel ? -1 : k); else { Tr.selectMember(-1); Tr.selectNode(-1); } },
      cursor: function (x, y) { return nearestNode(x, y, 16) >= 0 ? (st.drag >= 0 ? 'grabbing' : 'grab') : nearestSeg(x, y, 10) >= 0 ? 'pointer' : ''; }
    };
    return {
      id: 'truss', sim: Tr, side: -1, init: function () {}, advance: advance, draw: draw, input: input, st: st,
      anchor: function (V) { var F = frame(V), n = Tr.nodes[Tr.load] || Tr.nodes[0], p = toS(F, n.x, n.y); return { x: p[0], y: p[1], r: 10 }; },
      points: function (V) { var F = frame(V); return Tr.nodes.map(function (n) { return toS(F, n.x, n.y); }); },
      segments: function (V) { var F = frame(V); return Tr.members.map(function (m, k) { var a = toS(F, Tr.nodes[m[0]].x, Tr.nodes[m[0]].y), b = toS(F, Tr.nodes[m[1]].x, Tr.nodes[m[1]].y); return [a, b, k]; }); }
    };
  };

  /* ---------- the Truss panel ---------- */
  PF.labs.add('truss', function (root, h) {
    h.seg('preset', function (v) { Tr.setPreset(v); });
    h.range('load', function (v) { Tr.setMag(v); });
    h.pick('loadnode', function (v) { Tr.setLoadNode(+v); });
    h.pick('member', function (v) { Tr.selectMember(+v); });
    h.btn('toggle', function () { if (Tr.sel >= 0) Tr.toggleMember(Tr.sel); });
    h.btn('reset', function () { Tr.reset(); });
    [['left', -1, 0], ['right', 1, 0], ['up', 0, 1], ['down', 0, -1]].forEach(function (d) {
      h.btn('nudge-' + d[0], function () { var i = Tr.selNode; if (i < 0) return; Tr.moveNode(i, Tr.nodes[i].x + d[1] * 0.25, Tr.nodes[i].y + d[2] * 0.25); });
    });
    h.btn('here', function () { if (Tr.selNode >= 0) Tr.setLoadNode(Tr.selNode); });
    return {
      sync: function () {
        var res = Tr.res, mi = Tr.memberInfo(Tr.sel), jn = Tr.selNode;
        h.setSeg('preset', Tr.key);
        h.setRange('load', Tr.mag, Tr.mag.toFixed(0) + ' kN');
        h.setPick('loadnode', Tr.load, Tr.nodes.map(function (n, i) { return [String(i), 'Joint ' + Tr.name(i)]; }));
        var mo = [['-1', 'None (tap a bar)']]; Tr.members.forEach(function (m, k) { mo.push([String(k), Tr.memberName(k) + (Tr.on[k] ? '' : ' (removed)')]); }); h.setPick('member', Tr.sel, mo);
        h.setBtn('toggle', { disabled: Tr.sel < 0, label: Tr.sel >= 0 && !Tr.on[Tr.sel] ? 'Put bar ' + Tr.memberName(Tr.sel) + ' back' : Tr.sel >= 0 ? 'Remove bar ' + Tr.memberName(Tr.sel) : 'Remove selected bar' });
        ['left', 'right', 'up', 'down'].forEach(function (d) { h.setBtn('nudge-' + d, { disabled: jn < 0 }); });
        h.setBtn('here', { disabled: jn < 0 || jn === Tr.load, label: jn >= 0 ? 'Load on joint ' + Tr.name(jn) : 'Put the load on the selected joint' });
        h.text('joint', jn >= 0 ? 'Joint ' + Tr.name(jn) + ' selected: drag it, or nudge it with the arrows' : 'Drag a joint, or tap one, to move it');
        h.text('member-r', !mi ? 'No bar selected' : mi.state === 'removed' ? 'Bar ' + mi.name + ' is removed' : !res.ok || mi.force == null ? 'Bar ' + mi.name + ': no result' : 'Bar ' + mi.name + ' (' + mi.len.toFixed(2) + ' m): ' + Math.abs(mi.force).toFixed(1) + ' kN, ' + mi.state);
        if (res.ok) {
          var sumR = 0, parts = res.reactions.map(function (r) { if (r.axis === 1) sumR += r.value; return Tr.name(r.node) + (r.axis ? ' up ' : ' side ') + r.value.toFixed(1); });
          h.text('worst', 'Largest tension ' + res.maxT.toFixed(1) + ' kN, largest compression ' + Math.abs(res.maxC).toFixed(1) + ' kN');
          h.text('react', 'Reactions (kN): ' + parts.join(', ') + '. Vertical total ' + sumR.toFixed(1) + ' = load ' + Tr.mag.toFixed(1));
          h.status('Solved. Movement is drawn x' + Math.round(res.exag) + '.', false);
        } else {
          h.text('worst', 'No forces: this arrangement has no valid solution.'); h.text('react', '');
          h.status(res.message, true);
        }
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
