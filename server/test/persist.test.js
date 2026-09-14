import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import { closeDatabase, initDatabase } from "../src/db/connection.js";
import { persistLiveCatalog } from "../src/db/persist.js";
import { seedDatabase } from "../src/db/seed.js";
import { insertService, listServices, updateService } from "../src/models/Service.js";
import { getAllSettings, updateSettings } from "../src/models/Settings.js";
import { commitServiceImage } from "../src/services/serviceImages.js";
import { getServiceUploadsDir } from "../src/db/connection.js";
import { RETIRED_FACTORY_SERVICE_IDS } from "../src/config/defaultServices.js";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gs-persist-"));
}

function wipeSqlite(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("live.db")) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

function addFixture() {
  return insertService({
    id: "fixture-service",
    nameEn: "Fixture Service",
    nameAr: "خدمة",
    descriptionEn: "EN",
    descriptionAr: "AR",
    prices: { month: 2, year: 10 },
  });
}

describe("admin catalog survives restarts", () => {
  let dir;

  afterEach(() => {
    closeDatabase();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty and does not seed the retired factory catalog", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    const ids = listServices().map((s) => s.id);
    assert.equal(ids.length, 0);
    assert.equal(ids.includes("netflix-private"), false);
  });

  it("does not restore a leftover factory catalog dump", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    fs.mkdirSync(process.env.GODADDY_SYNC_DIR, { recursive: true });
    const factory = {
      exportedAt: new Date().toISOString(),
      services: RETIRED_FACTORY_SERVICE_IDS.map((id, index) => ({
        id,
        nameEn: `Factory ${id}`,
        nameAr: id,
        descriptionEn: "OLD",
        descriptionAr: "قديم",
        typeEn: "Shared Screen",
        typeAr: "شاشة مشتركة",
        prices: { month: 1, year: 8 },
        sortOrder: index,
      })),
    };
    fs.writeFileSync(
      path.join(process.env.GODADDY_SYNC_DIR, "latest-catalog.json"),
      `${JSON.stringify(factory, null, 2)}\n`,
    );

    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    assert.equal(listServices().length, 0);
  });

  it("keeps admin-added services that reuse old product slugs across restarts", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    RETIRED_FACTORY_SERVICE_IDS.slice(0, 10).forEach((id, index) => {
      insertService({
        id,
        nameEn: `Live ${id}`,
        nameAr: id,
        descriptionEn: "Added in admin after publish",
        descriptionAr: "أضيف",
        prices: { month: index + 1, year: 10 },
      });
    });
    persistLiveCatalog();
    assert.equal(listServices().length, 10);
    closeDatabase();

    wipeSqlite(dir);
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    assert.equal(listServices().length, 10);
    assert.equal(listServices()[0].descriptionEn, "Added in admin after publish");
  });

  it("does not persist an empty sqlite over a live catalog backup", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    addFixture();
    persistLiveCatalog();
    closeDatabase();

    wipeSqlite(dir);
    initDatabase(path.join(dir, "live.db"));
    persistLiveCatalog();
    seedDatabase();
    assert.equal(
      listServices().find((s) => s.id === "fixture-service")?.nameEn,
      "Fixture Service",
    );
  });

  it("does not wipe live sqlite services that reuse old product slugs", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    RETIRED_FACTORY_SERVICE_IDS.slice(0, 10).forEach((id, index) => {
      insertService({
        id,
        nameEn: `Live ${id}`,
        nameAr: id,
        descriptionEn: "Stay",
        descriptionAr: "أضيف",
        prices: { month: index + 1, year: 10 },
      });
    });
    persistLiveCatalog();
    closeDatabase();
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    assert.equal(listServices().length, 10);
  });

  it("restores edited prices after the sqlite file is deleted", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    addFixture();

    const updated = updateService("fixture-service", {
      prices: { month: 9.5, year: 40 },
    });
    assert.equal(updated.prices.month, 9.5);
    persistLiveCatalog();
    closeDatabase();

    wipeSqlite(dir);
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();

    const restored = listServices().find((s) => s.id === "fixture-service");
    assert.equal(restored.prices.month, 9.5);
    assert.equal(restored.prices.year, 40);
  });

  it("imports json-engine admin edits into a fresh sqlite database", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    const jsonPath = path.join(dir, "globalstore.json");
    initDatabase(path.join(dir, "unused.db"), { engine: "json", jsonPath });
    seedDatabase();
    addFixture();
    updateService("fixture-service", { prices: { month: 7, year: 30 } });
    persistLiveCatalog();
    closeDatabase();

    initDatabase(path.join(dir, "live.db"), { jsonPath });
    seedDatabase();
    const restored = listServices().find((s) => s.id === "fixture-service");
    assert.equal(restored.prices.month, 7);
    assert.equal(restored.prices.year, 30);
  });

  it("restores new services, descriptions, email, WhatsApp, and About Us", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    addFixture();

    updateService("fixture-service", {
      descriptionEn: "Admin custom desc",
      descriptionAr: "وصف مخصص",
      prices: { month: 4, year: 22 },
    });
    insertService({
      id: "admin-special",
      nameEn: "Admin Special",
      nameAr: "خاص",
      descriptionEn: "Added by admin",
      descriptionAr: "أضيف",
      prices: { month: 3, year: 12 },
    });
    updateSettings({
      complaintEmail: "ops-forever@example.com",
      whatsappNumbers: ["96550001111", "96550002222"],
      aboutEn: "Custom about forever",
      aboutAr: "نبذة مخصصة",
      socialLinks: { instagram: "https://instagram.com/globalstore-kuwait" },
    });
    persistLiveCatalog();
    closeDatabase();

    wipeSqlite(dir);
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();

    const fixture = listServices().find((s) => s.id === "fixture-service");
    const added = listServices().find((s) => s.id === "admin-special");
    const settings = getAllSettings();
    assert.equal(fixture.prices.month, 4);
    assert.equal(fixture.descriptionEn, "Admin custom desc");
    assert.equal(added?.nameEn, "Admin Special");
    assert.equal(added?.prices.year, 12);
    assert.equal(settings.complaintEmail, "ops-forever@example.com");
    assert.deepEqual(settings.whatsappNumbers, ["96550001111", "96550002222"]);
    assert.equal(settings.aboutEn, "Custom about forever");
    assert.equal(settings.aboutAr, "نبذة مخصصة");
    assert.equal(
      settings.socialLinks.instagram,
      "https://instagram.com/globalstore-kuwait",
    );
  });

  it("restores uploaded JPEGs after sqlite and the uploads folder are wiped", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    addFixture();

    const jpeg = Buffer.from(
      "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc40014100100000000000000000000000000000000ffda00080001000100003f00fbffd9",
      "hex",
    );
    const tmpUpload = path.join(dir, "fresh.jpg");
    fs.writeFileSync(tmpUpload, jpeg);
    const committed = commitServiceImage("fixture-service", tmpUpload);
    updateService("fixture-service", committed);
    persistLiveCatalog();
    const uploadsDir = getServiceUploadsDir();
    closeDatabase();

    wipeSqlite(dir);
    fs.rmSync(uploadsDir, { recursive: true, force: true });

    initDatabase(path.join(dir, "live.db"));
    seedDatabase();

    const restored = listServices().find((s) => s.id === "fixture-service");
    assert.equal(restored.imageUrl, "/api/services/fixture-service/image");
    assert.ok(restored.imageData && restored.imageData.length > 20);
    assert.equal(
      fs.existsSync(path.join(getServiceUploadsDir(), "fixture-service.jpg")),
      true,
    );
  });
});
