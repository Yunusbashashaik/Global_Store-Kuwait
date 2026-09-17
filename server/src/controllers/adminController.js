import {
  authenticateAdmin,
  createSessionToken,
} from "../middleware/auth.js";
import {
  deleteService,
  insertService,
  listServices,
  updateService,
} from "../models/Service.js";
import { getAllSettings, updateSettings } from "../models/Settings.js";
import { snapshotAdminChange } from "../services/godaddySync.js";
import { persistLiveCatalog, applyImportedAdminState, currentAdminSnapshotPayload } from "../db/persist.js";
import {
  commitServiceImage,
  removeServiceImage,
} from "../services/serviceImages.js";
import { translateEnglishToArabic } from "../services/translate.js";

function slugify(name) {
  const base = String(name || "service")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "service";
}

function uniqueServiceId(name) {
  const taken = new Set(listServices().map((service) => service.id));
  let id = slugify(name);
  if (!taken.has(id)) return id;
  let i = 2;
  while (taken.has(`${id}-${i}`)) i += 1;
  return `${id}-${i}`;
}

function parseBodyPrices(body) {
  const prices = {};
  if (body.prices && typeof body.prices === "object") {
    if (body.prices.month !== undefined) prices.month = body.prices.month;
    if (body.prices.year !== undefined) prices.year = body.prices.year;
  }
  if (body.priceMonth !== undefined) prices.month = body.priceMonth;
  if (body.priceYear !== undefined) prices.year = body.priceYear;
  return prices;
}

function parseOfferFields(body, { required = false } = {}) {
  const hasType = body.offerType !== undefined || body.offer_type !== undefined;
  const hasExpiry =
    body.offerExpiresAt !== undefined || body.offer_expires_at !== undefined;
  if (!required && !hasType && !hasExpiry) return {};
  return {
    offerType: body.offerType ?? body.offer_type ?? "none",
    offerExpiresAt: body.offerExpiresAt ?? body.offer_expires_at ?? null,
  };
}

function parseOutOfStock(body) {
  if (body.outOfStock === undefined && body.out_of_stock === undefined) {
    return undefined;
  }
  const raw = body.outOfStock ?? body.out_of_stock;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === "1" || raw === 1) return true;
  if (raw === "false" || raw === "0" || raw === 0) return false;
  return undefined;
}

export function login(req, res) {
  const { username, password } = req.body || {};
  if (!authenticateAdmin(username, password)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  res.json({ token: createSessionToken() });
}

export function me(_req, res) {
  res.json({ ok: true, role: "admin" });
}

export function getAdminServices(_req, res) {
  try {
    res.json({ services: listServices() });
  } catch (err) {
    console.error("Admin services load failed:", err);
    res.status(500).json({ error: "Failed to load services" });
  }
}

export function createAdminService(req, res) {
  try {
    const body = req.body || {};
    const nameEn = String(body.nameEn || body.name || "").trim();
    if (!nameEn) {
      res.status(400).json({ error: "Service name is required" });
      return;
    }

    const prices = parseBodyPrices(body);
    if (prices.month === undefined || prices.year === undefined) {
      res.status(400).json({ error: "1-month and 1-year prices are required" });
      return;
    }

    const id = uniqueServiceId(nameEn);
    let imageUrl = body.imageUrl || null;
    let imageData = null;
    if (req.file) {
      const committed = commitServiceImage(id, req.file.path);
      imageUrl = committed.imageUrl;
      imageData = committed.imageData;
    }

    const service = insertService({
      id,
      nameEn,
      nameAr: String(body.nameAr || nameEn).trim(),
      descriptionEn: String(body.descriptionEn || "").trim(),
      descriptionAr: String(body.descriptionAr || "").trim(),
      prices,
      outOfStock: parseOutOfStock(body),
      imageUrl,
      imageData,
      icon: body.icon || "✨",
      accent: body.accent || "#38bdf8",
      typeEn: body.typeEn || "Shared / Private",
      typeAr: body.typeAr || "مشترك / خاص",
      ...parseOfferFields(body, { required: true }),
    });

    snapshotAdminChange({
      action: "create-service",
      uploadedFilename: req.file?.filename,
      imageUrl,
    });
    persistLiveCatalog();

    res.status(201).json({ service });
  } catch (err) {
    console.error("Service create failed:", err);
    res.status(400).json({ error: err.message || "Create failed" });
  }
}

export function updateAdminService(req, res) {
  try {
    const body = req.body || {};
    const patch = {
      nameEn: body.nameEn,
      nameAr: body.nameAr,
      descriptionEn: body.descriptionEn,
      descriptionAr: body.descriptionAr,
      icon: body.icon,
      accent: body.accent,
      typeEn: body.typeEn,
      typeAr: body.typeAr,
      prices: parseBodyPrices(body),
      outOfStock: parseOutOfStock(body),
      ...parseOfferFields(body),
    };

    if (req.file) {
      const committed = commitServiceImage(req.params.id, req.file.path);
      patch.imageUrl = committed.imageUrl;
      patch.imageData = committed.imageData;
    } else if (typeof body.imageUrl === "string") {
      patch.imageUrl = body.imageUrl;
    }

    if (Object.keys(patch.prices).length === 0) {
      delete patch.prices;
    }

    const updated = updateService(req.params.id, patch);
    if (!updated) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    snapshotAdminChange({
      action: "update-service",
      uploadedFilename: req.file?.filename,
      imageUrl: updated.imageUrl,
    });
    persistLiveCatalog();
    res.json({ service: updated });
  } catch (err) {
    console.error("Service update failed:", err);
    res.status(400).json({ error: err.message || "Update failed" });
  }
}

export function deleteAdminService(req, res) {
  try {
    const removed = deleteService(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Service not found" });
      return;
    }
    removeServiceImage(req.params.id);
    snapshotAdminChange({ action: "delete-service" });
    persistLiveCatalog();
    res.json({ ok: true, id: req.params.id });
  } catch (err) {
    console.error("Service delete failed:", err);
    res.status(400).json({ error: err.message || "Delete failed" });
  }
}

export async function translateAdmin(req, res) {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) {
      res.status(400).json({ error: "Text is required" });
      return;
    }
    const translated = await translateEnglishToArabic(text);
    res.json({ text: translated });
  } catch (err) {
    console.error("Translate failed:", err);
    res.status(502).json({ error: err.message || "Translation failed" });
  }
}

export function getAdminSettings(_req, res) {
  try {
    res.json({ settings: getAllSettings() });
  } catch (err) {
    console.error("Settings load failed:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
}

export function putAdminSettings(req, res) {
  try {
    const settings = updateSettings(req.body || {});
    snapshotAdminChange({ action: "update-settings" });
    persistLiveCatalog();
    res.json({ settings });
  } catch (err) {
    console.error("Settings update failed:", err);
    res.status(400).json({ error: err.message || "Update failed" });
  }
}

export function exportAdminCatalog(_req, res) {
  try {
    const payload = currentAdminSnapshotPayload();
    if (!payload) {
      res.status(500).json({ error: "Catalog is not ready" });
      return;
    }
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="admin-state.json"');
    res.send(body);
  } catch (err) {
    console.error("Catalog export failed:", err);
    res.status(500).json({ error: err.message || "Export failed" });
  }
}

export function importAdminCatalog(req, res) {
  try {
    let parsed = req.body;
    if (req.file?.buffer) {
      parsed = JSON.parse(req.file.buffer.toString("utf8"));
    } else if (typeof req.body === "string") {
      parsed = JSON.parse(req.body);
    } else if (req.body?.snapshot && typeof req.body.snapshot === "object") {
      parsed = req.body.snapshot;
    }
    const result = applyImportedAdminState(parsed);
    persistLiveCatalog();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("Catalog import failed:", err);
    res.status(400).json({ error: err.message || "Import failed" });
  }
}
