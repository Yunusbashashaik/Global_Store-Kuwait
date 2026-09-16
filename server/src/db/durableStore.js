import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getActiveJsonPath } from "./connection.js";

/** Unused at boot. Must not overwrite the live catalog; use persist.js replicas. */

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function getGodaddySyncDir() {
  return process.env.GODADDY_SYNC_DIR || path.join(REPO_ROOT, "godaddy-sync");
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function stampOf(services) {
  if (!Array.isArray(services) || !services.length) return 0;
  return services.reduce((max, item) => {
    const raw = item.updated_at || item.updatedAt || "";
    const t = Date.parse(String(raw).replace(" ", "T"));
    return Number.isFinite(t) && t > max ? t : max;
  }, 0);
}

function catalogFromUnknown(parsed) {
  if (!parsed) return null;
  const services = Array.isArray(parsed.services) ? parsed.services : [];
  const settings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : null;
  if (!services.length && !settings) return null;
  const exported = Date.parse(parsed.exportedAt || "") || 0;
  return {
    services,
    settings,
    stamp: Math.max(stampOf(services), exported),
    count: services.length,
  };
}

export function readDurableCatalog({ skipActiveJson = false } = {}) {
  const candidates = [];
  if (!skipActiveJson) {
    candidates.push(catalogFromUnknown(readJson(getActiveJsonPath())));
  }

  const syncDir = getGodaddySyncDir();
  const syncCatalog = catalogFromUnknown(readJson(path.join(syncDir, "latest-catalog.json")));
  if (syncCatalog) {
    const syncSettings = readJson(path.join(syncDir, "latest-settings.json"));
    if (syncSettings?.settings && !syncCatalog.settings?.complaintEmail) {
      syncCatalog.settings = syncSettings.settings;
    }
    candidates.push(syncCatalog);
  }

  return candidates
    .filter(Boolean)
    .sort((a, b) => b.stamp - a.stamp || b.count - a.count)[0] || null;
}

export function writeDurableCatalog(payload) {
  const filePath = getActiveJsonPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existing = readJson(filePath) || {};
  const next = {
    services: payload.services || existing.services || [],
    settings: payload.settings || existing.settings || {},
    complaints: existing.complaints || payload.complaints || [],
    exportedAt: new Date().toISOString(),
  };
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, filePath);
  return filePath;
}
