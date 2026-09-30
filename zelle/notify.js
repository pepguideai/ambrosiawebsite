const cfg = require('../../config/zelle.config.json');
const { callSheet } = require('../_lib/sheet');
const { noStore, body, sameOrigin } = require('../_lib/http');

/* POST { n, t, action: "sent" | "email" }
   sent  -> records when the customer tapped "I've sent my payment"
   email -> re-sends the payment instructions (throttled in the script) */
module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST' || !sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  const { n, t, action } = body(req);
  const orderNumber = String(n || '').toUpperCase().slice(0, 12);
  if (!/^AMB-[A-Z0-9]{6}$/.test(orderNumber) || !t) return res.status(400).json({ error: 'Bad reference' });
  if (action !== 'sent' && action !== 'email') return res.status(400).json({ error: 'Unknown action' });
  try {
    const d = await callSheet(action === 'sent' ? 'markSent' : 'resend', { orderNumber, token: String(t).slice(0, 64), zelle: cfg.zelle, support: cfg.support });
    res.status(200).json({ ok: true, throttled: !!d.throttled });
  } catch (e) {
    console.error('[zelle/notify]', e.message);
    res.status(502).json({ error: 'That did not go through. Please try again.' });
  }
};
