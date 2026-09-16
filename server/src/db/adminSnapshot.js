import fs from "fs";
import path from "path";
import { DEFAULT_SERVICES } from "../config/defaultServices.js";
import { DEFAULT_SETTINGS } from "../config/defaults.js";

export const SNAPSHOT_NAME = "admin-state.json";

const STORE_COPY_NAMES = [
  SNAPSHOT_NAME,
  "globalstore.json",
  "globalstore.db",
  "globalstore.db-wal",
  "globalstore.db-shm",
];

function settingsSignature(settings) {
  const value = settings || {};
  return JSON.stringify({
    complaintEmail: value.complaintEmail,
    whatsappNumbers: value.whatsappNumbers,
    aboutEn: value.aboutEn,
    aboutAr: value.aboutAr,
    ownersEn: value.ownersEn,
    ownersAr: value.ownersAr,
    socialLinks: value.socialLinks,
  });
}

export { settingsSignature };

export function settingsMatchDefaults(settings) {
  return settingsSignature(settings) === settingsSignature(DEFAULT_SETTINGS);
}

function serviceSignature(service) {
  const month = Number(service.prices?.month);
  const year = Number(service.prices?.year);
  const outOfStock =
    service.outOfStock ||
    (Number.isFinite(month) && month === 0) ||
    (Number.isFinite(year) && year === 0)
      ? 1
      : 0;
  return [
    service.id,
    outOfStock ? 0 : month,
    outOfStock ? 0 : year,
    String(service.nameEn || ""),
    String(service.nameAr || ""),
    String(service.descriptionEn || ""),
    String(service.descriptionAr || ""),
    String(service.offerType || "none"),
    String(service.offerExpiresAt || ""),
    String(service.imageUrl || ""),
    outOfStock,
  ].join("|");
}

export function catalogSignature(services) {
  return (services || [])
    .map(serviceSignature)
    .sort()
    .join("\n");
}

export function catalogMatchesDefaults(services) {
  return catalogSignature(services) === catalogSignature(DEFAULT_SERVICES);
}

export function snapshotHasCustomCatalog(parsed) {
  const services = Array.isArray(parsed?.services) ? parsed.services : [];
  return services.length > 0 && !catalogMatchesDefaults(services);
}

export function snapshotHasCustomSettings(parsed) {
  const settings = parsed?.settings && typeof parsed.settings === "object" ? parsed.settings : null;
  return Boolean(settings) && !settingsMatchDefaults(settings);
}

export function readSnapshotFile(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") {
      return { path: filePath, readable: false, reason: "invalid-json", parsed: null };
    }
    const services = Array.isArray(parsed.services) ? parsed.services : [];
    return {
      path: filePath,
      readable: true,
      reason: "ok",
      parsed,
      savedAt: parsed.savedAt || null,
      services: services.length,
      matchesDefaults: catalogMatchesDefaults(services),
      customCatalog: snapshotHasCustomCatalog(parsed),
      customSettings: snapshotHasCustomSettings(parsed),
    };
  } catch (err) {
    return {
      path: filePath,
      readable: false,
      reason: err?.code === "ENOENT" ? "missing" : "unreadable",
      parsed: null,
    };
  }
}

export function scoreSnapshotProbe(probe) {
  if (!probe?.readable || !probe.parsed) {
    return {
      customCatalog: 0,
      customSettings: 0,
      savedAt: 0,
      serviceCount: 0,
      readable: 0,
    };
  }
  return {
    customCatalog: probe.customCatalog ? 1 : 0,
    customSettings: probe.customSettings ? 1 : 0,
    savedAt: Date.parse(probe.savedAt || 0) || 0,
    serviceCount: probe.services || 0,
    readable: 1,
  };
}

export function compareSnapshotScores(a, b) {
  if (a.customCatalog !== b.customCatalog) return b.customCatalog - a.customCatalog;
  if (a.customSettings !== b.customSettings) return b.customSettings - a.customSettings;
  if (a.savedAt !== b.savedAt) return b.savedAt - a.savedAt;
  return b.serviceCount - a.serviceCount;
}

export function probeSnapshotPaths(filePaths) {
  return [...new Set(filePaths.filter(Boolean))].map((filePath) =>
    readSnapshotFile(path.resolve(filePath)),
  );
}

export function pickBestSnapshotProbe(probes) {
  const readable = (probes || []).filter((probe) => probe.readable && probe.parsed);
  if (!readable.length) return null;
  return readable.reduce((best, probe) => {
    if (!best) return probe;
    return compareSnapshotScores(scoreSnapshotProbe(probe), scoreSnapshotProbe(best)) < 0
      ? probe
      : best;
  }, null);
}

export function factorySeedWouldClobber(existingProbe, incomingServices) {
  if (!existingProbe?.readable) return false;
  const incomingIsDefault =
    !incomingServices?.length || catalogMatchesDefaults(incomingServices);
  return Boolean(existingProbe.customCatalog && incomingIsDefault);
}

/** Never replace a populated backup with empty or factory rows. */
export function snapshotWriteWouldDestroy(existingProbe, incomingServices) {
  if (!existingProbe?.readable) return false;
  const incoming = Array.isArray(incomingServices) ? incomingServices : [];
  if ((existingProbe.services || 0) > 0 && incoming.length === 0) return true;
  return factorySeedWouldClobber(existingProbe, incoming);
}

export function snapshotShowsPriorCatalog(probe) {
  if (!probe?.readable || !probe.parsed) return false;
  if (probe.customCatalog || probe.services > 0) return true;
  return probe.parsed?.settings?.catalogSeeded === true;
}

function copyFileOverwrite(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function mergeMissingFiles(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      mergeMissingFiles(src, dest);
    } else if (!fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }
}

export function copyCatalogDir(fromDir, toDir, { overwriteStore = false } = {}) {
  if (!fromDir || !toDir || path.resolve(fromDir) === path.resolve(toDir)) {
    return { copied: false, reason: "same-dir" };
  }
  if (!fs.existsSync(fromDir)) return { copied: false, reason: "missing-source" };
  fs.mkdirSync(toDir, { recursive: true });
  let copied = false;
  for (const name of STORE_COPY_NAMES) {
    const src = path.join(fromDir, name);
    const dest = path.join(toDir, name);
    if (!fs.existsSync(src)) continue;
    if (overwriteStore || !fs.existsSync(dest)) {
      copyFileOverwrite(src, dest);
      copied = true;
    }
  }
  const uploadsFrom = path.join(fromDir, "uploads");
  if (fs.existsSync(uploadsFrom)) {
    mergeMissingFiles(uploadsFrom, path.join(toDir, "uploads"));
    copied = true;
  }
  return { copied, reason: copied ? "copied" : "nothing-to-copy", from: fromDir, to: toDir };
}
