const C = require('../_lib/customer');
const S = require('../_lib/session');
const { callSheet } = require('../_lib/sheet');
const { noStore, body, sameOrigin, ip } = require('../_lib/http');


/* Short public code so a failed sign-in/sign-up says which setup step is missing. */
function reason(e) {
  const m = String((e && e.message) || '');
  if (/SESSION_SECRET/.test(m)) return 'S1';          // SESSION_SECRET missing in Vercel (or no redeploy since)
  if (e && e.code === 'BAD_ACTION') return 'S2';       // Apps Script still on the old Code.gs
  if (/APPS_SCRIPT_URL/.test(m)) return 'S3';         // APPS_SCRIPT_URL / APPS_SCRIPT_SECRET missing in Vercel
  if (e && e.code === 'FORBIDDEN') return 'S4';        // APPS_SCRIPT_SECRET doesn't match the script property SECRET
  if (/non-JSON/.test(m)) return 'S5';                // Apps Script URL wrong or deployment not public
  if (/abort/i.test(m)) return 'S6';                  // Apps Script timed out
  return 'S0';
}

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

  let hash = null, sheetDown = false;
  try {
    const d = await callSheet('accountGet', { email });
    hash = d.account && d.account.hash;
  } catch (e) {
    if (e.code !== 'NOT_FOUND') { sheetDown = true; console.error('[auth/login] sheet unavailable (ref ' + reason(e) + '):', e.message); }
  }
  /* Sheet unreachable: password can't be checked, so let them in rather than
     lock everyone out of a free signup gate. */
  if (sheetDown) {
    try { C.setCookie(res, email); } catch (e) { return res.status(502).json({ error: 'Sign-in is unavailable right now. Try again in a minute. (ref S1)' }); }
    return res.status(200).json({ ok: true });
  }
  if (!C.checkPassword(password, hash)) {
    S.recordFail(keys);
    return res.status(401).json({ error: 'Email or password not recognised.' });
  }
  S.clearFails(keys);
  C.setCookie(res, email);
  res.status(200).json({ ok: true });
};
