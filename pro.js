/* ============================================================
   pro.js — the Pro key.
   ClipSolo stays free for everything that runs on your machine.
   "Pro" is the one thing that needs a server (optional share
   links), sold as a one-time unlock — no subscription, and no
   account: the key is stored on this device only.

   This file is the plumbing: it reads a locally stored key and
   marks the page as Pro. The key itself is issued by the
   payment link and validated by the share-link service later.
   ============================================================ */
(function () {
  'use strict';
  var STORE = 'clipsolo.pro.key';

  function key() { try { return localStorage.getItem(STORE) || ''; } catch (e) { return ''; } }
  function has() { return !!key(); }
  function set(k) { try { localStorage.setItem(STORE, k || ''); } catch (e) {} paint(); }
  function clear() { try { localStorage.removeItem(STORE); } catch (e) {} paint(); }

  function paint() {
    var on = has();
    document.documentElement.classList.toggle('is-pro', on);
    var nav = document.querySelector('.nav-right') || document.querySelector('.nav .wrap');
    if (!nav) return;
    var chip = nav.querySelector('.nav-pro');
    if (on && !chip) {
      chip = document.createElement('span');
      chip.className = 'nav-pro';
      chip.textContent = 'Pro';
      chip.title = 'Pro unlocked on this device';
      nav.insertBefore(chip, nav.firstChild);
    } else if (!on && chip) {
      chip.remove();
    }
  }

  window.ClipSoloPro = { has: has, key: key, set: set, clear: clear };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', paint);
  } else {
    paint();
  }
})();
