import { getDb } from "../db/connection.js";
import { loadImageData } from "../services/serviceImages.js";

function rowToService(row) {
  if (!row) return null;
  const outOfStock = Boolean(row.out_of_stock);
  const month = outOfStock ? 0 : Number(row.price_month);
  const year = outOfStock ? 0 : Number(row.price_year);
  return {
    id: row.id,
    icon: row.icon || "",
    accent: row.accent || "#38bdf8",
    typeEn: row.type_en,
    typeAr: row.type_ar,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    descriptionEn: row.description_en,
    descriptionAr: row.description_ar,
    prices: { month, year },
    imageUrl: row.image_url || null,
    imageData: row.image_data || null,
    outOfStock,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at || null,
  };
}

function deriveOutOfStock(prices, explicit) {
  if (typeof explicit === "boolean") return explicit;
  const month = Number(prices?.month);
  const year = Number(prices?.year);
  return (
    (Number.isFinite(month) && month === 0) ||
    (Number.isFinite(year) && year === 0)
  );
}

function sanitizePrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid price");
  }
  return Math.round(n * 1000) / 1000;
}

export function listServices() {
  const rows = getDb()
    .prepare("SELECT * FROM services ORDER BY sort_order ASC, name_en ASC")
    .all();
  return rows.map((row) => hydrateInlineImage(rowToService(row)));
}

function hydrateInlineImage(service) {
  if (!service) return service;
  if (service.imageData) return service;
  const data = loadImageData(service.id, service.imageUrl);
  if (!data) return service;
  return { ...service, imageData: data };
}

function getServiceById(id) {
  const row = getDb().prepare("SELECT * FROM services WHERE id = ?").get(id);
  return hydrateInlineImage(rowToService(row));
}

function countServices() {
  return getDb().prepare("SELECT COUNT(*) AS n FROM services").get().n;
}

export function insertService(data) {
  const db = getDb();
  const nextOrder =
    db.prepare("SELECT COALESCE(MIN(sort_order), 1) AS m FROM services").get()
      .m - 1;

  const outOfStock = deriveOutOfStock(data.prices, data.outOfStock);
  const month = outOfStock ? 0 : sanitizePrice(data.prices?.month ?? 0);
  const year = outOfStock ? 0 : sanitizePrice(data.prices?.year ?? 0);

  db.prepare(
    `INSERT INTO services (
      id, icon, accent, type_en, type_ar, name_en, name_ar,
      description_en, description_ar, price_month, price_year,
      image_url, image_data, out_of_stock, sort_order, updated_at
    ) VALUES (
      @id, @icon, @accent, @typeEn, @typeAr, @nameEn, @nameAr,
      @descriptionEn, @descriptionAr, @priceMonth, @priceYear,
      @imageUrl, @imageData, @outOfStock, @sortOrder, datetime('now')
    )`,
  ).run({
    id: data.id,
    icon: data.icon || "✨",
    accent: data.accent || "#38bdf8",
    typeEn: data.typeEn || "Shared / Private",
    typeAr: data.typeAr || "مشترك / خاص",
    nameEn: data.nameEn,
    nameAr: data.nameAr || data.nameEn,
    descriptionEn: data.descriptionEn || "",
    descriptionAr: data.descriptionAr || "",
    priceMonth: month,
    priceYear: year,
    imageUrl: data.imageUrl || null,
    imageData: data.imageData || loadImageData(data.id, data.imageUrl) || null,
    outOfStock: outOfStock ? 1 : 0,
    sortOrder: data.sortOrder ?? nextOrder,
  });

  return getServiceById(data.id);
}

export function updateService(id, patch) {
  const current = getServiceById(id);
  if (!current) return null;

  const nextPrices = {
    month:
      patch.prices?.month !== undefined
        ? sanitizePrice(patch.prices.month)
        : current.prices.month,
    year:
      patch.prices?.year !== undefined
        ? sanitizePrice(patch.prices.year)
        : current.prices.year,
  };

  const outOfStock = deriveOutOfStock(
    nextPrices,
    typeof patch.outOfStock === "boolean" ? patch.outOfStock : undefined,
  );

  const next = {
    nameEn: typeof patch.nameEn === "string" ? patch.nameEn : current.nameEn,
    nameAr: typeof patch.nameAr === "string" ? patch.nameAr : current.nameAr,
    descriptionEn:
      typeof patch.descriptionEn === "string"
        ? patch.descriptionEn
        : current.descriptionEn,
    descriptionAr:
      typeof patch.descriptionAr === "string"
        ? patch.descriptionAr
        : current.descriptionAr,
    icon: typeof patch.icon === "string" ? patch.icon : current.icon,
    accent: typeof patch.accent === "string" ? patch.accent : current.accent,
    typeEn: typeof patch.typeEn === "string" ? patch.typeEn : current.typeEn,
    typeAr: typeof patch.typeAr === "string" ? patch.typeAr : current.typeAr,
    imageUrl:
      patch.imageUrl !== undefined ? patch.imageUrl : current.imageUrl,
    imageData:
      patch.imageData !== undefined ? patch.imageData : current.imageData,
    priceMonth: outOfStock ? 0 : nextPrices.month,
    priceYear: outOfStock ? 0 : nextPrices.year,
    outOfStock: outOfStock ? 1 : 0,
  };

  getDb()
    .prepare(
      `UPDATE services SET
        name_en = @nameEn,
        name_ar = @nameAr,
        description_en = @descriptionEn,
        description_ar = @descriptionAr,
        icon = @icon,
        accent = @accent,
        type_en = @typeEn,
        type_ar = @typeAr,
        image_url = @imageUrl,
        image_data = @imageData,
        price_month = @priceMonth,
        price_year = @priceYear,
        out_of_stock = @outOfStock,
        updated_at = datetime('now')
      WHERE id = @id`,
    )
    .run({ ...next, id });

  return getServiceById(id);
}

export function deleteService(id) {
  const existing = getServiceById(id);
  if (!existing) return false;
  getDb().prepare("DELETE FROM services WHERE id = ?").run(id);
  return true;
}

export function seedServicesIfEmpty(defaults) {
  if (countServices() > 0) return false;
  replaceServicesFromCode(defaults);
  return true;
}

/** Catalog source of truth is shared/defaultServices.js — not JSON backups. */
export function replaceServicesFromCode(defaults) {
  const wanted = Array.isArray(defaults) ? defaults : [];
  const existing = listServices();
  existing.forEach((service) => {
    deleteService(service.id);
  });
  wanted.forEach((service, index) => {
    insertService({
      ...service,
      sortOrder: index,
      imageUrl: service.imageUrl || null,
      imageData: service.imageData || null,
    });
  });
  return wanted.length;
}
