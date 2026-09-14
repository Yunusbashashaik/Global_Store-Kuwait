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

`npm run build` then `npm start` (or Passenger) serves `client/dist` and `/api`. The hardcoded catalog is loaded from Git on every start.

Do **not** FTP only `client/dist` into `public_html`. That is static hosting and `/api/health` will 404.

If Apache serves static files and Node is on port 3001, copy `deploy/godaddy.htaccess` to `public_html/.htaccess` (requires `mod_proxy`).

If the website and API use different URLs, edit `client/public/runtime-config.js` after build:

```js
window.__GLOBALSTORE_CONFIG__ = { apiUrl: "https://your-node-api-url" };
```

### Catalog (hardcoded in Git)

Edit **`shared/defaultServices.js`** and put JPEGs in **`client/public/service-images/{id}.jpg`**. Commit and deploy. That catalog ships with the code, so it **does not vanish** on GoDaddy the way Admin-only database rows did.

The storefront catalog is the 42 services in that file. JSON dumps under `godaddy-sync/` and `server/data/` are not imported as services.

Admin can still change complaint email / WhatsApp / About Us. Do not use Admin to add the public catalog if you want it to survive every publish.

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
