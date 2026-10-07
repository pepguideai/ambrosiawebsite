const C = require('../_lib/customer');
const S = require('../_lib/session');
const { callSheet } = require('../_lib/sheet');
const { noStore, body, sameOrigin, ip } = require('../_lib/http');

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

  const b = body(req);
  const name = String(b.name || '').trim();
  const email = C.normEmail(b.email);
  const password = String(b.password || '');
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter your name.' });
  if (!C.validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 200) return res.status(400).json({ error: 'Use a password of at least 10 characters.' });

  const keys = ['reg:' + ip(req)];
  if (S.limited(keys)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  S.recordFail(keys);

  try {
    C.secret();
    await callSheet('accountCreate', { email, name, hash: C.hashPassword(password) });
  } catch (e) {
    if (e.code === 'EXISTS') return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    console.error('[auth/register]', e.message);
    return res.status(502).json({ error: 'Accounts are unavailable right now. Try again in a minute.' });
  }
  C.setCookie(res, email);
  res.status(200).json({ ok: true });
};
