/* Checkout mode. The live switch is live-checkout.json (readMode).
   The Edge Config helpers below are unused, kept for reference.
   Read:  EDGE_CONFIG connection string (added automatically when the store is
          connected to the project).
   Write: Vercel REST API with VERCEL_API_TOKEN (Edge Config is read-only from
          the connection string). */
const KEY = 'checkoutMode';
const LOG = 'checkoutModeLog';
const MODES = ['woocommerce', 'zelle'];

function conn() {
  const s = process.env.EDGE_CONFIG;
  if (!s) throw new Error('EDGE_CONFIG is not set');
  const u = new URL(s);
  return { id: process.env.EDGE_CONFIG_ID || u.pathname.replace(/^\//, ''), token: u.searchParams.get('token') };
}

async function readItem(key) {
  const c = conn();
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1500);
  try {
    const r = await fetch(`https://edge-config.vercel.com/${c.id}/item/${key}?token=${c.token}`, { signal: ctl.signal, cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('Edge Config read ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* Reads live-checkout.json at the site root (edit it on GitHub to switch).
   Anything but "zelle" means WooCommerce. */
async function readMode() {
  try {
    const v = require('../../live-checkout.json');
    return v && String(v.mode).trim().toLowerCase() === 'zelle' ? 'zelle' : 'woocommerce';
  } catch (e) {
    console.error('[checkout-mode] read failed, defaulting to woocommerce:', e && e.message);
    return 'woocommerce';
  }
}

/* Bacteriostatic water. Always on in Zelle mode; in WooCommerce mode it
   follows bacWater in the same file (only an explicit false hides it). */
async function readBacWater() {
  try {
    const v = require('../../live-checkout.json');
    if (v && String(v.mode).trim().toLowerCase() === 'zelle') return true;
    return !(v && v.bacWater === false);
  } catch (e) { return true; }
}

/* The admin page shows the same mode the site uses: live-checkout.json. */
async function readStatus() {
  return { current: { mode: await readMode(), by: null, at: null }, log: [] };
}

/* Switching happens by editing live-checkout.json on GitHub, not from here. */
async function writeMode(mode, by) {
  const e = new Error('To switch, edit live-checkout.json on GitHub. The site updates in about a minute.');
  e.code = 'USE_GITHUB';
  throw e;
}

async function writeModeEdgeConfig(mode, by) {
  if (!MODES.includes(mode)) throw new Error('Unknown mode');
  if (!process.env.VERCEL_API_TOKEN) throw new Error('VERCEL_API_TOKEN is not set');
  const status = await readStatus();
  const at = new Date().toISOString();
  const log = [{ mode, from: status.current.mode, by, at }, ...status.log].slice(0, 20);
  const q = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const r = await fetch(`https://api.vercel.com/v1/edge-config/${conn().id}/items${q}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [
      { operation: 'upsert', key: KEY, value: { mode, by, at } },
      { operation: 'upsert', key: LOG, value: log }
    ] })
  });
  if (!r.ok) throw new Error('Edge Config write ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return { current: { mode, by, at }, log };
}

module.exports = { readMode, readBacWater, readStatus, writeMode, MODES };
