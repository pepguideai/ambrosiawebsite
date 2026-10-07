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
  const name = String(b.name || '').trim();
  const email = C.normEmail(b.email);
  const password = String(b.password || '');
  if (!name || name.length > 80) return res.status(400).json({ error: 'Enter your name.' });
  if (!C.validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 10 || password.length > 200) return res.status(400).json({ error: 'Use a password of at least 10 characters.' });

  const keys = ['reg:' + ip(req)];
  if (S.limited(keys)) return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  S.recordFail(keys);

  /* Signup is free and instant, so a Sheet problem must not lock people out:
     record the account if we can, let them in regardless. */
  try {
    await callSheet('accountCreate', { email, name, hash: C.hashPassword(password) });
  } catch (e) {
    if (e.code === 'EXISTS') return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    console.error('[auth/register] account not saved (ref ' + reason(e) + '):', e.message, '| ' + email + ' | ' + name);
  }
  try { C.setCookie(res, email); }
  catch (e) {
    console.error('[auth/register]', e.message);
    return res.status(502).json({ error: 'Accounts are unavailable right now. Try again in a minute. (ref S1)' });
  }
  res.status(200).json({ ok: true });
};
