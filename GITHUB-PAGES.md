# GitHub Pages setup (free account)

## Your store URL

### **https://yunusbashashaik.github.io/Global_Store-Kuwait/**

Do **not** open `https://yunusbashashaik.github.io/` — that is your GitHub user site, not this repo, and GitHub shows a 404.

---

## How deploy works

Pushing to **`main`** runs **Deploy to GitHub Pages**, which builds the client and publishes to the **`gh-pages`** branch.

GitHub Pages must serve **`gh-pages`**, not **`main`**. `main` is the Node source (no website `index.html` at the root), so Pages on `main` always 404s.

## One-time Pages setting

1. Open **https://github.com/Yunusbashashaik/Global_Store-Kuwait/settings/pages**
2. **Build and deployment** → **Source:** Deploy from a branch
3. **Branch:** `gh-pages` · **Folder:** `/ (root)`
4. **Save**
5. Wait 1–2 minutes, then hard-refresh:

   **https://yunusbashashaik.github.io/Global_Store-Kuwait/**

If Actions has not run yet: **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

---

## Wrong URLs

| URL | Result |
|-----|--------|
| `yunusbashashaik.github.io` | Not this project — GitHub 404 |
| `yunusbashashaik.github.io/Global-Stores/` | Old name — not this repo |
| `yunusbashashaik.github.io/Global_Store-Kuwait/` | **Correct homepage** |
