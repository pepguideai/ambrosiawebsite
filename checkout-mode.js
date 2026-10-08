/* Ambrosia — checkout mode on the storefront.
   Asks /api/checkout-mode once per page (never cached). In Zelle mode it adds
   the offer line to the top oxblood strip and tells the cart. Anything short of
   a clean "zelle" answer leaves the site in its normal WooCommerce state. */
(function () {
  var PROMO = 'LIMITED TIME \u00b7 25% OFF EVERY ORDER PAID BY ZELLE';
  var live = /(^|\.)ambrosiastandard\.com$|\.vercel\.app$/.test(location.hostname);
  window.AmbrosiaCheckoutMode = 'woocommerce';
  window.AmbrosiaBacWater = false;
  var DROPPED_ID = 'bac-water';

  /* Returns the mode string. live-checkout.json is unchanged; the removed
     catalogue id is always stripped so an old cart cannot check it out. */
  function fetchMode() {
    if (!live) return Promise.resolve('woocommerce');
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, 2500);
    return fetch('/api/checkout-mode', { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : { mode: 'woocommerce' }; })
      .then(function (d) {
        window.AmbrosiaBacWater = false;
        return d && d.mode === 'zelle' ? 'zelle' : 'woocommerce';
      })
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

  /* Drop a legacy cart line for the removed catalogue id. Menus no longer
     link to it; this only clears browsers that still have the old line. */
  function dropRemovedProduct() {
    var tries = 0;
    (function dropFromCart() {
      var CS = window.AmbrosiaCart;
      if (!CS) { if (tries++ < 150) setTimeout(dropFromCart, 60); return; }
      if (CS.read().some(function (l) { return l.id === DROPPED_ID; })) CS.remove(DROPPED_ID);
    })();
  }

  /* Zelle mode still hides Woo-only chrome. It does not dismiss the research
     gate and it does not send /offer or vanity paths away. */
  function hideWooOnly() {
    function sweep() {
      var w = document.querySelectorAll("[data-woo-only]");
      for (var i = 0; i < w.length; i++) w[i].style.display = "none";
    }
    sweep();
    try { new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }

  var ready = fetchMode().then(function (mode) {
    window.AmbrosiaCheckoutMode = mode;
    dropRemovedProduct();
    if (mode === 'zelle') hideWooOnly();
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
