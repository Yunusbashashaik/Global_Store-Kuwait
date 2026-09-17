import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import { closeDatabase, getDbEngine, initDatabase } from "../src/db/connection.js";
import { seedDatabase } from "../src/db/seed.js";
import { insertService, listServices } from "../src/models/Service.js";
import { getAllSettings, updateSettings } from "../src/models/Settings.js";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-json-"));

describe("JSON file database fallback", () => {
  before(async () => {
    process.env.GODADDY_SYNC_DIR = path.join(testDir, "godaddy-sync");
    process.env.ALLOW_FACTORY_SEED = "1";
    initDatabase(path.join(testDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(testDir, "store.json"),
    });
    await seedDatabase();
  });

  after(() => {
    closeDatabase();
    delete process.env.ALLOW_FACTORY_SEED;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("starts with the default catalog on the JSON engine", () => {
    assert.equal(getDbEngine(), "json");
    assert.ok(listServices().length > 0);
    assert.ok(getAllSettings().complaintEmail);
  });

  it("creates a service and updates settings", () => {
    const created = insertService({
      id: "json-test-service",
      nameEn: "JSON Service",
      nameAr: "خدمة",
      descriptionEn: "en",
      descriptionAr: "ar",
      prices: { month: 2, year: 9 },
    });
    assert.equal(created.nameEn, "JSON Service");
    assert.ok(listServices().some((s) => s.id === "json-test-service"));

    const settings = updateSettings({ complaintEmail: "json@example.com" });
    assert.equal(settings.complaintEmail, "json@example.com");
    assert.equal(getAllSettings().complaintEmail, "json@example.com");
  });
});
