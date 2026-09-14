import { RETIRED_FACTORY_SERVICE_IDS } from "../config/defaultServices.js";
import { deleteService, listServices } from "../models/Service.js";
import { removeServiceImage } from "../services/serviceImages.js";

const RETIRED = new Set(RETIRED_FACTORY_SERVICE_IDS);
/** Full leftover factory snapshots only — not a store owner re-adding a handful of the same products. */
const FACTORY_DUMP_MIN = 20;

export function serviceRecordId(item) {
  return item?.id || "";
}

export function isRetiredFactoryServiceId(id) {
  return RETIRED.has(String(id || ""));
}

export function isFactoryCatalogDump(services) {
  if (!Array.isArray(services) || !services.length) return false;
  const hits = services.filter((item) => isRetiredFactoryServiceId(serviceRecordId(item))).length;
  return hits >= FACTORY_DUMP_MIN;
}

export function filterFactoryDumpServices(services) {
  if (!Array.isArray(services)) return [];
  if (!isFactoryCatalogDump(services)) return services;
  return services.filter((item) => !isRetiredFactoryServiceId(serviceRecordId(item)));
}

export function purgeFactoryCatalogIfPresent() {
  const live = listServices();
  if (!isFactoryCatalogDump(live)) return 0;
  let removed = 0;
  for (const service of live) {
    if (!isRetiredFactoryServiceId(service.id)) continue;
    deleteService(service.id);
    removeServiceImage(service.id);
    removed += 1;
  }
  return removed;
}
