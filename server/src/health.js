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
import { catalogMatchesDefaults, findPriorCatalogEvidence, getPersistStatus } from "./db/persist.js";
import { getLastSeedResult } from "./db/seed.js";
import { countServices, listServices } from "./models/Service.js";
import { getAllSettings, getSetting } from "./models/Settings.js";

export function getHealthPayload() {
  const persist = getPersistStatus();
  const seed = getLastSeedResult();
  const recovery = getLastCatalogRecovery();
  const prior = findPriorCatalogEvidence();
  const dataDir = getDataDir();
  const storePath = getActiveStorePath();
  const liveServices = listServices();
  const emptyCatalog = liveServices.length === 0;
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
    emptyCatalog,
    complaintEmail: getAllSettings().complaintEmail,
    catalogSeededThisBoot: Boolean(seed.catalogSeededThisBoot),
    catalogSeeded: getSetting("catalogSeeded") === true,
    catalogMatchesDefaults: catalogMatchesDefaults(liveServices),
    factoryReseedRemoved: true,
    factorySeedAllowed: !seed.catalogSeededThisBoot && emptyCatalog && !prior.detected && getSetting("catalogSeeded") !== true,
    seedBlockedReason: seed.seedBlockedReason || null,
    priorCatalogDetected: prior.detected,
    customSnapshotPresent: prior.customCatalog,
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
    boot: {
      dataDir,
      recoveredFrom: recovery?.from || null,
      recoveryReason: recovery?.reason || null,
      hydrateReason: persist.hydrate?.reason || seed.hydrated?.reason || null,
      catalogSeededThisBoot: Boolean(seed.catalogSeededThisBoot),
      seedBlockedReason: seed.seedBlockedReason || null,
      customSnapshotPresent: prior.customCatalog,
      catalogMatchesDefaults: catalogMatchesDefaults(liveServices),
    },
    time: new Date().toISOString(),
  };
}
