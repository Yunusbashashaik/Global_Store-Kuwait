import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import fs from "fs";
import os from "os";
import path from "path";
import { closeDatabase, initDatabase } from "../src/db/connection.js";
import { seedDatabase } from "../src/db/seed.js";
import { getHealthPayload } from "../src/health.js";
import { listServices } from "../src/models/Service.js";
import { getAllSettings } from "../src/models/Settings.js";
import { catalogMatchesDefaults } from "../src/db/persist.js";
import { DEFAULT_SERVICES } from "../../shared/defaultServices.js";
import {
  defaultRawBackupUrl,
  getOffHostBackupConfig,
  setOffHostBackupTestHook,
  waitForOffHostBackup,
} from "../src/db/offHostBackup.js";

const COMMITTED_BACKUP = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../catalog-backup/admin-state.json",
);
const COMMITTED_BACKUP_COPY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../catalog-backup/admin-state.backup.json",
);

const FACTORY_YOUTUBE = "▶️ YouTube Premium Personal Account";

describe("off-host catalog backup auto-restore", () => {
  const dirs = [];
  let savedPayloads = [];

  afterEach(async () => {
    await waitForOffHostBackup();
    setOffHostBackupTestHook(null);
    savedPayloads = [];
    closeDatabase();
  });

  after(() => {
    closeDatabase();
    for (const dir of dirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("empty local + off-host custom JSON restores names without factory seed", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-offhost-"));
    dirs.push(localDir);
    delete process.env.ALLOW_FACTORY_SEED;

    setOffHostBackupTestHook({
      load: async () => ({
        version: 1,
        savedAt: "2026-09-17T00:00:00.000Z",
        services: [
          {
            id: "youtube-premium-personal",
            nameEn: "YouTube Kuwait Live",
            nameAr: "يوتيوب كويت",
            descriptionEn: "custom",
            descriptionAr: "مخصص",
            prices: { month: 4, year: 30 },
            offerType: "special",
            offerExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
        settings: { catalogSeeded: true, complaintEmail: "ops@example.com" },
      }),
      save: async (payload) => {
        savedPayloads.push(payload);
      },
    });

    initDatabase(path.join(localDir, "unused.db"), {
      engine: "json",
      jsonPath: path.join(localDir, "globalstore.json"),
    });
    const seeded = await seedDatabase();
    assert.equal(seeded.catalogSeededThisBoot, false);
    assert.equal(seeded.offHost.reason, "offhost-restored");
    const youtube = listServices().find((s) => s.id === "youtube-premium-personal");
    assert.equal(youtube.nameEn, "YouTube Kuwait Live");
    assert.equal(youtube.nameEn === FACTORY_YOUTUBE, false);
    assert.equal(youtube.offerType, "special");
    assert.equal(getAllSettings().complaintEmail, "ops@example.com");
    assert.equal(catalogMatchesDefaults(listServices()), false);

    const health = getHealthPayload();
    assert.equal(health.catalogSeededThisBoot, false);
    assert.equal(health.factorySeedDisabled, true);
    assert.equal(health.offHostBackupConfigured, true);
    assert.equal(health.offHostBackupRestoredThisBoot, true);
    assert.equal(health.offHostBackupSavedAt, "2026-09-17T00:00:00.000Z");
    assert.equal(health.catalogEmpty, false);
    await waitForOffHostBackup();
    assert.ok(savedPayloads.length >= 1);
    assert.equal(savedPayloads.at(-1).services[0].nameEn, "YouTube Kuwait Live");
  });

  it("CATALOG_BACKUP_URL fetch restores a custom catalog", async () => {
    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-offhost-url-"));
    dirs.push(localDir);
    const prevUrl = process.env.CATALOG_BACKUP_URL;
    process.env.CATALOG_BACKUP_URL = "https://example.test/admin-state.json";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.equal(String(url), "https://example.test/admin-state.json");
      return {
        ok: true,
        json: async () => ({
          version: 1,
          savedAt: "2026-09-16T12:00:00.000Z",
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
        }),
      };
    };

    try {
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        jsonPath: path.join(localDir, "globalstore.json"),
      });
      const seeded = await seedDatabase();
      assert.equal(seeded.catalogSeededThisBoot, false);
      assert.equal(listServices()[0].nameEn, "Canva Pro Kuwait Custom");
      assert.equal(getHealthPayload().offHostBackupRestoredThisBoot, true);
      assert.equal(getHealthPayload().offHostBackupConfigured, true);
    } finally {
      globalThis.fetch = originalFetch;
      if (prevUrl === undefined) delete process.env.CATALOG_BACKUP_URL;
      else process.env.CATALOG_BACKUP_URL = prevUrl;
    }
  });

  it("default GitHub raw URL is configured without a token", () => {
    const keys = [
      "CATALOG_BACKUP_URL",
      "CATALOG_BACKUP_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "CATALOG_BACKUP_DISABLE",
    ];
    const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      for (const key of keys) delete process.env[key];
      const config = getOffHostBackupConfig();
      assert.equal(config.configured, true);
      assert.equal(config.pushConfigured, false);
      assert.equal(
        config.url,
        "https://raw.githubusercontent.com/Yunusbashashaik/Global_Store-Kuwait/main/catalog-backup/admin-state.json",
      );
      assert.equal(config.url, defaultRawBackupUrl());
    } finally {
      for (const key of keys) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  });

  it("empty local + committed catalog-backup restores N>0 services without factory seed", async () => {
    const committed = JSON.parse(fs.readFileSync(COMMITTED_BACKUP, "utf8"));
    const backupCopy = JSON.parse(fs.readFileSync(COMMITTED_BACKUP_COPY, "utf8"));
    assert.ok(committed.services.length > 0);
    assert.equal(committed.services.length, DEFAULT_SERVICES.length);
    assert.equal(backupCopy.services.length, committed.services.length);
    assert.equal(typeof committed.services[0].offerType, "string");
    assert.ok("offerExpiresAt" in committed.services[0]);

    const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-offhost-committed-"));
    dirs.push(localDir);
    const envKeys = [
      "ALLOW_FACTORY_SEED",
      "CATALOG_BACKUP_URL",
      "CATALOG_BACKUP_TOKEN",
      "GITHUB_TOKEN",
      "GH_TOKEN",
      "CATALOG_BACKUP_DISABLE",
      "CATALOG_BACKUP_ALLOW_NETWORK",
    ];
    const prev = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalFetch = globalThis.fetch;
    const fetched = [];
    try {
      for (const key of envKeys) delete process.env[key];
      process.env.CATALOG_BACKUP_ALLOW_NETWORK = "1";
      globalThis.fetch = async (url) => {
        fetched.push(String(url));
        assert.equal(String(url), defaultRawBackupUrl());
        return { ok: true, json: async () => committed };
      };
      initDatabase(path.join(localDir, "unused.db"), {
        engine: "json",
        jsonPath: path.join(localDir, "globalstore.json"),
      });
      const seeded = await seedDatabase();
      assert.equal(seeded.catalogSeededThisBoot, false);
      assert.equal(seeded.offHost.reason, "offhost-restored");
      assert.ok(listServices().length > 0);
      assert.equal(listServices().length, committed.services.length);
      const health = getHealthPayload();
      assert.equal(health.factorySeedDisabled, true);
      assert.equal(health.catalogEmpty, false);
      assert.equal(health.services, committed.services.length);
      assert.equal(health.offHostBackupConfigured, true);
      assert.equal(health.offHostBackupRestoredThisBoot, true);
      assert.equal(health.offHostBackupSource, "github-raw");
      assert.ok(fetched.includes(defaultRawBackupUrl()));
    } finally {
      globalThis.fetch = originalFetch;
      for (const key of envKeys) {
        if (prev[key] === undefined) delete process.env[key];
        else process.env[key] = prev[key];
      }
    }
  });
});
