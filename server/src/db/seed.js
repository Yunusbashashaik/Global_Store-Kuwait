import { DEFAULT_SERVICES } from "../config/defaultServices.js";
import {
  bindPersist,
  findPriorCatalogEvidence,
  hydratePersistedAdminState,
  persistAdminState,
  withoutPersist,
} from "./persist.js";
import {
  countServices,
  insertService,
  listServices,
  replaceAllServices,
} from "../models/Service.js";
import {
  countSettings,
  getAllSettings,
  getSetting,
  replaceAllSettings,
  seedSettingsIfEmpty,
  setSetting,
} from "../models/Settings.js";
import {
  persistServiceImageFiles,
  restoreServiceImageFiles,
} from "../services/serviceImages.js";

/**
 * Production boot (app.js → index.js):
 * 1. initDatabase() resolves DATA_DIR (env / /local / /root / $HOME), copies the
 *    best snapshot/store into the active dir, then opens SQLite/JSON.
 * 2. seed.js bindPersist runs at import time.
 * 3. seedDatabase(): hydrate from the best snapshot (offers included), then
 *    factory-insert DEFAULT_SERVICES only on true first boot.
 * 4. persistAdminState() replicates to every writable durable dir and will not
 *    overwrite a non-default admin-state.json with factory/empty rows.
 *
 * Wiped /local + surviving /root or $HOME custom snapshot:
 * recover copies it → hydrate restores names/prices/offers → seed is skipped
 * (catalogSeededThisBoot=false) → persist refreshes replicas from the restored catalog.
 */
function persistImages() {
  try {
    restoreServiceImageFiles(listServices());
    persistServiceImageFiles(listServices());
  } catch (err) {
    console.error("Service image persist failed:", err?.message || err);
  }
}

bindPersist({
  listServices,
  getAllSettings,
  getSetting,
  countSettings,
  countServices,
  replaceAllServices,
  replaceAllSettings,
  persistImages,
});

let lastSeedResult = {
  servicesSeeded: false,
  settingsSeeded: false,
  catalogSeededThisBoot: false,
  seedBlockedReason: null,
  hydrated: { restored: false },
  priorCatalog: { detected: false },
};

export function getLastSeedResult() {
  return lastSeedResult;
}

function seedDefaultCatalogIfEmpty() {
  if (countServices() > 0) {
    setSetting("catalogSeeded", true);
    return { seeded: false, reason: "live-catalog-present" };
  }

  if (getSetting("catalogSeeded") === true) {
    return { seeded: false, reason: "catalog-already-seeded" };
  }

  const prior = findPriorCatalogEvidence();
  if (prior.customCatalog) {
    console.error(
      `Refusing to seed factory catalog; custom snapshot still exists at ${prior.customSnapshotPath}`,
    );
    return { seeded: false, reason: "custom-snapshot-exists", prior };
  }
  if (prior.detected) {
    console.error(
      "Refusing to seed factory catalog; a prior admin snapshot or catalogSeeded flag still exists.",
    );
    return { seeded: false, reason: "prior-catalog-exists", prior };
  }

  withoutPersist(() => {
    DEFAULT_SERVICES.forEach((service, index) => {
      insertService(
        {
          ...service,
          imageUrl: service.imageUrl || null,
          sortOrder: service.sortOrder ?? index,
        },
        { persist: false },
      );
    });
  });
  setSetting("catalogSeeded", true);
  return { seeded: true, reason: "true-first-boot", prior };
}

export function seedDatabase() {
  const settingsSeeded = withoutPersist(() => seedSettingsIfEmpty());
  const hydrated = hydratePersistedAdminState();
  const seed = seedDefaultCatalogIfEmpty();
  const liveCount = countServices();
  if (liveCount > 0) {
    persistAdminState();
  }

  lastSeedResult = {
    servicesSeeded: seed.seeded,
    settingsSeeded,
    catalogSeededThisBoot: seed.seeded,
    seedBlockedReason: seed.seeded ? null : seed.reason,
    hydrated,
    priorCatalog: seed.prior || findPriorCatalogEvidence(),
  };
  return lastSeedResult;
}
