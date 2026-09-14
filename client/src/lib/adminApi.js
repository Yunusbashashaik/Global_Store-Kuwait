import { SERVICES } from "../data/catalog.js";

const CATALOG_CACHE_KEY = "globalstores_services_v3";
const API_BASE_KEY = "globalstores_api_base_v1";

function forCache(service) {
  if (!service || typeof service !== "object") return service;
  const next = { ...service };
  delete next.imageData;
  const imageUrl = String(next.imageUrl || "");
  if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) {
    next.imageUrl = next.id ? `/api/services/${next.id}/image` : null;
  }
  return next;
}

function sanitizeService(service) {
  return forCache(service);
}

function readCachedServices() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed.map(sanitizeService);
  } catch {
    /* ignore */
  }
  return null;
}

function writeCachedServices(services) {
  if (typeof window === "undefined") return;
  if (!Array.isArray(services) || !services.length) return;
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(services.map(forCache)));
  } catch {
    /* ignore quota */
  }
}

const SETTINGS_CACHE_KEY = "globalstores_settings_v1";

function readCachedSettings() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY) || "null");
    if (parsed && typeof parsed === "object" && parsed.complaintEmail) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function writeCachedSettings(settings) {
  if (typeof window === "undefined") return;
  if (!settings || typeof settings !== "object") return;
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota */
  }
}

export function cachedPublicServices() {
  return readCachedServices();
}

export function cachedPublicSettings() {
  return readCachedSettings();
}

function trimSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function unique(list) {
  return [...new Set(list.filter((item) => item !== undefined && item !== null))];
}

function candidateBases() {
  const bases = [];
  if (typeof window !== "undefined") {
    const runtime = window.__GLOBALSTORE_CONFIG__?.apiUrl;
    if (runtime) bases.push(trimSlash(runtime));
    bases.push(trimSlash(window.location.origin));
    const folder = trimSlash(window.location.pathname.replace(/\/[^/]*$/, ""));
    if (folder && folder !== "/") {
      bases.push(trimSlash(`${window.location.origin}${folder}`));
    }
  }
  bases.push(trimSlash(import.meta.env.VITE_API_URL || ""));
  bases.push("");
  return unique(bases);
}

let resolvedBase;
let backendAvailable;

function persistApiBase(base) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(API_BASE_KEY, trimSlash(base));
  } catch {
    /* ignore */
  }
}

function readPersistedApiBase() {
  if (typeof window === "undefined") return "";
  try {
    return trimSlash(localStorage.getItem(API_BASE_KEY) || "");
  } catch {
    return "";
  }
}

function getApiBase() {
  if (resolvedBase !== undefined) return resolvedBase;
  if (typeof window !== "undefined") {
    const runtime = window.__GLOBALSTORE_CONFIG__?.apiUrl;
    if (runtime) return trimSlash(runtime);
    const persisted = readPersistedApiBase();
    if (persisted) return persisted;
  }
  return "";
}

export function apiUrl(path) {
  return `${getApiBase()}${path}`;
}

async function isLiveHealth(base) {
  const res = await fetch(`${trimSlash(base)}/api/health`, { method: "GET" });
  const data = await res.json().catch(() => null);
  return Boolean(res.ok && data && data.ok === true);
}

async function discoverApiBase() {
  if (resolvedBase !== undefined && backendAvailable) return resolvedBase;
  for (const base of candidateBases()) {
    try {
      if (await isLiveHealth(base)) {
        resolvedBase = base;
        backendAvailable = true;
        persistApiBase(base);
        return base;
      }
    } catch {
      /* try next */
    }
  }
  backendAvailable = false;
  return getApiBase();
}

async function hasBackendApi() {
  if (backendAvailable !== undefined) return backendAvailable;
  await discoverApiBase();
  return Boolean(backendAvailable);
}

function resetBackendAvailability() {
  backendAvailable = undefined;
  resolvedBase = undefined;
}

function networkError(err) {
  const message = String(err?.message || err || "");
  if (err?.status === 405) {
    return new Error(
      "The web host blocked /api (HTTP 405). The Node app is not the public site. In GoDaddy cPanel use Application Manager, startup file app.js, then npm install && npm run build.",
    );
  }
  if (
    err instanceof TypeError ||
    /failed to fetch|load failed|networkerror|network request failed/i.test(
      message,
    )
  ) {
    return new Error(
      "Cannot reach /api/health on this domain. Open https://YOUR-DOMAIN/api/health — it must show {\"ok\":true}. If it 404s, Node is not serving the website yet.",
    );
  }
  return err instanceof Error ? err : new Error(message || "Request failed");
}

async function requestJson(path, { method = "GET", body, token, formData } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !formData) {
    headers["Content-Type"] = "application/json";
  }

  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (err) {
    throw networkError(err);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw networkError(err);
  }
  return data;
}

export async function adminLogin(username, password) {
  resetBackendAvailability();
  await discoverApiBase();
  try {
    const data = await requestJson("/api/admin/login", {
      method: "POST",
      body: { username, password },
    });
    backendAvailable = true;
    return data.token;
  } catch (err) {
    throw networkError(err);
  }
}

export async function adminValidateSession(token) {
  if (!token) return false;
  try {
    await requestJson("/api/admin/me", { token });
    return true;
  } catch {
    return false;
  }
}

export async function adminFetchServices(token) {
  const data = await requestJson("/api/admin/services", { token });
  return data.services;
}

export async function adminCreateService(token, payload, imageFile) {
  const formData = new FormData();
  formData.append("nameEn", payload.nameEn || "");
  formData.append("nameAr", payload.nameAr || payload.nameEn || "");
  formData.append("descriptionEn", payload.descriptionEn || "");
  formData.append("descriptionAr", payload.descriptionAr || "");
  formData.append("priceMonth", String(payload.prices?.month ?? ""));
  formData.append("priceYear", String(payload.prices?.year ?? ""));
  if (payload.outOfStock !== undefined) {
    formData.append("outOfStock", String(Boolean(payload.outOfStock)));
  }
  if (imageFile) formData.append("image", imageFile);

  const data = await requestJson("/api/admin/services", {
    method: "POST",
    token,
    formData,
  });
  return data.service;
}

export async function adminSaveService(token, id, payload, imageFile) {
  if (imageFile) {
    const formData = new FormData();
    if (payload.nameEn !== undefined) formData.append("nameEn", payload.nameEn);
    if (payload.nameAr !== undefined) formData.append("nameAr", payload.nameAr);
    if (payload.descriptionEn !== undefined) {
      formData.append("descriptionEn", payload.descriptionEn);
    }
    if (payload.descriptionAr !== undefined) {
      formData.append("descriptionAr", payload.descriptionAr);
    }
    if (payload.prices?.month !== undefined) {
      formData.append("priceMonth", String(payload.prices.month));
    }
    if (payload.prices?.year !== undefined) {
      formData.append("priceYear", String(payload.prices.year));
    }
    if (payload.outOfStock !== undefined) {
      formData.append("outOfStock", String(Boolean(payload.outOfStock)));
    }
    formData.append("image", imageFile);
    const data = await requestJson(`/api/admin/services/${id}`, {
      method: "PUT",
      token,
      formData,
    });
    return data.service;
  }

  const data = await requestJson(`/api/admin/services/${id}`, {
    method: "PUT",
    token,
    body: payload,
  });
  return data.service;
}

export async function adminFetchSettings(token) {
  const data = await requestJson("/api/admin/settings", { token });
  return data.settings;
}

export async function adminSaveSettings(token, patch) {
  const data = await requestJson("/api/admin/settings", {
    method: "PUT",
    token,
    body: patch,
  });
  window.dispatchEvent(new Event("gs:settings-updated"));
  writeCachedSettings(data.settings);
  return data.settings;
}

export async function adminDeleteService(token, id) {
  await requestJson(`/api/admin/services/${id}`, { method: "DELETE", token });
}

export function notifyServicesUpdated(services) {
  if (Array.isArray(services)) writeCachedServices(services);
  window.dispatchEvent(
    new CustomEvent("gs:services-updated", {
      detail: Array.isArray(services) ? { services } : undefined,
    }),
  );
}

export async function adminTranslate(token, text) {
  const data = await requestJson("/api/admin/translate", {
    method: "POST",
    token,
    body: { text },
  });
  return data.text;
}

export async function fetchPublicServices() {
  if (await hasBackendApi()) {
    try {
      const data = await requestJson("/api/services");
      if (Array.isArray(data.services) && data.services.length) {
        writeCachedServices(data.services);
        return data.services;
      }
    } catch {
      /* fall through to last live catalog, never baked defaults */
    }
  }
  const cached = readCachedServices();
  if (cached) return cached;
  return JSON.parse(JSON.stringify(SERVICES));
}

export async function fetchPublicSettings() {
  if (await hasBackendApi()) {
    try {
      const data = await requestJson("/api/settings");
      if (data.settings) {
        writeCachedSettings(data.settings);
        return data.settings;
      }
    } catch {
      /* fall through to last live settings */
    }
  }
  return readCachedSettings();
}
