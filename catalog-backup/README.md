# Off-host catalog backup

Public GitHub raw JSON used to hydrate an empty GoDaddy `/local` catalog **without** `ALLOW_FACTORY_SEED` and **without** a GitHub token.

Default read URL (when `CATALOG_BACKUP_URL` is unset):

`https://raw.githubusercontent.com/Yunusbashashaik/Global_Store-Kuwait/main/catalog-backup/admin-state.json`

`admin-state.json` and `admin-state.backup.json` are generated from `DEFAULT_SERVICES` plus default settings (including `offerType` / `offerExpiresAt`). Production still never inserts factory rows in process; it only restores this committed snapshot when the live table is empty.

When `GITHUB_TOKEN` / `GH_TOKEN` / `CATALOG_BACKUP_TOKEN` is set, the app can also push **custom** admin catalogs here via the GitHub Contents API. Factory/default catalogs are not pushed over a custom remote backup.
