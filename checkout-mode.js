/* Ambrosia — checkout mode on the storefront.
   Asks /api/checkout-mode once per page (never cached). In Zelle mode it adds
   the offer line to the top oxblood strip and tells the cart. Anything short of
   a clean "zelle" answer leaves the site in its normal WooCommerce state. */
(function () {
  var PROMO = 'LIMITED TIME \u00b7 25% OFF EVERY ORDER PAID BY ZELLE';
  var live = /(^|\.)ambrosiastandard\.com$|\.vercel\.app$/.test(location.hostname);
  window.AmbrosiaCheckoutMode = 'woocommerce';

  function fetchMode() {
    if (!live) return Promise.resolve('woocommerce');
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, 2500);
    return fetch('/api/checkout-mode', { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : { mode: 'woocommerce' }; })
      .then(function (d) { return d && d.mode === 'zelle' ? 'zelle' : 'woocommerce'; })
      .catch(function () { return 'woocommerce'; })
      .finally(function () { clearTimeout(t); });
  }

  function strip() {
    var els = document.querySelectorAll('div[style*="#3E1218"]');
    for (var i = 0; i < els.length; i++) {
      var inner = els[i].firstElementChild;
      if (inner && /RESEARCH USE ONLY/.test(inner.textContent) && inner.children.length <= 4) return inner;
    }
    return null;
  }

  function showPromo() {
    var tries = 0;
    (function place() {
      var s = strip();
      if (!s) { if (tries++ < 150) setTimeout(place, 60); return; }
      if (s.querySelector('[data-zelle-promo]')) return;
      var el = document.createElement('span');
      el.setAttribute('data-zelle-promo', '');
      el.textContent = PROMO;
      el.style.cssText = 'font-size:11px; font-weight:600; letter-spacing:0.18em; color:#F0E9DC; white-space:normal';
      s.insertBefore(el, s.firstChild);
    })();
  }

  var ready = fetchMode().then(function (mode) {
    window.AmbrosiaCheckoutMode = mode;
    if (mode === 'zelle') showPromo();
    try { window.dispatchEvent(new CustomEvent('ambrosia:checkout-mode', { detail: mode })); } catch (e) {}
    return mode;
  });

  /* Fresh read at the moment of checkout, so a flip takes effect without a reload. */
  window.AmbrosiaCheckout = {
    ready: ready,
    current: function () { return fetchMode().then(function (m) { window.AmbrosiaCheckoutMode = m; return m; }); }
  };
})();
