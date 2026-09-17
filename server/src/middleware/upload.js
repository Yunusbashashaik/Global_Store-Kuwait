import fs from "fs";
import multer from "multer";
import { getServiceUploadsDir, getUploadsDir } from "../db/connection.js";
import { serviceImagePublicUrl as stableServiceImageUrl } from "../services/serviceImages.js";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_SERVICE_IMAGE_BYTES = 5 * 1024 * 1024;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function makeStorage(getDest, { jpegName = false } = {}) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        const destDir = getDest();
        ensureDir(destDir);
        cb(null, destDir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (_req, file, cb) => {
      if (jpegName) {
        cb(null, `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
        return;
      }
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}-${safe || "upload"}`);
    },
  });
}

const jpegOnly = (_req, file, cb) => {
  const mime = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();
  const ok =
    mime === "image/jpeg" ||
    mime === "image/jpg" ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg");
  if (!ok) {
    cb(new Error("Image must be JPEG/JPG format"));
    return;
  }
  cb(null, true);
};

const anyImage = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error("Screenshot must be an image (PNG, JPG, WEBP, GIF, etc.)"));
    return;
  }
  cb(null, true);
};

export const uploadServiceImage = multer({
  storage: makeStorage(getServiceUploadsDir, { jpegName: true }),
  limits: { fileSize: MAX_SERVICE_IMAGE_BYTES },
  fileFilter: jpegOnly,
}).single("image");

export const uploadComplaintScreenshot = multer({
  storage: makeStorage(getUploadsDir),
  limits: { fileSize: MAX_SCREENSHOT_BYTES },
  fileFilter: anyImage,
}).single("screenshot");

const jsonSnapshot = (_req, file, cb) => {
  const mime = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();
  const ok =
    mime === "application/json" ||
    mime === "text/json" ||
    mime === "application/octet-stream" ||
    name.endsWith(".json");
  if (!ok) {
    cb(new Error("Backup must be an admin-state.json file"));
    return;
  }
  cb(null, true);
};

export const uploadAdminSnapshot = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: jsonSnapshot,
}).single("snapshot");

export function handleUpload(uploader) {
  return (req, res, next) => {
    uploader(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "File must be 5 MB or smaller" });
          return;
        }
        res.status(400).json({ error: err.message || "Invalid upload" });
        return;
      }
      res.status(400).json({ error: err.message || "Invalid upload" });
    });
  };
}

export function serviceImagePublicUrl(filename) {
  if (!filename) return null;
  if (String(filename).includes("/")) return filename;
  return `/api/uploads/services/${filename}`;
}

export { stableServiceImageUrl };
