import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import { closeDatabase, getLastCatalogRecovery, initDatabase } from "../src/db/connection.js";
import { getLastSeedResult, seedDatabase } from "../src/db/seed.js";
import { getHealthPayload } from "../src/health.js";
import { listServices, updateService } from "../src/models/Service.js";
import { DEFAULT_SERVICES } from "../../shared/defaultServices.js";
import { catalogMatchesDefaults, writeAdminSnapshot } from "../src/db/persist.js";

function wipeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function writeCustomSnapshot(dir, extras = {}) {
  const expires = new Date(Date.now() + 60_000).toISOString();
  fs.writeFileSync(
    path.join(dir, "admin-state.json"),
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

describe("catalog self-protection (no factory reseed)", () => {
  const dirs = [];

  after(() => {
    closeDatabase();
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("factory-seeds only on true first boot, then does not reseed the same dirs", () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-root-"));
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-home-"));
    dirs.push(localDir, rootDir, homeDir);

    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir, homeDir],
    });
    const first = seedDatabase();
    assert.equal(first.catalogSeededThisBoot, true);
    assert.equal(first.seedBlockedReason, null);
    assert.equal(listServices().length, DEFAULT_SERVICES.length);
    assert.ok(fs.existsSync(path.join(rootDir, "admin-state.json")));
    assert.ok(fs.existsSync(path.join(homeDir, "admin-state.json")));

    closeDatabase();
    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir, homeDir],
    });
    const second = seedDatabase();
    assert.equal(second.catalogSeededThisBoot, false);
    assert.equal(getLastSeedResult().catalogSeededThisBoot, false);
    assert.equal(second.seedBlockedReason, "live-catalog-present");
    assert.equal(listServices().length, DEFAULT_SERVICES.length);

    const health = getHealthPayload();
    assert.equal(health.factoryReseedRemoved, true);
    assert.equal(health.catalogSeededThisBoot, false);
    assert.ok(health.boot);
    assert.ok(Array.isArray(health.snapshotProbes));
  });

  it("wiped primary + custom backup on /root-style path restores offers and does not factory-seed", () => {
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
    const seeded = seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(seeded.hydrated.restored, true);
    assert.equal(getLastCatalogRecovery().from, rootDir);

    const youtube = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(youtube.nameEn, "YouTube Kuwait Live");
    assert.equal(youtube.offerType, "eid");
    assert.ok(youtube.offerExpiresAt);
    assert.equal(catalogMatchesDefaults(listServices()), false);

    const health = getHealthPayload();
    assert.equal(health.catalogSeededThisBoot, false);
    assert.equal(health.customSnapshotPresent, true);
    assert.equal(health.factoryReseedRemoved, true);
    assert.ok(health.hydrateReason);
    assert.ok(health.snapshotPaths.some((file) => file.includes(rootDir)));
  });

  it("does not factory-fill when previously seeded and restore finds no services", () => {
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
    const seeded = seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(seeded.seedBlockedReason, "catalog-already-seeded");
    assert.equal(listServices().length, 0);
    const kept = JSON.parse(fs.readFileSync(path.join(rootDir, "admin-state.json"), "utf8"));
    assert.equal(kept.settings.catalogSeeded, true);
    assert.equal(catalogMatchesDefaults(kept.services || []), false);
  });

  it("factory snapshot write cannot clobber a custom replica", () => {
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
  });

  it("keeps renamed live rows after close/reopen instead of reseeding defaults", () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-rename-local-"));
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-rename-root-"));
    dirs.push(localDir, rootDir);
    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir],
    });
    assert.equal(seedDatabase().catalogSeededThisBoot, true);
    updateService("youtube-premium-personal", { nameEn: "YouTube Kuwait Live" });

    closeDatabase();
    wipeDir(localDir);
    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
      replicaDirs: [rootDir],
    });
    const again = seedDatabase();
    assert.equal(again.catalogSeededThisBoot, false);
    const renamed = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(renamed.nameEn, "YouTube Kuwait Live");
  });
});
