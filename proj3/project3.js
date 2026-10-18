// Project 3 page interactions: anagram flips, image explorers, Euler scrubber, viewing distance,
// charts, and a 2D flow-matching toy with the exact velocity field of a Gaussian mixture.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var metricsNode = document.getElementById('p3-metrics');
  var metrics = metricsNode ? JSON.parse(metricsNode.textContent) : {};

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  // warm the cache for an interactive figure only when it nears the viewport
  function preloadNear(node, srcs) {
    function load() { srcs.forEach(function (src) { new Image().src = src; }); }
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '400px' });
    io.observe(node);
  }

  // ------------------------------------------------------------ segmented image explorers
  document.querySelectorAll('[data-explorer]').forEach(function (explorer) {
    var buttons = Array.prototype.slice.call(explorer.querySelectorAll('[role="radio"]'));
    var image = explorer.querySelector('.explorer-image');
    var note = explorer.querySelector('.explorer-note');

    preloadNear(explorer, buttons.map(function (b) { return b.dataset.src; }));

    function select(button, focus) {
      buttons.forEach(function (b) {
        var on = b === button;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      image.src = button.dataset.src;
      if (button.dataset.alt) image.alt = button.dataset.alt;
      note.textContent = button.dataset.note;
      if (focus) button.focus();
    }

    buttons.forEach(function (button, index) {
      button.tabIndex = button.getAttribute('aria-checked') === 'true' ? 0 : -1;
      button.addEventListener('click', function () { select(button, false); });
      button.addEventListener('keydown', function (event) {
        var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (event.key === 'Home') step = -index;
        if (event.key === 'End') step = buttons.length - 1 - index;
        if (step === undefined) return;
        event.preventDefault();
        select(buttons[(index + step + buttons.length) % buttons.length], true);
      });
    });
  });

  // ------------------------------------------------------------ visual anagrams: rotate 180°
  document.querySelectorAll('[data-anagram]').forEach(function (figure) {
    var button = figure.querySelector('.anagram-toggle');
    var stage = figure.querySelector('.anagram-stage');
    var readings = figure.querySelectorAll('[data-reading]');
    function set(rotated) {
      figure.classList.toggle('is-rotated', rotated);
      button.setAttribute('aria-pressed', rotated ? 'true' : 'false');
      readings.forEach(function (r) {
        r.classList.toggle('is-active', (r.dataset.reading === 'rotated') === rotated);
      });
    }
    function toggle() { set(!figure.classList.contains('is-rotated')); }
    button.addEventListener('click', toggle);
    if (stage) stage.addEventListener('click', toggle);
    set(false);
  });

  // ------------------------------------------------------------ Euler trajectory scrubber
  document.querySelectorAll('[data-scrubber]').forEach(function (figure) {
    var range = figure.querySelector('input[type="range"]');
    var image = figure.querySelector('.scrubber-image');
    var out = figure.querySelector('output');
    var start = Number(figure.dataset.start), step = Number(figure.dataset.step);
    var frames = [figure.dataset.first];
    for (var k = 1; k <= Number(range.max); k++) {
      var t = Math.round((start + k * step) * 100);
      frames.push(figure.dataset.pattern.replace('{t}', String(t).padStart(3, '0')));
    }
    preloadNear(figure, frames);
    var psnr = {};
    Object.keys(metrics.trajectory_psnr || {}).forEach(function (k) {
      psnr[Number(k).toFixed(2)] = metrics.trajectory_psnr[k];
    });
    function update() {
      var k = Number(range.value);
      var t = start + k * step;
      image.src = frames[k];
      var db = psnr[t.toFixed(2)];
      out.textContent = 't = ' + t.toFixed(2) + ' (' + (k === 0 ? 'input' : 'update ' + k) + ')' +
        (db != null ? ', ' + db.toFixed(1) + ' dB to the original' : '');
      range.setAttribute('aria-valuetext', out.textContent);
    }
    range.addEventListener('input', update);
    update();
  });

  // ------------------------------------------------------------ viewing-distance sliders
  document.querySelectorAll('[data-distance]').forEach(function (figure) {
    var range = figure.querySelector('input[type="range"]');
    var image = figure.querySelector('.distance-stage img');
    function update() {
      var t = Number(range.value) / 100;
      var scale = Math.pow(0.1, t);              // 100% down to 10%, evenly in log-size
      image.style.width = (scale * 100).toFixed(2) + '%';
      range.setAttribute('aria-valuetext', Math.round(scale * 100) + '% of full size');
    }
    range.addEventListener('input', update);
    update();
  });

  // ------------------------------------------------------------ charts (adapted from Project 2)
  var SVG = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  // piecewise-linear interpolation through sorted [x, y] points (in the chart's x space)
  function interp(points, log) {
    var u = function (v) { return log ? Math.log10(v) : v; };
    return function (x) {
      var ux = u(x);
      if (ux <= u(points[0][0])) return points[0][1];
      for (var i = 1; i < points.length; i++) {
        var a = points[i - 1], b = points[i];
        if (ux <= u(b[0])) return a[1] + (b[1] - a[1]) * (ux - u(a[0])) / (u(b[0]) - u(a[0]));
      }
      return points[points.length - 1][1];
    };
  }

  function lineChart(container, spec) {
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    var current = null;
    var view = null;
    var live = container.dataset.live ? document.getElementById(container.dataset.live) : null;
    var U = function (v) { return spec.log ? Math.log10(v) : v; };
    var invU = function (v) { return spec.log ? Math.pow(10, v) : v; };

    function render() {
      var W = Math.max(280, Math.round(container.clientWidth || 720));
      var H = Math.round(Math.min(320, Math.max(220, W * 0.44)));
      var m = { top: 18, right: 16, bottom: 48, left: W < 480 ? 46 : 58 };
      var iw = W - m.left - m.right, ih = H - m.top - m.bottom;
      container.innerHTML = '';
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart-svg', 'aria-hidden': 'true' }, container);
      container.appendChild(tip);
      var u0 = U(spec.x[0]), u1 = U(spec.x[1]);
      var x = function (v) { return m.left + (U(v) - u0) / (u1 - u0) * iw; };
      var y = function (v) { return m.top + (1 - (v - spec.y[0]) / (spec.y[1] - spec.y[0])) * ih; };
      var clampY = function (v) { return Math.max(spec.y[0], Math.min(spec.y[1], v)); };

      spec.yTicks.forEach(function (t) {
        el('line', { x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t), class: 'chart-grid' }, svg);
        el('text', { x: m.left - 8, y: y(t) + 4, class: 'chart-tick', 'text-anchor': 'end' }, svg).textContent = spec.yFormat(t);
      });
      var xTicks = W < 480 && spec.xTicks.length > 6 ? spec.xTicks.filter(function (_, i) { return i % 2 === 0; }) : spec.xTicks;
      xTicks.forEach(function (t) {
        el('text', { x: x(t), y: m.top + ih + 20, class: 'chart-tick', 'text-anchor': 'middle' }, svg).textContent = spec.xFormat(t);
      });
      el('text', { x: m.left + iw / 2, y: H - 6, class: 'chart-axis-label', 'text-anchor': 'middle' }, svg).textContent = spec.xLabel;
      el('text', { x: 13, y: m.top + ih / 2, class: 'chart-axis-label', 'text-anchor': 'middle', transform: 'rotate(-90 13 ' + (m.top + ih / 2) + ')' }, svg).textContent = spec.yLabel;

      spec.series.forEach(function (s) {
        var d = '';
        s.points.forEach(function (p, i) { d += (i ? 'L' : 'M') + x(p[0]).toFixed(2) + ' ' + y(clampY(p[1])).toFixed(2); });
        el('path', { d: d, class: 'chart-line ' + s.cls }, svg);
        s.points.forEach(function (p) { el('circle', { cx: x(p[0]), cy: y(clampY(p[1])), r: 2.6, class: 'chart-point ' + s.cls }, svg); });
      });

      var cross = el('line', { y1: m.top, y2: m.top + ih, class: 'chart-cross', visibility: 'hidden' }, svg);
      var dots = spec.series.map(function (s) { return el('circle', { r: 4.5, class: 'chart-dot ' + s.cls, visibility: 'hidden' }, svg); });
      var hit = el('rect', { x: m.left, y: m.top, width: iw, height: ih, class: 'chart-hit' }, svg);

      function fromPointer(event) {
        var r = svg.getBoundingClientRect();
        var px = (event.clientX - r.left) / r.width * W;
        return invU(u0 + (px - m.left) / iw * (u1 - u0));
      }
      hit.addEventListener('pointermove', function (event) { show(fromPointer(event)); });
      hit.addEventListener('pointerdown', function (event) { show(fromPointer(event)); });
      hit.addEventListener('pointerleave', function (event) { if (event.pointerType !== 'touch') hide(); });

      view = { W: W, x: x, y: y, clampY: clampY, cross: cross, dots: dots };
      if (current !== null) show(current);
    }

    function snap(fx) {
      // read values at the measured points, not between them
      var best = spec.series[0].points[0][0], bd = Infinity;
      spec.series[0].points.forEach(function (p) {
        var d = Math.abs(U(p[0]) - U(fx));
        if (d < bd) { bd = d; best = p[0]; }
      });
      return best;
    }

    function show(fx) {
      current = snap(Math.max(spec.x[0], Math.min(spec.x[1], fx)));
      var px = view.x(current);
      view.cross.setAttribute('x1', px); view.cross.setAttribute('x2', px); view.cross.setAttribute('visibility', 'visible');
      var rows = '<div class="tip-head">' + spec.xFormatLong(current) + '</div>';
      spec.series.forEach(function (s, i) {
        var v = interp(s.points, spec.log)(current);
        view.dots[i].setAttribute('cx', px); view.dots[i].setAttribute('cy', view.y(view.clampY(v)));
        view.dots[i].setAttribute('visibility', 'visible');
        rows += '<div class="tip-row"><i class="tip-key ' + s.cls + '"></i>' + s.name + '<b>' + spec.yFormatLong(v) + '</b></div>';
      });
      tip.innerHTML = rows;
      tip.hidden = false;
      if (live) live.textContent = tip.textContent;
      var right = px > view.W / 2;
      tip.style.left = right ? '0.75rem' : 'auto';
      tip.style.right = right ? 'auto' : '0.75rem';
    }

    function hide() {
      current = null;
      if (!view) return;
      view.cross.setAttribute('visibility', 'hidden');
      view.dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); });
      tip.hidden = true;
    }

    container.tabIndex = 0;
    container.addEventListener('focus', function () { if (current === null) show(spec.focusX); });
    container.addEventListener('blur', hide);
    container.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
        if (event.key === 'Escape') hide();
        return;
      }
      event.preventDefault();
      var xs = spec.series[0].points.map(function (p) { return p[0]; });
      var i = xs.indexOf(current === null ? snap(spec.focusX) : current);
      i = Math.max(0, Math.min(xs.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)));
      show(xs[i]);
    });

    render();
    if ('ResizeObserver' in window) {
      var lastWidth = container.clientWidth;
      new ResizeObserver(function () {
        if (Math.abs(container.clientWidth - lastWidth) < 2) return;
        lastWidth = container.clientWidth;
        render();
      }).observe(container);
    }
  }

  function pointsOf(obj) {
    return Object.keys(obj).map(function (k) { return [Number(k), obj[k]]; })
      .sort(function (a, b) { return a[0] - b[0]; });
  }
  var dB = function (v) { return v.toFixed(1) + ' dB'; };

  var trajChart = document.querySelector('[data-chart="trajectory"]');
  if (trajChart && metrics.trajectory_psnr) {
    var tp = pointsOf(metrics.trajectory_psnr);
    var one = metrics.psnr_vs_original['050'].one_step;
    lineChart(trajChart, {
      x: [0.5, 1], y: [12, 32], xTicks: [0.5, 0.6, 0.7, 0.8, 0.9, 1], yTicks: [12, 16, 20, 24, 28, 32],
      xFormat: function (v) { return v.toFixed(1); },
      xFormatLong: function (v) { return 't = ' + v.toFixed(2); },
      yFormat: function (v) { return String(v); }, yFormatLong: dB,
      xLabel: 'Time t along the Euler path', yLabel: 'PSNR to original (dB)', focusX: 0.8,
      series: [
        { name: 'Euler state', cls: 'series-euler', points: tp },
        { name: 'One-step estimate', cls: 'series-onestep', points: tp.map(function (p) { return [p[0], one]; }) }
      ]
    });
  }

  var sdChart = document.querySelector('[data-chart="sdedit"]');
  if (sdChart && metrics.sdedit_psnr) {
    var sd = metrics.sdedit_psnr;
    var series = [];
    [['campanile', 'Campanile', 'a'], ['golden_gate', 'Golden Gate', 'b'], ['west_lake', 'West Lake', 'c']].forEach(function (row) {
      series.push({ name: row[1] + ', generic', cls: 'series-' + row[2], points: pointsOf(sd[row[0]].edit) });
      series.push({ name: row[1] + ', text prompt', cls: 'series-' + row[2] + ' series-dashed', points: pointsOf(sd[row[0]].text) });
    });
    lineChart(sdChart, {
      log: true, x: [0.02, 0.5], y: [8, 32],
      xTicks: [0.02, 0.04, 0.06, 0.1, 0.14, 0.25, 0.5], yTicks: [8, 12, 16, 20, 24, 28, 32],
      xFormat: function (v) { return String(v); },
      xFormatLong: function (v) { return 'start at t = ' + v; },
      yFormat: function (v) { return String(v); }, yFormatLong: dB,
      xLabel: 'Starting time (log scale)', yLabel: 'PSNR to input (dB)', focusX: 0.1,
      series: series
    });
  }

  // ------------------------------------------------------------ 2D flow-matching toy
  var toy = document.querySelector('[data-flow-toy]');
  if (toy) flowToy(toy);

  function flowToy(root) {
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var readout = root.querySelector('.toy-readout');
    var wRange = root.querySelector('#toy-w');
    var wOut = root.querySelector('output[for="toy-w"]');
    var tRange = root.querySelector('#toy-t');
    var tOut = root.querySelector('output[for="toy-t"]');
    var play = root.querySelector('.toy-play');
    var pairsBox = root.querySelector('#toy-pairs');

    var VIEW = 3.6;           // half-width of the plotted square
    var S = 0.22;             // std of each data blob
    var RING = 2.4;
    var N = 420;
    var comps = [];
    for (var k = 0; k < 6; k++) {
      var a = Math.PI / 2 + k * Math.PI / 3;
      comps.push({ x: RING * Math.cos(a), y: RING * Math.sin(a), cls: k % 3 });
    }
    var all = [0, 1, 2, 3, 4, 5];
    var byClass = [[0, 3], [1, 4], [2, 5]];

    // seeded noise, so every setting starts from the same x0 (like a fixed seed)
    function mulberry32(s) {
      return function () {
        s |= 0; s = s + 0x6D2B79F5 | 0;
        var t = Math.imul(s ^ s >>> 15, 1 | s);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    var rand = mulberry32(180);
    function gauss() {
      var u = 1 - rand(), v = rand();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    var x0 = new Float64Array(2 * N);
    for (var i = 0; i < 2 * N; i++) x0[i] = gauss();
    // straight training pairs (x0, x1) with x1 drawn independently from the data
    var pairs = [];
    for (i = 0; i < 90; i++) {
      var c = comps[Math.floor(rand() * 6)];
      pairs.push([x0[2 * i], x0[2 * i + 1], c.x + S * gauss(), c.y + S * gauss()]);
    }

    // Exact marginal velocity E[x1 - x0 | x_t] for x0 ~ N(0, I), x1 ~ equal mixture of N(mu_k, S^2 I).
    // Given component k: x_t ~ N(t mu_k, var_t I), var_t = (1-t)^2 + t^2 S^2, and
    // E[x1 - x0 | x_t, k] = mu_k + (t S^2 - (1-t)) / var_t * (x_t - t mu_k).
    function velocity(x, y, t, set, out) {
      var s2 = S * S, vt = (1 - t) * (1 - t) + t * t * s2, coef = (t * s2 - (1 - t)) / vt;
      var logs = [], max = -Infinity, j;
      for (j = 0; j < set.length; j++) {
        var m = comps[set[j]], dx = x - t * m.x, dy = y - t * m.y;
        logs[j] = -(dx * dx + dy * dy) / (2 * vt);
        if (logs[j] > max) max = logs[j];
      }
      var vx = 0, vy = 0, z = 0;
      for (j = 0; j < set.length; j++) {
        var mm = comps[set[j]], w = Math.exp(logs[j] - max);
        z += w;
        vx += w * (mm.x + coef * (x - t * mm.x));
        vy += w * (mm.y + coef * (y - t * mm.y));
      }
      out[0] = vx / z; out[1] = vy / z;
    }

    var state = { steps: 50, cond: -1, w: 0, t: 1, pairs: false };
    var states = [], finalCls = new Int8Array(N);

    function simulate() {
      var n = state.steps, h = 1 / n, vc = [0, 0], vu = [0, 0];
      var set = state.cond < 0 ? all : byClass[state.cond];
      var cur = Float64Array.from(x0);
      states = [Float32Array.from(cur)];
      for (var s = 0; s < n; s++) {
        var t = s * h;
        for (var p = 0; p < N; p++) {
          var px = cur[2 * p], py = cur[2 * p + 1];
          velocity(px, py, t, set, vc);
          if (state.cond >= 0 && state.w !== 0) {
            velocity(px, py, t, all, vu);
            vc[0] += state.w * (vc[0] - vu[0]);
            vc[1] += state.w * (vc[1] - vu[1]);
          }
          cur[2 * p] = px + h * vc[0];
          cur[2 * p + 1] = py + h * vc[1];
        }
        states.push(Float32Array.from(cur));
      }
      // label each sample by the blob it lands in (or none)
      var onData = 0, dist = 0;
      for (p = 0; p < N; p++) {
        var fx = cur[2 * p], fy = cur[2 * p + 1], best = Infinity, bc = -1;
        for (var k2 = 0; k2 < 6; k2++) {
          var d = Math.hypot(fx - comps[k2].x, fy - comps[k2].y);
          if (d < best) { best = d; bc = comps[k2].cls; }
        }
        var hit = best < 3 * S && (state.cond < 0 || bc === state.cond);
        finalCls[p] = best < 3 * S ? bc : -1;
        if (hit) onData++;
        dist += best;
      }
      var pct = Math.round(100 * onData / N);
      var evals = state.steps * (state.cond >= 0 && state.w !== 0 ? 2 : 1);
      readout.innerHTML =
        '<span><b>' + pct + '%</b> of samples land on ' + (state.cond < 0 ? 'the data' : 'the chosen class') + '</span>' +
        '<span>mean distance to the nearest blob <b>' + (dist / N).toFixed(2) + '</b></span>' +
        '<span><b>' + evals + '</b> velocity evaluation' + (evals === 1 ? '' : 's') + ' per sample</span>';
      canvas.setAttribute('aria-label', 'Flow-matching toy: ' + N + ' noise samples integrated with ' + state.steps +
        ' Euler steps' + (state.cond < 0 ? ', unconditional' : ', conditioned on one class with guidance w = ' + state.w) +
        '. ' + pct + '% land on the target blobs.');
    }

    var colors = {};
    function readColors() {
      colors = {
        surface: cssVar('--surface', '#fff'), ink: cssVar('--ink', '#0b172a'), muted: cssVar('--muted', '#596779'),
        line: cssVar('--line', '#cdd7e5'), noise: cssVar('--noise', '#a0662a'),
        cls: [cssVar('--class-a', '#175cd3'), cssVar('--class-b', '#b7791f'), cssVar('--class-c', '#2f8f67')],
        none: cssVar('--uncond', '#7b8794')
      };
    }

    var size = 0, dpr = 1;
    function resize() {
      var w = Math.round(canvas.parentElement.clientWidth);
      if (w === size) return;
      size = w; dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr); canvas.height = Math.round(size * dpr);
      canvas.style.height = size + 'px';
      draw();
    }
    function X(v) { return (v + VIEW) / (2 * VIEW) * size; }
    function Y(v) { return (VIEW - v) / (2 * VIEW) * size; }

    function positionAt(p, t) {
      var n = state.steps, f = t * n, j = Math.min(n - 1, Math.floor(f)), r = f - j;
      var A = states[j], B = states[j + 1];
      return [A[2 * p] + (B[2 * p] - A[2 * p]) * r, A[2 * p + 1] + (B[2 * p + 1] - A[2 * p + 1]) * r];
    }

    function draw() {
      if (!size || !states.length) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = colors.surface;
      ctx.fillRect(0, 0, size, size);
      var unit = size / (2 * VIEW);

      // the noise distribution: 1 and 2 standard deviations of N(0, I)
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = colors.noise;
      ctx.globalAlpha = 0.55;
      [1, 2].forEach(function (r) { ctx.beginPath(); ctx.arc(X(0), Y(0), r * unit, 0, 2 * Math.PI); ctx.stroke(); });
      ctx.setLineDash([]);

      // the data: six blobs, two per class
      comps.forEach(function (m) {
        var active = state.cond < 0 || m.cls === state.cond;
        ctx.globalAlpha = active ? 0.16 : 0.06;
        ctx.fillStyle = colors.cls[m.cls];
        ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 3 * S * unit, 0, 2 * Math.PI); ctx.fill();
        ctx.globalAlpha = active ? 0.22 : 0.08;
        ctx.beginPath(); ctx.arc(X(m.x), Y(m.y), 1.5 * S * unit, 0, 2 * Math.PI); ctx.fill();
      });

      if (state.pairs) {
        ctx.globalAlpha = 0.35; ctx.strokeStyle = colors.muted; ctx.lineWidth = 1;
        pairs.forEach(function (q) { ctx.beginPath(); ctx.moveTo(X(q[0]), Y(q[1])); ctx.lineTo(X(q[2]), Y(q[3])); ctx.stroke(); });
      }

      // paths up to the current time
      var n = state.steps, last = Math.min(n, Math.floor(state.t * n));
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.13;
      for (var p = 0; p < N; p++) {
        ctx.strokeStyle = finalCls[p] < 0 ? colors.none : colors.cls[finalCls[p]];
        ctx.beginPath(); ctx.moveTo(X(states[0][2 * p]), Y(states[0][2 * p + 1]));
        for (var s = 1; s <= last; s++) ctx.lineTo(X(states[s][2 * p]), Y(states[s][2 * p + 1]));
        var q = positionAt(p, state.t);
        ctx.lineTo(X(q[0]), Y(q[1]));
        ctx.stroke();
      }
      // samples at the current time
      ctx.globalAlpha = 0.9;
      var r = Math.max(1.6, size / 300);
      for (p = 0; p < N; p++) {
        var pos = positionAt(p, state.t);
        ctx.fillStyle = state.t < 0.02 ? colors.noise : (finalCls[p] < 0 ? colors.none : colors.cls[finalCls[p]]);
        ctx.beginPath(); ctx.arc(X(pos[0]), Y(pos[1]), r, 0, 2 * Math.PI); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function setT(t) {
      state.t = t;
      tRange.value = Math.round(t * 1000);
      tOut.textContent = 't = ' + t.toFixed(2);
      draw();
    }

    // segmented controls: condition and step count
    root.querySelectorAll('[data-toy-group]').forEach(function (group) {
      var buttons = Array.prototype.slice.call(group.querySelectorAll('[role="radio"]'));
      function select(button, focus) {
        buttons.forEach(function (b) {
          var on = b === button;
          b.setAttribute('aria-checked', on ? 'true' : 'false');
          b.tabIndex = on ? 0 : -1;
        });
        state[group.dataset.toyGroup] = Number(button.dataset.value);
        if (group.dataset.toyGroup === 'cond') wRange.disabled = state.cond < 0;
        simulate(); draw();
        if (focus) button.focus();
      }
      buttons.forEach(function (button, index) {
        button.tabIndex = button.getAttribute('aria-checked') === 'true' ? 0 : -1;
        button.addEventListener('click', function () { select(button, false); });
        button.addEventListener('keydown', function (event) {
          var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
          if (step === undefined) return;
          event.preventDefault();
          select(buttons[(index + step + buttons.length) % buttons.length], true);
        });
      });
    });

    wRange.addEventListener('input', function () {
      state.w = Number(wRange.value);
      wOut.textContent = 'w = ' + state.w;
      simulate(); draw();
    });
    tRange.addEventListener('input', function () { stop(); setT(Number(tRange.value) / 1000); });
    pairsBox.addEventListener('change', function () { state.pairs = pairsBox.checked; draw(); });

    var raf = 0;
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      play.textContent = 'Play';
    }
    play.addEventListener('click', function () {
      if (raf) { stop(); return; }
      if (reduceMotion) { setT(state.t >= 0.999 ? 0 : 1); return; }
      play.textContent = 'Pause';
      var from = state.t >= 0.999 ? 0 : state.t, t0 = null;
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var t = Math.min(1, from + (ts - t0) / 2600);
        setT(t);
        if (t < 1) raf = requestAnimationFrame(frame); else stop();
      }
      raf = requestAnimationFrame(frame);
    });

    readColors();
    wRange.disabled = true;
    simulate();
    resize();
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas.parentElement);
    else window.addEventListener('resize', resize);
  }
})();
