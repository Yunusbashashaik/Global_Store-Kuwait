import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  SNAPSHOT_NAME,
  compareSnapshotScores,
  copyCatalogDir,
  pickBestSnapshotProbe,
  probeSnapshotPaths,
  readSnapshotFile,
  scoreSnapshotProbe,
} from "./adminSnapshot.js";
import { JsonDatabase } from "./jsonDb.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Git checkout root (folder that contains `server/` and `app.js`). */
export const APP_ROOT = path.join(__dirname, "..", "..", "..");
const LEGACY_DATA_DIR = path.join(__dirname, "..", "..", "data");
export const LEGACY_APP_DATA_DIR = LEGACY_DATA_DIR;
export const DEFAULT_DURABLE_DIRNAME = "global-store-kuwait-data";
export const ROOT_HOST_DATA_DIR = `/root/${DEFAULT_DURABLE_DIRNAME}`;
export const LOCAL_HOST_DATA_DIR = `/local/${DEFAULT_DURABLE_DIRNAME}`;

export let DATA_DIR = LEGACY_DATA_DIR;
export let UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export let SERVICE_UPLOADS_DIR = path.join(UPLOADS_DIR, "services");

const STORE_NAMES = [
  "globalstore.db",
  "globalstore.json",
  "admin-state.json",
  "globalstore.db-wal",
];

const SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS services (
      id TEXT PRIMARY KEY,
      icon TEXT NOT NULL DEFAULT '',
      accent TEXT NOT NULL DEFAULT '#38bdf8',
      type_en TEXT NOT NULL DEFAULT 'Shared / Private',
      type_ar TEXT NOT NULL DEFAULT 'مشترك / خاص',
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      description_en TEXT NOT NULL DEFAULT '',
      description_ar TEXT NOT NULL DEFAULT '',
      price_month REAL NOT NULL DEFAULT 0,
      price_year REAL NOT NULL DEFAULT 0,
      image_url TEXT,
      image_data TEXT,
      out_of_stock INTEGER NOT NULL DEFAULT 0,
      offer_type TEXT NOT NULL DEFAULT 'none',
      offer_expires_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      subject TEXT NOT NULL,
      details TEXT NOT NULL,
      screenshot_path TEXT,
      original_filename TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
`;

let db;
let dbEngine = "none";
let activeDbPath;
let activeJsonPath;
let lastMigration = { migrated: false, reason: "not-run" };
let lastCatalogRecovery = { recovered: false, reason: "not-run" };
let replicaDataDirs = [];
let searchHostSnapshotDirs = false;

function setDataDir(dir) {
  DATA_DIR = dir;
  UPLOADS_DIR = path.join(DATA_DIR, "uploads");
  SERVICE_UPLOADS_DIR = path.join(UPLOADS_DIR, "services");
}

function copyIfMissing(from, to) {
  if (!fs.existsSync(from) || fs.existsSync(to)) return;
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

function copyDirIfMissing(from, to) {
  if (!fs.existsSync(from)) return;
  const destHasFiles =
    fs.existsSync(to) && fs.readdirSync(to, { withFileTypes: true }).length > 0;
  if (destHasFiles) {
    mergeMissingFiles(from, to);
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true, force: false });
}

function removeJsonBackupFiles(dir) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const name of ["globalstore.json.bak", "globalstore.json.tmp"]) {
    const target = path.join(dir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
    }
  }
}

export function getDataDir() {
  return DATA_DIR;
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}

export function getLastMigration() {
  return lastMigration;
}

export function getLastCatalogRecovery() {
  return lastCatalogRecovery;
}

export function getReplicaDataDirs() {
  return replicaDataDirs.slice();
}

export function setReplicaDataDirs(dirs) {
  replicaDataDirs = [
    ...new Set((dirs || []).map((dir) => path.resolve(dir)).filter(Boolean)),
  ];
}

export function getSnapshotSearchDirs() {
  const dirs = new Set();
  dirs.add(path.resolve(getDataDir()));
  if (process.env.DATA_DIR) dirs.add(path.resolve(process.env.DATA_DIR));
  for (const dir of replicaDataDirs) dirs.add(path.resolve(dir));
  if (searchHostSnapshotDirs) {
    for (const dir of durableDataDirCandidates()) dirs.add(path.resolve(dir));
    dirs.add(path.resolve(LEGACY_DATA_DIR));
  }
  return [...dirs];
}

export function isInsideAppTree(dir, appRoot = APP_ROOT) {
  const resolved = path.resolve(dir);
  const root = path.resolve(appRoot);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

export function defaultDurableDataDir(
  appRoot = APP_ROOT,
  homeDir = os.homedir(),
) {
  const parent = path.resolve(appRoot, "..");
  const fsRoot = path.parse(path.resolve(appRoot)).root;
  if (parent !== fsRoot && parent !== path.sep) {
    return path.join(parent, DEFAULT_DURABLE_DIRNAME);
  }
  const homeCandidate = path.join(path.resolve(homeDir), DEFAULT_DURABLE_DIRNAME);
  if (!isInsideAppTree(homeCandidate, appRoot)) {
    return homeCandidate;
  }
  return LOCAL_HOST_DATA_DIR;
}

export function durableDataDirCandidates(appRoot = APP_ROOT, homeDir = os.homedir()) {
  const parent = path.resolve(appRoot, "..");
  const fsRoot = path.parse(path.resolve(appRoot)).root;
  const list = [
    LOCAL_HOST_DATA_DIR,
    ROOT_HOST_DATA_DIR,
    path.join(path.resolve(homeDir), DEFAULT_DURABLE_DIRNAME),
    "/var/lib/global-store-kuwait-data",
    "/opt/global-store-kuwait-data",
    "/data/global-store-kuwait-data",
    "/mnt/global-store-kuwait-data",
  ];
  if (parent !== fsRoot && parent !== path.sep) {
    list.unshift(path.join(parent, DEFAULT_DURABLE_DIRNAME));
  }
  const unique = [];
  const seen = new Set();
  for (const item of list) {
    const resolved = path.resolve(item);
    if (seen.has(resolved)) continue;
    if (isInsideAppTree(resolved, appRoot)) continue;
    seen.add(resolved);
    unique.push(resolved);
  }
  return unique;
}

function canWriteDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function storeArtifactsPresent(dir) {
  if (!dir || !fs.existsSync(dir)) return false;
  return STORE_NAMES.some((name) => fs.existsSync(path.join(dir, name)));
}

export function getServiceUploadsDir() {
  return SERVICE_UPLOADS_DIR;
}

function summarizeSnapshotProbes(probes) {
  return (probes || []).map((probe) => ({
    path: probe.path,
    readable: probe.readable,
    reason: probe.reason,
    savedAt: probe.savedAt || null,
    services: probe.services || 0,
    matchesDefaults: Boolean(probe.matchesDefaults),
    customCatalog: Boolean(probe.customCatalog),
  }));
}

export function recoverBestCatalogInto(destDir, searchDirs = []) {
  const dest = path.resolve(destDir);
  fs.mkdirSync(dest, { recursive: true });
  const dirs = [...new Set((searchDirs || []).map((dir) => path.resolve(dir)))];
  if (!dirs.includes(dest)) dirs.unshift(dest);
  const probes = probeSnapshotPaths(dirs.map((dir) => path.join(dir, SNAPSHOT_NAME)));
  const best = pickBestSnapshotProbe(probes);
  if (!best) {
    lastCatalogRecovery = {
      recovered: false,
      reason: "no-snapshot",
      dest,
      from: null,
      probes: summarizeSnapshotProbes(probes),
    };
    return lastCatalogRecovery;
  }

  const fromDir = path.dirname(best.path);
  const destProbe =
    probes.find((probe) => path.resolve(path.dirname(probe.path)) === dest) ||
    readSnapshotFile(path.join(dest, SNAPSHOT_NAME));
  const destScore = scoreSnapshotProbe(destProbe);
  const bestScore = scoreSnapshotProbe(best);
  const destIsBetterOrEqual = destProbe?.readable
    ? compareSnapshotScores(bestScore, destScore) >= 0
    : false;

  if (path.resolve(fromDir) === dest) {
    lastCatalogRecovery = {
      recovered: false,
      reason: "already-active",
      dest,
      from: fromDir,
      snapshotPath: best.path,
      customCatalog: Boolean(best.customCatalog),
      probes: summarizeSnapshotProbes(probes),
    };
    return lastCatalogRecovery;
  }

  if (destIsBetterOrEqual) {
    lastCatalogRecovery = {
      recovered: false,
      reason: "active-is-better",
      dest,
      from: fromDir,
      snapshotPath: best.path,
      customCatalog: Boolean(best.customCatalog),
      probes: summarizeSnapshotProbes(probes),
    };
    return lastCatalogRecovery;
  }

  const copied = copyCatalogDir(fromDir, dest, { overwriteStore: true });
  lastCatalogRecovery = {
    recovered: Boolean(copied.copied),
    reason: copied.copied ? "copied-best-catalog" : copied.reason,
    dest,
    from: fromDir,
    snapshotPath: best.path,
    customCatalog: Boolean(best.customCatalog),
    probes: summarizeSnapshotProbes(probes),
  };
  if (copied.copied) {
    console.log(
      `Recovered admin catalog from ${fromDir} into ${dest} (custom=${Boolean(best.customCatalog)}).`,
    );
  }
  return lastCatalogRecovery;
}

function preferredEnvDataDir(options = {}) {
  if (options.dataDir) return path.resolve(options.dataDir);
  if (process.env.DATA_DIR) return path.resolve(process.env.DATA_DIR);
  if (options.dbPath) return path.dirname(path.resolve(options.dbPath));
  if (options.jsonPath) return path.dirname(path.resolve(options.jsonPath));
  if (process.env.DATABASE_PATH) {
    return path.dirname(path.resolve(process.env.DATABASE_PATH));
  }
  if (process.env.JSON_DATABASE_PATH) {
    return path.dirname(path.resolve(process.env.JSON_DATABASE_PATH));
  }
  return null;
}

/** Keep live catalog outside the git/app folder so deploys cannot wipe admin edits. */
export function resolveProductionDataDir(options = {}) {
  const envDir = preferredEnvDataDir(options);
  const candidates = durableDataDirCandidates();
  const searchDirs = [...new Set([envDir, ...candidates, LEGACY_DATA_DIR].filter(Boolean))];
  const best = pickBestSnapshotProbe(
    probeSnapshotPaths(searchDirs.map((dir) => path.join(dir, SNAPSHOT_NAME))),
  );
  const bestDir = best ? path.dirname(best.path) : null;

  if (envDir && canWriteDir(envDir)) return envDir;
  if (bestDir && canWriteDir(bestDir) && !isInsideAppTree(bestDir)) return bestDir;

  for (const dir of candidates) {
    if (storeArtifactsPresent(dir) && canWriteDir(dir)) return dir;
  }
  for (const dir of candidates) {
    if (canWriteDir(dir)) return dir;
  }
  const preferred = defaultDurableDataDir();
  if (canWriteDir(preferred)) return preferred;
  return LEGACY_DATA_DIR;
}

export function migrateLegacyDataDir(fromDir, toDir) {
  if (!fromDir || !toDir || path.resolve(fromDir) === path.resolve(toDir)) return false;
  if (!fs.existsSync(fromDir)) return false;
  fs.mkdirSync(toDir, { recursive: true });
  let copied = false;
  for (const name of [
    "globalstore.db",
    "globalstore.db-wal",
    "globalstore.db-shm",
    "globalstore.json",
    "admin-state.json",
  ]) {
    const src = path.join(fromDir, name);
    const dest = path.join(toDir, name);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      copyIfMissing(src, dest);
      copied = true;
    }
  }
  copyDirIfMissing(path.join(fromDir, "uploads"), path.join(toDir, "uploads"));
  copyIfMissing(path.join(fromDir, "admin-state.json"), path.join(toDir, "admin-state.json"));
  removeJsonBackupFiles(fromDir);
  removeJsonBackupFiles(toDir);
  if (copied) {
    lastMigration = { migrated: true, reason: "copied-legacy", from: fromDir, to: toDir };
  } else if (lastMigration.reason === "not-run") {
    lastMigration = { migrated: false, reason: "no-copy" };
  }
  return copied;
}

function getDbPath() {
  return process.env.DATABASE_PATH || path.join(DATA_DIR, "globalstore.db");
}

export function getDbEngine() {
  return dbEngine;
}

export function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}

function migrateSqlite(sqlite) {
  const cols = sqlite.prepare("PRAGMA table_info(services)").all();
  const names = cols.map((col) => col.name);
  if (!names.includes("image_data")) {
    sqlite.exec("ALTER TABLE services ADD COLUMN image_data TEXT");
  }
  if (!names.includes("offer_type")) {
    sqlite.exec("ALTER TABLE services ADD COLUMN offer_type TEXT NOT NULL DEFAULT 'none'");
  }
  if (!names.includes("offer_expires_at")) {
    sqlite.exec("ALTER TABLE services ADD COLUMN offer_expires_at TEXT");
  }
}

function openSqlite(dbPath) {
  const Database = require("better-sqlite3");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = FULL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(SCHEMA_SQL);
  migrateSqlite(sqlite);
  return sqlite;
}

export function getActiveStorePath() {
  return activeDbPath || getDbPath();
}

export function getActiveDbPath() {
  return getActiveStorePath();
}

export function getActiveJsonPath() {
  if (activeJsonPath) return activeJsonPath;
  return (
    process.env.JSON_DATABASE_PATH ||
    path.join(DATA_DIR, "globalstore.json")
  );
}

export function flushActiveStore() {
  if (!db) return;
  if (dbEngine === "sqlite") {
    try {
      db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* ignore */
    }
  } else if (typeof db.save === "function") {
    db.save();
  }
}

export function initDatabase(dbPath, options = {}) {
  const explicitStore = Boolean(dbPath || options.jsonPath || options.dataDir);
  if (explicitStore) {
    searchHostSnapshotDirs = false;
    setDataDir(
      path.dirname(path.resolve(options.jsonPath || dbPath || options.dataDir)),
    );
    if (options.dataDir) setDataDir(path.resolve(options.dataDir));
    setReplicaDataDirs(options.replicaDirs || []);
    lastMigration = { migrated: false, reason: "explicit-store" };
    lastCatalogRecovery = { recovered: false, reason: "explicit-store" };
    if (replicaDataDirs.length) {
      recoverBestCatalogInto(DATA_DIR, [DATA_DIR, ...replicaDataDirs]);
    }
  } else {
    searchHostSnapshotDirs = true;
    setDataDir(resolveProductionDataDir(options));
    const writableReplicas = durableDataDirCandidates().filter((dir) => canWriteDir(dir));
    setReplicaDataDirs(writableReplicas);
    recoverBestCatalogInto(DATA_DIR, getSnapshotSearchDirs());
    migrateLegacyDataDir(LEGACY_DATA_DIR, DATA_DIR);
  }

  if (!dbPath) dbPath = getDbPath();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SERVICE_UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  removeJsonBackupFiles(DATA_DIR);

  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    db = undefined;
  }

  activeDbPath = dbPath;
  const jsonPath =
    options.jsonPath ||
    process.env.JSON_DATABASE_PATH ||
    path.join(DATA_DIR, "globalstore.json");
  activeJsonPath = jsonPath;
  fs.mkdirSync(getServiceUploadsDir(), { recursive: true });

  const engine = options.engine || process.env.DATABASE_ENGINE;
  const forceJson = engine === "json";
  if (!forceJson) {
    try {
      db = openSqlite(dbPath);
      dbEngine = "sqlite";
      return db;
    } catch (err) {
      console.error(
        "SQLite native module failed; using JSON file store instead.",
        err?.message || err,
      );
    }
  }

  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  db = new JsonDatabase(jsonPath);
  dbEngine = "json";
  activeDbPath = jsonPath;
  return db;
}

export function closeDatabase() {
  if (db) {
    try {
      flushActiveStore();
      db.close();
    } catch {
      /* ignore */
    }
    db = undefined;
  }
  dbEngine = "none";
  activeDbPath = undefined;
  activeJsonPath = undefined;
}

export { LEGACY_DATA_DIR };
