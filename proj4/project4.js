// Project 4 page interactions: contents rail, panorama pan, image explorers, correspondence viewer,
// blend wipe, and a live rectification demo (homography solve + inverse warp in the browser).
(function () {
  'use strict';

  var dataNode = document.getElementById('p4-data');
  var DATA = dataNode ? JSON.parse(dataNode.textContent) : { pairs: [], sets: {} };
  var SVGNS = 'http://www.w3.org/2000/svg';

  function preloadNear(node, srcs) {
    function load() { srcs.forEach(function (src) { new Image().src = src; }); }
    if (!('IntersectionObserver' in window)) { load(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); load(); }
    }, { rootMargin: '400px' });
    io.observe(node);
  }

  // radio-group behavior shared by every segmented control: click, arrows, Home/End
  function radioGroup(buttons, onSelect) {
    function select(button, focus) {
      buttons.forEach(function (b) {
        var on = b === button;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      onSelect(button);
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
    var current = buttons.filter(function (b) { return b.getAttribute('aria-checked') === 'true'; })[0] || buttons[0];
    return { select: select, current: current };
  }

  function fmt(v) {
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2).replace('e', '×10^').replace(/\^\+?(-?\d+)/, function (_, e) { return '<sup>' + e + '</sup>'; });
    return v.toFixed(a >= 100 ? 1 : a >= 1 ? 3 : 4);
  }

  function matrixHTML(H, label) {
    var cells = H.map(function (row) {
      return row.map(function (v) { return '<span>' + fmt(v) + '</span>'; }).join('');
    }).join('');
    return '<span class="matrix-label">' + label + '</span><div class="matrix" role="img" aria-label="3 by 3 matrix">' + cells + '</div>';
  }

  // ------------------------------------------------------------ contents rail: current section, fill, open subsections
  document.querySelectorAll('[data-toc]').forEach(function (toc) {
    var list = toc.querySelector('.toc-list');
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var items = links.map(function (a) {
      return { link: a, target: document.getElementById(a.getAttribute('href').slice(1)), sub: !!a.closest('.toc-sub') };
    }).filter(function (it) { return it.target; });
    var mains = items.filter(function (it) { return !it.sub; });
    var subs = items.filter(function (it) { return it.sub; });
    var wide = window.matchMedia('(min-width: 1100px)');
    var lastMain = null;
    toc.classList.add('is-live');

    function current(group) {
      var line = Math.min(window.innerHeight * 0.3, 260);
      var found = null;
      group.forEach(function (it) { if (it.target.getBoundingClientRect().top <= line) found = it; });
      return found;
    }

    function update() {
      var main = current(mains) || mains[0];
      var sub = current(subs);
      if (sub && !main.target.contains(sub.target)) sub = null;
      items.forEach(function (it) {
        if (it === main || it === sub) it.link.setAttribute('aria-current', 'true');
        else it.link.removeAttribute('aria-current');
      });
      toc.querySelectorAll('li.is-open').forEach(function (li) { li.classList.remove('is-open'); });
      var li = main.link.parentElement;
      if (li.querySelector('.toc-sub')) li.classList.add('is-open');
      if (wide.matches) {
        var top = main.link.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.style.setProperty('--fill', (top + main.link.offsetHeight / 2) + 'px');
      } else if (main !== lastMain) {
        list.scrollLeft = main.link.offsetLeft - list.clientWidth / 2 + main.link.offsetWidth / 2;
      }
      lastMain = main;
    }

    var queued = false;
    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; update(); });
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
  });

  // ------------------------------------------------------------ segmented image explorers
  document.querySelectorAll('[data-explorer]').forEach(function (explorer) {
    var buttons = Array.prototype.slice.call(explorer.querySelectorAll('[role="radio"]'));
    var image = explorer.querySelector('.explorer-image');
    var note = explorer.querySelector('.explorer-note');
    preloadNear(explorer, buttons.map(function (b) { return b.dataset.src; }));
    radioGroup(buttons, function (button) {
      image.src = button.dataset.src;
      if (button.dataset.alt) image.alt = button.dataset.alt;
      note.textContent = button.dataset.note;
    });
  });

  // ------------------------------------------------------------ panorama: drag to pan, start centered
  document.querySelectorAll('[data-pano]').forEach(function (figure) {
    var scroller = figure.querySelector('.pano-scroll');
    var img = scroller.querySelector('img');
    function center() { scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2; }
    if (img.complete) center(); else img.addEventListener('load', center);
    var startX = 0, startScroll = 0, dragging = false;
    scroller.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse') return;   // touch already scrolls natively
      dragging = true; startX = e.clientX; startScroll = scroller.scrollLeft;
      scroller.setPointerCapture(e.pointerId); scroller.classList.add('is-dragging');
    });
    scroller.addEventListener('pointermove', function (e) {
      if (dragging) scroller.scrollLeft = startScroll - (e.clientX - startX);
    });
    function stop() { dragging = false; scroller.classList.remove('is-dragging'); }
    scroller.addEventListener('pointerup', stop);
    scroller.addEventListener('pointercancel', stop);
    img.addEventListener('dragstart', function (e) { e.preventDefault(); });
  });

  // ------------------------------------------------------------ correspondence viewer
  document.querySelectorAll('[data-corr]').forEach(function (figure) {
    var buttons = Array.prototype.slice.call(figure.querySelectorAll('[data-pair]'));
    var panels = figure.querySelectorAll('.corr-panel');
    var imgs = [figure.querySelector('.corr-left'), figure.querySelector('.corr-right')];
    var svgs = [panels[0].querySelector('svg'), panels[1].querySelector('svg')];
    var tags = [panels[0].querySelector('.corr-tag'), panels[1].querySelector('.corr-tag')];
    var readout = figure.querySelector('.matrix-readout');
    var stats = figure.querySelector('.corr-stats');
    var GAIN = 5;
    preloadNear(figure, []);

    function el(name, attrs, parent) {
      var node = document.createElementNS(SVGNS, name);
      Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
      if (parent) parent.appendChild(node);
      return node;
    }

    function highlight(k) {
      svgs.forEach(function (svg) {
        svg.querySelectorAll('[data-k]').forEach(function (g) {
          g.classList.toggle('is-active', +g.dataset.k === k);
          g.classList.toggle('is-dim', k >= 0 && +g.dataset.k !== k);
        });
      });
    }

    function show(button) {
      var p = DATA.pairs[+button.dataset.pair];
      var size = DATA.sets[p.set].size;
      var label = DATA.sets[p.set].label;
      imgs[0].src = 'media/a1/' + p.set + '_' + p.i + '.jpg';
      imgs[1].src = 'media/a1/' + p.set + '_' + p.j + '.jpg';
      imgs[0].alt = label + ' photo ' + p.i + ' with ' + p.n + ' numbered correspondence points';
      imgs[1].alt = label + ' photo ' + p.j + ' with the matching points and their reprojections';
      tags[0].textContent = label + ' ' + p.i;
      tags[1].textContent = label + ' ' + p.j;
      svgs.forEach(function (svg) {
        svg.setAttribute('viewBox', '0 0 ' + size[0] + ' ' + size[1]);
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      });
      p.p1.forEach(function (pt, k) {
        var g = el('g', { 'data-k': k, class: 'corr-pt', tabindex: 0 }, svgs[0]);
        el('circle', { cx: pt[0], cy: pt[1], r: 9 }, g);
        var t = el('text', { x: pt[0], y: pt[1] + 4 }, g); t.textContent = k + 1;
        var q = p.p2[k], r = p.proj[k];
        var g2 = el('g', { 'data-k': k, class: 'corr-pt', tabindex: 0 }, svgs[1]);
        el('line', { class: 'resid', x1: q[0], y1: q[1], x2: q[0] + GAIN * (r[0] - q[0]), y2: q[1] + GAIN * (r[1] - q[1]) }, g2);
        el('circle', { class: 'proj', cx: q[0] + GAIN * (r[0] - q[0]), cy: q[1] + GAIN * (r[1] - q[1]), r: 11 }, g2);
        el('circle', { cx: q[0], cy: q[1], r: 9 }, g2);
        var t2 = el('text', { x: q[0], y: q[1] + 4 }, g2); t2.textContent = k + 1;
        [g, g2].forEach(function (node) {
          node.addEventListener('mouseenter', function () { highlight(k); });
          node.addEventListener('focus', function () { highlight(k); });
          node.addEventListener('mouseleave', function () { highlight(-1); });
          node.addEventListener('blur', function () { highlight(-1); });
          var tip = el('title', {}, node); tip.textContent = 'Point ' + (k + 1) + ': residual ' + p.err[k].toFixed(2) + ' px';
        });
      });
      readout.innerHTML = matrixHTML(p.H, 'H, photo ' + p.i + ' → photo ' + p.j);
      stats.innerHTML = p.n + ' points · RMSE <strong>' + p.rmse.toFixed(2) + ' px</strong> · worst ' + p.max.toFixed(2) + ' px';
    }

    var group = radioGroup(buttons, show);
    show(group.current);
  });

  // ------------------------------------------------------------ wipe: equal weights vs feathered
  document.querySelectorAll('[data-wipe]').forEach(function (figure) {
    var buttons = Array.prototype.slice.call(figure.querySelectorAll('[role="radio"]'));
    var stage = figure.querySelector('.wipe-stage');
    var under = figure.querySelector('.wipe-under');
    var over = figure.querySelector('.wipe-over img');
    var overWrap = figure.querySelector('.wipe-over');
    var range = figure.querySelector('.wipe-range');
    var note = figure.querySelector('.explorer-note');
    preloadNear(figure, buttons.map(function (b) { return b.dataset.over; }).concat(buttons.map(function (b) { return b.dataset.under; })));
    function setPos() {
      stage.style.setProperty('--pos', range.value + '%');
    }
    range.addEventListener('input', setPos);
    function show(button) {
      under.src = button.dataset.under;
      over.src = button.dataset.over;
      [under, over].forEach(function (im) { im.width = +button.dataset.w; im.height = +button.dataset.h; });
      under.alt = button.textContent + ' mosaic blended with equal weights';
      over.alt = button.textContent + ' mosaic blended with feathering';
      stage.style.aspectRatio = button.dataset.w + ' / ' + button.dataset.h;
      stage.classList.toggle('is-tall', +button.dataset.h > +button.dataset.w);
      note.textContent = button.dataset.note;
    }
    var group = radioGroup(buttons, show);
    show(group.current);
    setPos();
    overWrap.setAttribute('aria-hidden', 'true');
  });

  // ------------------------------------------------------------ rectification playground
  // Solve the 8x8 system for the homography taking 4 points a -> 4 points b (h33 = 1).
  function solveH(a, b) {
    var M = [], i, j, k;
    for (i = 0; i < 4; i++) {
      var x = a[i][0], y = a[i][1], u = b[i][0], v = b[i][1];
      M.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
      M.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
    }
    for (k = 0; k < 8; k++) {                 // Gaussian elimination with partial pivoting
      var piv = k;
      for (i = k + 1; i < 8; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i;
      if (Math.abs(M[piv][k]) < 1e-12) return null;
      var tmp = M[k]; M[k] = M[piv]; M[piv] = tmp;
      for (i = k + 1; i < 8; i++) {
        var f = M[i][k] / M[k][k];
        for (j = k; j < 9; j++) M[i][j] -= f * M[k][j];
      }
    }
    var h = new Array(8);
    for (i = 7; i >= 0; i--) {
      var s = M[i][8];
      for (j = i + 1; j < 8; j++) s -= M[i][j] * h[j];
      h[i] = s / M[i][i];
    }
    return [[h[0], h[1], h[2]], [h[3], h[4], h[5]], [h[6], h[7], 1]];
  }

  document.querySelectorAll('[data-playground]').forEach(function (figure) {
    var srcCanvas = figure.querySelector('.pg-source');
    var outCanvas = figure.querySelector('.pg-output');
    var matrix = figure.querySelector('.pg-matrix');
    var methodButtons = Array.prototype.slice.call(figure.querySelectorAll('[data-method]'));
    var resetButton = figure.querySelector('.pg-reset');
    var initial = JSON.parse(figure.dataset.corners);
    var target = JSON.parse(figure.dataset.size);
    var corners = initial.map(function (c) { return c.slice(); });
    var method = 'bilinear';
    var image = new Image();
    var pixels = null, W = 0, H = 0, scale = 1;
    var OUT_W = 175;                              // low resolution on purpose, then enlarged
    var OUT_H = Math.round(OUT_W * target[1] / target[0]);
    var handles = [];
    var active = -1;
    var names = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

    outCanvas.width = OUT_W; outCanvas.height = OUT_H;
    var outCtx = outCanvas.getContext('2d');
    var srcCtx = srcCanvas.getContext('2d');

    // keyboard-operable handles as real buttons over the canvas
    var stage = figure.querySelector('.playground-src');
    names.forEach(function (name, k) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pg-handle';
      b.setAttribute('aria-label', 'Move ' + name + ' corner with the arrow keys');
      b.addEventListener('keydown', function (e) {
        var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        var step = e.shiftKey ? 20 : 4;
        corners[k][0] = Math.max(0, Math.min(W - 1, corners[k][0] + d[0] * step));
        corners[k][1] = Math.max(0, Math.min(H - 1, corners[k][1] + d[1] * step));
        render();
      });
      stage.appendChild(b);
      handles.push(b);
    });

    function drawSource() {
      srcCtx.clearRect(0, 0, srcCanvas.width, srcCanvas.height);
      srcCtx.drawImage(image, 0, 0, srcCanvas.width, srcCanvas.height);
      srcCtx.save();
      srcCtx.scale(srcCanvas.width / W, srcCanvas.height / H);
      srcCtx.beginPath();
      corners.forEach(function (c, k) { if (k) srcCtx.lineTo(c[0], c[1]); else srcCtx.moveTo(c[0], c[1]); });
      srcCtx.closePath();
      srcCtx.restore();
      srcCtx.lineWidth = 2;
      srcCtx.strokeStyle = '#175cd3';
      srcCtx.fillStyle = 'rgba(23, 92, 211, 0.12)';
      srcCtx.fill(); srcCtx.stroke();
      corners.forEach(function (c, k) {
        handles[k].style.left = (c[0] / W * 100) + '%';
        handles[k].style.top = (c[1] / H * 100) + '%';
      });
    }

    function warp() {
      var rect = [[0, 0], [target[0] - 1, 0], [target[0] - 1, target[1] - 1], [0, target[1] - 1]];
      var Hm = solveH(rect, corners);              // output (target) pixels -> source pixels
      if (!Hm) return;
      matrix.innerHTML = matrixHTML(Hm, 'Output → source');
      var out = outCtx.createImageData(OUT_W, OUT_H);
      var o = out.data, sx = (target[0] - 1) / (OUT_W - 1), sy = (target[1] - 1) / (OUT_H - 1);
      for (var v = 0; v < OUT_H; v++) {
        for (var u = 0; u < OUT_W; u++) {
          var X = u * sx, Y = v * sy;
          var w = Hm[2][0] * X + Hm[2][1] * Y + 1;
          var x = (Hm[0][0] * X + Hm[0][1] * Y + Hm[0][2]) / w;
          var y = (Hm[1][0] * X + Hm[1][1] * Y + Hm[1][2]) / w;
          var idx = (v * OUT_W + u) * 4;
          if (method === 'nearest') {
            var xn = Math.floor(x + 0.5), yn = Math.floor(y + 0.5);
            if (xn < 0 || yn < 0 || xn >= W || yn >= H) { o[idx + 3] = 0; continue; }
            var s = (yn * W + xn) * 4;
            o[idx] = pixels[s]; o[idx + 1] = pixels[s + 1]; o[idx + 2] = pixels[s + 2]; o[idx + 3] = 255;
          } else {
            if (x < 0 || y < 0 || x > W - 1 || y > H - 1) { o[idx + 3] = 0; continue; }
            var x0 = Math.floor(x), y0 = Math.floor(y);
            var x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
            var dx = x - x0, dy = y - y0;
            var a = (y0 * W + x0) * 4, b = (y0 * W + x1) * 4, c = (y1 * W + x0) * 4, d = (y1 * W + x1) * 4;
            for (var ch = 0; ch < 3; ch++) {
              o[idx + ch] = (1 - dx) * (1 - dy) * pixels[a + ch] + dx * (1 - dy) * pixels[b + ch] +
                            (1 - dx) * dy * pixels[c + ch] + dx * dy * pixels[d + ch];
            }
            o[idx + 3] = 255;
          }
        }
      }
      outCtx.putImageData(out, 0, 0);
    }

    var queued = false;
    function render() {
      if (!pixels || queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; drawSource(); warp(); });
    }

    function toImage(e) {
      var r = srcCanvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
    }

    srcCanvas.addEventListener('pointerdown', function (e) {
      var p = toImage(e), best = -1, bestD = Infinity;
      var r = srcCanvas.getBoundingClientRect();
      corners.forEach(function (c, k) {
        var d = Math.hypot((c[0] - p[0]) / W * r.width, (c[1] - p[1]) / H * r.height);
        if (d < bestD) { bestD = d; best = k; }
      });
      if (bestD > 36) return;
      active = best;
      srcCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    srcCanvas.addEventListener('pointermove', function (e) {
      if (active < 0) return;
      var p = toImage(e);
      corners[active] = [Math.max(0, Math.min(W - 1, p[0])), Math.max(0, Math.min(H - 1, p[1]))];
      render();
    });
    function release() { active = -1; }
    srcCanvas.addEventListener('pointerup', release);
    srcCanvas.addEventListener('pointercancel', release);

    radioGroup(methodButtons, function (button) { method = button.dataset.method; render(); });
    resetButton.addEventListener('click', function () {
      corners = initial.map(function (c) { return c.slice(); });
      render();
    });

    image.onload = function () {
      W = image.naturalWidth; H = image.naturalHeight;
      srcCanvas.width = W; srcCanvas.height = H;
      var off = document.createElement('canvas');
      off.width = W; off.height = H;
      var octx = off.getContext('2d');
      octx.drawImage(image, 0, 0);
      try {
        pixels = octx.getImageData(0, 0, W, H).data;
      } catch (err) {                            // file:// pages cannot read canvas pixels
        figure.classList.add('is-unavailable');
        drawSource();
        return;
      }
      render();
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) { io.disconnect(); image.src = figure.dataset.src; }
      }, { rootMargin: '600px' });
      io.observe(figure);
    } else {
      image.src = figure.dataset.src;
    }
  });
})();
