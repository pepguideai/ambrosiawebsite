const crypto = require('crypto');

const COOKIE = 'amb_admin';
const TTL = 12 * 60 * 60;

function secret() {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_SESSION_SECRET is missing or shorter than 32 characters');
  return s;
}
const hmac = body => crypto.createHmac('sha256', secret()).update(body).digest('base64url');

function cookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function getSession(req) {
  const tok = cookies(req)[COOKIE];
  if (!tok || tok.indexOf('.') < 0) return null;
  const [body, sig] = tok.split('.');
  const want = Buffer.from(hmac(body));
  const got = Buffer.from(sig || '');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch (e) { return null; }
}

function setSession(res, user) {
  const body = Buffer.from(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + TTL })).toString('base64url');
  res.setHeader('Set-Cookie', `${COOKIE}=${body}.${hmac(body)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

/* One shared password.
   ADMIN_PASSWORD_HASH = pbkdf2$<iterations>$<salt>$<hash>
   Generate with: node scripts/hash-password.js "the password"
   The name picked at sign-in (Philip / Brittney) is recorded in the change
   log; it is not a separate credential. */
const NAMES = ['philip', 'brittney'];
function displayName(u) { return u ? u.charAt(0).toUpperCase() + u.slice(1) : ''; }

function checkPassword(password) {
  const rec = String(process.env.ADMIN_PASSWORD_HASH || '');
  const parts = rec.split('$');
  if (parts[0] !== 'pbkdf2' || parts.length !== 4) { console.error('[admin] ADMIN_PASSWORD_HASH missing or malformed'); return false; }
  const iter = parseInt(parts[1], 10);
  const salt = Buffer.from(parts[2], 'base64url');
  const want = Buffer.from(parts[3], 'base64url');
  const got = crypto.pbkdf2Sync(String(password || ''), salt, iter, want.length, 'sha256');
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

/* Per-instance limiter: 5 failures per 15 minutes per IP and per user name.
   Pair it with a Vercel Firewall rate-limit rule on /api/admin/login for a
   limit that holds across every instance (see ZELLE-SETUP.md). */
const fails = new Map();
const WINDOW = 15 * 60 * 1000, MAX = 5;
function limited(keys) {
  const now = Date.now();
  return keys.some(k => { const f = fails.get(k); return f && f.reset > now && f.n >= MAX; });
}
function recordFail(keys) {
  const now = Date.now();
  keys.forEach(k => {
    const f = fails.get(k);
    if (!f || f.reset < now) fails.set(k, { n: 1, reset: now + WINDOW });
    else f.n++;
  });
}
function clearFails(keys) { keys.forEach(k => fails.delete(k)); }

module.exports = { getSession, setSession, clearSession, checkPassword, displayName, NAMES, limited, recordFail, clearFails };
