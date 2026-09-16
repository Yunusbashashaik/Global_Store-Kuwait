import fs from "fs";
import path from "path";
import {
  flushActiveStore,
  getActiveStorePath,
  getDataDir,
  getReplicaDataDirs,
  getSnapshotSearchDirs,
} from "./connection.js";
import {
  SNAPSHOT_NAME,
  catalogMatchesDefaults,
  catalogSignature,
  copyCatalogDir,
  pickBestSnapshotProbe,
  probeSnapshotPaths,
  settingsMatchDefaults,
  settingsSignature,
  snapshotShowsPriorCatalog,
  snapshotWriteWouldDestroy,
} from "./adminSnapshot.js";

export {
  SNAPSHOT_NAME,
  catalogMatchesDefaults,
  catalogSignature,
  settingsMatchDefaults,
} from "./adminSnapshot.js";

let source = null;
let persistDisabled = 0;
let lastHydrateResult = { restored: false, reason: "not-run" };
let lastSnapshotProbes = [];
let lastWriteResult = { wrote: 0, skipped: 0, paths: [] };

export function bindPersist(nextSource) {
  source = nextSource;
}

export function withoutPersist(fn) {
  persistDisabled += 1;
  try {
    return fn();
  } finally {
    persistDisabled -= 1;
  }
}

export function getSnapshotWritePaths() {
  const dirs = new Set();
  const storePath = getActiveStorePath();
  if (storePath) dirs.add(path.dirname(path.resolve(storePath)));
  dirs.add(path.resolve(getDataDir()));
  if (process.env.DATA_DIR) dirs.add(path.resolve(process.env.DATA_DIR));
  for (const dir of getReplicaDataDirs()) {
    dirs.add(path.resolve(dir));
  }
  return [...dirs].map((dir) => path.join(dir, SNAPSHOT_NAME));
}

export function getSnapshotPaths() {
  const paths = new Set(getSnapshotWritePaths());
  for (const dir of getSnapshotSearchDirs()) {
    paths.add(path.join(path.resolve(dir), SNAPSHOT_NAME));
  }
  return [...paths];
}

function atomicWrite(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
  try {
    const dirFd = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    /* some hosts cannot fsync directories */
  }
}

export function writeAdminSnapshot(state) {
  if (!state) return null;
  const payload = {
    version: 1,
    savedAt: new Date().toISOString(),
    services: Array.isArray(state.services) ? state.services : [],
    settings: state.settings && typeof state.settings === "object" ? state.settings : {},
  };
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  let wrote = 0;
  let skipped = 0;
  const outcomes = [];
  for (const filePath of getSnapshotWritePaths()) {
    const existing = probeSnapshotPaths([filePath])[0];
    if (snapshotWriteWouldDestroy(existing, payload.services)) {
      skipped += 1;
      outcomes.push({ path: filePath, wrote: false, reason: "keep-existing-catalog" });
      continue;
    }
    try {
      atomicWrite(filePath, body);
      wrote += 1;
      outcomes.push({ path: filePath, wrote: true, reason: "ok" });
    } catch (err) {
      console.error("Failed to write admin snapshot", filePath, err?.message || err);
      outcomes.push({
        path: filePath,
        wrote: false,
        reason: err?.message || "write-failed",
      });
    }
  }
  lastWriteResult = { wrote, skipped, paths: outcomes };
  if (!wrote) {
    console.error("Admin snapshot was not written to any durable path");
    return null;
  }
  return payload;
}

export function replicateActiveStore() {
  const fromDir = path.resolve(getDataDir());
  const liveServices = source && typeof source.listServices === "function" ? source.listServices() : [];
  const destDirs = new Set(getSnapshotWritePaths().map((filePath) => path.dirname(filePath)));
  let copied = 0;
  for (const destDir of destDirs) {
    if (path.resolve(destDir) === fromDir) continue;
    const existing = probeSnapshotPaths([path.join(destDir, SNAPSHOT_NAME)])[0];
    if (snapshotWriteWouldDestroy(existing, liveServices)) continue;
    try {
      const result = copyCatalogDir(fromDir, destDir, { overwriteStore: true });
      if (result.copied) copied += 1;
    } catch (err) {
      console.error("Failed to replicate catalog store", destDir, err?.message || err);
    }
  }
  return copied;
}

export function persistAdminState() {
  if (persistDisabled || !source) return null;
  try {
    if (typeof source.persistImages === "function") {
      source.persistImages();
    }
    flushActiveStore();
    replicateActiveStore();
    const settings =
      source.getAllSettings && typeof source.getAllSettings === "function"
        ? { ...source.getAllSettings() }
        : {};
    if (typeof source.getSetting === "function") {
      settings.catalogSeeded = source.getSetting("catalogSeeded") === true;
    }
    return writeAdminSnapshot({
      services: source.listServices(),
      settings,
    });
  } catch (err) {
    console.error("Failed to persist admin state", err?.message || err);
    return null;
  }
}

export const persistLiveCatalog = persistAdminState;

export function inspectSnapshots() {
  lastSnapshotProbes = probeSnapshotPaths(getSnapshotPaths());
  return lastSnapshotProbes;
}

export function readAdminSnapshot() {
  const best = pickBestSnapshotProbe(inspectSnapshots());
  return best?.parsed || null;
}

export function findCustomAdminSnapshot() {
  return inspectSnapshots().find((probe) => probe.readable && probe.customCatalog) || null;
}

export function findPriorCatalogEvidence() {
  const probes = inspectSnapshots();
  const priorSnapshots = probes.filter(snapshotShowsPriorCatalog);
  const custom = priorSnapshots.find((probe) => probe.customCatalog) || null;
  return {
    detected: priorSnapshots.length > 0,
    customCatalog: Boolean(custom),
    customSnapshotPath: custom?.path || null,
    snapshotWithServices: priorSnapshots.find((probe) => probe.services > 0) || null,
    seededInSnapshot: priorSnapshots.some(
      (probe) => probe.parsed?.settings?.catalogSeeded === true,
    ),
    probes: priorSnapshots.map((probe) => ({
      path: probe.path,
      services: probe.services,
      customCatalog: Boolean(probe.customCatalog),
      catalogSeeded: probe.parsed?.settings?.catalogSeeded === true,
    })),
  };
}

export function hydratePersistedAdminState() {
  if (!source) {
    lastHydrateResult = { restored: false, reason: "unbound" };
    return lastHydrateResult;
  }
  const probes = inspectSnapshots();
  const snapshotProbe = pickBestSnapshotProbe(probes);
  if (!snapshotProbe) {
    lastHydrateResult = {
      restored: false,
      reason: "no-snapshot",
      snapshotPath: null,
      probes: probes.map((probe) => ({
        path: probe.path,
        readable: probe.readable,
        reason: probe.reason,
        savedAt: probe.savedAt || null,
        services: probe.services || 0,
        matchesDefaults: Boolean(probe.matchesDefaults),
        customCatalog: Boolean(probe.customCatalog),
      })),
    };
    return lastHydrateResult;
  }

  const snapshot = snapshotProbe.parsed;
  const currentSettings = source.getAllSettings();
  const snapSettings =
    snapshot.settings && typeof snapshot.settings === "object" ? snapshot.settings : null;
  const snapServices = Array.isArray(snapshot.services) ? snapshot.services : [];

  let restoredServices = false;
  let restoredSettings = false;
  let reason = "snapshot-not-applied";

  withoutPersist(() => {
    const currentServices = source.listServices();
    const emptyCatalog = currentServices.length === 0;
    const currentIsDefault = catalogMatchesDefaults(currentServices);
    const snapshotDiffers =
      catalogSignature(currentServices) !== catalogSignature(snapServices);
    const snapshotIsCustom = snapshotHasCustom(snapshotProbe);
    const snapshotCanReplaceDefaults =
      snapServices.length > 0 &&
      (snapshotIsCustom || snapServices.length >= currentServices.length);
    if (
      snapServices.length > 0 &&
      (emptyCatalog ||
        (currentIsDefault && snapshotDiffers && snapshotCanReplaceDefaults))
    ) {
      source.replaceAllServices(snapServices);
      restoredServices = true;
    }

    if (snapSettings) {
      const emptySettings = source.countSettings() === 0;
      const currentIsDefaultSettings = settingsMatchDefaults(currentSettings);
      const snapshotDiffersSettings =
        settingsSignature(currentSettings) !== settingsSignature(snapSettings);
      if (emptySettings || (currentIsDefaultSettings && snapshotDiffersSettings)) {
        source.replaceAllSettings(snapSettings);
        restoredSettings = true;
      }
    }
  });

  if (restoredServices || restoredSettings) {
    reason = restoredServices ? "restored-catalog" : "restored-settings";
    console.log(
      `Restored admin data from snapshot ${snapshotProbe.path} (services=${restoredServices}, settings=${restoredSettings}).`,
    );
    if (source.listServices().length > 0) {
      persistAdminState();
    }
  } else if (!snapshotDiffersFromLive(snapshotProbe)) {
    reason = "already-current";
  }

  lastHydrateResult = {
    restored: restoredServices || restoredSettings,
    restoredServices,
    restoredSettings,
    savedAt: snapshot.savedAt || null,
    reason,
    snapshotPath: snapshotProbe.path,
    customCatalog: Boolean(snapshotProbe.customCatalog),
    matchesDefaults: Boolean(snapshotProbe.matchesDefaults),
  };
  return lastHydrateResult;
}

function snapshotHasCustom(probe) {
  return Boolean(probe?.customCatalog || probe?.customSettings);
}

function snapshotDiffersFromLive(probe) {
  if (!source || !probe?.parsed) return true;
  return catalogSignature(source.listServices()) !== catalogSignature(probe.parsed.services);
}

export function getLastHydrateResult() {
  return lastHydrateResult;
}

export function getLastSnapshotWriteResult() {
  return lastWriteResult;
}

export function getPersistStatus() {
  const probes = inspectSnapshots();
  const snapshot = pickBestSnapshotProbe(probes);
  return {
    snapshotSavedAt: snapshot?.savedAt || null,
    snapshotServices: snapshot?.services || 0,
    snapshotPaths: probes.map((probe) => probe.path),
    snapshotProbes: probes.map((probe) => ({
      path: probe.path,
      readable: probe.readable,
      reason: probe.reason,
      savedAt: probe.savedAt || null,
      services: probe.services || 0,
      matchesDefaults: Boolean(probe.matchesDefaults),
      customCatalog: Boolean(probe.customCatalog),
    })),
    snapshotWrite: lastWriteResult,
    hydrate: lastHydrateResult,
  };
}
