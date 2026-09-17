import { DEFAULT_SERVICES } from "../config/defaultServices.js";
import { isFactorySeedAllowed, isFactorySeedDisabled } from "./factorySeed.js";
import {
  bindPersist,
  findPriorCatalogEvidence,
  hydrateFromOffHostIfNeeded,
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
import { resetOffHostBackupStatus } from "./offHostBackup.js";

/**
 * Production boot (app.js → index.js):
 * 1. initDatabase() resolves DATA_DIR, copies the best local snapshot/store.
 * 2. hydrate from local admin-state.json / admin-state.backup.json replicas.
 * 3. If still empty or factory-default, auto-restore from off-host GitHub/URL backup.
 * 4. NEVER insert DEFAULT_SERVICES in production. ALLOW_FACTORY_SEED=1 is local/demo only.
 * 5. persistAdminState() writes admin-state.json + admin-state.backup.json to every
 *    writable durable dir and queues an off-host GitHub update when a token is set.
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
  setSetting,
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
  factorySeedDisabled: true,
  hydrated: { restored: false },
  priorCatalog: { detected: false },
  offHost: { restored: false },
};

export function getLastSeedResult() {
  return lastSeedResult;
}

function seedDefaultCatalogIfEmpty() {
  if (countServices() > 0) {
    setSetting("catalogSeeded", true);
    return { seeded: false, reason: "live-catalog-present" };
  }

  if (!isFactorySeedAllowed()) {
    console.error(
      "Factory catalog insert is disabled (production or ALLOW_FACTORY_SEED is not 1). Leaving services empty after restore attempts.",
    );
    return { seeded: false, reason: "factory-seed-disabled" };
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

export async function seedDatabase() {
  resetOffHostBackupStatus();
  const settingsSeeded = withoutPersist(() => seedSettingsIfEmpty());
  const hydrated = hydratePersistedAdminState();
  const offHost = await hydrateFromOffHostIfNeeded();
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
    factorySeedDisabled: isFactorySeedDisabled(),
    hydrated,
    priorCatalog: seed.prior || findPriorCatalogEvidence(),
    offHost,
  };
  return lastSeedResult;
}
