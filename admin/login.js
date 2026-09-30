const S = require('../_lib/session');
const { noStore, body, sameOrigin, ip } = require('../_lib/http');

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

  const { user, password } = body(req);
  const u = S.NAMES.includes(String(user || '').toLowerCase()) ? String(user).toLowerCase() : 'admin';
  const keys = ['ip:' + ip(req)];
  if (S.limited(keys)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });

  let ok = false;
  try { ok = S.checkPassword(password); } catch (e) { console.error('[admin/login]', e.message); }
  await new Promise(r => setTimeout(r, 400));
  if (!ok) {
    S.recordFail(keys);
    return res.status(401).json({ error: 'Password not recognised.' });
  }
  S.clearFails(keys);
  S.setSession(res, u);
  res.status(200).json({ ok: true, user: S.displayName(u) });
};
