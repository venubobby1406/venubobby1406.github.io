/* ============================================================
   ClipSolo Embed — a record button for your product.
   Drop one <script> tag on any site and your users can record
   their screen (camera bubble and mic optional) without an
   account, without an install, and without the recording
   touching our servers: it is encoded in the visitor's browser
   and posted straight to YOUR endpoint.

     <script src="https://YOUR-CDN/clipsolo/embed.js"
             data-endpoint="https://api.yoursite.com/recordings"
             data-accent="#E23B2E"
             data-label="Record a bug"></script>
     <button data-clipsolo>Record a bug</button>

   Config (attributes on the script tag, or window.ClipSolo):
     data-endpoint   where the finished clip is POSTed (multipart: file,
                     plus name/email/width/height/duration fields).
                     Leave it out and the visitor just downloads the file.
     data-accent     button colour, default #E23B2E
     data-label      button text, default "Record"
     data-camera     on|off — show the camera bubble, default on
     data-frame      on|off — the studio frame (background + padding),
                     default on
     data-pad        frame padding in px, default 48
     data-radius     corner radius in px, default 24
     data-bg         frame background, default #1B1D22
     data-max        longest recording in seconds, default 900

   Everything is local: no cookies, no analytics, no third party.
   ============================================================ */
(function () {
  'use strict';
  if (window.ClipSoloEmbed) return;

  var CFG = {
    endpoint: '', accent: '#E23B2E', label: 'Record', camera: 'on', frame: 'on',
    pad: 48, radius: 24, bg: '#1B1D22', max: 900
  };

  function readConfig() {
    var script = document.currentScript ||
      (function () { var s = document.querySelectorAll('script'); return s[s.length - 1]; })();
    if (script) {
      var d = script.dataset || {};
      ['endpoint', 'accent', 'label', 'camera', 'frame', 'bg'].forEach(function (k) { if (d[k]) CFG[k] = d[k]; });
      ['pad', 'radius', 'max'].forEach(function (k) { if (d[k] !== undefined && d[k] !== '') CFG[k] = parseInt(d[k], 10) || CFG[k]; });
    }
    if (window.ClipSolo && typeof window.ClipSolo === 'object') {
      Object.keys(window.ClipSolo).forEach(function (k) { if (window.ClipSolo[k] !== undefined) CFG[k] = window.ClipSolo[k]; });
    }
    CFG.camera = CFG.camera !== 'off';
    CFG.frame = CFG.frame !== 'off';
  }
  readConfig();

  /* ---------------- styles (injected once) ---------------- */
  var CSS = [
    '.cs-modal{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;',
    'background:rgba(12,13,16,.72);backdrop-filter:blur(10px);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#EDEDEA}',
    '.cs-modal.is-open{display:flex}',
    '.cs-card{width:min(920px,94vw);background:#0E0F13;border:1px solid rgba(255,255,255,.1);border-radius:20px;overflow:hidden;',
    'box-shadow:0 40px 90px -40px rgba(0,0,0,.9)}',
    '.cs-head{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.08)}',
    '.cs-head b{font-size:14px;font-weight:600;letter-spacing:-.01em}',
    '.cs-head .cs-dot{width:8px;height:8px;border-radius:50%;background:' + CFG.accent + '}',
    '.cs-head .cs-x{margin-left:auto;background:none;border:0;color:#8A8D95;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px}',
    '.cs-stage{position:relative;background:#08090B;display:grid;place-items:center;min-height:240px}',
    '.cs-stage canvas{display:block;max-width:100%;max-height:56vh}',
    '.cs-bar{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.08)}',
    '.cs-btn{height:38px;padding:0 16px;border:0;border-radius:999px;background:' + CFG.accent + ';color:#fff;font:600 13px/1 system-ui,sans-serif;cursor:pointer}',
    '.cs-btn.ghost{background:rgba(255,255,255,.09);color:#EDEDEA}',
    '.cs-time{font:500 13px/1 ui-monospace,Consolas,monospace;letter-spacing:.06em;color:#E9EAEC}',
    '.cs-note{margin-left:auto;font:500 11px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.06em;color:#8A8D95;text-align:right}',
    '.cs-sel{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px}',
    '.cs-sel label{display:inline-flex;align-items:center;gap:7px;padding:7px 11px;border:1px solid rgba(255,255,255,.14);',
    'border-radius:9px;font-size:12.5px;color:#C6C8CE;cursor:pointer}',
    '.cs-sel input{accent-color:' + CFG.accent + '}',
    '.cs-stage .cs-badge{position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:8px;padding:6px 10px;',
    'border-radius:8px;background:rgba(8,9,11,.82);font:500 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.08em}',
    '.cs-stage .cs-badge i{width:7px;height:7px;border-radius:50%;background:' + CFG.accent + '}',
    '.cs-err{margin:0;padding:12px 18px;color:#FFB4AC;font-size:13px}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  /* ---------------- the recorder ---------------- */
  var modal, canvas, ctx, stream = null, camStream = null, micStream = null, audioCtx = null;
  var rec = null, chunks = [];
  var screenVid = null, camVid = null, raf = 0, timer = 0, started = 0, statusEl = null, audioTracks = 0;

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function build() {
    modal = el('div', 'cs-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Record');
    var card = el('div', 'cs-card');

    var head = el('div', 'cs-head');
    head.appendChild(el('span', 'cs-dot'));
    head.appendChild(el('b', null, 'ClipSolo'));
    var x = el('button', 'cs-x', '&times;');
    x.setAttribute('aria-label', 'Close');
    x.onclick = close;
    head.appendChild(x);
    card.appendChild(head);

    var sel = el('div', 'cs-sel');
    var l1 = el('label', null, '<input type="checkbox" id="csCam"' + (CFG.camera ? ' checked' : '') + '> Camera bubble');
    var l2 = el('label', null, '<input type="checkbox" id="csMic" checked> Microphone');
    var l3 = el('label', null, '<input type="checkbox" id="csFrame"' + (CFG.frame ? ' checked' : '') + '> Studio frame');
    sel.appendChild(l1); sel.appendChild(l2); sel.appendChild(l3);
    card.appendChild(sel);

    var stage = el('div', 'cs-stage');
    canvas = el('canvas');
    stage.appendChild(canvas);
    var badge = el('div', 'cs-badge', '<i></i> READY');
    badge.id = 'csBadge';
    stage.appendChild(badge);
    card.appendChild(stage);

    var bar = el('div', 'cs-bar');
    var go = el('button', 'cs-btn', 'Start recording');
    go.id = 'csGo';
    go.onclick = start;
    var time = el('span', 'cs-time', '00:00');
    time.id = 'csTime';
    bar.appendChild(go);
    bar.appendChild(time);
    statusEl = el('span', 'cs-note', 'Stays on this device until you send it.');
    bar.appendChild(statusEl);
    card.appendChild(bar);

    var err = el('p', 'cs-err');
    err.id = 'csErr';
    err.style.display = 'none';
    card.appendChild(err);

    modal.appendChild(card);
    modal.addEventListener('click', function (e) { if (e.target === modal) close(); });
    document.body.appendChild(modal);
  }

  function fail(msg) {
    var e = document.getElementById('csErr');
    if (e) { e.textContent = msg; e.style.display = 'block'; }
    if (statusEl) statusEl.textContent = 'Could not start.';
  }

  function close() {
    stopTracks();
    if (modal) modal.classList.remove('is-open');
  }

  function stopTracks() {
    cancelAnimationFrame(raf);
    clearInterval(timer);
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) {} }
    rec = null;
    if (screenVid) { screenVid.srcObject = null; screenVid = null; }
    if (camVid) { camVid.srcObject = null; camVid = null; }
    [stream, camStream, micStream].forEach(function (s) { if (s) s.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} }); });
    stream = null; camStream = null; micStream = null;
    if (audioCtx) { try { audioCtx.close(); } catch (e) {} audioCtx = null; }
  }

  async function start() {
    var go = document.getElementById('csGo');
    var err = document.getElementById('csErr');
    if (err) err.style.display = 'none';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      fail('This browser cannot record a screen.');
      return;
    }
    go.disabled = true;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true
      });
    } catch (e) {
      go.disabled = false;
      fail('Screen sharing was cancelled or blocked.');
      return;
    }
    var wantCam = document.getElementById('csCam').checked;
    if (wantCam && navigator.mediaDevices.getUserMedia) {
      try { camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch (e) { camStream = null; }
    }
    /* the microphone is a real switch — it becomes a real track in the clip */
    var wantMic = document.getElementById('csMic').checked;
    if (wantMic && navigator.mediaDevices.getUserMedia) {
      try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
      catch (e) { micStream = null; document.getElementById('csMic').checked = false; }
    }

    screenVid = document.createElement('video');
    screenVid.srcObject = stream; screenVid.muted = true; screenVid.playsInline = true;
    await screenVid.play().catch(function () {});
    if (camStream) {
      camVid = document.createElement('video');
      camVid.srcObject = camStream; camVid.muted = true; camVid.playsInline = true;
      await camVid.play().catch(function () {});
    }

    var W = screenVid.videoWidth || 1280, H = screenVid.videoHeight || 720;
    var useFrame = document.getElementById('csFrame').checked;
    var pad = useFrame ? CFG.pad : 0, rad = useFrame ? CFG.radius : 0;
    canvas.width = W + pad * 2;
    canvas.height = H + pad * 2;
    ctx = canvas.getContext('2d');

    var mime = '';
    ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'].some(function (m) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; return true; }
      return false;
    });

    /* the clip's tracks: the canvas video + (system audio and/or the microphone) */
    var recStream = canvas.captureStream(30);
    audioTracks = 0;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        var dest = audioCtx.createMediaStreamDestination();
        if (stream.getAudioTracks().length) { audioCtx.createMediaStreamSource(stream).connect(dest); }
        if (micStream) { audioCtx.createMediaStreamSource(micStream).connect(dest); }
        dest.stream.getAudioTracks().forEach(function (t) { recStream.addTrack(t); audioTracks++; });
        if (audioCtx.state === 'suspended') { audioCtx.resume(); }
      }
    } catch (e) { audioTracks = 0; }

    try {
      rec = new MediaRecorder(recStream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      go.disabled = false; stopTracks();
      fail('This browser cannot encode a recording.');
      return;
    }
    chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = finish;
    rec.start();

    started = Date.now();
    timer = setInterval(function () {
      var t = Math.floor((Date.now() - started) / 1000);
      var m = Math.floor(t / 60), s = t % 60;
      var e2 = document.getElementById('csTime');
      if (e2) e2.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      if (t >= CFG.max) { try { rec.stop(); } catch (e2) {} }
    }, 250);

    var badge = document.getElementById('csBadge');
    if (badge) badge.innerHTML = '<i></i> REC';
    go.textContent = 'Stop & save';
    go.disabled = false;
    go.onclick = function () { try { rec.stop(); } catch (e) {} };
    draw(W, H, pad, rad, useFrame);
  }

  function roundRect(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function draw(W, H, pad, rad, useFrame) {
    var badge = document.getElementById('csBadge');
    raf = requestAnimationFrame(function () {
      if (!screenVid) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (useFrame) {
        ctx.fillStyle = CFG.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.save();
      if (rad) { roundRect(ctx, pad, pad, W, H, rad); ctx.clip(); }
      ctx.drawImage(screenVid, pad, pad, W, H);
      if (camVid && camVid.videoWidth) {
        var r = Math.round(Math.min(W, H) * 0.11);
        var mg = Math.round(r * 0.4);
        var cx = canvas.width - r - mg, cy = canvas.height - r - mg;
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
        var s = Math.max((2 * r) / camVid.videoWidth, (2 * r) / camVid.videoHeight);
        var dw = camVid.videoWidth * s, dh = camVid.videoHeight * s;
        ctx.drawImage(camVid, cx - dw / 2, cy - dh / 2, dw, dh);
        ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(4, r * 0.055); ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.stroke();
      }
      ctx.restore();
      if (badge) badge.innerHTML = '<i></i> REC';
      draw(W, H, pad, rad, useFrame);
    });
  }

  async function finish() {
    var blob = new Blob(chunks, { type: 'video/webm' });
    chunks = [];
    /* what actually came out — used by the tests and by anyone curious */
    window.ClipSoloEmbed.last = {
      bytes: blob.size,
      width: canvas.width,
      height: canvas.height,
      duration: Math.round((Date.now() - started) / 1000),
      audio: audioTracks > 0,
      mic: !!micStream,
      systemAudio: !!(stream && stream.getAudioTracks().length),
      frame: CFG.frame
    };
    var go = document.getElementById('csGo');
    if (go) { go.textContent = 'Record again'; go.onclick = start; }
    var badge = document.getElementById('csBadge');
    if (badge) badge.innerHTML = '<i></i> SAVED';
    stopTracks();

    if (!CFG.endpoint) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'clip-' + Date.now() + '.webm';
      a.click();
      if (statusEl) statusEl.textContent = 'Downloaded — ' + (blob.size / 1048576).toFixed(1) + ' MB. Configure an endpoint to post it instead.';
      return;
    }

    if (statusEl) statusEl.textContent = 'Sending to your server…';
    try {
      var fd = new FormData();
      fd.append('file', blob, 'clip-' + Date.now() + '.webm');
      fd.append('width', String(canvas.width));
      fd.append('height', String(canvas.height));
      fd.append('duration', String(Math.round((Date.now() - started) / 1000)));
      var res = await fetch(CFG.endpoint, { method: 'POST', body: fd, mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (statusEl) statusEl.textContent = 'Sent to your server (' + Math.round(blob.size / 1024) + ' KB).';
    } catch (e) {
      fail('Your endpoint did not accept the recording. Nothing was uploaded.');
      if (statusEl) statusEl.textContent = 'Could not reach your endpoint (' + (e && e.message ? e.message : 'error') + '). The file was not sent.';
    }
  }

  /* ---------------- the trigger buttons ---------------- */
  function wire() {
    var buttons = document.querySelectorAll('[data-clipsolo]');
    for (var i = 0; i < buttons.length; i++) {
      (function (b) {
        b.style.setProperty('--cs-accent', CFG.accent);
        b.addEventListener('click', function (ev) {
          ev.preventDefault();
          if (!modal) build();
          modal.classList.add('is-open');
          var go = document.getElementById('csGo');
          if (go) { go.textContent = 'Start recording'; go.onclick = start; }
          var err = document.getElementById('csErr');
          if (err) err.style.display = 'none';
        });
      })(buttons[i]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.ClipSoloEmbed = { open: function () { if (!modal) build(); modal.classList.add('is-open'); }, config: CFG };
})();
