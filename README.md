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

Admin catalog, settings, and complaints persist in a **durable data directory outside the app package** (prefer `DATA_DIR` / `DATABASE_PATH`). Typical GoDaddy path: `~/global-store-kuwait-data` or `/local/global-store-kuwait-data` — never `/app/server/data`. Legacy `server/data` is copied once on first boot. Public pages load live data via `GET /api/services` and `GET /api/settings`. Factory services seed **once** into an empty store; later Restart Published App does not overwrite admin names, prices, images, or extra services.

Optional env:

- `DATA_DIR` — durable folder for SQLite/JSON + uploads + `admin-state.json`
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

Public services come from the **live API/database**. `shared/defaultServices.js` (plus JPEGs in `client/public/service-images/`) is used **only** to seed an empty durable store the first time. Admin Add/Edit is the source of truth after that. Confirm `/api/health` has `dataDirInsideApp: false` and `catalogSeededThisBoot: false` on later restarts.

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
