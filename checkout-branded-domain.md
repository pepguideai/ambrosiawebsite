# Branded-domain checkout (fix 05)

Goal: the customer never leaves `www.ambrosiastandard.com`, including the payment step.

Today the cart hands off to `admin.ambrosiastandard.com/checkout` because WordPress
scopes its session cookies to that host. Three things have to change together.

## 1. WordPress — wp-config.php

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

## 2. Vercel — vercel.json

`/checkout` must stop redirecting and start proxying, so the address bar keeps the
www host. Move these three entries out of `redirects` and into `rewrites`:

    { "source": "/checkout",                "destination": "https://admin.ambrosiastandard.com/checkout" },
    { "source": "/checkout/:path*",         "destination": "https://admin.ambrosiastandard.com/checkout/:path*" },
    { "source": "/order-received/:path*",   "destination": "https://admin.ambrosiastandard.com/order-received/:path*" }

Leave `/my-account` as a redirect until the account pages are styled.

## 3. This site — cart-store.js

One line, at the top of the file:

    var BRANDED_CHECKOUT = true;

## 4. Test, in this order

1. Hard-refresh www, add one vial, PROCEED TO CHECKOUT.
2. Confirm the address bar still reads `www.ambrosiastandard.com/checkout`.
3. Confirm the cart contents and any discount code carried over.
4. Place a real order with Cash on delivery and confirm it appears in WooCommerce.
5. Confirm the affiliate commission posts in AffiliateWP.
6. Log into wp-admin on the admin host and confirm it still works.

## Rollback

Set `BRANDED_CHECKOUT = false`, move the three rewrites back to redirects, remove
the wp-config lines. No data is affected by any of the three steps.

## Also worth doing while in here

- LiteSpeed Cache: add `/checkout` and `/order-received` to Do Not Cache URIs, purge all.
- The WPCode CORS snippet must list `https://www.ambrosiastandard.com` as an allowed origin.
- Rename the `admin.` subdomain to `checkout.` if any customer-facing URL still points at it.
