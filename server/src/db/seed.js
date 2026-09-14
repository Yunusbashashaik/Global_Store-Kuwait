import { persistLiveCatalog, restoreCatalogFromBackup } from "./persist.js";
import { DEFAULT_SERVICES } from "../config/defaultServices.js";
import { replaceServicesFromCode } from "../models/Service.js";
import { seedSettingsIfEmpty } from "../models/Settings.js";

export function seedDatabase(services = DEFAULT_SERVICES) {
  const restored = restoreCatalogFromBackup();
  replaceServicesFromCode(services);
  const settingsSeeded = seedSettingsIfEmpty();
  persistLiveCatalog();
  return { servicesSeeded: Array.isArray(services) ? services.length : 0, settingsSeeded, restored };
}
