# Live catalog files (GoDaddy)

This folder is **created by the Node app**, not by GitHub. After the first successful `npm start` / Passenger start you should see:

| File | What it is |
|------|------------|
| `globalstore.db` | SQLite catalog (if the native module loaded) |
| `globalstore.json` | JSON backup / fallback store |
| `uploads/services/` | Uploaded service photos |

cPanel File Manager often opens **`public_html`**. That is the website folder, **not** always the Node application root. `server/data` lives next to `server/src` inside the **Application Manager root** (the folder that contains `app.js`).

1. Open `https://YOUR-DOMAIN/api/health`.
2. Copy `dataDir` / `dbFile` / `jsonFile` from that JSON.
3. In File Manager, go to **that** path (enable **Show Hidden Files**).
4. If health 404s, Node is not serving the site — this folder will never appear under `public_html` alone.

Do not delete this folder when you upload a new GitHub zip. That is how Admin-added services disappear.
