# AGENTS.md

## Cursor Cloud specific instructions

This repository implements **GlobalStore.com** from `Tech. Document` as an npm workspace (`client` + `server`).

### Services

| Service | Dev command | URL |
|---------|-------------|-----|
| Vite frontend | `npm run dev` (workspace root) | http://localhost:5173 |
| Express API | started with `npm run dev` | http://localhost:3001 (`/api/*`) |

Vite proxies `/api` to port **3001** during development. For production-style serving, run `npm run build` then `npm start` (API serves `client/dist` on port 3001).

### Standard commands (root)

- **Install:** `npm install`
- **Dev:** `npm run dev`
- **Lint:** `npm run lint`
- **Test:** `npm run test` (server API tests only)
- **Build:** `npm run build`

### Catalog

Public services come from **`shared/defaultServices.js`** (committed in Git) plus JPEGs in `client/public/service-images/`. Startup replaces the database catalog with that file. JSON backups are not re-imported as services.

### Dynamic database

Site settings (complaint email, WhatsApp numbers, About Us, social links) and complaints persist in **SQLite** at `server/data/globalstore.db` (override with `DATABASE_PATH`). Public pages load live data via `GET /api/services` and `GET /api/settings`.

### Complaint email

Local dev works without SMTP: submissions are stored in SQLite (and appended to `server/data/complaints.jsonl`) and screenshots land in `server/data/uploads/`. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (and optional `COMPLAINT_EMAIL`) for real delivery. The active inbox address is also editable in Admin → Edit Services → Complaint Email ID.

### Admin panel

Click the header Admin icon to open a **modal** (no separate `/admin` page). After login, the dashboard offers **Add Services** and **Edit Services** (Services, Complaint Email, Contact Details, About Us). Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and optionally `ADMIN_SESSION_SECRET`. Session token is stored in `localStorage` key `globalstores_admin_token`.

**GoDaddy:** Admin requires the Node process (`npm run build && npm start`). Static FTP uploads cannot serve `/api/admin/login` and will show “Load failed”. Verify `GET /api/health` on the live domain. If the API is on another host, set `apiUrl` in `client/public/runtime-config.js`.

### E2E notes

- WhatsApp buttons open `wa.me` in a new tab (external; no local WhatsApp service). Numbers come from the database settings.
- Arabic mode toggles `body.rtl` and persists language in `localStorage` key `globalstores_lang`.
- Services with price `0` / `outOfStock` show an Out of Stock badge and disable Add to Cart.
