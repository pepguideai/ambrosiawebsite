const S = require('../_lib/session');
const M = require('../_lib/mode');
const { noStore, body, sameOrigin } = require('../_lib/http');

/* GET  -> current mode, who/when, last 20 changes
   POST { mode: "woocommerce" | "zelle" } -> flip */
module.exports = async (req, res) => {
  noStore(res);
  const s = S.getSession(req);
  if (!s) return res.status(401).json({ error: 'Signed out' });
  const user = S.displayName(s.u);

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ user, ...(await M.readStatus()) });
    }
    if (req.method === 'POST') {
      if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden' });
      const { mode } = body(req);
      if (!M.MODES.includes(mode)) return res.status(400).json({ error: 'Unknown mode' });
      return res.status(200).json({ user, ...(await M.writeMode(mode, user)) });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    if (e.code === 'USE_GITHUB') return res.status(409).json({ error: e.message });
    console.error('[admin/mode]', e.message);
    res.status(502).json({ error: 'The mode store could not be reached. Nothing was changed.' });
  }
};
