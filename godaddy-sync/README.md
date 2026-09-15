# GoDaddy notes

Live catalog and settings belong in a **durable data directory outside `/app`** (`DATA_DIR`, typically `global-store-kuwait-data`). Admin saves write `admin-state.json` with fsync.

This folder may still receive `latest-settings.json` when Admin saves contact / About Us settings. Do not copy old `latest-catalog.json` files onto the server as a replacement for the live database.
