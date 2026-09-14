import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, getServiceUploadsDir } from "../db/connection.js";

const REPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

export function safeServiceId(id) {
  const safe = String(id || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "service";
}

export function serviceImageFilename(id) {
  return `${safeServiceId(id)}.jpg`;
}

export function serviceImagePublicUrl(id) {
  return `/api/services/${safeServiceId(id)}/image`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clientDistServiceImagesDir() {
  return path.join(REPO_ROOT, "client", "dist", "service-images");
}

function copyFileIfPresent(source, dest) {
  if (!source || !fs.existsSync(source) || source === dest) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(source, dest);
  return true;
}

export function mirrorServiceImageFile(filename) {
  const safe = path.basename(String(filename || ""));
  if (!safe) return;
  const source = path.join(getServiceUploadsDir(), safe);
  if (!fs.existsSync(source)) return;
  copyFileIfPresent(source, path.join(clientDistServiceImagesDir(), safe));
}

function filenameFromImageUrl(imageUrl) {
  const value = String(imageUrl || "").split("?")[0];
  const imageRoute = value.match(/\/api\/services\/([^/]+)\/image$/);
  if (imageRoute) return `${imageRoute[1]}.jpg`;
  const marker = "/api/uploads/services/";
  const index = value.indexOf(marker);
  if (index === -1) {
    const alt = "/service-images/";
    const altIndex = value.indexOf(alt);
    if (altIndex === -1) return path.basename(value);
    return path.basename(value.slice(altIndex + alt.length));
  }
  return path.basename(value.slice(index + marker.length));
}

function imageSearchDirs() {
  return [
    getServiceUploadsDir(),
    path.join(REPO_ROOT, "server", "data", "uploads", "services"),
    path.join(REPO_ROOT, "client", "public", "service-images"),
    path.join(REPO_ROOT, "client", "dist", "service-images"),
  ];
}

function findExistingImage(id, imageUrl) {
  const names = [
    serviceImageFilename(id),
    filenameFromImageUrl(imageUrl),
  ].filter(Boolean);
  const unique = [...new Set(names)];
  for (const dir of imageSearchDirs()) {
    for (const name of unique) {
      const candidate = path.join(dir, path.basename(name));
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
  }
  return null;
}

export function commitServiceImage(id, tempPath) {
  if (!id || !tempPath || !fs.existsSync(tempPath)) {
    throw new Error("Service image upload is missing");
  }
  const destDir = getServiceUploadsDir();
  ensureDir(destDir);
  const dest = path.join(destDir, serviceImageFilename(id));
  if (path.resolve(tempPath) !== path.resolve(dest)) {
    fs.copyFileSync(tempPath, dest);
    const tmpName = path.basename(tempPath);
    if (tmpName.startsWith("tmp-") && path.dirname(tempPath) === destDir) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        /* ignore */
      }
    }
  }
  mirrorServiceImageFile(serviceImageFilename(id));
  return {
    imageUrl: serviceImagePublicUrl(id),
    imageData: fs.readFileSync(dest).toString("base64"),
  };
}

export function loadImageData(id, imageUrl) {
  const file = getServiceImagePath(id, imageUrl);
  if (!file) return null;
  try {
    return fs.readFileSync(file).toString("base64");
  } catch {
    return null;
  }
}

export function writeImageDataFile(id, imageData) {
  const raw = String(imageData || "");
  const payload = raw.includes("base64,") ? raw.split("base64,").pop() : raw;
  if (!payload) return null;
  const destDir = getServiceUploadsDir();
  ensureDir(destDir);
  const dest = path.join(destDir, serviceImageFilename(id));
  fs.writeFileSync(dest, Buffer.from(payload, "base64"));
  mirrorServiceImageFile(serviceImageFilename(id));
  return dest;
}

export function removeServiceImage(id) {
  const dest = path.join(getServiceUploadsDir(), serviceImageFilename(id));
  try {
    fs.unlinkSync(dest);
  } catch {
    /* ignore */
  }
}

export function persistServiceImageFiles(services = []) {
  ensureDir(getServiceUploadsDir());
  for (const service of services) {
    if (!service?.id) continue;
    const found = findExistingImage(service.id, service.imageUrl);
    if (!found) continue;
    const dest = path.join(getServiceUploadsDir(), serviceImageFilename(service.id));
    if (path.resolve(found) !== path.resolve(dest)) {
      fs.copyFileSync(found, dest);
    }
    mirrorServiceImageFile(serviceImageFilename(service.id));
  }
}

export function getServiceImagePath(id, imageUrl) {
  const dest = path.join(getServiceUploadsDir(), serviceImageFilename(id));
  if (fs.existsSync(dest) && fs.statSync(dest).isFile()) return dest;
  return findExistingImage(id, imageUrl);
}

export function sendServiceImage(req, res) {
  const id = req.params.id;
  const filePath = getServiceImagePath(id);
  if (filePath) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.sendFile(path.resolve(filePath));
    return;
  }
  try {
    const row = getDb().prepare("SELECT image_data FROM services WHERE id = ?").get(id);
    const payload = imagePayload(row?.image_data);
    if (payload) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.end(payload);
      return;
    }
  } catch {
    /* fall through */
  }
  res.status(404).type("application/json").json({ error: "Image not found" });
}

function imagePayload(imageData) {
  const raw = String(imageData || "");
  const encoded = raw.includes("base64,") ? raw.split("base64,").pop() : raw;
  if (!encoded) return null;
  try {
    const buf = Buffer.from(encoded, "base64");
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

export function restoreServiceImageFiles(services = []) {
  persistServiceImageFiles(services);
  return services.map((service) => {
    if (!service?.id) return service;
    const data = service.imageData || service.image_data;
    if (data) writeImageDataFile(service.id, data);
    const dest = path.join(
      getServiceUploadsDir(),
      serviceImageFilename(service.id),
    );
    if (!fs.existsSync(dest)) return service;
    const nextUrl = serviceImagePublicUrl(service.id);
    if (service.imageUrl === nextUrl && (service.imageData || !data)) return service;
    return { ...service, imageUrl: nextUrl, imageData: data || service.imageData };
  });
}
