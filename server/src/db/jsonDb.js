import fs from "fs";
import path from "path";

function nowIso() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function normalizeSql(sql) {
  return String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * File-backed store with a better-sqlite3-like prepare() API.
 * Used on hosts (including some GoDaddy plans) where native sqlite cannot load.
 */
export class JsonDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = { services: [], settings: {}, complaints: [] };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      this.data = {
        services: Array.isArray(parsed.services) ? parsed.services : [],
        settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
        complaints: Array.isArray(parsed.complaints) ? parsed.complaints : [],
      };
    } catch {
      this.save();
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload = `${JSON.stringify(this.data, null, 2)}\n`;
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    const fd = fs.openSync(tmp, "w");
    try {
      fs.writeSync(fd, payload);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, this.filePath);
    try {
      const dirFd = fs.openSync(path.dirname(this.filePath), "r");
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      /* some hosts cannot fsync directories */
    }
  }

  pragma() {
    return this;
  }

  exec() {
    return this;
  }

  close() {
    this.save();
  }

  transaction(fn) {
    return (...args) => {
      const result = fn(...args);
      this.save();
      return result;
    };
  }

  prepare(sql) {
    const key = normalizeSql(sql);
    const self = this;
    return {
      all: (...params) => self.dispatch(key, "all", params),
      get: (...params) => self.dispatch(key, "get", params),
      run: (...params) => self.dispatch(key, "run", params),
    };
  }

  dispatch(sql, mode, params) {
    if (sql.startsWith("select * from services order by") || sql === "select * from services") {
      const rows = [...this.data.services].sort((a, b) => {
        const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (order !== 0) return order;
        return String(a.name_en || "").localeCompare(String(b.name_en || ""));
      });
      return mode === "get" ? rows[0] : rows;
    }

    if (sql.startsWith("select image_data from services")) {
      const id = namedOrPositional(params, "id", 0);
      const row = this.data.services.find((s) => s.id === id);
      return row ? { image_data: row.image_data } : undefined;
    }

    if (sql.startsWith("select * from services where id")) {
      const id = namedOrPositional(params, "id", 0);
      const row = this.data.services.find((s) => s.id === id) || undefined;
      return mode === "all" ? (row ? [row] : []) : row;
    }

    if (sql.includes("select count(*) as n from services")) {
      return { n: this.data.services.length };
    }

    if (sql.includes("select coalesce(min(sort_order)")) {
      const min = this.data.services.reduce(
        (m, s) => Math.min(m, Number(s.sort_order) || 0),
        1,
      );
      return { m: this.data.services.length ? min : 1 };
    }

    if (sql.includes("select coalesce(max(sort_order)")) {
      const max = this.data.services.reduce(
        (m, s) => Math.max(m, Number(s.sort_order) || 0),
        -1,
      );
      return { m: this.data.services.length ? max : -1 };
    }

    if (sql.startsWith("insert into services")) {
      const p = asObject(params[0]);
      this.data.services.push({
        id: p.id,
        icon: p.icon || "",
        accent: p.accent || "#38bdf8",
        type_en: p.typeEn,
        type_ar: p.typeAr,
        name_en: p.nameEn,
        name_ar: p.nameAr,
        description_en: p.descriptionEn,
        description_ar: p.descriptionAr,
        price_month: p.priceMonth,
        price_year: p.priceYear,
        image_url: p.imageUrl,
        image_data: p.imageData || null,
        out_of_stock: p.outOfStock,
        offer_type: p.offerType || "none",
        offer_expires_at: p.offerExpiresAt || null,
        sort_order: p.sortOrder,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
      this.save();
      return { changes: 1 };
    }

    if (sql.startsWith("update services set")) {
      const p = asObject(params[0]);
      const index = this.data.services.findIndex((s) => s.id === p.id);
      if (index === -1) return { changes: 0 };
      const current = this.data.services[index];
      this.data.services[index] = {
        ...current,
        name_en: p.nameEn,
        name_ar: p.nameAr,
        description_en: p.descriptionEn,
        description_ar: p.descriptionAr,
        icon: p.icon,
        accent: p.accent,
        type_en: p.typeEn,
        type_ar: p.typeAr,
        image_url: p.imageUrl,
        image_data: p.imageData !== undefined ? p.imageData : current.image_data,
        price_month: p.priceMonth,
        price_year: p.priceYear,
        out_of_stock: p.outOfStock,
        offer_type: p.offerType ?? current.offer_type ?? "none",
        offer_expires_at:
          p.offerExpiresAt === undefined ? current.offer_expires_at || null : p.offerExpiresAt,
        updated_at: nowIso(),
      };
      this.save();
      return { changes: 1 };
    }

    if (sql === "delete from services") {
      const before = this.data.services.length;
      this.data.services = [];
      this.save();
      return { changes: before };
    }

    if (sql.startsWith("delete from services")) {
      const id = namedOrPositional(params, "id", 0);
      const before = this.data.services.length;
      this.data.services = this.data.services.filter((s) => s.id !== id);
      this.save();
      return { changes: before - this.data.services.length };
    }

    if (
      sql.startsWith("select key, value from settings") ||
      sql === "select * from settings" ||
      sql.startsWith("select * from settings")
    ) {
      const rows = Object.entries(this.data.settings).map(([key, value]) => ({
        key,
        value,
      }));
      return mode === "get" ? rows[0] : rows;
    }

    if (sql.startsWith("select value from settings")) {
      const key = namedOrPositional(params, "key", 0);
      const value = this.data.settings[key];
      return value === undefined ? undefined : { value };
    }

    if (sql.startsWith("insert into settings")) {
      const key = params[0];
      const value = params[1];
      this.data.settings[key] = value;
      this.save();
      return { changes: 1 };
    }

    if (sql.includes("select count(*) as n from settings")) {
      return { n: Object.keys(this.data.settings).length };
    }

    if (sql.startsWith("insert into complaints")) {
      const [
        id,
        full_name,
        phone,
        subject,
        details,
        screenshot_path,
        original_filename,
        created_at,
      ] = params;
      this.data.complaints.push({
        id,
        full_name,
        phone,
        subject,
        details,
        screenshot_path,
        original_filename,
        created_at,
      });
      this.save();
      return { changes: 1 };
    }

    throw new Error(`Unsupported JSON store query: ${sql}`);
  }
}

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return {};
}

function namedOrPositional(params, name, index) {
  const first = params[0];
  if (first && typeof first === "object" && !Array.isArray(first) && name in first) {
    return first[name];
  }
  return params[index];
}
