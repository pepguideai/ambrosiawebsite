# Zelle fallback checkout: setup and operations

## Day to day

**Flip the switch.** On GitHub, open `live-checkout.json` at the repo root, click the pencil, and change it to `{ "mode": "zelle" }` or `{ "mode": "woocommerce" }`. Commit. Vercel redeploys and the site switches in about a minute. Anything other than exactly `zelle` means WooCommerce. The `/admin-checkout` page only shows the current mode.

- **WooCommerce (default):** the normal card checkout. The Zelle offer is hidden.
- **Zelle fallback:** `/checkout` opens the on-site Zelle checkout. Every order gets a flat 25% off, and no other codes or offers apply. The top strip on every page shows "LIMITED TIME · 25% OFF EVERY ORDER PAID BY ZELLE". The cart hides the code and welcome boxes and shows the 25% line.

If you switch back to WooCommerce while a customer is mid-order, their payment and confirmation screens still work. New Zelle orders are refused by the server.

**View pending orders.** Open the "Ambrosia Zelle Orders" Google Sheet and filter Status = "Awaiting Zelle payment". Each order also arrives as an email to OWNER_EMAILS.

**Mark an order as paid.**

1. Find the incoming Zelle payment in the bank app.
2. Match the memo (AMB-XXXXXX) and the amount to the sheet's Order Number and Total.
3. Set Status to "Payment received". Then set it to "Shipped" when it goes out, or "Cancelled" if it doesn't.

Tell the customer by email that payment is confirmed. Status changes don't email anyone automatically.

**Customer Marked Sent** shows when the customer tapped "I've sent my payment". It is a hint only; it doesn't prove payment.

## What to change and where

`config/zelle.config.json` holds all customer-facing values:

- Zelle email and name
- Support email and phone
- Discount rate and label
- Ticker wording
- Shipping options and the $200 threshold
- Tax mode (`absorb` or `collect_by_state`) and rates
- Redirect delay
- Catalogue prices

**Keep `catalog` prices in step with WooCommerce and `cart-store.js`.** The Zelle server charges from this file, because WooCommerce may be down when you need the fallback.

Also update the ticker text in `checkout-mode.js` (`PROMO`) if you change the wording.

**Tax.** `absorb` charges no tax. The sheet still records the tax portion estimated from the TN rate (9.25% default) for TN addresses. To fill the rate table, add ZIPs or 3-digit prefixes under `tax.states.TN.zip`, e.g. `"37203": 0.0925`. Other states are $0 unless you add them.

**Shipping.** The page offers Standard ($12), Expedited ($28) and Overnight ($45). Standard is free when the product subtotal before the 25% is $200 or more, the same rule as WooCommerce.

## One-time setup

### 1. Upload
The new folders must stay folders at the repo root: `api/`, `config/`, `apps-script/`, `scripts/`. The new root files are:

- `middleware.js`
- `checkout-mode.js`
- `zelle-pricing.js`
- `zelle-mark.svg`
- `order.dc.html`
- `admin-checkout.dc.html`

GitHub's web uploader flattens folders, so drop each folder in on its own. `apps-script/` and `scripts/` are kept out of the deploy by `.vercelignore`.

Replace `zelle-mark.svg` with the official Zelle mark from Zelle's brand toolkit, keeping the same filename. The current file is a placeholder.

### 2. Google Sheet and Apps Script
1. Create a Google Sheet named "Ambrosia Zelle Orders". Use the Google account the emails should come from.
2. Go to Extensions → Apps Script. Replace `Code.gs` with `apps-script/Code.gs` from this folder.
3. Go to Project Settings → Script properties and add:
   - `SECRET`: a long random string (for example, `openssl rand -hex 32`)
   - `OWNER_EMAILS`: e.g. `philip@…,brittney@…`
4. Go to Deploy → New deployment → Web app. Set Execute as: **Me** and Who has access: **Anyone**. Authorise the Sheets and Gmail scopes when asked.
5. Copy the `/exec` URL.
6. The `Orders` tab and its headers are created on the first order. The last six columns are system columns; leave them in place. Three of them (the JSON, key and token columns) are hidden.

Daily email limit: 100 on a consumer Gmail account, 1,500 on Google Workspace. Each order sends 2 emails.

### 3. Checkout switch
Upload `live-checkout.json` to the repo root containing `{ "mode": "woocommerce" }`. No Edge Config or Vercel token is needed.

### 4. Environment variables (Production)

| Variable | Value |
| --- | --- |
| `APPS_SCRIPT_URL` | the `/exec` URL |
| `APPS_SCRIPT_SECRET` | same value as the script's `SECRET` |
| `ADMIN_SESSION_SECRET` | 32+ random characters |
| `ADMIN_PASSWORD_HASH` | `pbkdf2$310000$…` (the hash of the shared password) |

To change the password later, run `node scripts/hash-password.js "new password"` (12+ characters) and replace `ADMIN_PASSWORD_HASH` with the output, then redeploy.

Redeploy once after adding the variables.

### 5. Login rate limit
The login endpoint allows 5 failed attempts per 15 minutes per IP, counted separately on each server instance. For a limit that holds across all instances, add a Vercel Firewall rule: Rate limit, path `/api/admin/login`, 10 requests per 10 minutes per IP, action Deny.

### 6. Test before you need it
1. Switch to Zelle fallback and place a real $1-ish test order. You can temporarily add a test item to `catalog`.
2. Check the sheet row, both emails, copy buttons, refresh on the payment screen, and "I'll pay later".
3. Switch back to WooCommerce with the payment screen still open and confirm it still loads.
4. Confirm a new Zelle order is refused.
5. Delete the test row.

## How it fits together

- `middleware.js` reads `live-checkout.json` on every `/checkout` request. In Zelle mode (or when the URL carries `?order=`), it serves `order.dc.html`. Otherwise the request falls through to the existing WordPress rewrite. Any read error means WooCommerce.
- `/api/checkout-mode` is a public, uncached mode read. The cart calls it again when "Proceed to checkout" is tapped.
- `/api/zelle/order`:
  - **POST** re-checks the mode, validates the form, recomputes prices from `config/zelle.config.json` and writes to the sheet. Each checkout attempt carries an idempotency key, so a double-tap or retry returns the same order.
  - **GET** restores an order by number plus a private token. It works in either mode.
- `/api/zelle/notify` records "I've sent my payment" or re-sends the instructions email. Re-sends are limited to one every 2 minutes per order.
- `/api/admin/login`, `/logout` and `/mode` handle the admin page. They use a signed httpOnly cookie that lasts 12 hours, with SameSite=Strict and an Origin check on every POST.
