# Ambrosia — site source

Twenty-two pages, deployed flat to Vercel. Every file in this directory sits at
the repository root; there are no subfolders, because the GitHub web uploader
flattens them.

## How a page works

Each `.html` file is a Design Component: `<x-dc>` markup plus a logic class,
rendered in the browser by `support.js`. Markup streams and paints immediately;
the logic class supplies values and handlers. Styling is inline per element —
`ambrosia.css` carries only resets, the grid helpers (`.g2`, `.g3`, `.g4`,
`.hdr`, `.split`, `.stick`, `.trow`) and their media queries.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Home, with the six-compound grid |
| `ghk-cu` `glp-2` `glp-3` `glow` `klow` `wolverine` | The six catalogued compounds |
| `bacteriostatic-water.html` | Reconstitution supply, $20 / 10 mL |
| `cart.html` `checkout.html` | Cart and checkout |
| `standard.html` `faq.html` | The Ambrosia Standard, FAQ (includes handling & storage) |
| `affiliate.html` `affiliate-portal.html` `affiliate-agreement.html` | Partner recruitment, portal, terms |
| `contact.html` | Contact form and details |
| `research-use-policy` `terms-of-sale` `privacy-policy` `shipping-restrictions` `returns-documentation` | Legal |
| `offer.html` | Welcome-offer capture page, not linked from the site |
| `cart-store.js` | Catalogue, cart, pricing. Read this first. |
| `support.js` | Design Component runtime. Do not edit. |
| `ambrosia.css` | Shared resets and layout helpers |
| `vercel.json` | Clean URLs, cache and security headers |

## Pricing

Two axes, and they compose so the cheapest cost per mg is always the largest
vial bought deepest.

**Concentration** — GLP-2 and GLP-3 at 10 MG $70, 20 MG $120, 30 MG $160.
GHK-Cu 50 mg $35, 100 mg $50. Glow $125, Klow $170, Wolverine $120.

**Quantity** — two of any one vial 5% off, three 10%, ten 15%. Per line item.
Bacteriostatic water is flat $20 and excluded.

Kits are retired. Ten vials of 30 MG *is* the old ten-vial kit, so there is one
price for that basket instead of two. `cart-store.js` ignores any kit variation
still present in Woo.

## WooCommerce

Backend is headless WordPress/WooCommerce at `admin.ambrosiastandard.com`, Store
API at `/wp-json/wc/store/v1`.

`cart-store.js` owns the single catalogue fetch. Product pages read its result
via `await AmbrosiaCart.ready` — they do not fetch independently.

GLP-3 is wired and is the reference: `WOO_PRODUCT_IDS['glp-3'] = 11`. Its
variations are fetched individually, `Concentration` and `Pack Size` attributes
parsed, prices converted from minor units, and the result mapped onto our slug
scheme (`glp-3`, `glp-3-20`, `glp-3-30`).

**To wire another product, fill its Woo parent ID into `WOO_PRODUCT_IDS` in
`cart-store.js`.** Nothing else changes — the product page picks up live sizes
and prices automatically, and its static `SIZES` becomes a fallback. The console
warns on load which products are still on hardcoded prices.

Cart keys are slugs, not Woo IDs, so the tiers and the water prompt behave
identically before and after the fetch resolves. `AmbrosiaCart.wooPayload()`
translates to numeric IDs for submission and marks any line that cannot be
submitted yet.

## What still needs a server

Search `[SERVER]` in `cart-store.js`. In short:

- **Multi-vial tiers are presentational.** Woo must enforce the same rule via
  `woocommerce_before_calculate_totals` or a bulk-pricing plugin. Without it a
  modified request pays the discount without the quantity.
- **Checkout takes no payment.** It collects details and clears the cart.
- **Shipping rates are hardcoded.** They belong to Woo.
- **Coupon codes are validated client-side.** They must not be.
- **The affiliate portal is a working prototype on fixture data.** Logins
  (`NICOLE`, `ELANA`, `AFFILIATE1`, password `ambrosia`, any six-digit code) are
  in the page source. Real auth, referral attribution and payouts are all
  server-side work.
- **The contact form does not send.**

## Legal copy

The five legal pages and the affiliate agreement state the positions the site
already operates on, and each closes with a line saying it has not been through
counsel. Limitation of liability, warranty and indemnity are named as the
specific gaps in `terms-of-sale.html`.
