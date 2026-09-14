import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import { closeDatabase, initDatabase } from "../src/db/connection.js";
import { persistLiveCatalog } from "../src/db/persist.js";
import { seedDatabase } from "../src/db/seed.js";
import { listServices } from "../src/models/Service.js";
import { getAllSettings, updateSettings } from "../src/models/Settings.js";
import { DEFAULT_SERVICES } from "../src/config/defaultServices.js";

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

const CODE_SERVICE = {
  id: "code-service",
  nameEn: "Code Service",
  nameAr: "خدمة",
  descriptionEn: "From source",
  descriptionAr: "من المصدر",
  prices: { month: 3, year: 15 },
};

describe("catalog comes from source code", () => {
  let dir;

  afterEach(() => {
    closeDatabase();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts with the hardcoded DEFAULT_SERVICES catalog", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    assert.equal(listServices().length, DEFAULT_SERVICES.length);
    assert.equal(listServices()[0].id, "netflix-prime-combo");
    assert.equal(
      listServices().find((s) => s.id === "whatsapp-number")?.prices.month,
      1,
    );
  });

  it("does not restore leftover JSON catalog dumps", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    fs.mkdirSync(process.env.GODADDY_SYNC_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(process.env.GODADDY_SYNC_DIR, "latest-catalog.json"),
      `${JSON.stringify({
        services: [
          {
            id: "leftover-dump",
            nameEn: "Should Not Appear",
            nameAr: "لا",
            descriptionEn: "backup",
            descriptionAr: "نسخة",
            prices: { month: 1, year: 8 },
          },
        ],
      }, null, 2)}\n`,
    );

    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
    const ids = listServices().map((s) => s.id);
    assert.equal(ids.includes("leftover-dump"), false);
    assert.equal(ids.length, DEFAULT_SERVICES.length);
  });

  it("keeps hardcoded services after sqlite is deleted", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase([CODE_SERVICE]);
    assert.equal(listServices()[0].prices.month, 3);
    closeDatabase();

    wipeSqlite(dir);
    initDatabase(path.join(dir, "live.db"));
    seedDatabase([CODE_SERVICE]);
    const restored = listServices().find((s) => s.id === "code-service");
    assert.equal(restored.nameEn, "Code Service");
    assert.equal(restored.descriptionEn, "From source");
    assert.equal(restored.prices.year, 15);
  });

  it("replaces leftover database rows with the code catalog on boot", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase([{ ...CODE_SERVICE, id: "old-row", nameEn: "Old" }]);
    seedDatabase([]);
    assert.equal(listServices().length, 0);
  });

  it("still restores site settings from backup", () => {
    dir = tmpDir();
    process.env.GODADDY_SYNC_DIR = path.join(dir, "godaddy-sync");
    initDatabase(path.join(dir, "live.db"));
    seedDatabase();
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

    const settings = getAllSettings();
    assert.equal(listServices().length, DEFAULT_SERVICES.length);
    assert.equal(settings.complaintEmail, "ops-forever@example.com");
    assert.deepEqual(settings.whatsappNumbers, ["96550001111", "96550002222"]);
    assert.equal(settings.aboutEn, "Custom about forever");
  });
});
