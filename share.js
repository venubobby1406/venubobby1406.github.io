/* ============================================================
   share.js — send the recording somewhere.

   Two ways, and they are not the same thing:

   1 · "Send to an app"  — the operating system's own share
     sheet (WhatsApp, Slack, mail, files). The file goes straight
     from your machine to wherever you send it. No server, no
     link, nothing stored. Hidden on browsers that cannot share
     files, because a button that does nothing is a lie.

   2 · "Get a link"  — uploads the clip to the share service and
     hands back a URL that plays anywhere. This is the one thing
     that leaves your machine, so it is opt-in, it says so, and the
     link deletes itself after seven days. You can delete it early
     with the button that appears afterwards.

   The service is a Cloudflare Worker (see _design/worker/). Until
   it is deployed, endpoint is empty and the link button says so
   plainly instead of pretending.
   ============================================================ */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var SHARE = {
    endpoint: '',              /* set to the worker url once it is deployed */
    ttlDays: 7,                /* what the service promises */
    maxBytes: 25 * 1024 * 1024
  };

  var state = { busy: false, last: null };

  /* ---------- the file we are sharing: the same blob the download offers ---------- */
  function currentBlob() {
    var dl = $('btnDownload');
    var href = dl && dl.getAttribute('href');
    if (!href || href.indexOf('blob:') !== 0) return Promise.resolve(null);
    return fetch(href).then(function (r) { return r.blob(); });
  }

  function fileName() {
    var dl = $('btnDownload');
    var name = dl && dl.getAttribute('download');
    return name || 'clip.webm';
  }

  /* ---------- the service ---------- */
  function upload(blob, name) {
    if (!SHARE.endpoint) return Promise.reject(new Error('The share service is not switched on yet.'));
    if (!blob) return Promise.reject(new Error('There is no recording to share yet.'));
    if (blob.size > SHARE.maxBytes) {
      return Promise.reject(new Error('That clip is ' + Math.round(blob.size / 1048576) +
        ' MB — the limit is ' + Math.round(SHARE.maxBytes / 1048576) + ' MB. Trim it first, or download it.'));
    }
    var fd = new FormData();
    fd.append('file', blob, name || 'clip.webm');
    fd.append('name', name || 'clip.webm');
    return fetch(SHARE.endpoint + '/upload', { method: 'POST', body: fd, mode: 'cors' })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (!res.ok) throw new Error(body.error || ('The service answered ' + res.status + '.'));
          return body;
        });
      });
  }

  function removeClip(deleteUrl) {
    return fetch(deleteUrl, { method: 'DELETE', mode: 'cors' })
      .then(function (res) { return res.json().catch(function () { return {}; }); });
  }

  /* ---------- the operating system's share sheet ---------- */
  function canShareFiles() {
    try {
      if (!navigator.share || !navigator.canShare) return false;
      var probe = new File([new Blob([new Uint8Array(1)], { type: 'video/webm' })], 'probe.webm', { type: 'video/webm' });
      return navigator.canShare({ files: [probe] });
    } catch (e) { return false; }
  }

  function shareFile(blob, name) {
    if (!blob) return Promise.reject(new Error('There is no recording to share yet.'));
    var file = new File([blob], name || 'clip.webm', { type: blob.type || 'video/webm' });
    return navigator.share({ files: [file], title: 'ClipSolo clip' });
  }

  /* ---------- the card in the result panel ---------- */
  var card = $('share');
  if (card) {
    var btnLink = $('shareLink');
    var btnSend = $('shareSend');
    var note = $('shareNote');
    var box = $('shareLinkBox');
    var urlEl = $('shareUrl');
    var btnCopy = $('shareCopy');
    var btnDelete = $('shareDelete');
    var expiry = $('shareExpiry');

    var ON = !!SHARE.endpoint;

    function offMessage() {
      return 'The link service is not switched on yet. Download the file, or send it straight from here — nothing needs a server.';
    }

    if (btnLink) {
      btnLink.addEventListener('click', function () {
        if (state.busy) return;
        if (!SHARE.endpoint) {          /* the service is not deployed — say so, do not fake it */
          if (note) note.textContent = offMessage();
          return;
        }
        state.busy = true;
        btnLink.disabled = true;
        btnLink.textContent = 'Uploading…';
        if (note) note.textContent = 'Sending the file to the share service…';

        currentBlob()
          .then(function (blob) { return upload(blob, fileName()); })
          .then(function (res) {
            state.last = res;
            if (box) box.classList.remove('hidden');
            if (urlEl) { urlEl.textContent = res.url; urlEl.href = res.url; }
            if (expiry) {
              var days = res.ttlDays || SHARE.ttlDays;
              var when = res.expiresAt ? new Date(res.expiresAt) : null;
              expiry.textContent = 'This link deletes itself in ' + days + ' days' +
                (when ? ' — on ' + when.toLocaleDateString() : '') + '.';
            }
            if (note) note.textContent = 'Done. The file is on our storage now, and only for that long.';
            btnLink.textContent = 'Get another link';
          })
          .catch(function (err) {
            if (note) note.textContent = (err && err.message) ? err.message : 'The upload did not go through.';
            btnLink.textContent = 'Get a link';
          })
          .then(function () {
            state.busy = false;
            if (ON) btnLink.disabled = false;
          });
      });
    }

    if (btnSend) {
      if (canShareFiles()) {
        btnSend.classList.remove('hidden');
        btnSend.addEventListener('click', function () {
          currentBlob().then(function (blob) { return shareFile(blob, fileName()); })
            .catch(function (err) {
              if (err && err.name === 'AbortError') return;
              if (note) note.textContent = 'This browser would not open the share sheet. Download the file instead.';
            });
        });
      } else {
        btnSend.remove();
      }
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        var link = urlEl ? urlEl.textContent : '';
        if (!link) return;
        var label = btnCopy.textContent;
        var done = function () { btnCopy.textContent = 'Copied'; setTimeout(function () { btnCopy.textContent = label; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(done, function () { if (note) note.textContent = 'Copy it by hand: ' + link; });
        } else if (note) note.textContent = 'Copy it by hand: ' + link;
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', function () {
        if (!state.last || !state.last.deleteUrl) return;
        btnDelete.disabled = true;
        removeClip(state.last.deleteUrl).then(function (res) {
          if (res && res.ok) {
            if (box) box.classList.add('hidden');
            if (note) note.textContent = 'Deleted. The link is dead and the file is gone.';
          } else {
            btnDelete.disabled = false;
            if (note) note.textContent = 'It did not delete — ' + ((res && res.error) || 'unknown reason') + '.';
          }
        }).catch(function () {
          btnDelete.disabled = false;
          if (note) note.textContent = 'It did not delete — the service did not answer.';
        });
      });
    }

    if (!ON && note) {
      note.textContent = offMessage();
    } else if (note) {
      note.textContent = 'The clip is uploaded only because you asked for a link. It deletes itself after ' +
        SHARE.ttlDays + ' days, and you can take it down sooner.';
    }
  }

  window.ClipSoloShare = {
    config: SHARE,
    state: state,
    upload: upload,
    removeClip: removeClip,
    shareFile: shareFile,
    canShareFiles: canShareFiles,
    currentBlob: currentBlob
  };
})();
