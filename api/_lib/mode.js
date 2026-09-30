/* Checkout mode, stored in Vercel Edge Config.
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

/* Fail-safe: anything but a clean read of "zelle" means WooCommerce. */
async function readMode() {
  try {
    const v = await readItem(KEY);
    return v && v.mode === 'zelle' ? 'zelle' : 'woocommerce';
  } catch (e) {
    console.error('[checkout-mode] read failed, defaulting to woocommerce:', e && e.message);
    return 'woocommerce';
  }
}

async function readStatus() {
  const [cur, log] = await Promise.all([readItem(KEY), readItem(LOG)]);
  return {
    current: cur && MODES.includes(cur.mode) ? cur : { mode: 'woocommerce', by: null, at: null },
    log: Array.isArray(log) ? log : []
  };
}

async function writeMode(mode, by) {
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

module.exports = { readMode, readStatus, writeMode, MODES };
