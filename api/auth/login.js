const C = require('../_lib/customer');
const S = require('../_lib/session');
const { callSheet } = require('../_lib/sheet');
const { noStore, body, sameOrigin, ip } = require('../_lib/http');

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

  const b = body(req);
  const email = C.normEmail(b.email);
  const password = String(b.password || '');
  if (!C.validEmail(email) || !password) return res.status(400).json({ error: 'Enter your email and password.' });

  const keys = ['ip:' + ip(req), 'em:' + email];
  if (S.limited(keys)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });

  let hash = null;
  try {
    C.secret();
    const d = await callSheet('accountGet', { email });
    hash = d.account && d.account.hash;
  } catch (e) {
    if (e.code !== 'NOT_FOUND') {
      console.error('[auth/login]', e.message);
      return res.status(502).json({ error: 'Sign-in is unavailable right now. Try again in a minute.' });
    }
  }
  if (!C.checkPassword(password, hash)) {
    S.recordFail(keys);
    return res.status(401).json({ error: 'Email or password not recognised.' });
  }
  S.clearFails(keys);
  C.setCookie(res, email);
  res.status(200).json({ ok: true });
};
