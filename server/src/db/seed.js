import { DEFAULT_SERVICES } from "../config/defaultServices.js";
import {
  bindPersist,
  findCustomAdminSnapshot,
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
  hydrated: { restored: false },
};

export function getLastSeedResult() {
  return lastSeedResult;
}

function seedDefaultCatalogIfEmpty() {
  if (countServices() > 0) {
    setSetting("catalogSeeded", true);
    return false;
  }

  if (getSetting("catalogSeeded") === true) {
    return false;
  }

  const customSnapshot = findCustomAdminSnapshot();
  if (customSnapshot) {
    console.error(
      `Refusing to seed factory catalog; custom snapshot still exists at ${customSnapshot.path}`,
    );
    return false;
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
  return true;
}

export function seedDatabase() {
  const settingsSeeded = withoutPersist(() => seedSettingsIfEmpty());
  const hydrated = hydratePersistedAdminState();
  const servicesSeeded = seedDefaultCatalogIfEmpty();
  persistAdminState();

  lastSeedResult = {
    servicesSeeded,
    settingsSeeded,
    catalogSeededThisBoot: servicesSeeded,
    hydrated,
  };
  return lastSeedResult;
}
