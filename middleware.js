/* /checkout goes to WooCommerce unless live-checkout.json says "zelle".
   To switch: edit live-checkout.json on GitHub. Vercel redeploys in ~1 minute. */
export const config = { matcher: ['/checkout'] };

export default async function middleware(request) {
  const url = new URL(request.url);
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
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
