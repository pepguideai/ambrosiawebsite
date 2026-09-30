const S = require('../_lib/session');
const { noStore, sameOrigin } = require('../_lib/http');

module.exports = async (req, res) => {
  noStore(res);
  if (req.method !== 'POST' || !sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
  S.clearSession(res);
  res.status(200).json({ ok: true });
};
