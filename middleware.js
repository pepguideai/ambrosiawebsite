/* /checkout goes to WooCommerce unless live-checkout.json says "zelle".
   To switch: edit live-checkout.json on GitHub. Vercel redeploys in ~1 minute.

   createyouroffer.net serves the offer screen. /Nicole (any case) serves that
   same screen; affiliate-vanity.js records the AffiliateWP click. Affiliates
   live in config/affiliates.json. */
export const config = {
  matcher: [
    '/checkout',
    '/',
    '/((?!api/|fonts/|coa/|config/|wp-admin|wp-content|wp-includes|wp-json|.*\\.).*)'
  ]
};

const OFFER_HOSTS = new Set(['createyouroffer.net', 'www.createyouroffer.net']);

/* Top-level pages and routes that must never be captured by a vanity slug. */
const RESERVED = new Set([
  'index', 'offer', 'cart', 'faq', 'contact', 'standard',
  'glp-2', 'glp-3', 'ghk-cu', 'glow', 'klow', 'wolverine',
  'terms-of-sale', 'privacy-policy', 'research-use-policy',
  'shipping-restrictions', 'returns-documentation', 'affiliate-agreement',
  'affiliate', 'affiliate-portal', 'checkout', 'order', 'admin-checkout',
  'my-account', 'login', 'logout', 'api', 'config', 'fonts', 'coa',
  'order-received'
]);

let affiliateCache;

function next() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}

function rewrite(url, pathname) {
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL(pathname + url.search, url).toString() }
  });
}

function isOfferHost(hostname) {
  return OFFER_HOSTS.has(String(hostname || '').toLowerCase());
}

function vanitySlug(pathname) {
  const parts = String(pathname || '').split('/').filter(Boolean);
  if (parts.length !== 1) return '';
  let slug = parts[0];
  try { slug = decodeURIComponent(slug); } catch (e) { /* keep the raw segment */ }
  return slug.replace(/\/+$/, '').trim().toLowerCase();
}

function findAffiliate(data, slug) {
  const list = data && data.affiliates;
  if (!slug || !Array.isArray(list)) return null;
  for (let i = 0; i < list.length; i++) {
    const row = list[i] || {};
    if (String(row.slug || '').trim().toLowerCase() === slug) return row;
  }
  return null;
}

async function loadAffiliates(requestUrl) {
  if (affiliateCache) return affiliateCache;
  const response = await fetch(new URL('/config/affiliates.json', requestUrl), { cache: 'no-store' });
  if (!response.ok) throw new Error('affiliates.json HTTP ' + response.status);
  affiliateCache = await response.json();
  return affiliateCache;
}

async function checkoutGate(url) {
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
  return next();
}

async function offerVanity(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (isOfferHost(url.hostname) && (path === '/' || path === '/index.html')) {
    return rewrite(url, '/offer');
  }

  const slug = vanitySlug(path);
  if (!slug || RESERVED.has(slug)) return next();

  let data;
  try {
    data = await loadAffiliates(url);
  } catch (e) {
    console.error('[middleware] affiliates.json read failed:', e && e.message);
    return next();
  }

  const affiliate = findAffiliate(data, slug);
  if (!affiliate) return next();
  if (RESERVED.has(String(affiliate.slug || '').trim().toLowerCase())) {
    console.error('[middleware] affiliate slug collides with an existing page:', affiliate.slug);
    return next();
  }
  return rewrite(url, '/offer');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  if (url.pathname === '/checkout' || url.pathname === '/checkout/') return checkoutGate(url);
  try {
    return await offerVanity(request);
  } catch (e) {
    console.error('[middleware] vanity path failed:', e && e.message);
    return next();
  }
}
