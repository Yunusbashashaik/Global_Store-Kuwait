# Off-host catalog backup

The Node app writes `admin-state.json` here (and `admin-state.backup.json`) through the GitHub Contents API when `GITHUB_TOKEN` / `GH_TOKEN` / `CATALOG_BACKUP_TOKEN` is set on GoDaddy.

Do not commit a factory catalog into these JSON files. The running app creates and updates them after real admin saves so a wiped `/local` can auto-restore custom names, prices, and Eid/Special offers on the next boot.
