import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import { closeDatabase, initDatabase } from "../src/db/connection.js";
import { seedDatabase } from "../src/db/seed.js";
import { DEFAULT_SERVICES } from "../src/config/defaultServices.js";
import { insertService } from "../src/models/Service.js";
import { adminRouter } from "../src/routes/admin.js";
import { servicesRouter } from "../src/routes/services.js";
import { settingsRouter } from "../src/routes/settings.js";
import { mountUploadStatic } from "../src/middleware/staticUploads.js";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-admin-"));
process.env.GODADDY_SYNC_DIR = path.join(testDir, "godaddy-sync");

const JPEG_1x1 = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc40014100100000000000000000000000000000000ffda00080001000100003f00fbffd9",
  "hex",
);

const FIXTURE_ID = "fixture-service";

describe("services + admin API", () => {
  let app;

  before(() => {
    initDatabase(path.join(testDir, "test.db"));
    seedDatabase();
    insertService({
      id: FIXTURE_ID,
      nameEn: "Fixture Service",
      nameAr: "خدمة تجريبية",
      descriptionEn: "EN",
      descriptionAr: "AR",
      prices: { month: 2, year: 10 },
    });
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use("/api/services", servicesRouter);
    app.use("/api/settings", settingsRouter);
    mountUploadStatic(app);
    app.use("/api/admin", adminRouter);
  });

  after(() => {
    closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("lists services publicly from the database", async () => {
    const res = await request(app).get("/api/services");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.services));
    assert.ok(res.body.services.some((s) => s.id === FIXTURE_ID));
  });

  it("lists public settings from the database", async () => {
    const res = await request(app).get("/api/settings");
    assert.equal(res.status, 200);
    assert.ok(res.body.settings.complaintEmail);
    assert.ok(Array.isArray(res.body.settings.whatsappNumbers));
  });

  it("rejects bad login", async () => {
    const res = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "wrong" });
    assert.equal(res.status, 401);
  });

  it("logs in and updates a service price/description", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const token = login.body.token;
    const update = await request(app)
      .put(`/api/admin/services/${FIXTURE_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        prices: { month: 3, year: 20 },
        descriptionEn: "Updated EN desc",
        descriptionAr: "وصف محدث",
      });
    assert.equal(update.status, 200);
    assert.equal(update.body.service.prices.month, 3);
    assert.equal(update.body.service.prices.year, 20);
    assert.equal(update.body.service.descriptionEn, "Updated EN desc");

    const listed = await request(app).get("/api/services");
    const item = listed.body.services.find((s) => s.id === FIXTURE_ID);
    assert.equal(item.prices.month, 3);
    assert.equal(item.descriptionAr, "وصف محدث");
  });

  it("creates a new service that appears on the public list", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;

    const create = await request(app)
      .post("/api/admin/services")
      .set("Authorization", `Bearer ${token}`)
      .field("nameEn", "Test Stream")
      .field("nameAr", "اختبار")
      .field("descriptionEn", "EN desc")
      .field("descriptionAr", "AR desc")
      .field("priceMonth", "2.5")
      .field("priceYear", "18");

    assert.equal(create.status, 201);
    assert.equal(create.body.service.nameEn, "Test Stream");
    assert.equal(create.body.service.prices.month, 2.5);

    const listed = await request(app).get("/api/services");
    const item = listed.body.services.find((s) => s.nameEn === "Test Stream");
    assert.ok(item);
    assert.equal(listed.body.services[0].nameEn, "Test Stream");
  });

  it("marks zero-price services as out of stock", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;

    const update = await request(app)
      .put(`/api/admin/services/${FIXTURE_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ prices: { month: 0, year: 0 } });

    assert.equal(update.status, 200);
    assert.equal(update.body.service.outOfStock, true);
    assert.equal(update.body.service.prices.month, 0);
  });

  it("updates complaint email and WhatsApp numbers in settings", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;

    const update = await request(app)
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        complaintEmail: "ops@example.com",
        whatsappNumbers: ["96550001111", "96550002222"],
        aboutEn: "New about",
        socialLinks: { instagram: "https://instagram.com/example" },
      });

    assert.equal(update.status, 200);
    assert.equal(update.body.settings.complaintEmail, "ops@example.com");
    assert.deepEqual(update.body.settings.whatsappNumbers, [
      "96550001111",
      "96550002222",
    ]);
    assert.equal(update.body.settings.aboutEn, "New about");
    assert.equal(
      update.body.settings.socialLinks.instagram,
      "https://instagram.com/example",
    );

    const publicSettings = await request(app).get("/api/settings");
    assert.equal(publicSettings.body.settings.complaintEmail, "ops@example.com");
  });

  it("requires auth for updates", async () => {
    const res = await request(app)
      .put(`/api/admin/services/${FIXTURE_ID}`)
      .send({ prices: { month: 9 } });
    assert.equal(res.status, 401);
  });

  it("loads the hardcoded 42-service catalog", async () => {
    assert.equal(DEFAULT_SERVICES.length, 42);
    const res = await request(app).get("/api/services");
    assert.equal(res.status, 200);
    const ids = res.body.services.map((s) => s.id);
    assert.equal(ids.includes("netflix-prime-combo"), true);
    assert.equal(ids.includes("whatsapp-number"), true);
    assert.equal(ids.includes("disney-plus"), false);
    assert.equal(ids.includes("chatgpt-plus"), false);
    assert.equal(ids.includes("expressvpn"), false);
    assert.equal(ids.includes("netflix-private"), false);
  });

  it("deletes a service from the public catalog", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;

    const created = await request(app)
      .post("/api/admin/services")
      .set("Authorization", `Bearer ${token}`)
      .field("nameEn", "Temp Delete Me")
      .field("descriptionEn", "EN")
      .field("descriptionAr", "AR")
      .field("priceMonth", "1")
      .field("priceYear", "8");
    assert.equal(created.status, 201);
    const id = created.body.service.id;

    const del = await request(app)
      .delete(`/api/admin/services/${id}`)
      .set("Authorization", `Bearer ${token}`);
    assert.equal(del.status, 200);

    const listed = await request(app).get("/api/services");
    assert.equal(
      listed.body.services.some((s) => s.id === id),
      false,
    );
  });

  it("returns and updates owner copy in public settings", async () => {
    const res = await request(app).get("/api/settings");
    assert.ok(res.body.settings.ownersEn);

    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;
    const put = await request(app)
      .put("/api/admin/settings")
      .set("Authorization", `Bearer ${token}`)
      .send({ ownersEn: "Owned by Test Owners" });
    assert.equal(put.status, 200);
    assert.equal(put.body.settings.ownersEn, "Owned by Test Owners");

    const again = await request(app).get("/api/settings");
    assert.equal(again.body.settings.ownersEn, "Owned by Test Owners");
  });

  it("keeps a newly uploaded service JPEG after listing public services", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;

    const update = await request(app)
      .put(`/api/admin/services/${FIXTURE_ID}`)
      .set("Authorization", `Bearer ${token}`)
      .attach("image", JPEG_1x1, "custom-fixture.jpg");

    assert.equal(update.status, 200);
    assert.equal(
      update.body.service.imageUrl,
      `/api/services/${FIXTURE_ID}/image`,
    );

    const listed = await request(app).get("/api/services");
    const item = listed.body.services.find((s) => s.id === FIXTURE_ID);
    assert.equal(item.imageUrl, `/api/services/${FIXTURE_ID}/image`);
    assert.ok(item.imageData && item.imageData.length > 20);

    const file = await request(app).get(`/api/services/${FIXTURE_ID}/image`);
    assert.equal(file.status, 200);
    assert.ok(Number(file.headers["content-length"] || file.body?.length || 0) > 0);

    const alias = await request(app).get(`/service-images/${FIXTURE_ID}.jpg`);
    assert.equal(alias.status, 200);
    const uploadAlias = await request(app).get(`/api/uploads/services/${FIXTURE_ID}.jpg`);
    assert.equal(uploadAlias.status, 200);
  });

  it("translates English service copy to Arabic", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => [[["خدمة الاختبار اليدوي", "Manual Test Service"]]],
    });
    try {
      const login = await request(app)
        .post("/api/admin/login")
        .send({ username: "admin", password: "Wz%861?01" });
      const res = await request(app)
        .post("/api/admin/translate")
        .set("Authorization", `Bearer ${login.body.token}`)
        .send({ text: "Manual Test Service" });
      assert.equal(res.status, 200);
      assert.match(res.body.text, /[\u0600-\u06FF]/);
      assert.equal(res.body.text.includes("Manual Test Service"), false);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("rejects unauthenticated translate and delete", async () => {
    const translate = await request(app)
      .post("/api/admin/translate")
      .send({ text: "Hello" });
    assert.equal(translate.status, 401);

    const del = await request(app).delete(`/api/admin/services/${FIXTURE_ID}`);
    assert.equal(del.status, 401);
  });

  it("creates an optional offer and hides it from public after expiry", async () => {
    const login = await request(app)
      .post("/api/admin/login")
      .send({ username: "admin", password: "Wz%861?01" });
    const token = login.body.token;

    const none = await request(app)
      .post("/api/admin/services")
      .set("Authorization", `Bearer ${token}`)
      .field("nameEn", "Regular Add")
      .field("nameAr", "عادي")
      .field("descriptionEn", "EN")
      .field("descriptionAr", "AR")
      .field("priceMonth", "1")
      .field("priceYear", "8")
      .field("offerType", "none");
    assert.equal(none.status, 201);
    assert.equal(none.body.service.offerType, "none");

    const expired = await request(app)
      .post("/api/admin/services")
      .set("Authorization", `Bearer ${token}`)
      .field("nameEn", "Expired Eid")
      .field("nameAr", "عيد")
      .field("descriptionEn", "EN")
      .field("descriptionAr", "AR")
      .field("priceMonth", "1")
      .field("priceYear", "8")
      .field("offerType", "eid")
      .field("offerExpiresAt", new Date(Date.now() - 5000).toISOString());
    assert.equal(expired.status, 201);

    const active = await request(app)
      .post("/api/admin/services")
      .set("Authorization", `Bearer ${token}`)
      .field("nameEn", "Active Special")
      .field("nameAr", "خاص")
      .field("descriptionEn", "EN")
      .field("descriptionAr", "AR")
      .field("priceMonth", "2")
      .field("priceYear", "9")
      .field("offerType", "special")
      .field("offerExpiresAt", new Date(Date.now() + 60_000).toISOString());
    assert.equal(active.status, 201);

    const publicList = await request(app).get("/api/services");
    const adminList = await request(app)
      .get("/api/admin/services")
      .set("Authorization", `Bearer ${token}`);
    assert.equal(
      publicList.body.services.some((s) => s.nameEn === "Expired Eid"),
      false,
    );
    assert.ok(publicList.body.services.some((s) => s.nameEn === "Active Special"));
    assert.ok(publicList.body.services.some((s) => s.nameEn === "Regular Add"));
    assert.ok(adminList.body.services.some((s) => s.nameEn === "Expired Eid"));
  });
});
