# Mineazy Shop Backend — Project Memory

## Overview
Node.js/Express e-commerce backend for Mineazy (mining equipment & solutions), deployed via cPanel CloudLinux Node.js Selector (Passenger) at `https://mineazy.co.zw`. Uses NeDB (file-based) instead of MongoDB/Mongoose. Serves a CRA frontend from Apache (`~/public_html/`) and a Vite admin SPA from Passenger (`~/shop/admin_build/`).

### Frontend
- **Repo:** `C:\Users\Administrator\mineazy-shop-frontend\frontend`
- **Stack:** CRA + Tailwind CSS + React 18
- **Key deps:** react-helmet-async, lucide-react, leaflet, react-leaflet

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

### .htaccess (shop) — CURRENT
```
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION BEGIN
PassengerAppRoot "/home9/npivfupq/shop"
PassengerBaseURI "/"
PassengerNodejs "/home9/npivfupq/nodevenv/shop/20/bin/node"
PassengerAppType node
PassengerStartupFile server.js
# DO NOT REMOVE. CLOUDLINUX PASSENGER CONFIGURATION END
RewriteEngine On

# Redirect WWW to non-WWW
RewriteCond %{HTTP_HOST} ^www\.mineazy\.co\.zw$ [NC]
RewriteRule ^(.*)$ https://mineazy.co.zw/$1 [R=301,L]

# Redirect /index.html to /
RewriteRule ^index\.html$ / [R=301,L]

# Redirect /index.php to /
RewriteRule ^index\.php$ / [R=301,L]

# Serve existing static files directly (bypass Passenger/Node.js)
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule .* - [L,E=no-passenger:1]

# Exclude PHP files from Passenger
RewriteCond %{REQUEST_URI} \.php$ [NC]
RewriteRule .* - [L,E=no-passenger:1]
```
LiteSpeed's Passenger integration routes the domain to the Node.js app (managed by CloudLinux Node.js Selector); the app listens on a Passenger private socket (NOT port 5000). PHP files in `public_html/` are still served by Apache. Static files (storefront build, admin build) are served by the Node app itself (`SERVE_ADMIN`/`SERVE_FRONTEND`). The reverse-proxy variant used previously is backed up at `~/public_html/.htaccess.proxy-workaround.bak` and must NOT be restored except as an emergency fallback (see #9/#10).

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
| admin@mineazy.co.zw | (set via cPanel) | admin |
| customer@mineazy.co.zw | (set via cPanel) | customer |

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
helmet → cors → compression → hero preload (Link header for LCP) → rateLimit → body parser → morgan → static (admin_build) → API routes → admin SPA catch-all → frontend static files → SPA catch-all → error handler

### Frontend Serving
- Apache/LiteSpeed serves `/home9/npivfupq/public_html/` as `DocumentRoot` — existing static files served directly via `RewriteCond %{REQUEST_FILENAME} -f`
- Node.js `SERVE_FRONTEND` serves SPA fallback from `~/frontend/build/` (primary) or `~/shop/frontend_build/` (fallback) for non-file routes
- Node.js `SERVE_ADMIN` serves admin SPA from `~/shop/admin_build/` at `/admin`
- All requests go through Passenger/Node.js (Apache `E=no-passenger:1` trick does NOT work with CloudLinux Passenger)
- API calls from browser use Axios with `baseURL: "/api"` (same origin)
- **Build hash progression:** `main.852ea350.js` → `main.cf388ffc.js` → `main.e12fcde3.js` → `main.8c251bab.js` → `main.c1098c88.js` → `main.4ccc5dc0.js` → `main.bf7a0eb5.js` (current)

### Frontend Components (Home page)
| File | Purpose |
|---|---|
| `components/Home/TrustedPartners.jsx` | Partner logos carousel |
| `components/Home/BranchLocator.jsx` | Leaflet map with 13 branch locations, scrollable sidebar |
| `components/Header/Header.jsx` | Site header with inline navigation (NOT using Navigation.jsx) |

---

## Known Issues & Fixes Applied

### SEO Fixes (2026-08-25)
- **Duplicate meta tags:** Removed duplicate meta description, OG tags, Twitter tags, and canonical link from `index.html`. `Seo.jsx` handles dynamically via react-helmet-async.
- **H1 count 2→1:** Changed noscript `<h1>` to styled `<p>` tag.
- **Text-to-code ratio:** Expanded noscript content, added SEO text section at bottom of Home.jsx (300+ words), expanded hero/about/testimonials/featured products/CTA sections. Currently 8% (up from 4%).
- **Product 404s:** Added `/product`, `/categories`, `/compare`, `/wishlist`, `/notifications`, `/quote` to `validSpaRoutes` in server.js.
- **`/index.html` 404:** Added `RewriteRule ^index\.html$ / [R=301,L]` and `^index\.php$ / [R=301,L]` in `.htaccess`.
- **Google tag:** Added `AW-18409302529` async tag in `index.html`, CSP updated to allow `googletagmanager.com`.

### Image Optimization (2026-08-26)
- **Hero image:** `home-banner.webp` compressed from 373KB → **48KB** (87% reduction) using sharp at quality 55, width 1200px.
- **About banner:** `about-us-banner-mineazy.webp` compressed from 256KB → **33KB**.
- **Mining operations:** Converted to WebP (`mining-operations-mineazy.webp`).
- **CLS prevention:** Added `width`/`height` attributes to all `<img>` tags.
- **Lazy loading:** Below-fold images use `loading="lazy"` with `fetchPriority="low"`. Hero uses `<img fetchPriority="high">` instead of CSS `background-image`.

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
- **Recurrence (2026-08-12):** Site down with all APIs returning 503. `~/shop/stderr.log` showed `EADDRINUSE :::5000` on startup (old process still held port while Passenger spawned a new one); afterwards lsnode for shop was a zombie (no app process, nothing listening on 5000). `netstat`/`ss` are unreliable on the box — verify with `curl -s http://127.0.0.1:5000/health` instead.
- **ROOT CAUSE FOUND (2026-08-12):** The reverse-proxy `RewriteRule ^(.*)$ http://localhost:5000/$1 [P,L]` lines in `~/public_html/.htaccess` made the CloudLinux Passenger block inert. LiteSpeed served everything via the proxy to port 5000 and NEVER routed requests through Passenger, so Passenger never spawned/restarted the app. The app only ran when a manual `node server.js` held port 5000.
- **PERMANENT FIX APPLIED (2026-08-12):** Removed the proxy rewrite rules from `~/public_html/.htaccess`, leaving only the CloudLinux Passenger block + PHP exclusion. Passenger now spawns and manages the app itself on its own private socket (port 5000 no longer used — `curl code=000`). `touch ~/shop/tmp/restart.txt` triggers a graceful restart and Passenger auto-respawns the app. Verified: `/health`, `/api/categories`, `/api/products`, `/admin/`, storefront assets, and admin login all 200. Rollback backup kept at `~/public_html/.htaccess.proxy-workaround.bak`.
- **Manual process check:** `ps aux | grep '/home9/npivfupq/shop' | grep -v grep` (app runs embedded in `lsnode:/home9/npivfupq/shop/`, not a separate `node server.js`)
- **Manual start (if needed, FALLBACK ONLY):**
  ```bash
  cd ~/shop && nohup ~/nodevenv/shop/20/bin/node server.js >> ~/shop/server.log 2>> ~/shop/stderr.log &
  ```

### 10. .htaccess Reverse-Proxy Workaround (RESOLVED 2026-08-12)
- **Problem:** When Passenger isn't managing the app, requests don't reach Node.js
- **Fix applied:** Added rewrite rules in `~/public_html/.htaccess` to proxy non-static-file requests to `localhost:5000`
- **Why it was wrong:** The proxy rules (see #9) masked the Passenger block, preventing Passenger from ever managing/auto-restarting the app
- **Resolution:** Proxy rules removed; `~/public_html/.htaccess` is now the Passenger-native config (CloudLinux block + PHP exclusion) that CloudLinux Node.js Selector generated. Backup of the workaround kept at `~/public_html/.htaccess.proxy-workaround.bak`
- **If it ever needs to be re-applied (emergency only):** Restore the backup; manual start required (see #9)

### 11. Path Variable Shadowing Bug (FIXED 2026-08-25)
- **Problem:** SPA catch-all route in `server.js:343` used `const path = req.path` which shadowed the `path` module import. This caused `path.join()` calls to fail (calling `.join()` on a string instead of the path module), resulting in 500 errors on all SPA routes.
- **Root cause:** `const path = req.path` reassigned `path` from the `require('path')` module to a string for the rest of the request lifecycle.
- **Fix:** Renamed `const path = req.path` to `const reqPath = req.path` in server.js line 343.
- **Deployed and verified:** `/health` 200, `/shop` 200, `/nonexistent-page-xyz` 404, `www.mineazy.co.zw` 301.

### 12. Frontend Static Files Not Serving (RESOLVED 2026-08-25)
- **Problem:** `main.852ea350.js` returned 404 because `.htaccess` `PassengerBaseURI "/"` intercepted ALL requests before Apache could serve static files from `~/public_html/`.
- **Fix:** Deployed frontend build to `~/frontend/build/` where Node.js `express.static` serves it. The `candidatePaths.find(fs.existsSync)` in server.js picks `../frontend/build` first, then `frontend_build`.
- **Three deployment locations needed:**
  - `~/frontend/build/` — Node.js primary (served by `express.static`)
  - `~/shop/frontend_build/` — Node.js fallback
  - `~/public_html/` — Apache direct (when `.htaccess` `RewriteCond -f` matches)
- **Note:** `E=no-passenger:1` env var trick does NOT work with CloudLinux Passenger. All requests go through Node.js.

### 13. Multiple index.html Deployment Locations (RESOLVED 2026-08-25)
- **Problem:** CRA frontend build needed to be deployed in multiple locations to work with both Apache and Node.js serving.
- **Solution:** Deploy to all three locations:
  1. `~/frontend/build/` — primary for Node.js `express.static`
  2. `~/shop/frontend_build/` — fallback for Node.js
  3. `~/public_html/` — for Apache direct serving (index.html + static/)

### 14. Google Tag Not Present (FIXED 2026-08-25)
- **Problem:** Google Ads conversion tracking tag (AW-18409302529) was not present on the site.
- **Fix:** Added async Google tag to `index.html` after `<head>` tag. Updated CSP in server.js `scriptSrc` to include `https://www.googletagmanager.com`.

### 15. SEO: Duplicate Meta Tags & Missing Canonical (FIXED 2026-08-25)
- **Problem:** `index.html` had duplicate meta description, OG tags, Twitter tags, and canonical link that conflicted with `Seo.jsx` (react-helmet-async).
- **Fix:** Removed all duplicate meta tags, OG tags, Twitter tags, and `<link rel="canonical">` from `index.html`. `Seo.jsx` now handles all SEO dynamically.

### 16. SEO: H1 Count 2→1 (FIXED 2026-08-25)
- **Problem:** Noscript content had an `<h1>` tag, creating 2 H1 elements on the page (one from noscript, one from React).
- **Fix:** Changed noscript `<h1>` to styled `<p>` tag to preserve visual appearance while fixing H1 count.

### 17. SEO: Text-to-Code Ratio Low (FIXED 2026-08-25)
- **Problem:** Text-to-code ratio was 4% (goal 10%+). The rendered DOM had very little visible text compared to code.
- **Fix:** Expanded noscript content significantly (product descriptions, why choose, contact, quick links), added SEO text section at bottom of Home.jsx (300+ words), expanded hero description, about section, testimonials, featured products, and CTA sections.
- **Result:** Improved to 8% (goal is 10%+).

### 18. SEO: /index.html Returns 404 (FIXED 2026-08-25)
- **Problem:** `/index.html` returned 404 (SPA catch-all didn't treat it as valid).
- **Fix:** Added `RewriteRule ^index\.html$ / [R=301,L]` and `^index\.php$ / [R=301,L]` in `.htaccess`.

### 19. SEO: Product Links Return 404 (FIXED 2026-08-25)
- **Problem:** Product detail links like `/product/:id` returned 404 because they weren't in `validSpaRoutes`.
- **Fix:** Added `/product`, `/categories`, `/compare`, `/wishlist`, `/notifications`, `/quote` to `validSpaRoutes` in server.js.

### 20. Mobile PageSpeed: Hero Image Too Large (FIXED 2026-08-26)
- **Problem:** Hero image `home-banner.webp` was 373KB (too large for mobile LCP).
- **Fix:** Re-compressed with sharp at quality 55, width 1200px → **48KB** (87% reduction). Also compressed `about-us-banner-mineazy.webp` from 256KB → **33KB**.
- **Additional optimizations:** Changed below-fold mining operations image from `loading="eager"` to `loading="lazy"` with `fetchPriority="low"`. Added `width`/`height` attributes to images for CLS prevention. Changed hero/CTA sections from CSS `background-image` to `<img>` tags for better LCP/CLS.

### 21. Mobile PageSpeed: JS Bundle Too Large (FIXED 2026-08-26)
- **Problem:** Main JS bundle was 131.59KB gzipped. Login, Register, PaymentProcessing were eagerly loaded. 217-line dead `headerStyles` CSS string in Header.jsx. Unused imports across 10+ files.
- **Fix:** Moved Login, Register, PaymentProcessing to `React.lazy()`. Removed dead `headerStyles` const (217 lines of CSS that was never injected into DOM). Cleaned unused imports from Shop.jsx, ProductDetail.jsx, Orders.jsx, OrderDetails.jsx, OrderSuccess.jsx, Blog.jsx, BlogPost.jsx, ProductCard.jsx. Removed unused variables (`navigate`, `user`, `isOutOfStock`).
- **Result:** Main bundle reduced to **125.63KB** gzipped (5.96KB / 4.5% reduction).

### 22. Mobile PageSpeed Current Scores (as of 2026-08-26)
- **Performance:** 68 (improved from 63)
- **Accessibility:** 79
- **Best Practices:** 96
- **SEO:** 100
- **Note:** Scores cached from page-speed.dev. Hero image compression (373KB→48KB) deployed but may not be reflected in cached results yet. Re-run PageSpeed test in 2-3 hours for updated scores.

### 23. Branch Locator with Leaflet Map (ADDED 2026-09-07)
- **Feature:** Added a Branch Locator section on the home page with a scrollable Leaflet map showing all Mineazy branches across Zimbabwe.
- **Dependencies added:** `leaflet@1.9.4`, `react-leaflet@4.2.1` (React 18 compatible)
- **Files:**
  - `frontend/src/components/Home/BranchLocator.jsx` — Leaflet map component with branch markers, fly-to on click, scrollable sidebar list
  - `frontend/src/pages/Home.jsx` — imports and renders BranchLocator between TrustedPartners and About sections
  - `frontend/src/components/Header/Header.jsx` — "Branches" nav link added to navigation array with smooth-scroll on home page
- **Branch GPS coordinates (13 branches):**
  | Branch | Latitude | Longitude |
  |---|---|---|
  | Belmont | -20.17246 | 28.57521 |
  | Tongogara | -20.150342 | 28.589757 |
  | Junkshop | -20.148579 | 28.58701 |
  | Maphisa | -21.064779 | 28.458567 |
  | Esigodini 2 | -20.293167 | 28.938451 |
  | Habane | -20.3123 | 28.942574 |
  | Mthwakazi | -20.545458 | 29.276163 |
  | Mswela | -20.533696 | 29.288926 |
  | Filabusi Mainshop | -20.526441 | 29.298054 |
  | Gwanda VID | -20.937838 | 29.009163 |
  | Thobelani | -20.943136 | 29.00573 |
  | Gweru MMS | -19.446757 | 29.814204 |
  | Gweru EazyTools | -19.448399 | 29.810319 |
- **Nav link:** "Branches" in Header.jsx navigation, smooth-scrolls to `#branch-locator` on home page, navigates to `/#branch-locator` from other pages
- **Stats update:** Hero section branch count updated from "8" to "13"
- **Note:** `Navigation.jsx` component exists but is NOT used — Header.jsx has its own inline navigation array

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
- `https://mineazy.co.zw/admin/` — admin panel (login: admin@mineazy.co.zw)

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

### Deploy Frontend Build
```bash
# Deploy to all 3 locations
scp -o StrictHostKeyChecking=no -P 37980 -r <frontend_build_dir>/* npivfupq@mineazy.co.zw:~/frontend/build/
scp -o StrictHostKeyChecking=no -P 37980 -r <frontend_build_dir>/* npivfupq@mineazy.co.zw:~/shop/frontend_build/
# Deploy index.html and static/ to public_html
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "rm -rf ~/public_html/static && cp -r ~/frontend/build/static ~/public_html/static && cp ~/frontend/build/index.html ~/public_html/index.html"
```

### Deploy .htaccess (shop)
```bash
scp -o StrictHostKeyChecking=no -P 37980 .htaccess npivfupq@mineazy.co.zw:~/shop/.htaccess
```

### Deploy server.js
```bash
scp -o StrictHostKeyChecking=no -P 37980 server.js npivfupq@mineazy.co.zw:~/shop/server.js
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "touch ~/shop/tmp/restart.txt"
```

### Restart App (when Passenger manages it)
```bash
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "touch ~/shop/tmp/restart.txt"
```

### Manual Start/Recovery (FALLBACK ONLY — normal operation is Passenger-managed)
```bash
# Start Node.js manually
ssh -o StrictHostKeyChecking=no -p 37980 npivfupq@mineazy.co.zw "cd ~/shop && nohup ~/nodevenv/shop/20/bin/node server.js >> ~/shop/server.log 2>> ~/shop/stderr.log &"
```
Then deploy the proxy `.htaccess` (`~/public_html/.htaccess.proxy-workaround.bak`) to route traffic to the manual process. Remember this masks Passenger (see #9/#10).

### Restore Passenger (only if it stops managing the app)
1. cPanel → Setup Node.js Application → find `/home9/npivfupq/shop/`
2. Click Start Application (or Edit → Save)
3. Ensure `~/public_html/.htaccess` contains ONLY the Passenger block + PHP exclusion (no proxy rules)
