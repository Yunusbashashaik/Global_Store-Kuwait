import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  closeDatabase,
  getDataDir,
  getDbEngine,
  getLastCatalogRecovery,
  getServiceUploadsDir,
  initDatabase,
  isInsideAppTree,
  migrateLegacyDataDir,
} from "../src/db/connection.js";
import { getLastSeedResult, seedDatabase } from "../src/db/seed.js";
import { getHealthPayload } from "../src/health.js";
import {
  insertService,
  listPublicServices,
  listServices,
  updateService,
} from "../src/models/Service.js";
import { DEFAULT_SERVICES } from "../../shared/defaultServices.js";
import { getAllSettings, getSetting, updateSettings } from "../src/models/Settings.js";
import { catalogMatchesDefaults, writeAdminSnapshot } from "../src/db/persist.js";

describe("admin catalog persistence", () => {
  const dirs = [];
  const prevFactory = process.env.ALLOW_FACTORY_SEED;

  before(() => {
    process.env.ALLOW_FACTORY_SEED = "1";
  });

  after(() => {
    closeDatabase();
    if (prevFactory === undefined) delete process.env.ALLOW_FACTORY_SEED;
    else process.env.ALLOW_FACTORY_SEED = prevFactory;
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps settings after close, reopen, and seed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-persist-"));
    dirs.push(dir);
    const jsonPath = path.join(dir, "globalstore.json");
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    await seedDatabase();

    updateSettings({
      complaintEmail: "persist@example.com",
      aboutEn: "Kept about text",
    });

    closeDatabase();
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    await seedDatabase();

    assert.equal(getDbEngine(), "json");
    assert.equal(listServices().length, DEFAULT_SERVICES.length);
    const settings = getAllSettings();
    assert.equal(settings.complaintEmail, "persist@example.com");
    assert.equal(settings.aboutEn, "Kept about text");
    assert.equal(fs.existsSync(`${jsonPath}.bak`), false);
  });

  it("does not copy or keep JSON catalog backup files", async () => {
    const fromDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-legacy-bak-"));
    const toDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-dest-bak-"));
    dirs.push(fromDir, toDir);
    fs.writeFileSync(path.join(fromDir, "globalstore.json"), '{"services":[]}\n');
    fs.writeFileSync(path.join(fromDir, "globalstore.json.bak"), '{"services":[{"id":"old"}]}\n');
    migrateLegacyDataDir(fromDir, toDir);
    assert.equal(fs.existsSync(path.join(toDir, "globalstore.json.bak")), false);
    assert.equal(fs.existsSync(path.join(fromDir, "globalstore.json.bak")), false);
    assert.ok(fs.existsSync(path.join(toDir, "globalstore.json")));
  });

  it("copies leftover upload files into a data folder that already exists", async () => {
    const fromDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-legacy-up-"));
    const toDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-dest-up-"));
    dirs.push(fromDir, toDir);
    fs.mkdirSync(path.join(fromDir, "uploads", "services"), { recursive: true });
    fs.mkdirSync(path.join(toDir, "uploads", "services"), { recursive: true });
    fs.writeFileSync(path.join(fromDir, "uploads", "services", "sample.jpg"), "img");
    fs.writeFileSync(path.join(toDir, "uploads", "keep.txt"), "x");
    migrateLegacyDataDir(fromDir, toDir);
    assert.ok(
      fs.existsSync(path.join(toDir, "uploads", "services", "sample.jpg")),
    );
  });

  it("writes new service images into the active data directory", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-upload-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    const dest = getServiceUploadsDir();
    assert.equal(dest, path.join(dir, "uploads", "services"));
    assert.ok(fs.existsSync(dest));
  });

  it("seeds the default catalog only when the store is empty", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-empty-hard-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    insertService({
      id: "live-row",
      nameEn: "Live Row",
      nameAr: "حي",
      descriptionEn: "en",
      descriptionAr: "ar",
      prices: { month: 1, year: 8 },
    });
    const first = await seedDatabase();
    assert.equal(first.catalogSeededThisBoot, false);
    assert.equal(listServices().length, 1);
    assert.equal(listServices()[0].id, "live-row");
    assert.equal(getSetting("catalogSeeded"), true);
  });

  it("keeps renamed services after close, reopen, and seed", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-rename-"));
    dirs.push(dir);
    const jsonPath = path.join(dir, "globalstore.json");
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    const seeded = await seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, true);

    const original = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.ok(original);
    updateService("youtube-premium-personal", { nameEn: "YouTube Kuwait Live" });

    closeDatabase();
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    const again = await seedDatabase();
    assert.equal(again.catalogSeededThisBoot, false);
    assert.equal(getLastSeedResult().catalogSeededThisBoot, false);

    const renamed = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(renamed.nameEn, "YouTube Kuwait Live");
    assert.ok(listServices().some((s) => s.id === "netflix-prime-combo"));
  });

  it("does not delete admin-added services on later seeds", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-extra-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    await seedDatabase();
    insertService({
      id: "extra-admin",
      nameEn: "Extra",
      nameAr: "إضافي",
      descriptionEn: "en",
      descriptionAr: "ar",
      prices: { month: 2, year: 9 },
    });
    await seedDatabase();
    const listed = listServices();
    assert.ok(listed.some((s) => s.id === "extra-admin"));
    assert.ok(listed.length > DEFAULT_SERVICES.length);
  });

  it("reports durable health fields after seed-once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-health-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    await seedDatabase();
    const health = getHealthPayload();
    assert.equal(health.ok, true);
    assert.equal(health.catalogSeeded, true);
    assert.equal(health.catalogSeededThisBoot, true);
    assert.equal(health.factorySeedDisabled, false);
    assert.equal(typeof health.offHostBackupConfigured, "boolean");
    assert.equal(health.catalogEmpty, false);
    assert.ok(Array.isArray(health.replicaInventory));
    assert.equal(health.dataDir, getDataDir());
    assert.ok(health.storePath);
    assert.ok(health.snapshotSavedAt);
    assert.equal(typeof health.dataDirInsideApp, "boolean");
    assert.equal(isInsideAppTree(dir, dir), true);

    await seedDatabase();
    assert.equal(getHealthPayload().catalogSeededThisBoot, false);
  });

  it("hides expired offers from the public catalog only", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-offer-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    await seedDatabase();
    insertService({
      id: "eid-offer-row",
      nameEn: "Eid Deal",
      nameAr: "عيد",
      descriptionEn: "en",
      descriptionAr: "ar",
      prices: { month: 1, year: 8 },
      offerType: "eid",
      offerExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    insertService({
      id: "special-offer-row",
      nameEn: "Special Deal",
      nameAr: "خاص",
      descriptionEn: "en",
      descriptionAr: "ar",
      prices: { month: 2, year: 9 },
      offerType: "special",
      offerExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const adminList = listServices();
    const publicList = listPublicServices();
    assert.ok(adminList.some((s) => s.id === "eid-offer-row"));
    assert.equal(publicList.some((s) => s.id === "eid-offer-row"), false);
    assert.ok(publicList.some((s) => s.id === "special-offer-row"));
    assert.ok(publicList.some((s) => s.id === "netflix-prime-combo"));
  });

  it("restores a custom snapshot from an alternate durable path without factory seeding", async () => {
    const active = fs.mkdtempSync(path.join(os.tmpdir(), "gs-active-"));
    const replica = fs.mkdtempSync(path.join(os.tmpdir(), "gs-replica-"));
    dirs.push(active, replica);
    fs.writeFileSync(
      path.join(replica, "admin-state.json"),
      `${JSON.stringify(
        {
          version: 1,
          savedAt: "2026-01-01T00:00:00.000Z",
          services: [
            {
              id: "youtube-premium-personal",
              nameEn: "YouTube Kuwait Live",
              nameAr: "يوتيوب كويت",
              descriptionEn: "custom",
              descriptionAr: "مخصص",
              prices: { month: 4, year: 30 },
            },
          ],
          settings: { catalogSeeded: true, complaintEmail: "live@example.com" },
        },
        null,
        2,
      )}\n`,
    );

    initDatabase(path.join(active, "unused.db"), {
      engine: "json",
      jsonPath: path.join(active, "globalstore.json"),
      replicaDirs: [replica],
    });
    const seeded = await seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(getLastSeedResult().catalogSeededThisBoot, false);
    assert.equal(seeded.hydrated.restored, true);
    const youtube = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(youtube.nameEn, "YouTube Kuwait Live");
    assert.equal(getAllSettings().complaintEmail, "live@example.com");
    assert.equal(catalogMatchesDefaults(listServices()), false);

    const health = getHealthPayload();
    assert.equal(health.catalogSeededThisBoot, false);
    assert.equal(health.catalogMatchesDefaults, false);
    assert.ok(Array.isArray(health.snapshotPaths));
    assert.ok(health.snapshotPaths.some((file) => file.includes(replica)));
    assert.ok(health.hydrateReason);
    assert.equal(getLastCatalogRecovery().from, replica);
  });

  it("does not clobber a custom snapshot with a factory-seeded catalog", async () => {
    const active = fs.mkdtempSync(path.join(os.tmpdir(), "gs-clobber-a-"));
    const replica = fs.mkdtempSync(path.join(os.tmpdir(), "gs-clobber-b-"));
    dirs.push(active, replica);
    initDatabase(path.join(active, "unused.db"), {
      engine: "json",
      jsonPath: path.join(active, "globalstore.json"),
      replicaDirs: [replica],
    });

    const customPath = path.join(replica, "admin-state.json");
    fs.writeFileSync(
      customPath,
      `${JSON.stringify(
        {
          version: 1,
          savedAt: "2025-06-01T00:00:00.000Z",
          services: [
            {
              id: "canva-pro",
              nameEn: "Canva Pro Kuwait Custom",
              nameAr: "كانفا",
              descriptionEn: "custom",
              descriptionAr: "مخصص",
              prices: { month: 9, year: 90 },
            },
          ],
          settings: { catalogSeeded: true },
        },
        null,
        2,
      )}\n`,
    );

    const wrote = writeAdminSnapshot({
      services: DEFAULT_SERVICES,
      settings: {},
    });
    assert.ok(wrote);
    const kept = JSON.parse(fs.readFileSync(customPath, "utf8"));
    assert.equal(kept.services[0].nameEn, "Canva Pro Kuwait Custom");
    assert.equal(catalogMatchesDefaults(kept.services), false);
  });

  it("writes admin-state.json to multiple durable directories", async () => {
    const one = fs.mkdtempSync(path.join(os.tmpdir(), "gs-multi-a-"));
    const two = fs.mkdtempSync(path.join(os.tmpdir(), "gs-multi-b-"));
    dirs.push(one, two);
    initDatabase(path.join(one, "unused.db"), {
      engine: "json",
      jsonPath: path.join(one, "globalstore.json"),
      replicaDirs: [two],
    });
    await seedDatabase();
    assert.ok(fs.existsSync(path.join(one, "admin-state.json")));
    assert.ok(fs.existsSync(path.join(one, "admin-state.backup.json")));
    assert.ok(fs.existsSync(path.join(two, "admin-state.json")));
    assert.ok(fs.existsSync(path.join(two, "admin-state.backup.json")));
    assert.ok(fs.existsSync(path.join(two, "globalstore.json")));
    const fromOne = JSON.parse(fs.readFileSync(path.join(one, "admin-state.json"), "utf8"));
    const fromTwo = JSON.parse(fs.readFileSync(path.join(two, "admin-state.json"), "utf8"));
    assert.equal(fromOne.services.length, fromTwo.services.length);
    assert.ok(fromOne.services.length > 0);
  });
});
