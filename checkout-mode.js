/* Ambrosia — checkout mode on the storefront.
   Asks /api/checkout-mode once per page (never cached). In Zelle mode it adds
   the offer line to the top oxblood strip and tells the cart. Anything short of
   a clean "zelle" answer leaves the site in its normal WooCommerce state. */
(function () {
  var PROMO = 'LIMITED TIME \u00b7 25% OFF EVERY ORDER PAID BY ZELLE';
  var live = /(^|\.)ambrosiastandard\.com$|\.vercel\.app$/.test(location.hostname);
  window.AmbrosiaCheckoutMode = 'woocommerce';
  window.AmbrosiaBacWater = true;
  var BAC_ID = 'bac-water', BAC_HREF = 'bacteriostatic-water';

  /* Returns the mode string; records the bac water switch on the side. */
  function fetchMode() {
    if (!live) return Promise.resolve('woocommerce');
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { ctl && ctl.abort(); }, 2500);
    return fetch('/api/checkout-mode', { cache: 'no-store', signal: ctl && ctl.signal })
      .then(function (r) { return r.ok ? r.json() : { mode: 'woocommerce' }; })
      .then(function (d) {
        window.AmbrosiaBacWater = !(d && d.bacWater === false);
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

  /* Bac water off: hide every link to it (menus re-render, so keep watching)
     and take it out of the cart. The middleware redirects the page itself. */
  function hideBacWater() {
    var sel = 'a[href^="' + BAC_HREF + '"], a[href^="/' + BAC_HREF + '"]';
    function sweep() {
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        if (els[i].style.display !== 'none') els[i].style.display = 'none';
      }
    }
    sweep();
    try { new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
    var tries = 0;
    (function dropFromCart() {
      var CS = window.AmbrosiaCart;
      if (!CS) { if (tries++ < 150) setTimeout(dropFromCart, 60); return; }
      if (CS.read().some(function (l) { return l.id === BAC_ID; })) CS.remove(BAC_ID);
    })();
  }

  /* Zelle mode: reveal elements marked data-zelle-only (product nicknames). */
  function showZelleOnly() {
    function sweep() {
      var els = document.querySelectorAll('[data-zelle-only]');
      for (var i = 0; i < els.length; i++) if (els[i].style.display === 'none') els[i].style.display = '';
    }
    sweep();
    try { new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }

  /* Zelle mode: no popups. Removes the entry gate if it mounted before the
     mode was known, and keeps it from coming back. */
  function killPopups() {
    function sweep() {
      var g = document.getElementById('ambrosia-gate');
      if (g) { g.remove(); document.body.style.overflow = ''; }
    }
    sweep();
    try { new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }

  var ready = fetchMode().then(function (mode) {
    window.AmbrosiaCheckoutMode = mode;
    if (!window.AmbrosiaBacWater) hideBacWater();
    if (mode === 'zelle') { showZelleOnly(); killPopups(); }
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
