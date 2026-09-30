/* Vercel Routing Middleware. /checkout normally rewrites to WooCommerce (see
   vercel.json). In Zelle mode it is rewritten to the on-site order page
   instead. Reads Edge Config on every request; any failure falls through to
   WooCommerce. */
export const config = { matcher: ['/checkout'] };

export default async function middleware(request) {
  const url = new URL(request.url);
  let zelle = url.searchParams.has('order');
  if (!zelle) {
    try {
      const u = new URL(process.env.EDGE_CONFIG);
      const id = process.env.EDGE_CONFIG_ID || u.pathname.replace(/^\//, '');
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 1200);
      const r = await fetch(`https://edge-config.vercel.com/${id}/item/checkoutMode?token=${u.searchParams.get('token')}`, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (r.ok) { const v = await r.json(); zelle = !!v && v.mode === 'zelle'; }
    } catch (e) {
      console.error('[middleware] checkout mode read failed, using WooCommerce:', e && e.message);
    }
  }
  if (zelle) {
    return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/order.dc' + url.search, url).toString() } });
  }
  return new Response(null, { headers: { 'x-middleware-next': '1' } });
}
