import {
  APP_ROOT,
  getActiveJsonPath,
  getActiveStorePath,
  getDataDir,
  getDbEngine,
  getLastCatalogRecovery,
  getReplicaDataDirs,
  getSnapshotSearchDirs,
  isInsideAppTree,
} from "./db/connection.js";
import { catalogMatchesDefaults, getPersistStatus } from "./db/persist.js";
import { getLastSeedResult } from "./db/seed.js";
import { countServices, listServices } from "./models/Service.js";
import { getAllSettings, getSetting } from "./models/Settings.js";

export function getHealthPayload() {
  const persist = getPersistStatus();
  const seed = getLastSeedResult();
  const recovery = getLastCatalogRecovery();
  const dataDir = getDataDir();
  const storePath = getActiveStorePath();
  const liveServices = listServices();
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
    catalogMatchesDefaults: catalogMatchesDefaults(liveServices),
    dataDirInsideApp: isInsideAppTree(dataDir, APP_ROOT),
    snapshotSavedAt: persist.snapshotSavedAt,
    snapshotServices: persist.snapshotServices,
    snapshotPaths: persist.snapshotPaths,
    snapshotProbes: persist.snapshotProbes,
    snapshotWrite: persist.snapshotWrite,
    hydrate: persist.hydrate || seed.hydrated,
    hydrateReason: persist.hydrate?.reason || seed.hydrated?.reason || null,
    catalogRecovery: recovery,
    replicaWriteDirs: getReplicaDataDirs(),
    snapshotSearchDirs: getSnapshotSearchDirs(),
    time: new Date().toISOString(),
  };
}
