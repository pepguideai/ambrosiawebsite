# Branded-domain checkout (fix 05)

Goal: the customer never leaves `www.ambrosiastandard.com`, including the payment step.

This is no longer cosmetic. On the cross-site path, checkout **fails on iOS**:
Safari blocks the third-party session cookie the Store API depends on, so the
nonce fetched from the admin host arrives bound to a session that was never
stored, Woo answers 403, and the cart shows "Checkout could not be reached."
Chrome on desktop still allows that cookie, which is why it worked there.

Today the cart hands off to `admin.ambrosiastandard.com/checkout` because WordPress
scopes its session cookies to that host. Three things have to change together.

## 1. WordPress — wp-config.php  ⬅ STILL TO DO

Add above the "That's all, stop editing" line:

    define('WP_HOME',    'https://www.ambrosiastandard.com');
    define('WP_SITEURL', 'https://admin.ambrosiastandard.com');
    define('COOKIE_DOMAIN', '.ambrosiastandard.com');
    define('ADMIN_COOKIE_PATH', '/');
    define('COOKIEPATH', '/');
    define('SITECOOKIEPATH', '/');

`WP_SITEURL` stays on the admin host so wp-admin keeps working; `WP_HOME` is what
front-end URLs are generated against. The widened `COOKIE_DOMAIN` is what lets the
session survive the hop between hosts.

Take a database and file backup first. If the site becomes unreachable, removing
these six lines over SFTP restores the current behaviour.

## 2. Vercel — vercel.json  ✅ DONE

`/checkout` must stop redirecting and start proxying, so the address bar keeps the
www host. These three entries are now in `rewrites` rather than `redirects`:

    { "source": "/checkout",                "destination": "https://admin.ambrosiastandard.com/checkout" },
    { "source": "/checkout/:path*",         "destination": "https://admin.ambrosiastandard.com/checkout/:path*" },
    { "source": "/order-received/:path*",   "destination": "https://admin.ambrosiastandard.com/order-received/:path*" }

`/wp-json/:path*` was already proxied — that rewrite is what makes step 3 work.
Leave `/my-account` as a redirect until the account pages are styled.

## 3. This site — cart-store.js  ✅ DONE

Two changes, both at the top of the file:

    var BRANDED_CHECKOUT = true;
    var STORE_API_URL = (BRANDED_CHECKOUT ? '' : WOO_ORIGIN) + '/wp-json/wc/store/v1';

The second one is the actual iOS fix and was missing from the original plan. It
routes the Store API calls through this site's own `/wp-json/…` proxy instead of
the admin host, so the session cookie is first-party and Safari keeps it.

Because the cookie now lands on `www`, step 1's widened `COOKIE_DOMAIN` is what
lets `/checkout` still see that session. The three steps only work together — the
code side alone will break checkout everywhere, not just on iOS.

## 4. Test, in this order

1. Hard-refresh www, add one vial, PROCEED TO CHECKOUT.
2. Confirm the address bar still reads `www.ambrosiastandard.com/checkout`.
3. Confirm the cart contents and any discount code carried over.
4. **Repeat 1–3 on an iPhone.** This is the case that was broken.
5. Place a real order with Cash on delivery and confirm it appears in WooCommerce.
6. Confirm the affiliate commission posts in AffiliateWP.
7. Log into wp-admin on the admin host and confirm it still works.

The cart's failure message now appends the real error in brackets, so if
something still fails the status code is readable on the phone itself.

## Rollback

Set `BRANDED_CHECKOUT = false`, move the three rewrites back to redirects, remove
the wp-config lines. No data is affected by any of the three steps.

## Also worth doing while in here

- LiteSpeed Cache: add `/checkout` and `/order-received` to Do Not Cache URIs, purge all.
- The WPCode CORS snippet must list `https://www.ambrosiastandard.com` as an allowed origin.
- Rename the `admin.` subdomain to `checkout.` if any customer-facing URL still points at it.
