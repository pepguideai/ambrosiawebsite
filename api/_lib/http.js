function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

/* State-changing requests must come from our own pages. */
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return false;
  try { return new URL(o).host === req.headers.host; } catch (e) { return false; }
}

function ip(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
}

module.exports = { noStore, body, sameOrigin, ip };
