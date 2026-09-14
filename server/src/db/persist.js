import { getDb, getDbEngine } from "./connection.js";
import { readDurableCatalog, writeDurableCatalog } from "./durableStore.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";
import { listServices, updateService } from "../models/Service.js";
import { getAllSettings } from "../models/Settings.js";
import {
  persistServiceImageFiles,
  restoreServiceImageFiles,
} from "../services/serviceImages.js";

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

export function persistLiveCatalog() {
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
    writeDurableCatalog({
      services: rows,
      settings: rawSettingsFromDb(),
    });
  } catch (err) {
    console.error("Durable catalog write failed:", err);
  }
}

function stable(value) {
  return JSON.stringify(value ?? null);
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
