// Loaded by every fixture page. With `?harness` in the URL it injects the fake
// chrome runtime and the built content script so the page can be tested
// without installing the extension. Without it, the page is plain HTML for
// testing the real extension (load via scripts/serve.mjs so the http:// match
// pattern applies).
(function () {
  var params = new URLSearchParams(location.search);
  if (!params.has('harness')) return;
  var here = document.currentScript.src;
  var shim = new URL('../dist/shim.js', here).href;
  var content = new URL('../../../dist/content.js', here).href;
  var s1 = document.createElement('script');
  s1.src = shim;
  s1.onload = function () {
    var s2 = document.createElement('script');
    s2.src = content;
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
  var badge = document.createElement('div');
  badge.textContent = 'harness mode: fake chrome runtime, Alt+Shift+A simulates the shortcut';
  badge.style.cssText = 'position:fixed;left:8px;bottom:8px;font:11px system-ui;color:#555;background:#fff8c4;padding:2px 6px;border-radius:4px;z-index:2147483646';
  document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(badge); });
})();
