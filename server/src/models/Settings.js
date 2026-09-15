import { persistAdminState } from "../db/persist.js";
import { getDb } from "../db/connection.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";

function getRaw(key) {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : undefined;
}

function setRaw(key, value) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, typeof value === "string" ? value : JSON.stringify(value));
}

export function getSetting(key, fallback) {
  const raw = getRaw(key);
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function setSetting(key, value) {
  setRaw(key, value);
  return getSetting(key);
}

export function countSettings() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM settings").get().n;
}

export function replaceAllSettings(settings = {}) {
  for (const [key, value] of Object.entries(settings || {})) {
    if (value === undefined) continue;
    setSetting(key, value);
  }
  return getAllSettings();
}

export function getAllSettings() {
  return {
    complaintEmail: getSetting("complaintEmail", DEFAULT_SETTINGS.complaintEmail),
    whatsappNumbers: getSetting(
      "whatsappNumbers",
      DEFAULT_SETTINGS.whatsappNumbers,
    ),
    aboutEn: getSetting("aboutEn", DEFAULT_SETTINGS.aboutEn),
    aboutAr: getSetting("aboutAr", DEFAULT_SETTINGS.aboutAr),
    ownersEn: getSetting("ownersEn", DEFAULT_SETTINGS.ownersEn),
    ownersAr: getSetting("ownersAr", DEFAULT_SETTINGS.ownersAr),
    socialLinks: getSetting("socialLinks", DEFAULT_SETTINGS.socialLinks),
  };
}

export function updateSettings(patch = {}, options = {}) {
  if (typeof patch.complaintEmail === "string") {
    const email = patch.complaintEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }
    setSetting("complaintEmail", email);
  }

  if (Array.isArray(patch.whatsappNumbers)) {
    const numbers = patch.whatsappNumbers
      .map((n) => String(n).replace(/\D/g, ""))
      .filter(Boolean);
    if (!numbers.length) {
      throw new Error("At least one WhatsApp number is required");
    }
    setSetting("whatsappNumbers", numbers);
  }

  if (typeof patch.aboutEn === "string") {
    setSetting("aboutEn", patch.aboutEn);
  }
  if (typeof patch.aboutAr === "string") {
    setSetting("aboutAr", patch.aboutAr);
  }
  if (typeof patch.ownersEn === "string") {
    setSetting("ownersEn", patch.ownersEn);
  }
  if (typeof patch.ownersAr === "string") {
    setSetting("ownersAr", patch.ownersAr);
  }

  if (patch.socialLinks && typeof patch.socialLinks === "object") {
    const current = getSetting("socialLinks", DEFAULT_SETTINGS.socialLinks);
    const next = { ...current };
    for (const key of ["whatsapp", "instagram", "tiktok", "youtube", "facebook"]) {
      if (typeof patch.socialLinks[key] === "string") {
        next[key] = patch.socialLinks[key].trim();
      }
    }
    setSetting("socialLinks", next);
  }

  if (options.persist !== false) persistAdminState();
  return getAllSettings();
}

export function seedSettingsIfEmpty() {
  const count = getDb().prepare("SELECT COUNT(*) AS n FROM settings").get().n;
  if (count > 0) return false;
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    setSetting(key, value);
  }
  return true;
}
