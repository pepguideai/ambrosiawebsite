/* Ambrosia — Zelle order pricing. One function, used by the browser (display)
   and by /api/zelle/order (authority), so every screen and email matches the
   sheet to the cent. All arithmetic is in integer cents.

   Discount codes (config/discount-codes.json) do not stack with the Zelle
   saving. The customer receives the higher rate. Equal rates keep the Zelle
   saving. The code entered is still recorded on the quote. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZellePricing = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var cents = function (d) { return Math.round(Number(d || 0) * 100); };

  function taxRate(cfg, state, zip) {
    var s = cfg.tax && cfg.tax.states && cfg.tax.states[String(state || '').toUpperCase()];
    if (!s) return 0;
    var z = String(zip || '').slice(0, 5);
    if (s.zip && s.zip[z] != null) return Number(s.zip[z]);
    if (s.zip && s.zip[z.slice(0, 3)] != null) return Number(s.zip[z.slice(0, 3)]);
    return Number(s.default || 0);
  }

  /* Case-insensitive match against config/discount-codes.json.
     book omitted: the code is not checked (older callers).
     book provided: a non-empty code must match an active entry. */
  function lookupCode(typed, book) {
    if (!book || !Array.isArray(book.codes)) return { status: 'unchecked' };
    var raw = String(typed || '').trim();
    if (!raw) return { status: 'empty' };
    if (raw.length > 40 || !/^[A-Za-z0-9-]+$/.test(raw)) return { status: 'invalid' };
    var key = raw.toUpperCase();
    for (var i = 0; i < book.codes.length; i++) {
      var c = book.codes[i];
      if (!c || String(c.code || '').trim().toUpperCase() !== key) continue;
      var pct = Number(c.percent);
      if (c.active !== true || !(pct > 0 && pct <= 100)) return { status: 'invalid' };
      return { status: 'ok', code: String(c.code).trim(), percent: pct, label: c.label ? String(c.label) : String(c.code).trim() };
    }
    return { status: 'invalid' };
  }

  /* input: { lines:[{id,qty}], shipId, state, zip, code }
     codeBook: { codes:[{ code, percent, active, label }] } from discount-codes.json */
  function quote(input, cfg, codeBook) {
    var errors = [];
    var items = (input.lines || []).map(function (l) {
      var p = cfg.catalog[l.id];
      var qty = Math.min(99, Math.max(1, parseInt(l.qty, 10) || 0));
      if (!p) { errors.push('Unknown item: ' + l.id); return null; }
      var unit = cents(p.price);
      return { id: l.id, name: p.name, mass: p.mass, qty: qty, unit: unit, line: unit * qty };
    }).filter(Boolean);

    var subtotal = items.reduce(function (a, i) { return a + i.line; }, 0);
    var zelleRate = Number(cfg.discount.rate || 0);
    var found = lookupCode(input && input.code, codeBook);
    var codeError = found.status === 'invalid' ? 'That code is not recognised.' : '';
    var codeRate = found.status === 'ok' ? found.percent / 100 : 0;
    /* Better of the two. Do not multiply, and do not take 20% of the
       already-discounted subtotal. A tie stays with the Zelle saving. */
    var useCode = found.status === 'ok' && codeRate > zelleRate;
    var rate = useCode ? codeRate : zelleRate;
    var discount = Math.round(subtotal * rate);
    var net = subtotal - discount;
    var canonical = found.status === 'ok' ? found.code : '';
    var zPct = Math.round(zelleRate * 100);
    var cPct = Math.round(codeRate * 100);
    var codeNote = '';
    if (canonical && useCode) {
      codeNote = canonical + ' applied at ' + cPct + '%. It replaces the ' + zPct + '% Zelle saving. The two discounts do not stack; you receive the better one.';
    } else if (canonical) {
      codeNote = canonical + ' is recorded. It does not stack with the Zelle saving. You receive the better discount: ' + zPct + '% off.';
    }
    var label = useCode ? (found.label + ' (' + cPct + '%)') : cfg.discount.label;
    var discountCodeRecord = canonical ? (useCode ? canonical : ('ZELLE25; ' + canonical)) : 'ZELLE25';

    var opts = cfg.shipping.options;
    var ship = opts.filter(function (o) { return o.id === input.shipId; })[0] || opts[0];
    /* $200 threshold is measured on product value BEFORE the Zelle discount,
       matching the WooCommerce free-shipping snippet. */
    var free = ship.id === cfg.shipping.freeOptionId && subtotal >= cents(cfg.shipping.freeThreshold);
    var shipping = items.length ? (free ? 0 : cents(ship.price)) : 0;

    var r = taxRate(cfg, input.state, input.zip);
    var base = net + (cfg.tax.taxShipping ? shipping : 0);
    var mode = cfg.tax.mode === 'collect_by_state' ? 'collect_by_state' : 'absorb';
    var taxCharged = 0, taxEstimated = 0;
    if (mode === 'collect_by_state') { taxCharged = Math.round(base * r); taxEstimated = taxCharged; }
    else { taxEstimated = r ? Math.round(base * r / (1 + r)) : 0; }

    return {
      items: items, subtotal: subtotal, discountRate: rate, discountLabel: label,
      discount: discount, shipId: ship.id, shipLabel: ship.label, shipDetail: ship.detail, shipping: shipping,
      freeShipping: free, taxMode: mode, taxRate: r, taxCharged: taxCharged, taxEstimated: taxEstimated,
      total: net + shipping + taxCharged, errors: errors,
      stacking: 'better-of',
      discountSource: useCode ? 'code' : 'zelle',
      zelleDiscountRate: zelleRate,
      codeDiscountRate: found.status === 'ok' ? codeRate : 0,
      discountCode: canonical,
      discountCodeRecord: discountCodeRecord,
      codeNote: codeNote,
      codeError: codeError
    };
  }

  function money(c) {
    return '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return { quote: quote, money: money, taxRate: taxRate };
});
