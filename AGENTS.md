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

Public services come from the **live API/database**. Production never inserts `DEFAULT_SERVICES` (`ALLOW_FACTORY_SEED=1` is local demo only). Startup hydrates from local `admin-state.json` / `admin-state.backup.json` replicas, then from the GitHub off-host backup (`catalog-backup/admin-state.json`) when the live table is empty or factory. Startup must not replace a custom catalog. JSON backups are not used to wipe services.

### Dynamic database

Site settings, catalog, and complaints persist in SQLite/JSON under **`DATA_DIR`** (prefer a folder **outside** the app package, e.g. `~/global-store-kuwait-data` or `/local/global-store-kuwait-data`; override with `DATA_DIR` / `DATABASE_PATH`). Legacy `server/data` is migrated once. Public pages load live data via `GET /api/services` and `GET /api/settings`. Health should report `dataDir`, `storePath`, `snapshotSavedAt`, `catalogSeededThisBoot`, `catalogSeeded`, `catalogEmpty`, `factorySeedDisabled`, `offHostBackupConfigured`, `offHostBackupRestoredThisBoot`, `hydrateReason`, `replicaInventory`, `catalogMatchesDefaults`, `dataDirInsideApp`. GoDaddy must set `GITHUB_TOKEN` (repo Contents write) or `CATALOG_BACKUP_URL`.

### Complaint email

Local dev works without SMTP: submissions are stored in SQLite (and appended to `server/data/complaints.jsonl`) and screenshots land in `server/data/uploads/`. Set `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (and optional `COMPLAINT_EMAIL`) for real delivery. The active inbox address is also editable in Admin → Edit Services → Complaint Email ID.

### Admin panel

Click the header Admin icon to open a **modal** (no separate `/admin` page). After login, the dashboard offers **Add Services**, **Edit Services** (Services, Complaint Email, Contact Details, About Us), and catalog backup download/restore. Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and optionally `ADMIN_SESSION_SECRET`. Session token is stored in `localStorage` key `globalstores_admin_token`.

**GoDaddy:** Deploy **`main`**. Run `npm run build && npm start` (Passenger startup file `app.js`). Static FTP of `client/dist` cannot serve `/api`. Verify `GET /api/health`. GitHub Pages is a static preview only and is not used on GoDaddy.

### E2E notes

- WhatsApp buttons open `wa.me` in a new tab (external; no local WhatsApp service). Numbers come from the database settings.
- Arabic mode toggles `body.rtl` and persists language in `localStorage` key `globalstores_lang`.
- Services with price `0` / `outOfStock` show an Out of Stock badge and disable Add to Cart.
- Optional Eid/Special offers replace the Out of Stock badge with a countdown while active; expired offer services disappear from the public catalog only.
