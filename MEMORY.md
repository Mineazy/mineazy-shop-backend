# Mineazy Shop Backend — Project Memory

## Overview
Node.js/Express e-commerce backend for Mineazy (mining equipment & solutions), deployed via cPanel CloudLinux Node.js Selector (Passenger) at `https://mineazy.co.zw`. Uses NeDB (file-based) instead of MongoDB/Mongoose. Serves a CRA frontend from Apache (`~/public_html/`) and a Vite admin SPA from Passenger (`~/shop/admin_build/`).

---

## Architecture

### Stack
- **Runtime:** Node.js 20 (Passenger via cPanel Node.js Selector)
- **Framework:** Express
- **Database:** NeDB (file-based, `~/shop/data/*.db`)
- **Templating:** None (REST API + SPA frontend/admin)
- **PDF generation:** pdfkit (pure Node.js, installed via npm)
- **Email:** nodemailer via SMTP
- **Payments:** Paynow

### Deployment
- **Git origin:** `https://github.com/anomalyco/mineazy-shop-backend.git`
- **Server user:** npivfupq (host: mineazy.co.zw, port: 37980)
- **App root:** `/home9/npivfupq/shop/`
- **Frontend root:** `/home9/npivfupq/public_html/` (served by Apache, NOT Node.js)
- **Restart:** `touch ~/shop/tmp/restart.txt`
- **Logs:** `~/shop/stderr.log` (app stderr)
- **Node.js Selector:** v20, entry point `server.js`

### Environment Variables
Set in three places (priority order):
1. `~/shop/.env` — loaded by dotenv, full set of vars
2. `~/public_html/.htaccess` — LiteSpeed rewrite rules (reverse-proxy to Node.js on port 5000)
3. cPanel Node.js Selector UI — additional vars

**Key vars:**
| Variable | Value |
|---|---|
| `PORT` | 5000 |
| `NODE_ENV` | production |
| `SERVE_ADMIN` | true |
| `SERVE_FRONTEND` | true |
| `JWT_SECRET` | (set in .htaccess) |
| `EMAIL_HOST` | mail.mineazy.co.zw |
| `EMAIL_PORT` | 465 |
| `EMAIL_USER` | sales@mineazy.co.zw |
| `EMAIL_PASS` | Manchester20# |
| `EMAIL_FROM` | sales@mineazy.co.zw |
| `CLOUDINARY_API_KEY` | 681449246525152 |
| `CLOUDINARY_API_SECRET` | Qxxcy49auO-4XnMoOswB9M6lD2A |
| `CLOUDINARY_CLOUD_NAME` | probitymutsambiwa |
| `PAYNOW_INTEGRATION_ID` | 23628 |
| `PAYNOW_INTEGRATION_KEY` | cf7f6a2f-833d-4565-b6f3-da62ed6e7dca |

### .htaccess (public_html)
```
RewriteEngine On

# Exclude PHP files from Passenger
RewriteCond %{REQUEST_URI} \.php$ [NC]
RewriteRule .* - [L,E=no-passenger:1]

# Serve existing files and directories directly (Apache)
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule .* - [L]

# Proxy all other requests to Node.js backend on port 5000
RewriteRule ^(.*)$ http://localhost:5000/$1 [P,L]
```
This reverse-proxies non-static-file requests to Node.js on port 5000. Apache serves existing files from `~/public_html/` (storefront) directly; everything else (API, admin, SPA routes) goes to Node.js.

---

## Database (NeDB)

All data stored in `~/shop/data/` as flat files. Each file is append-only JSONL.

### Files
| File | Purpose |
|---|---|
| `categories.db` | 23 categories (imported from old backend) |
| `products.db` | 2,557 products (imported from old backend) |
| `blogposts.db` | 3 blog posts (seeded) |
| `carts.db` | Shopping carts |
| `orders.db` | Orders |
| `users.db` | Users (admin + test customers) |

### Users
| Email | Password | Role |
|---|---|---|
| admin@mineazy.co.zw | AdminPass123! | admin |
| customer@mineazy.co.zw | Customer123! | customer |

### Seed data IDs (for reference)
- Order for PDF testing: `02c736faa7d7fdc735a1e6b4`

---

## Key Files & Routes

### Server
| File | Purpose |
|---|---|
| `server.js` | Entry point, middleware stack, route mounting, static file serving |
| `utils/mongoshim.js` | NeDB wrapper with QueryBuilder (thenable, chainable .sort/.skip/.limit), populate(), aggregate() |
| `utils/emailService.js` | Nodemailer transport, sendEmail, sendInvoiceEmail, sendPasswordResetEmail |
| `utils/pdfGenerator.js` | pdfkit-based invoice PDF generation (generateInvoicePDF + generateInvoiceHTML fallback) |
| `utils/helpers.js` | Helper functions |
| `middleware/auth.js` | JWT auth middleware |
| `middleware/errorHandler.js` | Global error handler |

### Routes
| File | Mount | Notes |
|---|---|---|
| `routes/auth.js` | `/api/auth` | Login, register, password reset, profile management |
| `routes/products.js` | `/api/products` | CRUD, filtering, `/:id` falls back to slug lookup |
| `routes/categories.js` | `/api/categories` | CRUD |
| `routes/cart.js` | `/api/cart` | Add/remove items, clear cart, inline effectivePrice calculation |
| `routes/orders.js` | `/api/orders` | Order CRUD, status management |
| `routes/blog.js` | `/api/blog` | Has `/posts`, `/posts/related/:slug`, `/posts/:slug` aliases; static routes (`/categories`, `/tags`, `/featured`, `/archive`) before `/:slug` catch-all |
| `routes/invoices.js` | `/api/invoices` | Invoice PDF download (`/admin/:orderId/pdf`), public invoice view |
| `routes/payments.js` | `/api/payments` | Paynow integration |
| `routes/quotes.js` | `/api/quotes` | Quote requests |
| `routes/contact.js` | `/api/contact` | Contact form |
| `routes/pages.js` | `/api/pages` | Static pages |
| `routes/transactions.js` | `/api/transactions` | Payment transactions |
| `routes/blogCategories.js` | `/api/blog/categories` | Blog category CRUD |

### Middleware Order (server.js)
helmet → cors → compression → rateLimit → body parser → morgan → static (admin_build) → API routes → admin SPA catch-all → frontend static files → error handler

### Frontend Serving
- Apache serves `/home9/npivfupq/public_html/` as `DocumentRoot` — existing static files served directly
- Node.js `SERVE_FRONTEND` serves SPA fallback from `~/frontend/build/` for non-file routes proxied via `.htaccess`
- Node.js `SERVE_ADMIN` serves admin SPA from `~/shop/admin_build/` at `/admin`
- All non-file, non-PHP requests are reverse-proxied by `.htaccess` to `localhost:5000`
- API calls from browser use Axios with `baseURL: "/api"` (same origin)

---

## Known Issues & Fixes Applied

### 1. PDF Generation (puppeteer → pdfkit)
- **Problem:** CloudLinux lacks system libraries for Chrome (`libatk-bridge-2.0.so.0`, `libasound.so.2`, `libgbm.so.1`, `libatspi.so.0`)
- **Fix:** Replaced puppeteer-core + @sparticuz/chromium with pdfkit (pure Node.js, zero system deps)
- **File:** `utils/pdfGenerator.js` — rewrite with pdfkit
- **Invoice download:** `GET /api/invoices/admin/:orderId/pdf` (auth required)
- **Test order:** `02c736faa7d7fdc735a1e6b4`

### 2. Blog Route Order
- **Problem:** Frontend calls `GET /api/blog/posts` but `/:slug` catch-all matched "posts" as a slug
- **Fix:** Added `/posts`, `/posts/related/:slug`, `/posts/:slug` route aliases; reordered static routes before `/:slug`
- **File:** `routes/blog.js`

### 3. Cart Population & Pricing
- **Problem:** `MongoShim.populate` didn't handle dotted paths (`items.product`); `product.effectivePrice` is a static method, not instance
- **Fix:** Updated `mongoshim.js` populate to traverse `.`-separated paths into arrays; inlined `effectivePrice` calculation in cart route
- **Files:** `utils/mongoshim.js`, `routes/cart.js`

### 4. Admin Panel 404 (2026-06-01)
- **Problem:** Admin SPA at `/admin` returned 404 because `SERVE_ADMIN=true` was missing from `~/shop/.env` on the server
- **Fix:** Added `SERVE_ADMIN=true` and `SERVE_FRONTEND=true` to `~/shop/.env`; when Passenger manages the app, server.js registers `/admin` and `app.get('*')` routes for admin and frontend SPA fallback
- **Note:** The code fix from earlier (admin before frontend catch-all in server.js:190-209) was already correct, it just wasn't activated due to missing env var

### 5. API URL Patching
- **Problem:** Frontend/admin JS bundles hardcoded Render URL (`https://mining-equipment-backend.onrender.com`)
- **Fix:** Used `sed` to replace with empty string (relative path `/api/...`)
- **Files:** Minified bundles in `~/shop/admin_build/assets/` and `~/public_html/static/js/`

### 6. Cache Busting
- **Problem:** Browsers cache JS bundles aggressively (7-day Cache-Control from LiteSpeed)
- **Fix:** Added `?v=2` query param to script/link tags in HTML files
- **Files:** `index.html` in `~/public_html/` and `~/shop/admin_build/`

### 7. Windows Build Artifacts
- **Problem:** Admin build from Windows had literal backslashes in filenames
- **Fix:** Manually created `assets/` directory and renamed files

### 8. SMTP Configuration
- **Current:** mail.mineazy.co.zw:465, sales@mineazy.co.zw
- **Note:** Port 465 requires `secure: true` — handled dynamically in `emailService.js`

### 9. Passenger/lsnode Process Killed — Won't Auto-Restart
- **Problem:** Killing the old lsnode process (to pick up new .env vars) caused it to never restart; Passenger didn't auto-spawn a replacement
- **Workaround:** Node.js started manually on port 5000 with `.htaccess` reverse-proxy rules (see `.htaccess` section above)
- **Permanent fix:** Go to cPanel → Setup Node.js Application → find `/home9/npivfupq/shop/` → Start/Edit-Save to re-register with Passenger. Once Passenger manages it again, revert `.htaccess` to the original PHP-only rule.
- **Manual process check:** `ps aux | grep 'node.*server' | grep -v grep`
- **Manual start (if needed):**
  ```bash
  cd ~/shop && nohup ~/nodevenv/shop/20/bin/node server.js >> ~/shop/server.log 2>> ~/shop/stderr.log &
  ```

### 10. .htaccess Reverse-Proxy Workaround
- **Problem:** When Passenger isn't managing the app, requests don't reach Node.js
- **Fix:** Added rewrite rules in `~/public_html/.htaccess` to proxy non-static-file requests to `localhost:5000`
- **Rules:** Existing files/directories served by Apache; everything else proxied via `[P]` flag to Node.js
- **Revert when Passenger is fixed:** Restore the original `.htaccess`:
  ```
  RewriteEngine On
  RewriteCond %{REQUEST_URI} \.php$ [NC]
  RewriteRule .* - [L,E=no-passenger:1]
  ```

---

## Models (11 total)

All models use `MongoShim` wrapper instead of Mongoose:
- `User`, `Product`, `Category`, `Cart`, `Order`, `Quote`, `BlogPost`, `BlogCategory`, `ContactMessage`, `Page`, `Transaction`

---

## Testing

### Local (Render.com — deprecated)
- Old backend: `https://mining-equipment-backend.onrender.com` (Render, MongoDB)
- No longer active; all data migrated to NeDB on cPanel

### Live
- `https://mineazy.co.zw/health` — health check endpoint
- `https://mineazy.co.zw/api/products` — product listing
- `https://mineazy.co.zw/api/blog` — blog posts
- `https://mineazy.co.zw/admin/` — admin panel (login: admin@mineazy.co.zw / AdminPass123!)

### PDF Test
```js
const orderId = '02c736faa7d7fdc735a1e6b4';
// GET /api/invoices/admin/${orderId}/pdf (auth: Bearer token)
```

---

## Common Tasks

### Deploy Code Changes
```bash
scp -o StrictHostKeyChecking=no -P 37980 <local_file> npivfupq@mineazy.co.zw:~/shop/<path>
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "touch ~/shop/tmp/restart.txt"
```

### Deploy .htaccess
```bash
scp -o StrictHostKeyChecking=no -P 37980 .htaccess npivfupq@mineazy.co.zw:~/public_html/.htaccess
```

### Restart App (when Passenger manages it)
```bash
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "touch ~/shop/tmp/restart.txt"
```

### Manual Start/Recovery (if Passenger is down)
```bash
# Start Node.js manually
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "cd ~/shop && nohup ~/nodevenv/shop/20/bin/node server.js >> ~/shop/server.log 2>> ~/shop/stderr.log &"
```
Then deploy the proxy `.htaccess` (see above) to route traffic to the manual process.

### Restore Passenger (permanent fix)
1. cPanel → Setup Node.js Application → find `/home9/npivfupq/shop/`
2. Click Start Application (or Edit → Save)
3. Revert `.htaccess` to original (PHP-only rule)
