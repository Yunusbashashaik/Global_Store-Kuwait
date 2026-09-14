---
published: false
---

# Global-Stores

> **Open the website (iPad / phone):** [https://yunusbashashaik.github.io/Global-Stores/](https://yunusbashashaik.github.io/Global-Stores/)  
> Do **not** use `yunusbashashaik.github.io` alone — that is not your store URL.

GlobalStore.com — bilingual digital subscription marketplace for Kuwait (KWD).

## Development

Requirements: Node.js 20+.

```bash
npm install
npm run dev
```

- **Client:** http://localhost:5173 (Vite dev server; proxies `/api` to the backend)
- **API:** http://localhost:3001 (`GET /api/health`, `GET /api/services`, `GET /api/settings`, `POST /api/complaints`, `POST /api/admin/login`)

```bash
npm run lint
npm run test
npm run build
npm start   # serves built client + API on port 3001
```

### Dynamic database (SQLite)

Admin edits and public catalog/settings are stored in **`server/data/globalstore.db`** (not GitHub-tracked static files). Every visitor hitting the Node API sees the same live data.

Optional env:

- `DATABASE_PATH` — custom SQLite file path
- `ADMIN_USERNAME` (default: `admin`)
- `ADMIN_PASSWORD` (default: `Wz%861?01`)
- `ADMIN_SESSION_SECRET` — signs admin session tokens

### Admin panel

Click the **Admin** icon in the header. A modal prompts for credentials, then opens the Admin Dashboard:

- **Add Services** — JPEG image, name, EN/AR descriptions, 1-month and 1-year prices
- **Edit Services** — dropdown for Services, Complaint Email ID, Contact Details (WhatsApp), and About Us / social links

Default credentials: `admin` / `Wz%861?01` (override with `ADMIN_USERNAME` / `ADMIN_PASSWORD`).

Out-of-stock services use price `0`, show an **Out of Stock** note, and disable Add to Cart.

### Deploy on GoDaddy (Node.js)

Admin login needs a **running Node app**. If `https://YOUR-DOMAIN/api/health` does not return `{"ok":true}`, login cannot work.

**cPanel Application Manager (Passenger)**

1. Setup → Application Manager → Register Application  
2. Application root = this repo folder  
3. Application URL = your domain (or subdomain) **root**, not a `/public_html` static copy  
4. Application startup file: `app.js`  
5. Node.js version: 20+  
6. In the app directory:
   ```bash
   npm install
   npm run build
   ```
7. Restart the application  
8. Visit `https://YOUR-DOMAIN/api/health` — you must see JSON `ok: true`  
9. Then sign in with `admin` / `Wz%861?01`

Do **not** FTP only `client/dist` into `public_html`. That is static hosting and `/api/health` will 404.

If Apache serves static files and Node is on port 3001, copy `deploy/godaddy.htaccess` to `public_html/.htaccess` (requires `mod_proxy`).

If the website and API use different URLs, edit `client/public/runtime-config.js` after build:

```js
window.__GLOBALSTORE_CONFIG__ = { apiUrl: "https://your-node-api-url" };
```

**`server/data` is not in the GitHub zip.** Git ignores the database files. cPanel File Manager also usually opens `public_html`, which is not the Node app folder. The live files appear only after Node starts, next to `app.js` → `server/data/` (`globalstore.db` and/or `globalstore.json`).

1. Open `https://YOUR-DOMAIN/api/health`.
2. Use `dataDir`, `dbFile`, and `jsonFile` in that JSON — that is the real path on disk.
3. In File Manager go to **Application Manager → Application root** (the folder that contains `app.js`), then `server/data`. Turn on **Show Hidden Files**.
4. If `/api/health` 404s, you are looking at static hosting. There will be no `server/data` under `public_html` until Node is the app that serves the domain.

Keep that folder when you upload a new release. Replacing it (or uploading only `client/dist`) wipes Admin-added services.

The storefront ships with an **empty catalog**. Add services one by one in Admin after publish. There is no baked-in Netflix/Prime/etc. list. Leftover **full** factory dumps are not re-imported. Services you add in Admin (including Netflix-named products) are marked `origin: "live"` and restored on restart.

Admin adds/edits are written to **both** `server/data/globalstore.db` (or the JSON fallback) **and** `server/data/globalstore.json`. That backup includes services you added (prices, names, descriptions, images, stock), complaint email, WhatsApp/contact numbers, About Us, and social links. On every app start the server restores **your** backup — not the old factory catalog. A restart will not overwrite a non-empty backup with an empty database.

The public homepage also keeps the last live catalog in the browser (`localStorage` key `globalstores_services_v3`).

### Admin backup folder (`godaddy-sync/`)

Every admin create/edit/delete of a service (and settings saves) writes a copy into **`godaddy-sync/`** for manual backup before you copy a GitHub release onto GoDaddy:

- `godaddy-sync/latest-catalog.json`
- `godaddy-sync/latest-settings.json`
- `godaddy-sync/admin-uploads/services/` (uploaded JPEGs)
- `godaddy-sync/changelog.jsonl`

Those runtime files are gitignored. Copy the folder off-box, then restore images into `server/data/uploads/services/` on the server. See `godaddy-sync/README.md`. Optional env: `GODADDY_SYNC_DIR`.

### Complaint email

Complaints are sent by **email only** (not WhatsApp). The destination address is stored in the database (default `global2stor2@gmail.com`) and can be changed from the admin panel.

- **Static hosting (GitHub Pages):** FormSubmit classic multipart POST fallback
- **Node API + SMTP:** screenshot embedded + attached

Optional env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `COMPLAINT_EMAIL` / `VITE_COMPLAINT_EMAIL`

See `Tech. Document` for full product requirements.

## Deployment (GitHub Pages) — free account OK

You **do not need a paid GitHub plan** for a **public** repository. GitHub Pages is included on free accounts. This repo is public.

Pushes to **`main`** run [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), which builds the site and pushes it to the root of the **`gh-pages`** branch.

### One-time setup (iPhone, iPad, or computer)

1. Open **https://github.com/Yunusbashashaik/Global-Stores/settings/pages**
2. Under **Build and deployment** → **Source**, choose **Deploy from a branch**
3. **Branch:** `gh-pages` · **Folder:** `/ (root)` · **Save**
4. Wait 1–2 minutes, then open on your iPad:

   **https://yunusbashashaik.github.io/Global-Stores/**

If the workflow has not run yet, go to **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

The homepage uses built-in catalog data if the API is unavailable. **Admin**, **live price/settings edits**, and **complaint email via SMTP** need the Node server (`npm start` on a host such as Render or GoDaddy Node). Point that host at a persistent disk so `server/data/globalstore.db` survives restarts.
