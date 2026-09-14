import { getDb, getDbEngine } from "./connection.js";
import { readDurableCatalog, writeDurableCatalog } from "./durableStore.js";
import { DEFAULT_SERVICES } from "../config/defaultServices.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";
import {
  insertService,
  listServices,
  updateService,
} from "../models/Service.js";
import { getAllSettings } from "../models/Settings.js";
import {
  persistServiceImageFiles,
  restoreServiceImageFiles,
} from "../services/serviceImages.js";
import { filterFactoryDumpServices } from "./factoryCatalog.js";

function rowToPatch(item) {
  if (item.prices && item.nameEn) {
    return {
      id: item.id,
      icon: item.icon,
      accent: item.accent,
      typeEn: item.typeEn,
      typeAr: item.typeAr,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      descriptionEn: item.descriptionEn,
      descriptionAr: item.descriptionAr,
      prices: item.prices,
      imageUrl: item.imageUrl,
      imageData: item.imageData || null,
      outOfStock: item.outOfStock,
      sortOrder: item.sortOrder,
    };
  }
  const outOfStock = Boolean(item.out_of_stock);
  return {
    id: item.id,
    icon: item.icon,
    accent: item.accent,
    typeEn: item.type_en,
    typeAr: item.type_ar,
    nameEn: item.name_en,
    nameAr: item.name_ar,
    descriptionEn: item.description_en,
    descriptionAr: item.description_ar,
    prices: {
      month: outOfStock ? 0 : Number(item.price_month),
      year: outOfStock ? 0 : Number(item.price_year),
    },
    imageUrl: item.image_url || null,
    imageData: item.image_data || item.imageData || null,
    outOfStock,
    sortOrder: item.sort_order,
  };
}

function rawSettingsFromDb() {
  try {
    const rows = getDb().prepare("SELECT key, value FROM settings").all();
    return Object.fromEntries((rows || []).map((row) => [row.key, row.value]));
  } catch {
    return {};
  }
}

function rewriteRestoredImageUrls(services) {
  const restored = restoreServiceImageFiles(services);
  restored.forEach((service) => {
    const live = services.find((item) => item.id === service.id);
    const patch = {};
    if (service.imageUrl && service.imageUrl !== live?.imageUrl) {
      patch.imageUrl = service.imageUrl;
    }
    if (service.imageData && service.imageData !== live?.imageData) {
      patch.imageData = service.imageData;
    }
    if (Object.keys(patch).length) updateService(service.id, patch);
  });
}

export function persistLiveCatalog({ allowEmpty = false } = {}) {
  try {
    persistServiceImageFiles(listServices());
    listServices().forEach((service) => {
      if (!service.imageData) return;
      const row = getDb().prepare("SELECT * FROM services WHERE id = ?").get(service.id);
      if (!row?.image_data) {
        updateService(service.id, { imageData: service.imageData });
      }
    });
    const rows = getDb().prepare("SELECT * FROM services").all();
    if (!rows.length && !allowEmpty) {
      const existing = readDurableCatalog();
      if (existing?.services?.length) {
        console.warn(
          "[globalstore] skip persisting empty catalog over existing backup",
        );
        return;
      }
    }
    writeDurableCatalog({
      origin: "live",
      services: rows,
      settings: rawSettingsFromDb(),
    });
  } catch (err) {
    console.error("Durable catalog write failed:", err);
  }
}

function stamp(value) {
  const t = Date.parse(String(value || "").replace(" ", "T"));
  return Number.isFinite(t) ? t : 0;
}

function stable(value) {
  return JSON.stringify(value ?? null);
}

function serviceFingerprint(service) {
  return stable({
    nameEn: service.nameEn,
    nameAr: service.nameAr,
    descriptionEn: service.descriptionEn,
    descriptionAr: service.descriptionAr,
    typeEn: service.typeEn,
    typeAr: service.typeAr,
    imageUrl: service.imageUrl || null,
    hasImageData: Boolean(service.imageData || service.image_data),
    prices: {
      month: Number(service.prices?.month),
      year: Number(service.prices?.year),
    },
    outOfStock: Boolean(service.outOfStock),
  });
}

function isDefaultService(service) {
  const fallback = DEFAULT_SERVICES.find((item) => item.id === service.id);
  if (!fallback) return false;
  return serviceFingerprint(service) === serviceFingerprint(fallback);
}

function settingsToRaw(settings) {
  if (!settings || typeof settings !== "object") return null;
  const raw = {};
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) continue;
    raw[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return Object.keys(raw).length ? raw : null;
}

function parseSettingValue(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function settingsFingerprint(settings) {
  return stable({
    complaintEmail: settings.complaintEmail,
    whatsappNumbers: settings.whatsappNumbers,
    aboutEn: settings.aboutEn,
    aboutAr: settings.aboutAr,
    ownersEn: settings.ownersEn,
    ownersAr: settings.ownersAr,
    socialLinks: settings.socialLinks,
  });
}

function parsedSettingsFromRaw(raw) {
  if (!raw) return null;
  if (Array.isArray(raw.whatsappNumbers) || typeof raw.socialLinks === "object") {
    return raw;
  }
  return {
    complaintEmail: parseSettingValue(raw.complaintEmail),
    whatsappNumbers: parseSettingValue(raw.whatsappNumbers),
    aboutEn: parseSettingValue(raw.aboutEn),
    aboutAr: parseSettingValue(raw.aboutAr),
    ownersEn: parseSettingValue(raw.ownersEn),
    ownersAr: parseSettingValue(raw.ownersAr),
    socialLinks: parseSettingValue(raw.socialLinks),
  };
}

function isDefaultSettings(settings) {
  if (!settings) return true;
  return settingsFingerprint(settings) === settingsFingerprint(DEFAULT_SETTINGS);
}

function restoreSettings(settings) {
  const raw = settingsToRaw(settings);
  if (!raw) return false;
  const db = getDb();
  for (const [key, value] of Object.entries(raw)) {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(key, value);
  }
  return true;
}

function shouldPreferBackup({ liveDefault, backupDefault, liveStamp, backupStamp, contentDiffers }) {
  if (!contentDiffers) return false;
  if (liveDefault && !backupDefault) return true;
  if (!liveDefault && backupDefault) return false;
  if (backupStamp && liveStamp) return backupStamp >= liveStamp;
  return true;
}

export function restoreCatalogFromBackup() {
  const live = listServices();
  const backup = readDurableCatalog({
    skipActiveJson: getDbEngine() === "json" && live.length > 0,
  });
  if (!backup?.services?.length && !backup?.settings) {
    rewriteRestoredImageUrls(listServices());
    persistServiceImageFiles(listServices());
    return false;
  }

  let changed = false;

  const incoming =
    backup.origin === "live"
      ? backup.services
      : filterFactoryDumpServices(backup.services);
  if (incoming.length) {
    if (live.length === 0) {
      incoming.forEach((item, index) => {
        const patch = rowToPatch(item);
        insertService({
          ...patch,
          sortOrder: patch.sortOrder ?? index,
        });
      });
      changed = true;
    } else {
      const byId = new Map(live.map((service) => [service.id, service]));
      incoming.forEach((item) => {
        const patch = rowToPatch(item);
        if (!patch.id) return;
        const current = byId.get(patch.id);
        if (!current) {
          insertService(patch);
          changed = true;
          return;
        }
        const contentDiffers = serviceFingerprint(current) !== serviceFingerprint(patch);
        if (
          shouldPreferBackup({
            liveDefault: isDefaultService(current),
            backupDefault: isDefaultService(patch),
            liveStamp: stamp(current.updatedAt),
            backupStamp: stamp(item.updated_at || item.updatedAt),
            contentDiffers,
          })
        ) {
          updateService(patch.id, patch);
          changed = true;
        }
      });
    }
  }

  if (backup.settings) {
    const liveSettings = getAllSettings();
    const backupSettings = parsedSettingsFromRaw(backup.settings);
    if (
      shouldPreferBackup({
        liveDefault: isDefaultSettings(liveSettings),
        backupDefault: isDefaultSettings(backupSettings),
        liveStamp: 0,
        backupStamp: backup.stamp || 1,
        contentDiffers:
          settingsFingerprint(liveSettings) !== settingsFingerprint(backupSettings),
      })
    ) {
      restoreSettings(backup.settings);
      changed = true;
    }
  }

  rewriteRestoredImageUrls(listServices());
  persistServiceImageFiles(listServices());

  return changed;
}
