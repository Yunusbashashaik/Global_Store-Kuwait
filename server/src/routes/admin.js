import { Router } from "express";
import {
  createAdminService,
  deleteAdminService,
  exportAdminCatalog,
  getAdminServices,
  getAdminSettings,
  importAdminCatalog,
  login,
  me,
  putAdminSettings,
  translateAdmin,
  updateAdminService,
} from "../controllers/adminController.js";
import { requireAdmin } from "../middleware/auth.js";
import {
  handleUpload,
  uploadAdminSnapshot,
  uploadServiceImage,
} from "../middleware/upload.js";

export const adminRouter = Router();

adminRouter.post("/login", login);
adminRouter.get("/me", requireAdmin, me);
adminRouter.get("/services", requireAdmin, getAdminServices);
adminRouter.post(
  "/services",
  requireAdmin,
  handleUpload(uploadServiceImage),
  createAdminService,
);
adminRouter.put(
  "/services/:id",
  requireAdmin,
  handleUpload(uploadServiceImage),
  updateAdminService,
);
adminRouter.delete("/services/:id", requireAdmin, deleteAdminService);
adminRouter.post("/translate", requireAdmin, translateAdmin);
adminRouter.get("/settings", requireAdmin, getAdminSettings);
adminRouter.put("/settings", requireAdmin, putAdminSettings);
adminRouter.get("/catalog-backup", requireAdmin, exportAdminCatalog);
adminRouter.post(
  "/catalog-backup",
  requireAdmin,
  handleUpload(uploadAdminSnapshot),
  importAdminCatalog,
);
