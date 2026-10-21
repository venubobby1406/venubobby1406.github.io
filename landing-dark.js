/* ============================================================
   landing-dark.js — the only JavaScript on this page.
   Two jobs: the Tools dropdown and the mobile nav.
   Everything else is CSS. No dependencies, no build step.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- the Tools dropdown ---------- */
  var btn = document.getElementById('toolsBtn');
  var menu = document.getElementById('toolsMenu');

  if (btn && menu) {
    var items = Array.prototype.slice.call(menu.querySelectorAll('.menu__item'));

    function open() {
      menu.hidden = false;
      /* next frame, so the transition has a start state to animate from */
      requestAnimationFrame(function () { menu.classList.add('is-open'); });
      btn.setAttribute('aria-expanded', 'true');
    }
    function close(focusBack) {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      window.setTimeout(function () {
        if (!menu.classList.contains('is-open')) menu.hidden = true;
      }, 160);
      if (focusBack) btn.focus();
    }
    function isOpen() { return btn.getAttribute('aria-expanded') === 'true'; }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isOpen()) close(false); else open();
    });

    /* keep the pointer inside the menu open, leave it closes */
    menu.addEventListener('mouseenter', function () { if (!isOpen()) open(); });
    menu.addEventListener('mouseleave', function () { if (!window.matchMedia('(hover: hover)').matches) return; close(false); });

    /* click outside closes */
    document.addEventListener('click', function (e) {
      if (isOpen() && !menu.contains(e.target) && e.target !== btn) close(false);
    });

    /* Escape closes and returns the focus */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { close(true); return; }
      if (!isOpen()) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        var i = items.indexOf(document.activeElement);
        var next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        if (items[next]) items[next].focus();
      }
    });
  }

  /* ---------- the mobile nav ---------- */
  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');

  if (burger && links) {
    burger.addEventListener('click', function () {
      var open = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', open ? 'false' : 'true');
      burger.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
      links.classList.toggle('is-open', !open);
    });

    /* a tap on a link closes the panel */
    links.addEventListener('click', function (e) {
      if (e.target.closest('a') && links.classList.contains('is-open')) {
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-label', 'Open menu');
        links.classList.remove('is-open');
      }
    });

    /* Escape closes it */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('is-open')) {
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-label', 'Open menu');
        links.classList.remove('is-open');
        burger.focus();
      }
    });

    /* if the viewport grows past the mobile breakpoint, reset the panel */
    var mq = window.matchMedia('(min-width: 861px)');
    var reset = function () {
      if (!mq.matches) return;
      links.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
    };
    if (mq.addEventListener) mq.addEventListener('change', reset);
    else if (mq.addListener) mq.addListener(reset);
  }
})();
