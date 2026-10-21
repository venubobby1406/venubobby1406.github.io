/* ============================================================
   studio.js — the Studio frame.
   Put the recording on a background, with padding and rounded
   corners, and save a second copy. Everything happens on this
   device: the original recording is never touched.

   Page-side on purpose: the recorder's own script owns the
   recording pipeline, this only reads the finished blob.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var studio = $('studio');
  if (!studio) return;

  var frame = $('studioFrame');
  var video = $('studioVideo');
  var dl = $('btnDownload');
  var out = $('studioDownload');
  var btn = $('studioRender');
  var note = $('studioNote');
  var padEl = $('studioPad'), padV = $('studioPadV');
  var radEl = $('studioRadius'), radV = $('studioRadiusV');
  var colorEl = $('studioColor');
  var swatches = $('studioBg');

  var bg = 'none';        // 'none' or a colour
  var custom = '#15161A';
  var rendering = false;

  function bgColor() {
    if (bg === 'none') {
      /* no background chosen: padding falls back to ink rather than black holes */
      return (parseInt(padEl.value, 10) > 0) ? '#15161A' : 'transparent';
    }
    return bg;
  }

  function apply() {
    var pad = parseInt(padEl.value, 10) || 0;
    var rad = parseInt(radEl.value, 10) || 0;
    padV.textContent = pad + ' px';
    radV.textContent = rad + ' px';
    frame.style.padding = pad + 'px';
    frame.style.background = bgColor();
    frame.style.borderRadius = rad ? rad + 'px' : '';
    var v = video;
    if (v) v.style.borderRadius = rad ? rad + 'px' : '';
  }

  /* keep the preview on the same file the download button offers */
  function syncSource() {
    if (!dl || !video) return;
    var href = dl.getAttribute('href') || '';
    if (!href || href.indexOf('blob:') !== 0) return;
    if (video.getAttribute('src') === href) return;
    video.setAttribute('src', href);
    video.muted = true;
    var p = video.play();
    if (p && p.catch) p.catch(function () { });
  }

  if (swatches) {
    swatches.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.swatch') : null;
      if (!b) return;
      var all = swatches.querySelectorAll('.swatch');
      for (var i = 0; i < all.length; i++) all[i].classList.remove('is-on');
      b.classList.add('is-on');
      bg = b.getAttribute('data-bg') || 'none';
      if (bg !== 'none') custom = bg;
      apply();
    });
  }
  if (colorEl) {
    colorEl.addEventListener('input', function () {
      custom = colorEl.value;
      bg = custom;
      var all = swatches ? swatches.querySelectorAll('.swatch') : [];
      for (var i = 0; i < all.length; i++) all[i].classList.remove('is-on');
      apply();
    });
  }
  if (padEl) padEl.addEventListener('input', apply);
  if (radEl) radEl.addEventListener('input', apply);

  /* the download link changes when the version or quality changes */
  if (dl && window.MutationObserver) {
    new MutationObserver(function () { syncSource(); apply(); })
      .observe(dl, { attributes: true, attributeFilter: ['href'] });
  }

  /* ---------- the render ---------- */
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function pickMime() {
    var opts = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < opts.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    }
    return '';
  }

  async function render() {
    if (rendering) return;
    var href = dl && dl.getAttribute('href');
    if (!href || href.indexOf('blob:') !== 0) {
      if (note) note.textContent = 'Record something first — then frame it.';
      return;
    }
    if (!window.MediaRecorder) {
      if (note) note.textContent = 'This browser cannot render a styled copy.';
      return;
    }
    rendering = true;
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = 'Rendering…';
    if (note) note.textContent = 'Rendering in real time — keep this tab in front.';

    var pad = parseInt(padEl.value, 10) || 0;
    var rad = parseInt(radEl.value, 10) || 0;
    var colour = bgColor();
    var src = video.getAttribute('src') || href;

    try {
      var v = document.createElement('video');
      v.src = src; v.muted = true; v.playsInline = true;
      await new Promise(function (res, rej) {
        v.addEventListener('loadeddata', res, { once: true });
        v.addEventListener('error', rej, { once: true });
        setTimeout(function () { rej(new Error('timeout')); }, 15000);
      });
      var W = v.videoWidth, H = v.videoHeight;
      if (!W || !H) throw new Error('no video dimensions');

      var canvas = document.createElement('canvas');
      canvas.width = W + pad * 2;
      canvas.height = H + pad * 2;
      var g = canvas.getContext('2d');

      var mime = pickMime();
      var rec = new MediaRecorder(canvas.captureStream(30), mime ? { mimeType: mime } : undefined);
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      var stopped = new Promise(function (res) { rec.onstop = res; });

      await v.play();

      var draw = function () {
        if (v.ended || v.paused) { try { rec.stop(); } catch (e) { } return; }
        g.clearRect(0, 0, canvas.width, canvas.height);
        if (colour && colour !== 'transparent') {
          g.fillStyle = colour;
          g.fillRect(0, 0, canvas.width, canvas.height);
        }
        g.save();
        if (rad) { roundRect(g, pad, pad, W, H, rad); g.clip(); }
        g.drawImage(v, pad, pad, W, H);
        g.restore();
        requestAnimationFrame(draw);
      };
      rec.start();
      draw();
      await stopped;

      var blob = new Blob(chunks, { type: 'video/webm' });
      if (out) {
        out.href = URL.createObjectURL(blob);
        out.download = 'clipsolo-styled.webm';
        out.classList.remove('hidden');
      }
      if (note) note.textContent = 'Done — ' + (blob.size / 1048576).toFixed(1) + ' MB styled copy. Your original is unchanged.';
    } catch (e) {
      if (note) note.textContent = 'Could not render the styled copy here: ' + (e && e.message ? e.message : 'unknown error');
    } finally {
      rendering = false;
      btn.disabled = false;
      btn.textContent = oldLabel;
      syncSource();
    }
  }

  if (btn) btn.addEventListener('click', render);

  /* when the result panel appears, pick the file up */
  var result = $('panel-result');
  if (result && window.MutationObserver) {
    new MutationObserver(function () {
      if (!result.classList.contains('hidden')) { syncSource(); apply(); }
    }).observe(result, { attributes: true, attributeFilter: ['class'] });
  }

  apply();
})();
