import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getServiceUploadsDir } from "../db/connection.js";
import { listServices } from "../models/Service.js";
import { getAllSettings } from "../models/Settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

export function getGodaddySyncDir() {
  return process.env.GODADDY_SYNC_DIR || path.join(REPO_ROOT, "godaddy-sync");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function filenameFromImageUrl(imageUrl) {
  const value = String(imageUrl || "");
  const marker = "/api/uploads/services/";
  const index = value.indexOf(marker);
  if (index === -1) return "";
  return path.basename(value.slice(index + marker.length).split("?")[0]);
}

function copyUploadedFile(filename) {
  const safe = path.basename(String(filename || ""));
  if (!safe) return null;
  const source = path.join(getServiceUploadsDir(), safe);
  if (!fs.existsSync(source)) return null;
  const destDir = path.join(getGodaddySyncDir(), "admin-uploads", "services");
  ensureDir(destDir);
  const dest = path.join(destDir, safe);
  fs.copyFileSync(source, dest);
  return path.relative(getGodaddySyncDir(), dest);
}

export function snapshotAdminChange({ action, uploadedFilename, imageUrl } = {}) {
  try {
    const dir = getGodaddySyncDir();
    ensureDir(path.join(dir, "admin-uploads", "services"));

    const copied = [];
    const fromUpload = copyUploadedFile(uploadedFilename);
    if (fromUpload) copied.push(fromUpload);
    const fromUrl = copyUploadedFile(filenameFromImageUrl(imageUrl));
    if (fromUrl && !copied.includes(fromUrl)) copied.push(fromUrl);

    const catalogPath = path.join(dir, "latest-catalog.json");
    const settingsPath = path.join(dir, "latest-settings.json");
    fs.writeFileSync(
      catalogPath,
      `${JSON.stringify(
        {
          origin: "live",
          exportedAt: new Date().toISOString(),
          services: listServices(),
        },
        null,
        2,
      )}\n`,
    );
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ settings: getAllSettings() }, null, 2)}\n`,
    );

    const logLine = `${JSON.stringify({
      at: new Date().toISOString(),
      action: action || "update",
      copied,
    })}\n`;
    fs.appendFileSync(path.join(dir, "changelog.jsonl"), logLine);
    return { dir, copied };
  } catch (err) {
    console.error("GoDaddy sync snapshot failed:", err);
    return null;
  }
}
