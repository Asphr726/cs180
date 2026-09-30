// Project 2 page interactions: image explorers, viewing-distance slider, frequency-response charts.
(function () {
  'use strict';

  // ------------------------------------------------------------ segmented image explorers
  document.querySelectorAll('[data-explorer]').forEach(function (explorer) {
    var buttons = Array.prototype.slice.call(explorer.querySelectorAll('[role="radio"]'));
    var image = explorer.querySelector('.explorer-image');
    var note = explorer.querySelector('.explorer-note');

    // warm the cache so switching is instant
    buttons.forEach(function (button) { new Image().src = button.dataset.src; });

    function select(button, focus) {
      buttons.forEach(function (b) {
        var on = b === button;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      image.src = button.dataset.src;
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

  // ------------------------------------------------------------ viewing-distance slider
  var range = document.getElementById('distance-range');
  var distanceImage = document.getElementById('distance-image');
  if (range && distanceImage) {
    var update = function () {
      var t = Number(range.value) / 100;
      var scale = Math.pow(0.07, t);            // 100% down to 7%, evenly in log-size
      distanceImage.style.width = (scale * 100).toFixed(2) + '%';
      range.setAttribute('aria-valuetext', Math.round(scale * 100) + '% of full size');
    };
    range.addEventListener('input', update);
    update();
  }

  // ------------------------------------------------------------ charts
  var SVG = 'http://www.w3.org/2000/svg';

  function el(name, attrs, parent) {
    var node = document.createElementNS(SVG, name);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(node);
    return node;
  }

  function gaussianResponse(sigma, f) {
    return Math.exp(-2 * Math.PI * Math.PI * sigma * sigma * f * f);
  }

  function cutoff(sigma) {
    return Math.sqrt(Math.log(2) / 2) / (Math.PI * sigma);
  }

  function lineChart(container, spec) {
    var tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    var current = null;
    var view = null;   // geometry and handles of the latest render

    // Draw at the container's real pixel width so text stays ~12px on phones.
    function render() {
      var W = Math.max(280, Math.round(container.clientWidth || 720));
      var H = Math.round(Math.min(320, Math.max(220, W * 0.44)));
      var m = { top: 18, right: 16, bottom: 48, left: W < 480 ? 46 : 58 };
      var iw = W - m.left - m.right, ih = H - m.top - m.bottom;
      container.innerHTML = '';
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, class: 'chart-svg', 'aria-hidden': 'true' }, container);
      container.appendChild(tip);
      var x = function (v) { return m.left + (v - spec.x[0]) / (spec.x[1] - spec.x[0]) * iw; };
      var y = function (v) { return m.top + (1 - (v - spec.y[0]) / (spec.y[1] - spec.y[0])) * ih; };
      var clampY = function (v) { return Math.max(spec.y[0], Math.min(spec.y[1], v)); };
      var clipId = 'clip-' + Math.random().toString(36).slice(2);
      el('rect', { x: m.left, y: m.top, width: iw, height: ih }, el('clipPath', { id: clipId }, el('defs', {}, svg)));

      spec.yTicks.forEach(function (t) {
        el('line', { x1: m.left, x2: m.left + iw, y1: y(t), y2: y(t), class: t === spec.yBaseline ? 'chart-baseline' : 'chart-grid' }, svg);
        el('text', { x: m.left - 8, y: y(t) + 4, class: 'chart-tick', 'text-anchor': 'end' }, svg).textContent = spec.yFormat(t);
      });
      var xTicks = W < 480 ? spec.xTicks.filter(function (_, i) { return i % 2 === 0; }) : spec.xTicks;
      xTicks.forEach(function (t) {
        el('text', { x: x(t), y: m.top + ih + 20, class: 'chart-tick', 'text-anchor': 'middle' }, svg).textContent = spec.xFormat(t);
      });
      el('text', { x: m.left + iw / 2, y: H - 6, class: 'chart-axis-label', 'text-anchor': 'middle' }, svg).textContent = spec.xLabel;
      el('text', { x: 13, y: m.top + ih / 2, class: 'chart-axis-label', 'text-anchor': 'middle', transform: 'rotate(-90 13 ' + (m.top + ih / 2) + ')' }, svg).textContent = spec.yLabel;

      (spec.markers || []).forEach(function (mk) {
        el('line', { x1: x(mk.x), x2: x(mk.x), y1: m.top, y2: m.top + ih, class: 'chart-marker ' + mk.cls }, svg);
        el('text', { x: x(mk.x) + (mk.anchor === 'end' ? -6 : 6), y: m.top + 14, class: 'chart-marker-label', 'text-anchor': mk.anchor || 'start' }, svg).textContent = mk.label;
      });

      var N = 240;
      spec.series.forEach(function (s) {
        var d = '';
        for (var i = 0; i <= N; i++) {
          var fx = spec.x[0] + (spec.x[1] - spec.x[0]) * i / N;
          // leave the plot through the bottom edge instead of running along it
          d += (i ? 'L' : 'M') + x(fx).toFixed(2) + ' ' + y(Math.max(s.f(fx), spec.y[0] - 20)).toFixed(2);
        }
        el('path', { d: d, class: 'chart-line ' + s.cls, 'clip-path': 'url(#' + clipId + ')' }, svg);
      });

      var cross = el('line', { y1: m.top, y2: m.top + ih, class: 'chart-cross', visibility: 'hidden' }, svg);
      var dots = spec.series.map(function (s) { return el('circle', { r: 4.5, class: 'chart-dot ' + s.cls, visibility: 'hidden' }, svg); });
      var hit = el('rect', { x: m.left, y: m.top, width: iw, height: ih, class: 'chart-hit' }, svg);

      function fromPointer(event) {
        var r = svg.getBoundingClientRect();
        var px = (event.clientX - r.left) / r.width * W;
        return spec.x[0] + (px - m.left) / iw * (spec.x[1] - spec.x[0]);
      }
      hit.addEventListener('pointermove', function (event) { show(fromPointer(event)); });
      hit.addEventListener('pointerdown', function (event) { show(fromPointer(event)); });
      hit.addEventListener('pointerleave', function (event) { if (event.pointerType !== 'touch') hide(); });

      view = { W: W, x: x, y: y, clampY: clampY, cross: cross, dots: dots };
      if (current !== null) show(current);
    }

    function show(fx) {
      current = Math.max(spec.x[0], Math.min(spec.x[1], fx));
      var px = view.x(current);
      view.cross.setAttribute('x1', px); view.cross.setAttribute('x2', px); view.cross.setAttribute('visibility', 'visible');
      var rows = '<div class="tip-head">' + spec.xFormatLong(current) + '</div>';
      spec.series.forEach(function (s, i) {
        var v = s.f(current);
        view.dots[i].setAttribute('cx', px); view.dots[i].setAttribute('cy', view.y(view.clampY(v)));
        view.dots[i].setAttribute('visibility', v < spec.y[0] ? 'hidden' : 'visible');
        rows += '<div class="tip-row"><i class="tip-key ' + s.cls + '"></i>' + s.name + '<b>' + spec.yFormatLong(v) + '</b></div>';
      });
      tip.innerHTML = rows;
      tip.hidden = false;
      // keep the readout on the side away from the crosshair
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
      var step = (spec.x[1] - spec.x[0]) / 60;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        show((current === null ? spec.focusX : current) + (event.key === 'ArrowRight' ? step : -step));
      } else if (event.key === 'Escape') {
        hide();
      }
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

  function db(v) { return 20 * Math.log10(Math.max(v, 1e-12)); }

  var sharpen = document.querySelector('[data-chart="sharpen-gain"]');
  if (sharpen) {
    var sigma = Number(sharpen.dataset.sigma);
    var gain = function (alpha) {
      return function (f) {
        var h = gaussianResponse(sigma, f);
        return db(h * ((1 + alpha) - alpha * h));
      };
    };
    lineChart(sharpen, {
      x: [0, 0.5], y: [-50, 6], yBaseline: 0,
      xTicks: [0, 0.1, 0.2, 0.3, 0.4, 0.5], yTicks: [-50, -40, -30, -20, -10, 0],
      xFormat: function (v) { return v.toFixed(1); },
      xFormatLong: function (v) { return v.toFixed(3) + ' cycles/px'; },
      yFormat: function (v) { return (v > 0 ? '+' : '') + v; },
      yFormatLong: function (v) { return v < -99 ? '< −99 dB' : (v > 0 ? '+' : '') + v.toFixed(1) + ' dB'; },
      xLabel: 'Frequency (cycles per pixel)', yLabel: 'Gain vs original (dB)',
      focusX: 0.1,
      series: [
        { name: 'Blurred', cls: 'series-blurred', f: gain(0) },
        { name: 'α = 1', cls: 'series-a1', f: gain(1) },
        { name: 'α = 2', cls: 'series-a2', f: gain(2) },
        { name: 'α = 4', cls: 'series-a4', f: gain(4) }
      ]
    });
  }

  var transfer = document.querySelector('[data-chart="hybrid-transfer"]');
  if (transfer) {
    var sigmaLow = Number(transfer.dataset.sigmaLow);
    var sigmaHigh = Number(transfer.dataset.sigmaHigh);
    var height = Number(transfer.dataset.height);
    var fLow = cutoff(sigmaLow) * height, fHigh = cutoff(sigmaHigh) * height;
    var xMax = Math.ceil(fHigh * 2.2 / 10) * 10;
    var ticks = [];
    var tickStep = xMax > 150 ? 50 : (xMax > 60 ? 20 : 10);
    for (var t = 0; t <= xMax; t += tickStep) ticks.push(t);
    lineChart(transfer, {
      x: [0, xMax], y: [0, 1.05],
      xTicks: ticks, yTicks: [0, 0.25, 0.5, 0.75, 1],
      xFormat: function (v) { return String(v); },
      xFormatLong: function (v) { return v.toFixed(1) + ' cycles / image height'; },
      yFormat: function (v) { return v.toFixed(2); },
      yFormatLong: function (v) { return v.toFixed(2); },
      xLabel: 'Frequency (cycles per image height)', yLabel: 'Filter response',
      focusX: (fLow + fHigh) / 2,
      markers: [
        { x: fLow, cls: 'series-low', label: 'f½ = ' + fLow.toFixed(0), anchor: 'end' },
        { x: fHigh, cls: 'series-high', label: 'f½ = ' + fHigh.toFixed(0) }
      ],
      series: [
        { name: 'Low-pass', cls: 'series-low', f: function (f) { return gaussianResponse(sigmaLow, f / height); } },
        { name: 'High-pass', cls: 'series-high', f: function (f) { return 1 - gaussianResponse(sigmaHigh, f / height); } }
      ]
    });
  }
})();
