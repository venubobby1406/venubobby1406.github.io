/* ============================================================
   sponsors.js — the one quiet sponsor slot.
   The site's promise has always been "one small sponsor slot keeps
   the lights on — never your files, never your data". This is that
   slot: a single text link in the footer, no tracking, no cookies,
   no interstitials, no popups. If there is no sponsor it renders
   nothing at all.
   ============================================================ */
(function () {
  'use strict';
  var slot = document.getElementById('sponsorSlot');
  if (!slot) return;

  function paint(cfg) {
    if (!cfg || !cfg.sponsor || !cfg.url) return;   /* nothing to show */
    var label = document.getElementById('sponsorLabel');
    var link = document.getElementById('sponsorLink');
    var blurb = document.getElementById('sponsorBlurb');
    if (label) label.textContent = cfg.label || 'Sponsored by';
    if (link) { link.textContent = cfg.sponsor; link.href = cfg.url; }
    if (blurb) blurb.textContent = cfg.blurb || '';
    slot.hidden = false;
  }

  if (typeof fetch === 'function') {
    fetch('sponsors.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(paint)
      .catch(function () { /* offline or file:// — the slot stays hidden */ });
  }
})();
