/* Ambrosia cart — shared, persisted across pages. Classic script, sets window.AmbrosiaCart. */
(function () {
  var KEY = 'ambrosia-cart-v1';
  var EVT = 'ambrosia-cart-change';

  var CATALOG = {
    'glp-1': { name: 'GLP-1', mass: '10 mg per vial', price: 70, img: 'assets/vial-glp-1.png', href: 'Ambrosia GLP-1.dc.html' },
    'glp-1-30': { name: 'GLP-1', mass: '30 mg per vial', price: 175, img: 'assets/vial-glp-1.png', href: 'Ambrosia GLP-1.dc.html' },
    'glp-1-50': { name: 'GLP-1', mass: '50 mg per vial', price: 250, img: 'assets/vial-glp-1.png', href: 'Ambrosia GLP-1.dc.html' },
    'glp-2': { name: 'GLP-2', mass: '10 mg per vial', price: 70, img: 'assets/vial-glp-2.png', href: 'Ambrosia GLP-2.dc.html' },
    'glp-2-30': { name: 'GLP-2', mass: '30 mg per vial', price: 175, img: 'assets/vial-glp-2.png', href: 'Ambrosia GLP-2.dc.html' },
    'glp-2-50': { name: 'GLP-2', mass: '50 mg per vial', price: 250, img: 'assets/vial-glp-2.png', href: 'Ambrosia GLP-2.dc.html' },
    'glp-3': { name: 'GLP-3', mass: '10 mg per vial', price: 70, img: 'assets/vial-glp-3.png', href: 'Ambrosia GLP-3.dc.html' },
    'glp-3-30': { name: 'GLP-3', mass: '30 mg per vial', price: 175, img: 'assets/vial-glp-3.png', href: 'Ambrosia GLP-3.dc.html' },
    'glp-3-50': { name: 'GLP-3', mass: '50 mg per vial', price: 250, img: 'assets/vial-glp-3.png', href: 'Ambrosia GLP-3.dc.html' },
    'mt-2':         { name: 'Melanotan 2',           mass: '10 mg per vial',  price: 45,  img: 'assets/vial-mt-2.png',         href: 'Ambrosia Melanotan 2.dc.html' },
    'ghk-cu':       { name: 'GHK-Cu',                mass: '50 mg per vial',  price: 35,  img: 'assets/vial-ghk-cu.png',       href: 'Ambrosia GHK-Cu.dc.html' },
    'ghk-cu-100': { name: 'GHK-Cu', mass: '100 mg per vial', price: 50, img: 'assets/vial-ghk-cu.png', href: 'Ambrosia GHK-Cu.dc.html' },
    'glow':         { name: 'Glow',                  mass: '70 mg per vial',  price: 125, img: 'assets/vial-glow.png',         href: 'Ambrosia Glow Blend.dc.html' },
    'bpc-157':      { name: 'BPC-157',               mass: '10 mg per vial',  price: 50,  img: 'assets/vial-bpc-157.png',      href: 'Ambrosia BPC-157.dc.html' },
    'semax':        { name: 'Semax',                 mass: '10 mg per vial',  price: 60,  img: 'assets/vial-semax.png',        href: 'Ambrosia Semax.dc.html' },
    'nad':          { name: 'NAD+',                  mass: '500 mg per vial', price: 120, img: 'assets/vial-nad.png',          href: 'Ambrosia NAD-.dc.html' },
    'tesamorelin':  { name: 'Tesamorelin',           mass: '10 mg per vial',  price: 95,  img: 'assets/vial-tesamorelin.png',  href: 'Ambrosia Tesamorelin.dc.html' },
    'glutathione':  { name: 'Glutathione',           mass: '500 mg per vial', price: 50,  img: 'assets/vial-glutathione.png',  href: 'Ambrosia Glutathione.dc.html' },
    'wolverine':    { name: 'Wolverine',             mass: '10 mg per vial',  price: 80,  img: 'assets/vial-wolverine.png',    href: 'Ambrosia Wolverine Blend.dc.html' },
    'bac-water':    { name: 'Bacteriostatic Water',  mass: '30 mL',           price: 25, img: 'assets/vial-bac-water.png',  href: 'Ambrosia Bacteriostatic Water.dc.html' }
  };

  var SHIPPING = [
    { id: 'standard',  label: 'Standard',  detail: '3–5 business days', price: 12 },
    { id: 'expedited', label: 'Expedited', detail: '2 business days',   price: 28 },
    { id: 'overnight', label: 'Overnight', detail: 'Next business day', price: 45 }
  ];

  var DISCOUNTS = { COLLECTIVE10: { label: 'Collective member', rate: 0.10 } };

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
    if (!CATALOG[id]) return read();
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
    var n = qty | 0;
    var cur = read().filter(function (l) { return l.id !== id || n > 0; });
    for (var i = 0; i < cur.length; i++) if (cur[i].id === id) cur[i].qty = Math.min(99, Math.max(1, n));
    return write(cur);
  }

  function remove(id) { return write(read().filter(function (l) { return l.id !== id; })); }
  function clear() { return write([]); }
  function count() { return read().reduce(function (a, l) { return a + l.qty; }, 0); }

  function lines() {
    return read().map(function (l) {
      var p = CATALOG[l.id];
      return {
        id: l.id, qty: l.qty, name: p.name, mass: p.mass, price: p.price,
        img: p.img, href: p.href, priceFlag: p.priceFlag || null, total: p.price * l.qty
      };
    });
  }

  function subtotal() { return lines().reduce(function (a, l) { return a + l.total; }, 0); }

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
    CATALOG: CATALOG, SHIPPING: SHIPPING, DISCOUNTS: DISCOUNTS,
    read: read, write: write, add: add, setQty: setQty, remove: remove, clear: clear,
    count: count, lines: lines, subtotal: subtotal, money: money, on: on
  };
})();
