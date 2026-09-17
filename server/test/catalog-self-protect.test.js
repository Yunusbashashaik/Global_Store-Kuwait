import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import { closeDatabase, getLastCatalogRecovery, initDatabase } from "../src/db/connection.js";
import { getLastSeedResult, seedDatabase } from "../src/db/seed.js";
import { getHealthPayload } from "../src/health.js";
import { listServices, updateService } from "../src/models/Service.js";
import { DEFAULT_SERVICES } from "../../shared/defaultServices.js";
import { catalogMatchesDefaults, writeAdminSnapshot } from "../src/db/persist.js";
import { waitForOffHostBackup } from "../src/db/offHostBackup.js";

const FACTORY_YOUTUBE = "▶️ YouTube Premium Personal Account";
const FACTORY_CANVA = "🎨 Canva Pro Available";

function wipeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeCustomSnapshot(dir, extras = {}) {
  const expires = new Date(Date.now() + 60_000).toISOString();
  fs.writeFileSync(
    path.join(dir, extras.fileName || "admin-state.json"),
    `${JSON.stringify(
      {
        version: 1,
        savedAt: "2026-04-01T12:00:00.000Z",
        services: [
          {
            id: "youtube-premium-personal",
            nameEn: "YouTube Kuwait Live",
            nameAr: "يوتيوب كويت",
            descriptionEn: "custom",
            descriptionAr: "مخصص",
            prices: { month: 4, year: 30 },
            offerType: "eid",
            offerExpiresAt: extras.offerExpiresAt || expires,
          },
        ],
        settings: { catalogSeeded: true, complaintEmail: "live@example.com" },
      },
      null,
      2,
    )}\n`,
  );
}

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  const restore = () => {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  };
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (err) {
    restore();
    throw err;
  }
}

describe("catalog self-protection (no factory reseed)", () => {
  const dirs = [];

  afterEach(async () => {
    await waitForOffHostBackup();
    closeDatabase();
  });

  after(() => {
    closeDatabase();
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("factory-seeds only when ALLOW_FACTORY_SEED=1 on true first boot, then does not reseed", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-root-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-home-"));
    dirs.push(localDir, rootDir, homeDir);

    await withEnv("ALLOW_FACTORY_SEED", "1", async () => {
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        jsonPath: path.join(localDir, "globalstore.json"),
        replicaDirs: [rootDir, homeDir],
      });
      const first = await seedDatabase();
      assert.equal(first.catalogSeededThisBoot, true);
      assert.equal(first.seedBlockedReason, null);
      assert.equal(listServices().length, DEFAULT_SERVICES.length);
      assert.ok(fs.existsSync(path.join(rootDir, "admin-state.json")));
      assert.ok(fs.existsSync(path.join(rootDir, "admin-state.backup.json")));
      assert.ok(fs.existsSync(path.join(homeDir, "admin-state.json")));
      assert.ok(fs.existsSync(path.join(homeDir, "admin-state.backup.json")));

      closeDatabase();
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        jsonPath: path.join(localDir, "globalstore.json"),
        replicaDirs: [rootDir, homeDir],
      });
      const second = await seedDatabase();
      assert.equal(second.catalogSeededThisBoot, false);
      assert.equal(getLastSeedResult().catalogSeededThisBoot, false);
      assert.equal(second.seedBlockedReason, "live-catalog-present");
      assert.equal(listServices().length, DEFAULT_SERVICES.length);

      const health = getHealthPayload();
      assert.equal(health.factorySeedDisabled, false);
      assert.equal(health.catalogSeededThisBoot, false);
      assert.equal(health.catalogEmpty, false);
      assert.ok(health.boot);
      assert.ok(Array.isArray(health.replicaInventory));
    });
  });

  it("wiped primary + no replicas stays empty and never factory-fills YouTube/Canva", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-wipe-empty-"));
    dirs.push(localDir);
    wipeDir(localDir);

    await withEnv("ALLOW_FACTORY_SEED", undefined, async () => {
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        dataDir: localDir,
        jsonPath: path.join(localDir, "globalstore.json"),
        replicaDirs: [],
      });
      const seeded = await seedDatabase();
      assert.equal(seeded.catalogSeededThisBoot, false);
      assert.equal(seeded.seedBlockedReason, "factory-seed-disabled");
      assert.equal(listServices().length, 0);
      assert.equal(
        listServices().some((s) => s.nameEn === FACTORY_YOUTUBE || s.nameEn === FACTORY_CANVA),
        false,
      );
      assert.equal(catalogMatchesDefaults(listServices()), false);

      const health = getHealthPayload();
      assert.equal(health.catalogSeededThisBoot, false);
      assert.equal(health.catalogEmpty, true);
      assert.equal(health.factorySeedDisabled, true);
      assert.equal(health.catalogMatchesDefaults, false);
      assert.ok(health.hydrateReason);
      assert.equal(fs.existsSync(path.join(localDir, "admin-state.json")), false);
    });
  });

  it("wiped primary + custom backup on /root-style path restores offers and does not factory-seed", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-wipe-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-wipe-root-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-wipe-home-"));
    dirs.push(localDir, rootDir, homeDir);

    wipeDir(localDir);
    writeCustomSnapshot(rootDir);

    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      dataDir: localDir,
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir, homeDir],
    });
    const seeded = await seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(seeded.hydrated.restored, true);
    assert.equal(getLastCatalogRecovery().from, rootDir);

    const youtube = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(youtube.nameEn, "YouTube Kuwait Live");
    assert.equal(youtube.offerType, "eid");
    assert.ok(youtube.offerExpiresAt);
    assert.equal(catalogMatchesDefaults(listServices()), false);
    assert.equal(youtube.nameEn === FACTORY_YOUTUBE, false);

    const health = getHealthPayload();
    assert.equal(health.catalogSeededThisBoot, false);
    assert.equal(health.customSnapshotPresent, true);
    assert.equal(health.factorySeedDisabled, true);
    assert.ok(health.hydrateReason);
    assert.ok(health.replicaInventory.some((probe) => probe.path.includes(rootDir)));
  });

  it("restores from admin-state.backup.json when the primary snapshot is gone", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-backup-file-"));
    const replica = fs.mkdtempSync(path.join(os.tmpdir(), "gs-backup-rep-"));
    dirs.push(localDir, replica);
    writeCustomSnapshot(replica, { fileName: "admin-state.backup.json" });

    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [replica],
    });
    const seeded = await seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(listServices()[0].nameEn, "YouTube Kuwait Live");
  });

  it("production never factory-seeds even if ALLOW_FACTORY_SEED=1", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-prod-"));
    dirs.push(localDir);
    await withEnv("NODE_ENV", "production", async () => {
      await withEnv("ALLOW_FACTORY_SEED", "1", async () => {
        initDatabase(path.join(localDir, "unused.db"), {
          engine: "json",
          jsonPath: path.join(localDir, "globalstore.json"),
        });
        const seeded = await seedDatabase();
        assert.equal(seeded.catalogSeededThisBoot, false);
        assert.equal(listServices().length, 0);
        assert.equal(getHealthPayload().factorySeedDisabled, true);
      });
    });
  });

  it("does not factory-fill when previously seeded and restore finds no services", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-empty-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-empty-root-"));
    dirs.push(localDir, rootDir);
    fs.writeFileSync(
      path.join(rootDir, "admin-state.json"),
      `${JSON.stringify(
        {
          version: 1,
          savedAt: "2026-05-01T00:00:00.000Z",
          services: [],
          settings: { catalogSeeded: true },
        },
        null,
        2,
      )}\n`,
    );
    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir],
    });
    const seeded = await seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(listServices().length, 0);
    const kept = JSON.parse(fs.readFileSync(path.join(rootDir, "admin-state.json"), "utf8"));
    assert.equal(kept.settings.catalogSeeded, true);
    assert.equal(catalogMatchesDefaults(kept.services || []), false);
  });

  it("factory snapshot write cannot clobber a custom replica", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-clobber-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-clobber-root-"));
    dirs.push(localDir, rootDir);
    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir],
    });
    writeCustomSnapshot(rootDir);
    const wrote = writeAdminSnapshot({
      services: DEFAULT_SERVICES,
      settings: { catalogSeeded: true },
    });
    assert.ok(wrote);
    const kept = JSON.parse(fs.readFileSync(path.join(rootDir, "admin-state.json"), "utf8"));
    assert.equal(kept.services[0].nameEn, "YouTube Kuwait Live");
    assert.equal(kept.services[0].offerType, "eid");
    await waitForOffHostBackup();
  });

  it("keeps renamed live rows after close/reopen instead of reseeding defaults", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-rename-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-rename-root-"));
    dirs.push(localDir, rootDir);
    await withEnv("ALLOW_FACTORY_SEED", "1", async () => {
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        jsonPath: path.join(localDir, "globalstore.json"),
        replicaDirs: [rootDir],
      });
      assert.equal((await seedDatabase()).catalogSeededThisBoot, true);
      updateService("youtube-premium-personal", { nameEn: "YouTube Kuwait Live" });

      closeDatabase();
      wipeDir(localDir);
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        jsonPath: path.join(localDir, "globalstore.json"),
        replicaDirs: [rootDir],
      });
      const again = await seedDatabase();
      assert.equal(again.catalogSeededThisBoot, false);
      const renamed = listServices().find((s) => s.id === "youtube-premium-personal");
      assert.equal(renamed.nameEn, "YouTube Kuwait Live");
    });
  });
});
