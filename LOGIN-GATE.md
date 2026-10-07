# Login gate: setup

Products, prices, cart and checkout on www.ambrosiastandard.com are only served to signed-in visitors. Every request passes through `middleware.js` on Vercel's servers. A visitor without a valid sign-in cookie gets redirected to `/login`, and that includes pasted product links. Accounts are stored in the **Accounts** tab of the Zelle orders Google Sheet.

## Files
- `middleware.js`: the gate, plus the existing Zelle/WooCommerce checkout switch
- `login.dc.html`: the sign-in and create-account page (`/login`)
- `api/auth/login.js`, `api/auth/register.js`, `api/auth/logout.js`
- `api/_lib/customer.js`: cookie signing and password hashing
- `vercel.json`: adds the `/login` rewrite
- `apps-script/Code.gs`: adds the account actions
- `woo-login-gate.php`: a WordPress snippet that also gates the WooCommerce host

## Setup, in order
1. **Apps Script.** Paste the new `Code.gs` over the old one and click Save. Then go to Deploy → Manage deployments → pencil → Version: **New version** → Deploy. The URL stays the same.
2. **Vercel env var.** Add `SESSION_SECRET` with the value from `woo-login-gate.php` (64 hex characters) and set it to Production.
3. **Upload** the files listed above to the GitHub repo, in the same folders. Vercel redeploys.
4. **WordPress.** Go to WPCode → Add snippet → PHP. Paste in `woo-login-gate.php`, choose Run everywhere, and set it to Active.

## Test
- In an incognito window, open `www.ambrosiastandard.com/glp-3`. You should land on `/login?next=/glp-3`.
- Create an account. You should return to `/glp-3`.
- In incognito, open `admin.ambrosiastandard.com/shop/` (or any product URL there). You should be redirected to `/login`.
- Open `admin.ambrosiastandard.com/wp-json/wc/store/v1/products`. It should return 401.

## Day to day
- To remove an account, delete its row in the Accounts tab.
- To sign everyone out, change `SESSION_SECRET`, both in Vercel and in the snippet.
- To sign out, use the link `/api/auth/logout`.
- If `SESSION_SECRET` is missing, nobody can get past the gate. It fails closed.
