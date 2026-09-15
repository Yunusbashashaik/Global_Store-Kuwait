import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import {
  closeDatabase,
  getDataDir,
  getDbEngine,
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

describe("admin catalog persistence", () => {
  const dirs = [];

  after(() => {
    closeDatabase();
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps settings after close, reopen, and seed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-persist-"));
    dirs.push(dir);
    const jsonPath = path.join(dir, "globalstore.json");
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    seedDatabase();

    updateSettings({
      complaintEmail: "persist@example.com",
      aboutEn: "Kept about text",
    });

    closeDatabase();
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    seedDatabase();

    assert.equal(getDbEngine(), "json");
    assert.equal(listServices().length, DEFAULT_SERVICES.length);
    const settings = getAllSettings();
    assert.equal(settings.complaintEmail, "persist@example.com");
    assert.equal(settings.aboutEn, "Kept about text");
    assert.equal(fs.existsSync(`${jsonPath}.bak`), false);
  });

  it("does not copy or keep JSON catalog backup files", () => {
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

  it("copies leftover upload files into a data folder that already exists", () => {
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

  it("writes new service images into the active data directory", () => {
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

  it("seeds the default catalog only when the store is empty", () => {
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
    const first = seedDatabase();
    assert.equal(first.catalogSeededThisBoot, false);
    assert.equal(listServices().length, 1);
    assert.equal(listServices()[0].id, "live-row");
    assert.equal(getSetting("catalogSeeded"), true);
  });

  it("keeps renamed services after close, reopen, and seed", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-rename-"));
    dirs.push(dir);
    const jsonPath = path.join(dir, "globalstore.json");
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    const seeded = seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, true);

    const original = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.ok(original);
    updateService("youtube-premium-personal", { nameEn: "YouTube Kuwait Live" });

    closeDatabase();
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    const again = seedDatabase();
    assert.equal(again.catalogSeededThisBoot, false);
    assert.equal(getLastSeedResult().catalogSeededThisBoot, false);

    const renamed = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(renamed.nameEn, "YouTube Kuwait Live");
    assert.ok(listServices().some((s) => s.id === "netflix-prime-combo"));
  });

  it("does not delete admin-added services on later seeds", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-extra-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    seedDatabase();
    insertService({
      id: "extra-admin",
      nameEn: "Extra",
      nameAr: "إضافي",
      descriptionEn: "en",
      descriptionAr: "ar",
      prices: { month: 2, year: 9 },
    });
    seedDatabase();
    const listed = listServices();
    assert.ok(listed.some((s) => s.id === "extra-admin"));
    assert.ok(listed.length > DEFAULT_SERVICES.length);
  });

  it("reports durable health fields after seed-once", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-health-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    seedDatabase();
    const health = getHealthPayload();
    assert.equal(health.ok, true);
    assert.equal(health.catalogSeeded, true);
    assert.equal(health.catalogSeededThisBoot, true);
    assert.equal(health.dataDir, getDataDir());
    assert.ok(health.storePath);
    assert.ok(health.snapshotSavedAt);
    assert.equal(typeof health.dataDirInsideApp, "boolean");
    assert.equal(isInsideAppTree(dir, dir), true);

    seedDatabase();
    assert.equal(getHealthPayload().catalogSeededThisBoot, false);
  });

  it("hides expired offers from the public catalog only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-offer-"));
    dirs.push(dir);
    initDatabase(path.join(dir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(dir, "globalstore.json"),
    });
    seedDatabase();
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
});
