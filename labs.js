/* ==========================================================================
   labs.js
   The HTML controls of each experiment. They are ordinary buttons, sliders and
   text in the page (real focus, real labels, keyboard operable), laid over the
   canvas. This file only provides the plumbing; each scene file registers the
   behaviour of its own panel with PF.labs.add(name, setup).

   A panel keeps no state of its own: setup(root, h) wires the controls to the
   simulation, and returns { sync() } which copies the simulation's state back into
   the controls (so Reset, or a drag on the canvas, is always reflected).
   A panel is inert (data-live="0") unless its scene is settled on screen.
   ========================================================================== */
(function (global) {
  'use strict';
  var PF = global.PF = global.PF || {};
  var L = PF.labs = { defs: {}, live: [], items: [] }, d = global.document;

  L.add = function (name, setup) { L.defs[name] = setup; };

  function $(root, sel) { return root.querySelector(sel); }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  /* helpers handed to each panel */
  function helpers(root) {
    var H = {
      root: root,
      change: function () { L.touch(); },
      btn: function (id, fn) { var b = $(root, '[data-b="' + id + '"]'); if (b) b.addEventListener('click', function (e) { if (root.getAttribute('data-live') === '0') return; fn(e); H.change(); }); return b; },
      seg: function (id, fn) {
        var g = $(root, '[data-seg="' + id + '"]'); if (!g) return;
        g.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b || root.getAttribute('data-live') === '0') return; fn(b.getAttribute('data-v'), b); H.change(); });
        g.addEventListener('keydown', function (e) {                                  // arrow keys move through the choices
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
          var bs = $$(g, 'button[data-v]'), i = bs.indexOf(d.activeElement); if (i < 0) return;
          var j = (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + bs.length) % bs.length; bs[j].focus(); e.preventDefault();
        });
      },
      pick: function (id, fn) { var e = $(root, 'select[data-s="' + id + '"]'); if (e) e.addEventListener('change', function () { if (root.getAttribute('data-live') === '0') return; fn(e.value); H.change(); }); return e; },
      setPick: function (id, v, opts) {
        var e = $(root, 'select[data-s="' + id + '"]'); if (!e) return;
        if (opts && e._o !== opts.map(function (o) { return o[0] + ':' + o[1]; }).join('|')) { e._o = opts.map(function (o) { return o[0] + ':' + o[1]; }).join('|'); e.innerHTML = ''; opts.forEach(function (o) { var op = d.createElement('option'); op.value = o[0]; op.textContent = o[1]; e.appendChild(op); }); }
        if (d.activeElement !== e && e.value !== String(v)) e.value = String(v);
      },
      range: function (id, fn) { var r = $(root, 'input[data-r="' + id + '"]'); if (r) r.addEventListener('input', function () { if (root.getAttribute('data-live') === '0') return; fn(+r.value); H.change(); }); return r; },
      setSeg: function (id, v) { var g = $(root, '[data-seg="' + id + '"]'); if (!g) return; $$(g, 'button[data-v]').forEach(function (b) { var on = b.getAttribute('data-v') === String(v); if (b._on !== on) { b._on = on; b.setAttribute('aria-pressed', on ? 'true' : 'false'); } }); },
      segDisabled: function (id, v, off) { var g = $(root, '[data-seg="' + id + '"]'); if (!g) return; $$(g, 'button[data-v]').forEach(function (b) { if (b.getAttribute('data-v') === String(v) && b.disabled !== !!off) b.disabled = !!off; }); },
      setRange: function (id, v, out, min, max) {
        var r = $(root, 'input[data-r="' + id + '"]'); if (!r) return;
        if (min != null && r.min !== String(min)) r.min = min; if (max != null && r.max !== String(max)) r.max = max;
        if (d.activeElement !== r && +r.value !== +v) r.value = v;
        if (out != null) H.text(id + '-o', out);
        r.setAttribute('aria-valuetext', out == null ? String(v) : String(out));
      },
      rangeDisabled: function (id, off) { var r = $(root, 'input[data-r="' + id + '"]'); if (r && r.disabled !== !!off) r.disabled = !!off; },
      text: function (id, s) { var e = $(root, '[data-t="' + id + '"]'); if (e && e._v !== s) { e._v = s; e.textContent = s; } },
      html: function (id, s) { var e = $(root, '[data-t="' + id + '"]'); if (e && e._h !== s) { e._h = s; e.innerHTML = s; } },
      setBtn: function (id, o) {
        var b = $(root, '[data-b="' + id + '"]'); if (!b) return;
        if (o.pressed != null && b._p !== o.pressed) { b._p = o.pressed; b.setAttribute('aria-pressed', o.pressed ? 'true' : 'false'); }
        if (o.label != null && b._l !== o.label) { b._l = o.label; var t = $(b, '.lb') || b; t.textContent = o.label; }
        if (o.disabled != null && b.disabled !== !!o.disabled) b.disabled = !!o.disabled;
      },
      show: function (id, on) { var e = $(root, '[data-t="' + id + '"]'); if (e && e.hidden === !!on) e.hidden = !on; },
      status: function (s, urgent) { var e = $(root, '[data-status]'); if (e && e._v !== s) { e._v = s; e.textContent = s; e.setAttribute('data-urgent', urgent ? '1' : '0'); } }
    };
    return H;
  }

  /* connect every panel found in the page (called once from main.js) */
  L.init = function () {
    if (L.ready) return; L.ready = true;
    $$(d, '.lab[data-lab]').forEach(function (root) {
      var name = root.getAttribute('data-lab'), setup = L.defs[name]; if (!setup) return;
      var h = helpers(root), api = setup(root, h) || {};
      L.items.push({ root: root, name: name, sync: api.sync || function () {}, scene: +root.getAttribute('data-scene') });
      if (api.sync) api.sync();
      root.setAttribute('data-live', '0');
    });
  };
  var syncing = false;
  L.syncAll = function () { for (var i = 0; i < L.items.length; i++) { try { L.items[i].sync(); } catch (e) { if (global.console) console.warn('lab ' + L.items[i].name, e); } } };
  /* a control changed something: show it now (also while animation is paused) and refresh the readouts */
  L.touch = function () {
    if (syncing) return; syncing = true;
    try { L.syncAll(); } finally { syncing = false; }
    if (PF.input && PF.input.repaint) PF.input.repaint();
    else if (PF.start) PF.start();
  };
  /* which scene is settled: its panel is live, the others are inert */
  L.setLive = function (scene) {
    for (var i = 0; i < L.items.length; i++) { var it = L.items[i], on = it.scene === scene ? '1' : '0'; if (it.root.getAttribute('data-live') !== on) it.root.setAttribute('data-live', on); }
  };
  /* rows layout (reduced motion, or no film): every panel is live because its scene is an ordinary row */
  L.allLive = function () { for (var i = 0; i < L.items.length; i++) L.items[i].root.setAttribute('data-live', '1'); };
})(typeof window !== 'undefined' ? window : globalThis);
