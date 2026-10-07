/* Login gate + checkout switch. Runs before every request on the site.

   1. Nothing is served without a valid sign-in cookie (amb_session) except the
      sign-in page, its assets, the auth API and the admin pages (which have
      their own password). Pages redirect
      to /login?next=…; API calls get 401. Direct links are gated the same way.
   2. /checkout goes to WooCommerce unless live-checkout.json says "zelle".
      To switch: edit live-checkout.json on GitHub. Vercel redeploys in ~1 minute.

   SESSION_SECRET (Vercel env) signs the cookie. If it is missing the gate stays
   shut for everyone, which is the safe failure. */
export const config = { matcher: ['/', '/:path*'] };

const PUBLIC_PATHS = new Set([
  '/login', '/login.dc', '/login.dc.html',
  '/support.js', '/ambrosia.css', '/live-checkout.json', '/favicon.ico', '/robots.txt',
  '/admin-checkout', '/admin-checkout.dc', '/admin-checkout.dc.html',
  '/admin-affiliates', '/admin-affiliates.dc', '/admin-affiliates.dc.html'
]);
/* Admin pages and /api/admin have their own password. */
const PUBLIC_PREFIXES = ['/api/auth/', '/api/admin/', '/fonts/'];

const enc = new TextEncoder();
function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function cookie(request, name) {
  const all = request.headers.get('cookie') || '';
  for (const part of all.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}
async function signedIn(request) {
  const secret = process.env.SESSION_SECRET || process.env.APPS_SCRIPT_SECRET;
  if (!secret || secret.length < 16) { console.error('[gate] SESSION_SECRET missing or too short; everyone is signed out'); return false; }
  const tok = cookie(request, 'amb_session');
  const dot = tok.lastIndexOf('.');
  if (dot < 1) return false;
  const body = tok.slice(0, dot), sig = tok.slice(dot + 1);
  try {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    if (!(await crypto.subtle.verify('HMAC', key, unb64url(sig), enc.encode(body)))) return false;
    const p = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return !!p && typeof p.exp === 'number' && p.exp > Math.floor(Date.now() / 1000);
  } catch (e) { return false; }
}
function isPublic(path) {
  return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some(p => path.startsWith(p));
}
function safeNext(v) {
  return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') && !v.startsWith('/login') ? v : '/';
}
const NEXT = { 'x-middleware-next': '1' };
const redirect = to => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });

/* Zelle mode turns the login gate off. Read from live-checkout.json, cached
   for 30 s per edge instance so pages and assets don't each refetch it. */
let modeCache = { v: null, at: 0 };
async function zelleMode(url) {
  if (modeCache.v !== null && Date.now() - modeCache.at < 30000) return modeCache.v;
  let z = false;
  try {
    const r = await fetch(new URL('/live-checkout.json', url), { cache: 'no-store' });
    if (r.ok) { const v = await r.json(); z = !!v && String(v.mode).trim().toLowerCase() === 'zelle'; }
  } catch (e) {}
  modeCache = { v: z, at: Date.now() };
  return z;
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  let authed = await signedIn(request);
  if (!authed && await zelleMode(url)) authed = true;

  if (path === '/login' || path.startsWith('/login.dc')) {
    if (authed) return redirect(new URL(safeNext(url.searchParams.get('next')), url).toString());
    return new Response(null, { headers: NEXT });
  }
  if (!authed && !isPublic(path)) {
    if (path.startsWith('/api/') || path.startsWith('/wp-json/') || request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Sign in required.' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }
    const login = new URL('/login', url);
    const next = path + url.search;
    if (next !== '/') login.searchParams.set('next', next);
    return redirect(login.toString());
  }

  if (path === '/bacteriostatic-water' || path === '/bacteriostatic-water.html') {
    try {
      const r = await fetch(new URL('/live-checkout.json', url), { cache: 'no-store' });
      if (r.ok) { const v = await r.json(); if (v && v.bacWater === false && String(v.mode).trim().toLowerCase() !== 'zelle') return redirect(new URL('/#catalogue', url).toString()); }
    } catch (e) {}
  }

  if (path === '/checkout') {
    let zelle = url.searchParams.has('order');
    if (!zelle) {
      try {
        const r = await fetch(new URL('/live-checkout.json', url), { cache: 'no-store' });
        if (r.ok) { const v = await r.json(); zelle = !!v && String(v.mode).trim().toLowerCase() === 'zelle'; }
      } catch (e) {
        console.error('[middleware] live-checkout.json read failed, using WooCommerce:', e && e.message);
      }
    }
    if (zelle) {
      return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/order.dc' + url.search, url).toString() } });
    }
  }
  return new Response(null, { headers: NEXT });
}
