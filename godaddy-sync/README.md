# GoDaddy manual sync (admin uploads)

Admin add/edit writes a copy of the live catalog, site settings, and newly uploaded service images into this folder so you can back them up **before** copying the GitHub release onto GoDaddy.

Runtime files in this folder are **not** committed (see `.gitignore`). GitHub code deploys do not include `server/data/` SQLite or uploads.

## What lands here

| Path | Contents |
|------|----------|
| `latest-catalog.json` | Full services snapshot after each admin create/update/delete |
| `latest-settings.json` | Complaint email, WhatsApp numbers, About Us, social links |
| `admin-uploads/services/` | JPEG copies of images attached when adding or editing a service |
| `changelog.jsonl` | One JSON line per admin change (timestamp + copied files) |

Override the folder with `GODADDY_SYNC_DIR` if you want it outside the repo.

## Copy to GoDaddy

1. Keep a local/zip backup of this `godaddy-sync/` folder after admin edits.
2. Deploy the GitHub code (`npm run build && npm start` on the Node app).
3. Restore live data from the backup:
   - Copy `admin-uploads/services/*` → `server/data/uploads/services/`
   - Keep `server/data/globalstore.db` on the server (do not overwrite it with an empty Git checkout)
4. Restart the Node application.

If the GoDaddy site is a fresh install with an empty database, import `latest-catalog.json` / `latest-settings.json` only when that snapshot is **your** admin-added catalog. A live snapshot includes `"origin": "live"`. Delete any old factory dump (the full Netflix/Prime list with no live origin) so those rows cannot come back. Do not replace a healthy production database blindly. After you add services in Admin, do not copy a Git checkout over `server/data/` — that is why the homepage goes empty again.
