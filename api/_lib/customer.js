const crypto = require('crypto');

/* Customer sign-in. The cookie is verified by middleware.js on every request
   and by the WordPress snippet woo-login-gate.php, so the format must match:
   amb_session = base64url(JSON {e, exp}) + "." + base64url(HMAC-SHA256(body, SESSION_SECRET)) */
const COOKIE = 'amb_session';
const TTL = 30 * 24 * 60 * 60;
const ITER = 210000;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET is missing or shorter than 32 characters');
  return s;
}
const b64 = v => Buffer.from(v).toString('base64url');

function setCookie(res, email) {
  const body = b64(JSON.stringify({ e: email, exp: Math.floor(Date.now() / 1000) + TTL }));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  res.setHeader('Set-Cookie', `${COOKIE}=${body}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.pbkdf2Sync(String(pw), salt, ITER, 32, 'sha256');
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(h)}`;
}
const DUMMY = `pbkdf2$${ITER}$${b64(Buffer.alloc(16))}$${b64(Buffer.alloc(32))}`;
function checkPassword(pw, rec) {
  const parts = String(rec || DUMMY).split('$');
  if (parts[0] !== 'pbkdf2' || parts.length !== 4) return false;
  const want = Buffer.from(parts[3], 'base64url');
  const got = crypto.pbkdf2Sync(String(pw || ''), Buffer.from(parts[2], 'base64url'), parseInt(parts[1], 10), want.length, 'sha256');
  return want.length === got.length && crypto.timingSafeEqual(want, got) && !!rec;
}

const normEmail = e => String(e || '').trim().toLowerCase();
const validEmail = e => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

module.exports = { secret, setCookie, clearCookie, hashPassword, checkPassword, normEmail, validEmail };
