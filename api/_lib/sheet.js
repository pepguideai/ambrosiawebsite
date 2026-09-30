/* Google Apps Script web app: the order sheet and both emails live there.
   APPS_SCRIPT_URL    the /exec URL of the deployed web app
   APPS_SCRIPT_SECRET shared secret, also saved as the script property SECRET */
async function callSheet(action, payload) {
  const url = process.env.APPS_SCRIPT_URL;
  if (!url || !process.env.APPS_SCRIPT_SECRET) throw new Error('APPS_SCRIPT_URL / APPS_SCRIPT_SECRET not set');
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secret: process.env.APPS_SCRIPT_SECRET, action, ...payload })
    });
    const text = await r.text();
    let d;
    try { d = JSON.parse(text); } catch (e) { throw new Error('Sheet returned non-JSON (HTTP ' + r.status + ')'); }
    if (!d.ok) { const e = new Error(d.error || 'Sheet error'); e.code = d.code; throw e; }
    return d;
  } finally { clearTimeout(t); }
}

module.exports = { callSheet };
