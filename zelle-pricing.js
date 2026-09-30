/* Ambrosia — Zelle order pricing. One function, used by the browser (display)
   and by /api/zelle/order (authority), so every screen and email matches the
   sheet to the cent. All arithmetic is in integer cents. */
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

  /* input: { lines:[{id,qty}], shipId, state, zip } */
  function quote(input, cfg) {
    var errors = [];
    var items = (input.lines || []).map(function (l) {
      var p = cfg.catalog[l.id];
      var qty = Math.min(99, Math.max(1, parseInt(l.qty, 10) || 0));
      if (!p) { errors.push('Unknown item: ' + l.id); return null; }
      var unit = cents(p.price);
      return { id: l.id, name: p.name, mass: p.mass, qty: qty, unit: unit, line: unit * qty };
    }).filter(Boolean);

    var subtotal = items.reduce(function (a, i) { return a + i.line; }, 0);
    var rate = Number(cfg.discount.rate || 0);
    var discount = Math.round(subtotal * rate);
    var net = subtotal - discount;

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
      items: items, subtotal: subtotal, discountRate: rate, discountLabel: cfg.discount.label,
      discount: discount, shipId: ship.id, shipLabel: ship.label, shipDetail: ship.detail, shipping: shipping,
      freeShipping: free, taxMode: mode, taxRate: r, taxCharged: taxCharged, taxEstimated: taxEstimated,
      total: net + shipping + taxCharged, errors: errors
    };
  }

  function money(c) {
    return '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return { quote: quote, money: money, taxRate: taxRate };
});
