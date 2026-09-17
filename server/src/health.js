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
import { isFactorySeedAllowed, isFactorySeedDisabled } from "./db/factorySeed.js";
import { getOffHostBackupConfig, getOffHostBackupStatus } from "./db/offHostBackup.js";
import { catalogMatchesDefaults, findPriorCatalogEvidence, getPersistStatus } from "./db/persist.js";
import { getLastSeedResult } from "./db/seed.js";
import { countServices, listServices } from "./models/Service.js";
import { getAllSettings, getSetting } from "./models/Settings.js";

export function getHealthPayload() {
  const persist = getPersistStatus();
  const seed = getLastSeedResult();
  const recovery = getLastCatalogRecovery();
  const prior = findPriorCatalogEvidence();
  const offHost = getOffHostBackupStatus();
  const offHostConfig = getOffHostBackupConfig();
  const dataDir = getDataDir();
  const storePath = getActiveStorePath();
  const liveServices = listServices();
  const emptyCatalog = liveServices.length === 0;
  const factorySeedDisabled = isFactorySeedDisabled();
  const hydrateReason = persist.hydrate?.reason || seed.hydrated?.reason || null;
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
    catalogEmpty: emptyCatalog,
    complaintEmail: getAllSettings().complaintEmail,
    catalogSeededThisBoot: Boolean(seed.catalogSeededThisBoot),
    catalogSeeded: getSetting("catalogSeeded") === true,
    catalogMatchesDefaults: catalogMatchesDefaults(liveServices),
    factorySeedDisabled,
    factoryReseedRemoved: true,
    factorySeedAllowed: isFactorySeedAllowed(),
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
    hydrateReason,
    catalogRecovery: recovery,
    replicaWriteDirs: getReplicaDataDirs(),
    snapshotSearchDirs: getSnapshotSearchDirs(),
    replicaInventory: persist.replicaInventory || persist.snapshotProbes || [],
    offHostBackupConfigured: Boolean(offHostConfig.configured),
    offHostBackupPushConfigured: Boolean(offHostConfig.pushConfigured),
    offHostBackupRestoredThisBoot: Boolean(offHost.restoredThisBoot),
    offHostBackupSavedAt: offHost.restoredSavedAt || offHost.savedAt || persist.snapshotSavedAt || null,
    offHostBackupSource: offHost.source || null,
    offHostBackupLastError: offHost.lastError || null,
    boot: {
      dataDir,
      recoveredFrom: recovery?.from || null,
      recoveryReason: recovery?.reason || null,
      hydrateReason,
      catalogSeededThisBoot: Boolean(seed.catalogSeededThisBoot),
      seedBlockedReason: seed.seedBlockedReason || null,
      customSnapshotPresent: prior.customCatalog,
      catalogMatchesDefaults: catalogMatchesDefaults(liveServices),
      factorySeedDisabled,
      offHostBackupConfigured: Boolean(offHostConfig.configured),
      offHostBackupRestoredThisBoot: Boolean(offHost.restoredThisBoot),
    },
    time: new Date().toISOString(),
  };
}
