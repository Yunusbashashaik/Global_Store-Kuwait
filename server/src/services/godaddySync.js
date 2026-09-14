import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAllSettings } from "../models/Settings.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

export function getGodaddySyncDir() {
  return process.env.GODADDY_SYNC_DIR || path.join(REPO_ROOT, "godaddy-sync");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function snapshotAdminChange({ action } = {}) {
  try {
    const dir = getGodaddySyncDir();
    ensureDir(dir);
    const settingsPath = path.join(dir, "latest-settings.json");
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify({ settings: getAllSettings() }, null, 2)}\n`,
    );
    const logLine = `${JSON.stringify({
      at: new Date().toISOString(),
      action: action || "update",
    })}\n`;
    fs.appendFileSync(path.join(dir, "changelog.jsonl"), logLine);
    return { dir, copied: [] };
  } catch (err) {
    console.error("GoDaddy sync snapshot failed:", err);
    return null;
  }
}
