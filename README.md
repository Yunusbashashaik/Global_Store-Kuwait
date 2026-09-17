---
published: false
---

# Global-Stores

> **GitHub Pages preview:** [https://yunusbashashaik.github.io/Global_Store-Kuwait/](https://yunusbashashaik.github.io/Global_Store-Kuwait/)  
> Do **not** use `yunusbashashaik.github.io` alone. Live store + Admin = **GoDaddy Node** from branch **`main`**.

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

### Dynamic database

Admin catalog, settings, and complaints persist in a **durable data directory outside the app package** (prefer `DATA_DIR` / `DATABASE_PATH`). Typical GoDaddy path: `~/global-store-kuwait-data` or `/local/global-store-kuwait-data` — never `/app/server/data`. Legacy `server/data` is copied once on first boot. Public pages load live data via `GET /api/services` and `GET /api/settings`. Production never inserts factory `DEFAULT_SERVICES`. Local demo first boot uses `ALLOW_FACTORY_SEED=1` only.

Optional env:

- `DATA_DIR` — durable folder for SQLite/JSON + uploads + `admin-state.json` + `admin-state.backup.json`
- `DATABASE_PATH` — custom SQLite file path
- `ADMIN_USERNAME` (default: `admin`)
- `ADMIN_PASSWORD` (default: `Wz%861?01`)
- `ADMIN_SESSION_SECRET` — signs admin session tokens
- `GITHUB_TOKEN` / `GH_TOKEN` / `CATALOG_BACKUP_TOKEN` — **set on GoDaddy** (Contents read/write) so each admin save updates `catalog-backup/admin-state.json` in this repo and boot can auto-restore after a host wipe
- `CATALOG_BACKUP_URL` — optional raw HTTPS JSON URL used to fetch a backup if the GitHub token is not set
- `CATALOG_BACKUP_REPO` / `CATALOG_BACKUP_PATH` / `CATALOG_BACKUP_BRANCH` — optional overrides (defaults: this repo, `catalog-backup/admin-state.json`, `main`)
- `ALLOW_FACTORY_SEED` — **never set on GoDaddy**. Local/dev first-time demo only (`ALLOW_FACTORY_SEED=1`, and never with `NODE_ENV=production`)

### Catalog survival (GoDaddy)

GoDaddy can empty `/local`. This app does not stop that recycle. It **auto-restores** the custom catalog:

1. Every admin persist writes `admin-state.json` and `admin-state.backup.json` to every writable durable dir (`/local`, `/root`, `$HOME`, `DATA_DIR`, …).
2. The same payload is pushed to GitHub `catalog-backup/admin-state.json` (and `.backup.json`) when a token is set.
3. On boot, **before any seed decision**, an empty or factory live table is hydrated from local replicas, then from GitHub or `CATALOG_BACKUP_URL`. Custom names return without a human import.

`GET /api/health` after a recycle should show `factorySeedDisabled: true`, `catalogSeededThisBoot: false`, `offHostBackupConfigured: true`, `offHostBackupRestoredThisBoot: true` when the GitHub/URL copy was used, and `catalogMatchesDefaults: false`.

Admin dashboard: **Download catalog backup** / **Restore catalog backup** (`GET`/`POST /api/admin/catalog-backup`).

### Admin panel

Click the **Admin** icon in the header. A modal prompts for credentials, then opens the Admin Dashboard:

- **Add Services** — JPEG image, name, EN/AR descriptions, 1-month and 1-year prices
- **Edit Services** — dropdown for Services, Complaint Email ID, Contact Details (WhatsApp), and About Us / social links
- **Download / Restore catalog backup** — `admin-state.json` export/import after a host wipe

Default credentials: `admin` / `Wz%861?01` (override with `ADMIN_USERNAME` / `ADMIN_PASSWORD`).

Out-of-stock services use price `0`, show an **Out of Stock** note, and disable Add to Cart.

### Deploy on GoDaddy (Node.js)

This is the real website. Always deploy branch **`main`**. GitHub Pages is only a static preview and is not required for GoDaddy.

1. Setup → Application Manager → Register Application  
2. Application root = this repo folder (contains `app.js`)  
3. Application URL = your domain **root**  
4. Application startup file: `app.js`  
5. Node.js version: 20+  
6. In the app directory:
   ```bash
   git pull origin main
   npm install
   npm run build
   ```
7. Restart the application  
8. Visit `https://YOUR-DOMAIN/api/health` — you must see JSON `ok: true`

`npm run build` then `npm start` (or Passenger) serves `client/dist` and `/api`. Admin catalog lives in the durable data directory and survives Restart Published App.

Do **not** FTP only `client/dist` into `public_html`. That is static hosting and `/api/health` will 404.

If Apache serves static files and Node is on port 3001, copy `deploy/godaddy.htaccess` to `public_html/.htaccess` (requires `mod_proxy`).

If the website and API use different URLs, edit `client/public/runtime-config.js` after build:

```js
window.__GLOBALSTORE_CONFIG__ = { apiUrl: "https://your-node-api-url" };
```

### Catalog

Public services come from the **live API/database**. `shared/defaultServices.js` is **not** inserted on GoDaddy. Confirm `/api/health` has `factorySeedDisabled: true`, `catalogSeededThisBoot: false`, and after auto-restore `offHostBackupRestoredThisBoot: true` with custom names (`catalogMatchesDefaults: false`).

Optional Eid / Special offers with an expiry datetime hide that one service from the public catalog when time is up; Admin can still see it.

### Complaint email

Complaints are sent by **email only** (not WhatsApp). The destination address is stored in the database (default `global2stor2@gmail.com`) and can be changed from the admin panel.

- **Static hosting (GitHub Pages):** FormSubmit classic multipart POST fallback
- **Node API + SMTP:** screenshot embedded + attached

Optional env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `COMPLAINT_EMAIL` / `VITE_COMPLAINT_EMAIL`

See `Tech. Document` for full product requirements.

## Deployment (GitHub Pages preview)

Pushes to **`main`** run [`.github/workflows/deploy-pages-actions.yml`](.github/workflows/deploy-pages-actions.yml). There is no `gh-pages` deploy.

1. Open **https://github.com/Yunusbashashaik/Global_Store-Kuwait/settings/pages**
2. **Source:** GitHub Actions → Save
3. Open **https://yunusbashashaik.github.io/Global_Store-Kuwait/**

The live catalog, Admin, and complaints need **GoDaddy Node** (`git pull origin main`, then `npm run build && npm start`).
