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

### Catalog (hardcoded in Git)

Edit **`shared/defaultServices.js`** and put JPEGs in **`client/public/service-images/{id}.jpg`**. Commit and deploy. That catalog ships with the code, so it **does not vanish** on GoDaddy the way Admin-only database rows did.

The storefront starts with an empty array until you add objects there. JSON dumps under `godaddy-sync/` and `server/data/` are not imported as services.

Admin can still change complaint email / WhatsApp / About Us. Do not use Admin to add the public catalog if you want it to survive every publish.

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
