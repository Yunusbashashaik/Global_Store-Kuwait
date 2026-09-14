# GitHub Pages vs GoDaddy

Code lives on **`main` only**. There is no `gh-pages` deploy.

## GitHub Pages (static preview)

URL: **https://yunusbashashaik.github.io/Global_Store-Kuwait/**

Do not open `https://yunusbashashaik.github.io/` — that is not this repo.

1. Open **https://github.com/Yunusbashashaik/Global_Store-Kuwait/settings/pages**
2. **Build and deployment** → **Source:** **GitHub Actions** (not “Deploy from a branch”)
3. Save
4. Push to **`main`** (or Actions → **Deploy Pages from main** → Run workflow)
5. Open the URL above

Pages is a **static** copy of the catalog in Git. It has no Node `/api`. Admin login and complaint SMTP need GoDaddy (or any Node host).

## GoDaddy (Node.js) — this is the live store

Use **`main`**. Node builds the site at `/` and serves the API.

1. Application Manager → Register Application  
2. Application root = this repo folder (the folder that contains `app.js`)  
3. Application URL = your domain root (not a static `public_html` copy of `client/dist`)  
4. Startup file: **`app.js`**  
5. Node 20+  
6. In that folder:
   ```bash
   git pull origin main
   npm install
   npm run build
   ```
7. Restart the application  
8. Check `https://YOUR-DOMAIN/api/health` — must show `"ok": true`

`npm run build` uses base `/` so it matches a real domain. Do **not** set `VITE_BASE_PATH=/Global_Store-Kuwait/` on GoDaddy.

The 42 services and photos are in `shared/defaultServices.js` and `client/public/service-images/`. Every `npm start` / Passenger start loads them from that code, so they do not vanish.

To update services later: change those files on **`main`**, pull on GoDaddy, `npm run build`, restart.
