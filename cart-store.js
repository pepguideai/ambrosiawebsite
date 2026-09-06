/* ============================================================================
   Ambrosia cart — shared across pages. Classic script; sets window.AmbrosiaCart.

   ARCHITECTURE
   ------------
   Prices come from WooCommerce (headless) via the Store API. The FALLBACK table
   below exists only so pages render before the fetch resolves, and so the five
   products not yet wired to Woo still work. Live data overrides it by slug.

   Cart keys are SLUGS ('glp-3-30'), not Woo IDs. Every catalogue entry carries a
   `wooId` once live data matches it, so checkout can translate slug -> Woo ID.
   Keeping slugs as the key is what lets the product pages, the multi-vial tiers
   and the bacteriostatic-water prompt work identically before and after the
   fetch lands.

   [SERVER] markers flag everything that needs a real backend before launch.
   ============================================================================ */

(function () {
  /* Idempotent: the runtime can evaluate this file more than once per page. */
  if (window.AmbrosiaCart) return;

  /* Store API is called on WordPress's OWN host, not through the www proxy.
     Reason: WordPress scopes its session cookies to admin.ambrosiastandard.com.
     A cart built over the proxy lands on www, so the customer arrives at
     WordPress's checkout with no session and gets bounced to wp-login.

     www and admin share the registrable domain, so the cart cookie is
     same-site and carries into the checkout navigation. Cross-ORIGIN still
     applies, so WordPress must return CORS headers for this origin — see the
     "Ambrosia Store API CORS" WPCode snippet. */
  var WOO_ORIGIN = 'https://admin.ambrosiastandard.com';
  var STORE_API_URL = WOO_ORIGIN + '/wp-json/wc/store/v1';
  window.STORE_API_URL = STORE_API_URL; // legacy global, referenced by older page code

  var KEY = 'ambrosia-cart-v1';
  var EVT = 'ambrosia-cart-change';

  /* --------------------------------------------------------------------------
     Woo product IDs, by slug.

     GLP-3 (11) is confirmed and is the reference pattern — see loadCatalog()
     below and loadSizes() on glp-3.html.

     [SERVER] The five nulls need their real Woo parent product IDs. Until then
     those products fall back to the hardcoded prices in FALLBACK and their
     product pages use static SIZES. Fill an ID in here and the catalogue entry
     starts coming from Woo with no other change.
     -------------------------------------------------------------------------- */
  var WOO_PRODUCT_IDS = {
    'glp-3':     11,
    'glp-2':     19,
    'ghk-cu':    27,
    'glow':      32,
    'klow':      31,
    'wolverine': 30,
    'bac-water': 47
  };

  /* --------------------------------------------------------------------------
     FALLBACK prices. [SERVER] Delete a block once its Woo ID is filled in above
     and the live fetch is confirmed for it.
     -------------------------------------------------------------------------- */
  var FALLBACK = {
    'glp-2':        { name: 'GLP-2',                 mass: '10 MG per vial',  price: 70,  img: 'vial-glp-2.png',     href: 'glp-2.html' },
    'glp-2-20':     { name: 'GLP-2',                 mass: '20 MG per vial',  price: 120, img: 'vial-glp-2.png',     href: 'glp-2.html' },
    'glp-2-30':     { name: 'GLP-2',                 mass: '30 MG per vial',  price: 160, img: 'vial-glp-2.png',     href: 'glp-2.html' },
    'glp-3':        { name: 'GLP-3',                 mass: '10 MG per vial',  price: 70,  img: 'vial-glp-3.png',     href: 'glp-3.html' },
    'glp-3-20':     { name: 'GLP-3',                 mass: '20 MG per vial',  price: 120, img: 'vial-glp-3.png',     href: 'glp-3.html' },
    'glp-3-30':     { name: 'GLP-3',                 mass: '30 MG per vial',  price: 160, img: 'vial-glp-3.png',     href: 'glp-3.html' },
    'ghk-cu':       { name: 'GHK-Cu',                mass: '50 mg per vial',  price: 35,  img: 'vial-ghk-cu.png',    href: 'ghk-cu.html' },
    'ghk-cu-100':   { name: 'GHK-Cu',                mass: '100 mg per vial', price: 50,  img: 'vial-ghk-cu.png',    href: 'ghk-cu.html' },
    'glow':         { name: 'Glow',                  mass: '70 mg per vial',  price: 125, img: 'vial-glow.png',      href: 'glow.html' },
    'klow':         { name: 'Klow',                  mass: '80 mg per vial',  price: 170, img: 'vial-klow.png',      href: 'klow.html' },
    'wolverine':    { name: 'Wolverine',             mass: '20 mg per vial',  price: 120, img: 'vial-wolverine.png', href: 'wolverine.html' },
    'bac-water':    { name: 'Bacteriostatic Water',  mass: '10 mL',           price: 20,  img: 'vial-bac-water.png', href: 'bacteriostatic-water.html' }
  };

  var CATALOG = {};
  for (var k in FALLBACK) CATALOG[k] = Object.assign({ live: false, wooId: null }, FALLBACK[k]);

  var catalogReady = null;

  /* [SERVER] Shipping rates are hardcoded. Woo owns real rates — these should
     come from the Store API cart endpoint once checkout is server-side. */
  var SHIPPING = [
    { id: 'standard',  label: 'Standard',  detail: '3–5 business days', price: 12 },
    { id: 'expedited', label: 'Expedited', detail: '2 business days',   price: 28 },
    { id: 'overnight', label: 'Overnight', detail: 'Next business day', price: 45 }
  ];

  /* [SERVER] Coupon codes must be validated by Woo, never client-side. */
  var DISCOUNTS = {
    COLLECTIVE10: { label: 'Collective member', rate: 0.10 },
    NICOLE15:     { label: 'Partner referral', rate: 0.15 },
    ELANA15:      { label: 'Partner referral', rate: 0.15 }
  };

  /* --------------------------------------------------------------------------
     Multi-vial pricing: two of any one vial 5% off, three 10%, ten 15%.
     Applies per line item. Bacteriostatic water is flat $20 and excluded.

     [SERVER] This is presentational only. Woo must enforce the same rule with a
     `woocommerce_before_calculate_totals` hook or a bulk-pricing plugin,
     otherwise a modified request pays the discounted price without the tier.
     -------------------------------------------------------------------------- */
  var TIERS = [{ qty: 10, rate: 0.15 }, { qty: 3, rate: 0.10 }, { qty: 2, rate: 0.05 }];

  function tierRate(id, qty) {
    if (id === 'bac-water') return 0;
    for (var i = 0; i < TIERS.length; i++) if (qty >= TIERS[i].qty) return TIERS[i].rate;
    return 0;
  }

  function nextTier(id, qty) {
    if (id === 'bac-water') return null;
    for (var i = TIERS.length - 1; i >= 0; i--) if (qty < TIERS[i].qty) return TIERS[i];
    return null;
  }

  /* ---------------------------- live catalogue ---------------------------- */

  function centsToDollars(priceStr, minorUnit) {
    var n = parseInt(priceStr, 10) || 0;
    return n / Math.pow(10, minorUnit || 2);
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  /* Woo variation attributes arrive as "Concentration: 20 MG, Pack Size: Single".
     Same parse as glp-3.html's loadSizes(), kept in step deliberately. */
  function parseVariation(str) {
    var attrs = {};
    (str || '').split(',').forEach(function (part) {
      var idx = part.indexOf(':');
      if (idx === -1) return;
      attrs[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
    });
    return attrs;
  }

  /* Attribute name -> value for one variation. Prefers the structured array the
     Store API returns (on the parent's `variations` entry, or on the variation
     itself); falls back to the old "Name: Value, Name: Value" string. */
  function attrsFrom(entry, detail) {
    var out = {};
    var list = (entry && entry.attributes) || (detail && detail.attributes) || null;
    if (list && list.length && list[0] && typeof list[0].value !== 'undefined') {
      list.forEach(function (a) { if (a && a.name) out[String(a.name).trim()] = String(a.value).trim(); });
      return out;
    }
    return parseVariation(detail && detail.variation);
  }

  /* Map a live variation back onto our slug scheme: 'glp-3' + 20 MG -> 'glp-3-20'.
     The base concentration keeps the bare slug, matching FALLBACK. */
  function slugFor(baseSlug, conc) {
    var mg = parseInt(conc, 10);
    if (!mg) return baseSlug;
    var siblings = Object.keys(FALLBACK).filter(function (s) {
      return s === baseSlug || s.indexOf(baseSlug + '-') === 0;
    });
    var lowest = Infinity;
    siblings.forEach(function (s) {
      var m = parseInt((FALLBACK[s].mass || '').replace(/[^0-9]/g, ''), 10);
      if (m && m < lowest) lowest = m;
    });
    return mg === lowest ? baseSlug : baseSlug + '-' + mg;
  }

  async function loadCatalog() {
    var slugs = Object.keys(WOO_PRODUCT_IDS).filter(function (s) { return WOO_PRODUCT_IDS[s]; });
    if (!slugs.length) return CATALOG;

    for (var i = 0; i < slugs.length; i++) {
      var baseSlug = slugs[i];
      var id = WOO_PRODUCT_IDS[baseSlug];
      try {
        var p = await fetchJson(STORE_API_URL + '/products/' + id);
        var parentImg = (p.images && p.images[0] && p.images[0].src) || '';
        var href = baseSlug + '.html';

        if (p.type === 'variable' && p.variations && p.variations.length) {
          /* The parent listing already carries each variation's attributes as a
             structured array ([{name, value}]) — use that rather than parsing a
             formatted string, which is not guaranteed to be present. We still
             fetch each variation for its own price and image. */
          var variations = await Promise.all(p.variations.map(function (entry) {
            return fetchJson(STORE_API_URL + '/products/' + entry.id)
              .then(function (detail) { return { entry: entry, detail: detail }; })
              .catch(function (e) {
                console.warn('AmbrosiaCart: skipping variation', entry.id, e);
                return null;
              });
          }));
          variations.filter(Boolean).forEach(function (row) {
            var v = row.detail;
            var attrs = attrsFrom(row.entry, v);
            var conc = attrs['Concentration'] || '';
            var pack = attrs['Pack Size'] || '';
            var isKit = /kit|10 vial/i.test(pack);
            /* Kits are retired from the catalogue — the ten-vial tier replaces
               them. Ignore any that still exist in Woo. */
            if (isKit) return;
            var slug = slugFor(baseSlug, conc);
            CATALOG[slug] = {
              name: p.name,
              mass: conc ? conc + ' per vial' : '',
              price: centsToDollars(v.prices.price, v.prices.currency_minor_unit),
              img: (v.images && v.images[0] && v.images[0].src) || parentImg || (FALLBACK[slug] && FALLBACK[slug].img),
              href: href,
              wooId: v.id,
              live: true
            };
          });
        } else {
          CATALOG[baseSlug] = {
            name: p.name,
            mass: (FALLBACK[baseSlug] && FALLBACK[baseSlug].mass) || '',
            price: centsToDollars(p.prices.price, p.prices.currency_minor_unit),
            img: parentImg || (FALLBACK[baseSlug] && FALLBACK[baseSlug].img),
            href: baseSlug + '.html',
            wooId: p.id,
            live: true
          };
        }
      } catch (e) {
        console.error('AmbrosiaCart: live fetch failed for ' + baseSlug + ' (' + (e && e.message ? e.message : e) + ') \u2014 using fallback prices. If this is a CORS error, allow the site origin on ' + STORE_API_URL);
      }
    }

    var pending = Object.keys(WOO_PRODUCT_IDS).filter(function (s) { return !WOO_PRODUCT_IDS[s]; });
    if (pending.length) {
      console.warn('AmbrosiaCart: still on hardcoded prices (no Woo product ID): ' + pending.join(', '));
    }
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: read() })); } catch (e) {}
    return CATALOG;
  }

  catalogReady = loadCatalog().catch(function (e) {
    console.error('AmbrosiaCart: catalogue load failed entirely', e);
    return CATALOG;
  });

  /* ------------------------------- cart ---------------------------------- */

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var v = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(v)) return [];
      return v.filter(function (l) { return l && CATALOG[l.id] && l.qty > 0; })
              .map(function (l) { return { id: l.id, qty: Math.min(99, Math.max(1, l.qty | 0)) }; });
    } catch (e) { return []; }
  }

  function write(next) {
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: next })); } catch (e) {}
    return next;
  }

  function add(id, qty) {
    id = String(id);
    if (!CATALOG[id]) { console.warn('AmbrosiaCart: unknown id', id); return read(); }
    var n = Math.max(1, qty | 0 || 1);
    var cur = read();
    var hit = false;
    for (var i = 0; i < cur.length; i++) {
      if (cur[i].id === id) { cur[i].qty = Math.min(99, cur[i].qty + n); hit = true; break; }
    }
    if (!hit) cur.push({ id: id, qty: Math.min(99, n) });
    return write(cur);
  }

  function setQty(id, qty) {
    id = String(id);
    var n = qty | 0;
    var cur = read().filter(function (l) { return l.id !== id || n > 0; });
    for (var i = 0; i < cur.length; i++) if (cur[i].id === id) cur[i].qty = Math.min(99, Math.max(1, n));
    return write(cur);
  }

  function remove(id) { id = String(id); return write(read().filter(function (l) { return l.id !== id; })); }
  function clear() { return write([]); }
  function count() { return read().reduce(function (a, l) { return a + l.qty; }, 0); }

  function lines() {
    return read().map(function (l) {
      var p = CATALOG[l.id];
      if (!p) return null;
      var rate = tierRate(l.id, l.qty);
      var gross = p.price * l.qty;
      var total = Math.round(gross * (1 - rate) * 100) / 100;
      return {
        id: l.id, qty: l.qty, name: p.name, mass: p.mass, price: p.price,
        img: p.img, href: p.href, wooId: p.wooId || null, live: !!p.live,
        rate: rate, gross: gross, saved: gross - total, total: total
      };
    }).filter(Boolean);
  }

  function subtotal() { return lines().reduce(function (a, l) { return a + l.total; }, 0); }
  function savings() { return lines().reduce(function (a, l) { return a + l.saved; }, 0); }

  /* [SERVER] Checkout payload. Woo needs numeric IDs; any line without a wooId
     cannot be submitted, which is the guard for the five unwired products. */
  function wooPayload() {
    return lines().map(function (l) {
      return { id: l.wooId, quantity: l.qty, slug: l.id, submittable: !!l.wooId };
    });
  }

  /* --------------------------------------------------------------------------
     Checkout handoff. The static site owns browsing and the cart; WooCommerce
     owns money. This pushes the local cart into Woo's real cart over the
     same-origin Store API, applies the discount code, then sends the customer
     to WordPress's own checkout. The address bar shows the WordPress host for
     the payment step; renaming that subdomain to checkout. or shop. makes it
     read properly.
     -------------------------------------------------------------------------- */
  async function storeNonce() {
    var r = await fetch(STORE_API_URL + '/cart', { credentials: 'include' });
    return r.headers.get('Nonce') || r.headers.get('X-WC-Store-API-Nonce') || '';
  }

  async function handoff(couponCode) {
    var payload = wooPayload();
    var blocked = payload.filter(function (l) { return !l.submittable; });
    if (blocked.length) {
      var err = new Error('Not yet available for online order: '
        + blocked.map(function (l) { return l.slug; }).join(', '));
      err.code = 'UNWIRED';
      throw err;
    }
    if (!payload.length) throw new Error('Your cart is empty.');

    var nonce = await storeNonce();
    var hdrs = { 'Content-Type': 'application/json' };
    if (nonce) hdrs.Nonce = nonce;

    /* Start from an empty Woo cart so a re-run cannot double the quantities. */
    await fetch(STORE_API_URL + '/cart/items', {
      method: 'DELETE', headers: hdrs, credentials: 'include'
    }).catch(function () {});

    for (var i = 0; i < payload.length; i++) {
      var line = payload[i];
      var res = await fetch(STORE_API_URL + '/cart/add-item', {
        method: 'POST', headers: hdrs, credentials: 'include',
        body: JSON.stringify({ id: line.id, quantity: line.quantity })
      });
      if (!res.ok) {
        var body = await res.text();
        throw new Error('Woo rejected ' + line.slug + ' (' + res.status + '): ' + body.slice(0, 200));
      }
    }

    if (couponCode) {
      await fetch(STORE_API_URL + '/cart/apply-coupon', {
        method: 'POST', headers: hdrs, credentials: 'include',
        body: JSON.stringify({ code: couponCode })
      }).catch(function (e) { console.warn('AmbrosiaCart: coupon not applied', e); });
    }

    window.location.href = WOO_ORIGIN + '/checkout';
  }

  function money(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function on(fn) {
    var h = function () { fn(); };
    window.addEventListener(EVT, h);
    window.addEventListener('storage', h);
    return function () { window.removeEventListener(EVT, h); window.removeEventListener('storage', h); };
  }

  window.AmbrosiaCart = {
    get CATALOG() { return CATALOG; },
    ready: catalogReady,
    STORE_API_URL: STORE_API_URL,
    WOO_PRODUCT_IDS: WOO_PRODUCT_IDS,
    SHIPPING: SHIPPING, DISCOUNTS: DISCOUNTS, TIERS: TIERS,
    tierRate: tierRate, nextTier: nextTier,
    read: read, write: write, add: add, setQty: setQty, remove: remove, clear: clear,
    count: count, lines: lines, subtotal: subtotal, savings: savings,
    wooPayload: wooPayload, handoff: handoff, money: money, on: on
  };
})();
