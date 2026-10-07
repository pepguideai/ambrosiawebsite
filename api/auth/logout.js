const C = require('../_lib/customer');
const { noStore } = require('../_lib/http');

/* GET /api/auth/logout (a plain link works) or POST. */
module.exports = async (req, res) => {
  noStore(res);
  C.clearCookie(res);
  if (req.method === 'GET') { res.statusCode = 302; res.setHeader('Location', '/login'); return res.end(); }
  res.status(200).json({ ok: true });
};
