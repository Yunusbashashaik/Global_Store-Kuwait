import {
  APP_ROOT,
  getActiveJsonPath,
  getActiveStorePath,
  getDataDir,
  getDbEngine,
  isInsideAppTree,
} from "./db/connection.js";
import { getPersistStatus } from "./db/persist.js";
import { getLastSeedResult } from "./db/seed.js";
import { countServices } from "./models/Service.js";
import { getAllSettings, getSetting } from "./models/Settings.js";

export function getHealthPayload() {
  const persist = getPersistStatus();
  const seed = getLastSeedResult();
  const dataDir = getDataDir();
  const storePath = getActiveStorePath();
  return {
    ok: true,
    service: "global-store-api",
    db: getDbEngine(),
    dataDir,
    storePath,
    databasePath: storePath,
    dbFile: storePath,
    jsonFile: getActiveJsonPath(),
    services: countServices(),
    complaintEmail: getAllSettings().complaintEmail,
    catalogSeededThisBoot: Boolean(seed.catalogSeededThisBoot),
    catalogSeeded: getSetting("catalogSeeded") === true,
    dataDirInsideApp: isInsideAppTree(dataDir, APP_ROOT),
    snapshotSavedAt: persist.snapshotSavedAt,
    snapshotServices: persist.snapshotServices,
    time: new Date().toISOString(),
  };
}
