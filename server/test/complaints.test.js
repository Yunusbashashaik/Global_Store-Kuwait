import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import request from "supertest";
import { closeDatabase, initDatabase } from "../src/db/connection.js";
import { seedDatabase } from "../src/db/seed.js";
import { complaintRouter } from "../src/routes/complaints.js";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "gs-complaints-"));

describe("complaints API", () => {
  let app;

  before(async () => {
    initDatabase(path.join(testDir, "test.db"));
    await seedDatabase();
    app = express();
    app.use("/api/complaints", complaintRouter);
  });

  after(() => {
    closeDatabase();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("rejects missing screenshot", async () => {
    const res = await request(app)
      .post("/api/complaints")
      .field("fullName", "Test User")
      .field("phone", "+96550000000")
      .field("subject", "Test")
      .field("details", "Details");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Screenshot is missing/i);
  });

  it("rejects missing text fields", async () => {
    const res = await request(app)
      .post("/api/complaints")
      .field("fullName", " ")
      .field("phone", "123")
      .field("subject", "Test")
      .field("details", "Details")
      .attach("screenshot", PNG, {
        filename: "shot.png",
        contentType: "image/png",
      });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Full Name is missing/i);
  });

  it("rejects non-image uploads with JSON", async () => {
    const res = await request(app)
      .post("/api/complaints")
      .field("fullName", "Test User")
      .field("phone", "+96550000000")
      .field("subject", "Test")
      .field("details", "Details")
      .attach("screenshot", Buffer.from("not-an-image"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });
    assert.equal(res.status, 400);
    assert.equal(typeof res.body.error, "string");
    assert.match(res.body.error, /image/i);
  });

  it("rejects files larger than 5 MB with JSON", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024 + 1024)]);
    const res = await request(app)
      .post("/api/complaints")
      .field("fullName", "Test User")
      .field("phone", "+96550000000")
      .field("subject", "Test")
      .field("details", "Details")
      .attach("screenshot", big, {
        filename: "big.png",
        contentType: "image/png",
      });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /5 MB/i);
  });

  it("accepts a valid image even with a messy filename", async () => {
    const res = await request(app)
      .post("/api/complaints")
      .field("fullName", "Test User")
      .field("phone", "+96550000000")
      .field("subject", "Access issue")
      .field("details", "Need help unlocking my account")
      .attach("screenshot", PNG, {
        filename: "weird name (1) + copy.png",
        contentType: "image/png",
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.ticketId, /^GS-/);
  });
});
