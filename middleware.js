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

/* Research-entry cookie. Set beside the existing localStorage acknowledgement.
   HTML pages are not served until it is present, so a deep link cannot skip
   the gate. API, asset, config, and WordPress proxy paths are not checked. */
const ENTRY_COOKIE = 'ambrosia-entry-ack';
const ENTRY_EXEMPT = new Set([
  '/enter', '/enter.html',
  '/research-use-policy', '/research-use-policy.html',
  '/terms-of-sale', '/terms-of-sale.html',
  '/privacy-policy', '/privacy-policy.html'
]);
function isUngatedPath(path) {
  if (ENTRY_EXEMPT.has(path)) return true;
  if (path.startsWith('/api/') || path.startsWith('/wp-json/') || path.startsWith('/wp-admin/') || path.startsWith('/wp-content/') || path.startsWith('/wp-includes/') || path.startsWith('/config/') || path.startsWith('/fonts/') || path.startsWith('/coa/')) return true;
  return /\.(js|mjs|css|png|jpe?g|webp|gif|svg|ttf|woff2?|pdf|ico|json|map|txt|xml|php)$/i.test(path);
}
function entryAcked(request) {
  return cookie(request, ENTRY_COOKIE) === 'yes';
}
function safeEntryNext(path, search) {
  const next = path + (search || '');
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith('/enter')) return '/';
  return next;
}

/* Single-segment paths that are real pages. Anything else (/Nicole) is an
   affiliate vanity URL and is rewritten to the offer screen. Old nickname
   slugs stay reserved so they are not captured if a redirect is skipped. */
const RESERVED = new Set([
  'index', 'cart', 'checkout', 'offer', 'order', 'login', 'enter', 'standard', 'faq', 'contact',
  'terms-of-sale', 'privacy-policy', 'shipping-restrictions', 'returns-documentation',
  'research-use-policy', 'affiliate-agreement', 'affiliate', 'affiliate-portal',
  'admin-checkout', 'admin-affiliates',
  'ghk-cu', 'ghk-cu-bpc-157-tb-500', 'ghk-cu-bpc-157-tb-500-kpv', 'bpc-157-tb-500',
  'glp-2', 'glp-3',
  'glow', 'klow', 'wolverine', 'bacteriostatic-water',
  'my-account', 'order-received'
]);
function vanityRewrite(url, path) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 1) return null;
  let slug = parts[0];
  try { slug = decodeURIComponent(slug); } catch (e) {}
  slug = slug.replace(/\/+$/, '').trim().toLowerCase();
  if (!slug || slug.includes('.') || RESERVED.has(slug)) return null;
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/offer' + url.search, url).toString(), 'Cache-Control': 'no-store' } });
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

  if ((request.method === 'GET' || request.method === 'HEAD') && !isUngatedPath(path) && !entryAcked(request)) {
    const dest = new URL('/enter', url);
    dest.searchParams.set('next', safeEntryNext(path, url.search));
    return redirect(dest.toString());
  }

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
  const vanity = vanityRewrite(url, path);
  if (vanity) return vanity;
  return new Response(null, { headers: NEXT });
}
