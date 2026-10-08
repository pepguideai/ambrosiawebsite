const cfg = require('../../config/zelle.config.json');
const Pricing = require('../../zelle-pricing.js');
const { readMode } = require('../_lib/mode');
const { callSheet } = require('../_lib/sheet');
const { noStore, body, sameOrigin } = require('../_lib/http');

const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const iso = v => { const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };

function validate(b) {
  const c = b.customer || {};
  const out = {
    email: str(c.email, 200).toLowerCase(), phone: str(c.phone, 40), name: str(c.name, 120),
    street: str(c.street, 200), apt: str(c.apt, 80), city: str(c.city, 80),
    state: str(c.state, 2).toUpperCase(), zip: str(c.zip, 10)
  };
  const errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) errors.email = 'Enter a valid email address.';
  if (out.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a phone number with area code.';
  if (out.name.length < 2) errors.name = 'Enter your full name.';
  if (out.street.length < 3) errors.street = 'Enter a street address.';
  if (out.city.length < 2) errors.city = 'Enter a city.';
  if (!STATES.includes(out.state)) errors.state = 'Choose a state.';
  if (!/^\d{5}(-\d{4})?$/.test(out.zip)) errors.zip = 'Enter a 5-digit ZIP.';
  const a = b.attest || {};
  const ageAt = a.age === true ? iso(a.ageAt) : null;
  const termsAt = a.terms === true ? iso(a.termsAt) : null;
  if (!ageAt) errors.age = 'Please confirm you are 21 or older.';
  if (!termsAt) errors.terms = 'Please confirm research use only and agree to the Terms of Service.';
  const purpose = PURPOSES.includes(a.purpose) ? a.purpose : '';
  if (!purpose) errors.purpose = 'Please select your research purpose.';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(String(b.idempotencyKey || ''))) errors.form = 'Please reload the page and try again.';
  return { customer: out, ageAt, termsAt, purpose, notes: str(b.notes, 1000), errors };
}
const PURPOSES = ['Independent researcher', 'MD', 'Research foundation', 'Research institute', 'Analytical laboratory'];


module.exports = async (req, res) => {
  noStore(res);
  try {
    /* Restore: works in either mode so a customer mid-flow can always finish. */
    if (req.method === 'GET') {
      const n = str(req.query.n, 12).toUpperCase(), t = str(req.query.t, 64);
      if (!/^AMB-[A-Z0-9]{6}$/.test(n) || !t) return res.status(400).json({ error: 'Bad reference' });
      const d = await callSheet('get', { orderNumber: n, token: t });
      return res.status(200).json({ ok: true, order: d.order });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

    if ((await readMode()) !== 'zelle') {
      return res.status(409).json({ code: 'MODE_OFF', error: 'Checkout has been updated. Please return to your cart.' });
    }

    const b = body(req);
    const v = validate(b);
    const lines = Array.isArray(b.lines) ? b.lines.slice(0, 50) : [];
    if (!lines.length) v.errors.form = 'Your cart is empty.';
    if (Object.keys(v.errors).length) return res.status(400).json({ code: 'INVALID', errors: v.errors });

    if (lines.some(l => l && l.id === 'bac-water')) {
      return res.status(400).json({ code: 'INVALID', errors: { form: 'An item in your cart is no longer sold. Remove it to continue.' } });
    }
    const q = Pricing.quote({ lines, shipId: b.shipId, state: v.customer.state, zip: v.customer.zip }, cfg);
    if (q.errors.length || !q.items.length) return res.status(400).json({ code: 'INVALID', errors: { form: 'One of the items in your cart is no longer available.' } });

    const d = await callSheet('create', {
      idempotencyKey: b.idempotencyKey,
      order: {
        customer: v.customer, notes: v.notes, quote: q,
        attest: { ageAt: v.ageAt, termsAt: v.termsAt, purpose: v.purpose, receivedAt: new Date().toISOString() }
      },
      zelle: cfg.zelle, support: cfg.support
    });
    res.status(200).json({ ok: true, order: d.order, existing: !!d.existing });
  } catch (e) {
    console.error('[zelle/order]', e.code || '', e.message);
    const nf = e.code === 'NOT_FOUND';
    res.status(nf ? 404 : 502).json({ code: nf ? 'NOT_FOUND' : 'WRITE_FAILED', error: nf ? 'Order not found.' : 'We could not place your order just now. Your cart is saved. Please try again in a moment.' });
  }
};
