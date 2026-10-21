/* ============================================================
   ClipSolo — demos.js
   Drives the mini product animations on the landing:
   · plays a demo only while it is on screen (IntersectionObserver)
   · runs the hero recorder as a small state machine
     idle → recording → saved → repeat
   · respects prefers-reduced-motion (static final state instead)
   No dependencies, no build step.
   ============================================================ */
(function () {
  'use strict';

  document.body.classList.remove('no-js');

  var reduced = window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  if (reduced) document.body.classList.add('no-motion');

  /* ---------- 1 · play only what is on screen ---------- */
  var demos = Array.prototype.slice.call(document.querySelectorAll('[data-demo]'));

  if (!reduced && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        if (entry.isIntersecting && entry.intersectionRatio > 0.2) {
          el.classList.add('is-live');
        } else {
          el.classList.remove('is-live');
        }
      });
    }, { threshold: [0, 0.2, 0.5, 1] });
    demos.forEach(function (d) { io.observe(d); });
  } else {
    demos.forEach(function (d) { d.classList.add('is-live'); });
  }

  /* ---------- 2 · hero recorder state machine ---------- */
  var recorders = Array.prototype.slice.call(document.querySelectorAll('[data-demo="rec"]'));

  if (!reduced) {
    var phases = [
      { name: 'idle',  ms: 1500, say: 'Ready',   btn: 'Record' },
      { name: 'rec',   ms: 8200, say: 'Recording', btn: 'Stop' },
      { name: 'saved', ms: 2100, say: 'Saved',   btn: 'Record again' }
    ];

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function fmt(ms) {
      var s = Math.floor(ms / 1000);
      return pad(Math.floor(s / 60)) + ':' + pad(s % 60);
    }

    recorders.forEach(function (rec) {
      var labels = Array.prototype.slice.call(rec.querySelectorAll('[data-rec-label]'));
      var clocks = Array.prototype.slice.call(rec.querySelectorAll('[data-rec-time]'));
      var buttons = Array.prototype.slice.call(rec.querySelectorAll('[data-rec-btn-label]'));
      var idx = 0;
      var started = performance.now();
      var elapsed = 0;

      function frame(now) {
        var p = phases[idx];
        elapsed = now - started;
        if (elapsed >= p.ms) {
          idx = (idx + 1) % phases.length;
          p = phases[idx];
          started = now;
          elapsed = 0;
        }
        rec.setAttribute('data-state', p.name);
        labels.forEach(function (l) { l.textContent = p.say; });
        buttons.forEach(function (b) { b.textContent = p.btn; });
        clocks.forEach(function (c) {
          c.textContent = p.name === 'rec' ? fmt(elapsed)
            : p.name === 'saved' ? fmt(8200) : fmt(0);
        });
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  /* ---------- 3 · reveal on scroll (the "smoothness") ---------- */
  var revealSel = '.sec-head, .tool, .step, .case, .faq details, .toolrow, .bench .grid > div, .final__panel';
  var revealEls = Array.prototype.slice.call(document.querySelectorAll(revealSel));

  if (!reduced && revealEls.length && 'IntersectionObserver' in window) {
    document.body.classList.add('js-reveal');
    var groups = new Map();
    revealEls.forEach(function (el) {
      el.classList.add('reveal');
      var parent = el.parentElement;
      var n = groups.get(parent) || 0;
      groups.set(parent, n + 1);
      el.style.transitionDelay = Math.min(n, 6) * 45 + 'ms';
    });
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          ro.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    revealEls.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- 4 · aurora parallax ---------- */
  var glows = Array.prototype.slice.call(document.querySelectorAll('.aurora-field__glow'));
  if (glows.length && !reduced) {
    var queued = false;
    function paint() {
      var y = window.pageYOffset || 0;
      glows.forEach(function (g) {
        g.style.setProperty('--par', (y * 0.11).toFixed(1) + 'px');
      });
      queued = false;
    }
    window.addEventListener('scroll', function () {
      if (!queued) { queued = true; requestAnimationFrame(paint); }
    }, { passive: true });
    paint();
  }

  /* ---------- 5 · the header tightens once you scroll ---------- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var navTick = false;
    var onNavScroll = function () {
      if (navTick) return;
      navTick = true;
      requestAnimationFrame(function () {
        nav.classList.toggle('scrolled', (window.pageYOffset || 0) > 8);
        navTick = false;
      });
    };
    window.addEventListener('scroll', onNavScroll, { passive: true });
    onNavScroll();
  }

  /* ---------- 6 · honest counters ---------- */
  /* The "0" in "0 KB uploaded" is the point — it is never animated. */
})();
