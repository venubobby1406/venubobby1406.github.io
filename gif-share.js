/* gif-share.js — the GIF pane's "Save this range as MP4" shortcut.
   WhatsApp Web cannot send an animated GIF: it uploads the file as a document,
   and WhatsApp on the phone cannot open a GIF document. An MP4 of the same span
   plays inline everywhere, so this button drives the page's own Start/End sliders
   and the Trim action. workbench.js keeps its range in a closure and stays untouched. */
(function () {
  var btn = document.getElementById('wbGoGifMp4');
  if (!btn) return;
  var GIF_MAX = 8;   /* must match GIF_MAX in workbench.js — the GIF clamp */

  btn.addEventListener('click', function () {
    var inR = document.getElementById('wbIn');
    var outR = document.getElementById('wbOut');
    var go = document.getElementById('wbGoTrim');
    if (!inR || !outR || !go) return;
    if (go.disabled) return;   /* a render is already running — let it finish */

    var inT = parseFloat(inR.value) || 0;
    var outT = parseFloat(outR.value) || 0;

    /* exactly the span the GIF uses: never longer than GIF_MAX seconds */
    if (outT > inT + GIF_MAX) {
      outR.value = inT + GIF_MAX;
      outR.dispatchEvent(new Event('input', { bubbles: true }));
    }

    var tab = document.querySelector('.wmode[data-pane="trim"]');
    if (tab) tab.click();
    go.click();
  });
})();
