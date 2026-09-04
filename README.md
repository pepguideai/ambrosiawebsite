# Ambrosia — ambrosiastandard.com

Static site. No build step, no dependencies, no framework install. Every file in
this folder is served as-is.

## Deploying to Vercel via GitHub

### 1. Upload to the repository

Replace the **entire contents** of the repo root with the contents of this
folder. Do not nest it inside a `build/` directory — `index.html` must sit at
the repo root.

The one structural rule: **`fonts/` must stay a real folder.** The stylesheet
loads `fonts/Cinzel.ttf` and friends by relative path. Everything else
(HTML, CSS, JS, images) is flat at the root.

GitHub's drag-and-drop uploader flattens folders, so upload in two passes:

1. Drag all root-level files (the `.html`, `.css`, `.js`, `.json`, `.png`,
   `.jpg` files) into the repo root.
2. Then drag the `fonts` folder in separately — the web uploader preserves a
   folder when you drop the folder itself rather than its contents.

If you use git locally instead, one commit does it:

```
git rm -r --cached .
cp -R /path/to/build/. .
git add -A
git commit -m "Site update: ticker, self-hosted type, new hero"
git push
```

### 2. Files to delete from the repo

If these are still present from an earlier deploy, remove them:

```
glp-1.html            bpc-157.html          semax.html
nad.html              glutathione.html      melanotan-2.html
tesamorelin.html      foundations.html      hero-vials.png
hero-vials-wide-tight.png                   collective-cards.png
vial-glp-1.png        vial-bpc-157.png      vial-semax.png
vial-nad.png          vial-glutathione.png  vial-melanotan-2.png
vial-tesamorelin.png
```

Also remove any `assets/` folder — image paths are bare filenames now.

### 3. Vercel

The project is already connected; a push to `main` triggers the deploy. Confirm
in Vercel → Settings → Build & Deployment:

- **Framework Preset:** Other
- **Build Command:** *(empty)*
- **Output Directory:** *(empty — leave it blank; `vercel.json` no longer sets one)*
- **Install Command:** *(empty)*

`vercel.json` handles `cleanUrls`, cache headers (a year on images and fonts,
an hour on CSS/JS) and the security headers. Nothing to configure by hand.

### 4. Post-deploy checks

1. **Fonts.** Open the site and confirm the AMBROSIA logo renders in Cinzel's
   engraved caps, not a Times-style serif. In DevTools → Network, filter to
   `Font`: four `.ttf` files should return 200. A 404 here means `fonts/` was
   flattened during upload — re-upload it as a folder.
2. **Ticker.** The oxblood strip should scroll continuously right-to-left. If
   the messages are stacked and static, `ambrosia.css` didn't update.
3. **Live pricing.** Open `/glp-3` and check the console. Silence means the
   WooCommerce Store API fetch succeeded. A `live fetch failed for glp-3`
   warning means the Store API is rejecting the request — allow
   `https://www.ambrosiastandard.com` as an origin for CORS on
   `admin.ambrosiastandard.com/wp-json/wc/store/v1`. The site falls back to
   hardcoded prices in the meantime, so it stays functional either way.
4. **Images.** Load the home page and the affiliate page; check the Network tab
   for any 404 on a `.jpg` or `.png`.

## What's in this release

- Top oxblood strip is a continuous ticker: research-use notice, free shipping
  over $200, free 50mg GHK-Cu over $300, ships from USA / international
  shipping, qualified purchasers 21+. 53-second loop, pauses on hover, static
  for visitors with reduced-motion enabled.
- Header rebalanced — MENU and SHOP at left, OUR STANDARDS and CART at right,
  logo centred. SHOP jumps straight to the catalogue.
- Type is self-hosted: Cinzel, Instrument Serif and Archivo ship as `.ttf`
  files under `fonts/`, declared with `@font-face` in `ambrosia.css`. No
  Google Fonts request, so no fallback to the system serif.
- New full-bleed hero and a new Ambrosia Collective banner.
- Strip colour is oxblood `#3E1218`, matching the offer page.

## Architecture

- `cart-store.js` — the only stateful layer. Owns the catalogue, cart
  persistence in `localStorage`, multi-vial tier pricing (5% at 2 vials, 10% at
  3, 15% at 10) and the WooCommerce Store API fetch. Pages read it via
  `await AmbrosiaCart.ready`.
- `ambrosia.css` — shared resets, `@font-face` declarations, responsive grid
  helpers and the ticker keyframes. Component styling stays inline per element.
- `support.js` — the page runtime. Do not edit.
- `vercel.json` — routing, cache and security headers.

### Wiring the remaining products to live pricing

`WOO_PRODUCT_IDS` in `cart-store.js` currently maps only GLP-3 (`11`). Add each
product's Woo parent ID to that map and it switches to live variation pricing;
its static `SIZES` block stays as the fallback.

### Server-side work still outstanding

Lines marked `[SERVER]` in `cart-store.js` mark the discount tiers. The
multi-vial pricing is computed client-side for display, and must be validated
in WooCommerce before an order is accepted.
