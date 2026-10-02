/* Ambrosia — checkout mode on the storefront.
   Asks /api/checkout-mode once per page (never cached). A clean "zelle"
   answer sets data-checkout-mode on <html>, which hides [data-promo] and
   shows the homepage's [data-zelle-copy] banner. Anything short of that
   leaves the site in its normal WooCommerce state. */
(function () {
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

  function apply(mode) {
    window.AmbrosiaCheckoutMode = mode;
    try { document.documentElement.setAttribute('data-checkout-mode', mode); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('ambrosia:checkout-mode', { detail: mode })); } catch (e) {}
  }

  var ready = fetchMode().then(function (mode) {
    apply(mode);
    return mode;
  });

  /* Fresh read at the moment of checkout, so a flip takes effect without a reload. */
  window.AmbrosiaCheckout = {
    ready: ready,
    current: function () { return fetchMode().then(function (m) { apply(m); return m; }); }
  };
})();
