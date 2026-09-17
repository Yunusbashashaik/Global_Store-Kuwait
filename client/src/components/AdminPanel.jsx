import { useCallback, useEffect, useRef, useState } from "react";
import GlassModal from "./GlassModal.jsx";
import {
  adminCreateService,
  adminDeleteService,
  adminFetchServices,
  adminFetchSettings,
  adminLogin,
  adminSaveService,
  adminSaveSettings,
  adminTranslate,
  adminUploadCatalogBackup,
  adminValidateSession,
  adminDownloadCatalogBackup,
  notifyServicesUpdated,
} from "../lib/adminApi.js";
import { compressJpeg } from "../lib/compressJpeg.js";
import { serviceImagePreviewSrc } from "../lib/serviceImageSrc.js";

const TOKEN_KEY = "globalstores_admin_token";
const TOAST_MS = 3200;

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

const emptyServiceDraft = {
  nameEn: "",
  nameAr: "",
  descriptionEn: "",
  descriptionAr: "",
  prices: { month: "", year: "" },
  offerType: "none",
  offerExpiresAt: "",
};

const EDIT_SECTIONS = [
  { id: "services", labelKey: "adminEditServices" },
  { id: "email", labelKey: "adminEditEmail" },
  { id: "contact", labelKey: "adminEditContact" },
  { id: "about", labelKey: "adminEditAbout" },
];

const SOCIAL_LABELS = {
  whatsapp: "socialWhatsApp",
  instagram: "socialInstagram",
  tiktok: "socialTikTok",
  youtube: "socialYouTube",
  facebook: "socialFacebook",
};

function toSettingsDraft(settings) {
  return {
    complaintEmail: settings.complaintEmail || "",
    whatsappNumbers:
      Array.isArray(settings.whatsappNumbers) && settings.whatsappNumbers.length
        ? [...settings.whatsappNumbers]
        : [""],
    aboutEn: settings.aboutEn || "",
    aboutAr: settings.aboutAr || "",
    ownersEn: settings.ownersEn || "",
    ownersAr: settings.ownersAr || "",
    socialLinks: {
      whatsapp: settings.socialLinks?.whatsapp || "",
      instagram: settings.socialLinks?.instagram || "",
      tiktok: settings.socialLinks?.tiktok || "",
      youtube: settings.socialLinks?.youtube || "",
      facebook: settings.socialLinks?.facebook || "",
    },
  };
}

function formatWhatsAppInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "+";
}

function toDatetimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toDraft(service) {
  return {
    nameEn: service.nameEn || "",
    nameAr: service.nameAr || "",
    descriptionEn: service.descriptionEn || "",
    descriptionAr: service.descriptionAr || "",
    prices: {
      month: service.prices?.month ?? "",
      year: service.prices?.year ?? "",
    },
    offerType: service.offerType || "none",
    offerExpiresAt: toDatetimeLocal(service.offerExpiresAt),
  };
}

export default function AdminPanel({ open, onClose, t }) {
  const [token, setTokenState] = useState(() => getToken());
  const [view, setView] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [translating, setTranslating] = useState("");

  const [services, setServices] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(emptyServiceDraft);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [settingsDraft, setSettingsDraft] = useState(null);

  const [confirmContact, setConfirmContact] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cacheRef = useRef({ services: null, settings: null });
  const toastTimer = useRef(null);
  const importInputRef = useRef(null);

  const showToast = useCallback((text) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), TOAST_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const prefetch = useCallback(
    async (sessionToken) => {
      const [list, settings] = await Promise.all([
        cacheRef.current.services
          ? Promise.resolve(cacheRef.current.services)
          : adminFetchServices(sessionToken),
        cacheRef.current.settings
          ? Promise.resolve(cacheRef.current.settings)
          : adminFetchSettings(sessionToken),
      ]);
      cacheRef.current.services = list;
      cacheRef.current.settings = settings;
      setServices(list);
      setSettingsDraft(toSettingsDraft(settings));
      return { list, settings };
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    setError("");
    setConfirmContact(false);
    setConfirmEmail(false);
    setConfirmDelete(false);

    const existing = getToken();
    if (!existing) {
      setTokenState("");
      setView("login");
      return;
    }

    let cancelled = false;
    setChecking(true);
    adminValidateSession(existing)
      .then(async (ok) => {
        if (cancelled) return;
        if (!ok) {
          setToken("");
          setTokenState("");
          setView("login");
          return;
        }
        setTokenState(existing);
        setView("dashboard");
        prefetch(existing).catch(() => {});
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, prefetch]);

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const onLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const sessionToken = await adminLogin(username, password);
      setToken(sessionToken);
      setTokenState(sessionToken);
      setPassword("");
      setView("dashboard");
      await prefetch(sessionToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    setToken("");
    setTokenState("");
    setView("login");
    cacheRef.current = { services: null, settings: null };
    setServices([]);
    setSelectedId("");
    setDraft(emptyServiceDraft);
    setSettingsDraft(null);
    setToast("");
    setError("");
  };

  const goDashboard = () => {
    setView("dashboard");
    setError("");
    setSelectedId("");
    setDraft(emptyServiceDraft);
    setImageFile(null);
    setImagePreview("");
  };

  const openAdd = () => {
    setView("add");
    setDraft(emptyServiceDraft);
    setImageFile(null);
    setImagePreview("");
    setError("");
  };

  const openEditMenu = () => {
    setView("edit-menu");
    setError("");
    prefetch(token).catch((err) => setError(err.message));
  };

  const onExportCatalog = async () => {
    setBusy(true);
    setError("");
    try {
      const blob = await adminDownloadCatalogBackup(token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "admin-state.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast(t.adminCatalogExported);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onImportCatalog = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await adminUploadCatalogBackup(token, file);
      cacheRef.current = { services: null, settings: null };
      const { list } = await prefetch(token);
      notifyServicesUpdated(list);
      showToast(t.adminCatalogImported);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const selectEditSection = async (sectionId) => {
    setError("");
    setBusy(true);
    try {
      if (sectionId === "services") {
        await prefetch(token);
        setSelectedId("");
        setDraft(emptyServiceDraft);
        setImageFile(null);
        setImagePreview("");
        setView("edit-services");
        return;
      }
      await prefetch(token);
      setView(`edit-${sectionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onSelectService = (id) => {
    setSelectedId(id);
    const service = services.find((s) => s.id === id);
    if (service) {
      setDraft(toDraft(service));
      setImagePreview(
        service.imageData
          ? `data:image/jpeg;base64,${service.imageData}`
          : service.imageUrl || "",
      );
    }
    setImageFile(null);
    setError("");
  };

  const onPickImage = async (file) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const ok =
      file.type === "image/jpeg" ||
      file.type === "image/jpg" ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg");
    if (!ok) {
      setError(t.adminImageJpegOnly);
      return;
    }
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    try {
      const compact = await compressJpeg(file);
      setImageFile(compact);
      setImagePreview(URL.createObjectURL(compact));
    } catch {
      /* keep original file and preview */
    }
  };

  const onTranslate = async (field) => {
    const source =
      field === "name" ? draft.nameEn.trim() : draft.descriptionEn.trim();
    if (!source) return;
    setTranslating(field);
    setError("");
    try {
      const arabic = await adminTranslate(token, source);
      setDraft((d) =>
        field === "name"
          ? { ...d, nameAr: arabic }
          : { ...d, descriptionAr: arabic },
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setTranslating("");
    }
  };

  const onSaveNew = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await adminCreateService(
        token,
        {
          nameEn: draft.nameEn,
          nameAr: draft.nameAr || draft.nameEn,
          descriptionEn: draft.descriptionEn,
          descriptionAr: draft.descriptionAr,
          prices: {
            month: Number(draft.prices.month),
            year: Number(draft.prices.year),
          },
          offerType: draft.offerType || "none",
          offerExpiresAt:
            draft.offerType && draft.offerType !== "none"
              ? fromDatetimeLocal(draft.offerExpiresAt)
              : null,
        },
        imageFile,
      );
      const next = [...services, created];
      setServices(next);
      cacheRef.current.services = next;
      notifyServicesUpdated(next);
      showToast(t.adminCreated);
      setDraft(emptyServiceDraft);
      setImageFile(null);
      setImagePreview("");
      goDashboard();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onSaveEditService = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      const updated = await adminSaveService(
        token,
        selectedId,
        {
          nameEn: draft.nameEn,
          nameAr: draft.nameAr,
          descriptionEn: draft.descriptionEn,
          descriptionAr: draft.descriptionAr,
          prices: {
            month: Number(draft.prices.month),
            year: Number(draft.prices.year),
          },
          offerType: draft.offerType || "none",
          offerExpiresAt:
            draft.offerType && draft.offerType !== "none"
              ? fromDatetimeLocal(draft.offerExpiresAt)
              : null,
        },
        imageFile,
      );
      const next = services.map((s) => (s.id === selectedId ? updated : s));
      setServices(next);
      cacheRef.current.services = next;
      notifyServicesUpdated(next);
      setDraft(toDraft(updated));
      setImageFile(null);
      setImagePreview(
        updated.imageData
          ? `data:image/jpeg;base64,${updated.imageData}`
          : updated.imageUrl || "",
      );
      showToast(t.adminSaved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelServiceEdit = () => {
    setSelectedId("");
    setDraft(emptyServiceDraft);
    setImageFile(null);
    setImagePreview("");
    setError("");
  };

  const confirmDeleteService = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError("");
    try {
      await adminDeleteService(token, selectedId);
      const next = services.filter((s) => s.id !== selectedId);
      setServices(next);
      cacheRef.current.services = next;
      notifyServicesUpdated(next);
      setConfirmDelete(false);
      cancelServiceEdit();
      showToast(t.adminDeleted);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const persistEmail = async () => {
    setBusy(true);
    setError("");
    try {
      const settings = await adminSaveSettings(token, {
        complaintEmail: settingsDraft.complaintEmail,
      });
      cacheRef.current.settings = settings;
      setSettingsDraft(toSettingsDraft(settings));
      setConfirmEmail(false);
      showToast(t.adminSettingsSaved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmSaveContact = async () => {
    setBusy(true);
    setError("");
    try {
      const numbers = (settingsDraft.whatsappNumbers || [])
        .map((n) => String(n).replace(/\D/g, ""))
        .filter(Boolean);
      const settings = await adminSaveSettings(token, { whatsappNumbers: numbers });
      cacheRef.current.settings = settings;
      setSettingsDraft(toSettingsDraft(settings));
      setConfirmContact(false);
      showToast(t.adminSettingsSaved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onSaveAbout = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const settings = await adminSaveSettings(token, {
        aboutEn: settingsDraft.aboutEn,
        aboutAr: settingsDraft.aboutAr,
        ownersEn: settingsDraft.ownersEn,
        ownersAr: settingsDraft.ownersAr,
        socialLinks: settingsDraft.socialLinks,
      });
      cacheRef.current.settings = settings;
      setSettingsDraft(toSettingsDraft(settings));
      showToast(t.adminSettingsSaved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const selectedService = services.find((s) => s.id === selectedId);
  const screenTitle =
    view === "dashboard"
      ? t.adminDashboardTitle
      : view === "add"
        ? t.adminAddServices
        : view === "edit-menu"
          ? t.adminEditServicesBtn
          : view === "edit-services"
            ? t.adminEditServices
            : view === "edit-email"
              ? t.adminEditEmail
              : view === "edit-contact"
                ? t.adminEditContact
                : view === "edit-about"
                  ? t.adminEditAbout
                  : t.adminNavLabel;

  const backTarget =
    view === "add" || view === "edit-menu"
      ? "dashboard"
      : view.startsWith("edit-")
        ? "edit-menu"
        : null;

  return (
    <>
      {view === "login" || checking ? (
        <GlassModal
          title={t.adminLoginTitle}
          onClose={onClose}
          className="admin-login-modal"
        >
          {checking ? (
            <p className="catalog-note">{t.adminLoading}</p>
          ) : (
            <form className="admin-login-form" onSubmit={onLogin}>
              <div className="admin-login-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                  />
                </svg>
              </div>
              <p className="admin-lead">{t.adminLoginLead}</p>
              <label>
                {t.adminUsername}
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                {t.adminPassword}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>
              {error ? <p className="error-text">{error}</p> : null}
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? t.adminWorking : t.adminSignIn}
              </button>
            </form>
          )}
        </GlassModal>
      ) : (
        <div className="admin-fs" role="dialog" aria-modal="true" aria-labelledby="admin-fs-title">
          <header className="admin-fs-header">
            {backTarget ? (
              <button
                type="button"
                className="admin-back-btn"
                onClick={() =>
                  backTarget === "dashboard" ? goDashboard() : setView(backTarget)
                }
              >
                ← {t.adminBack}
              </button>
            ) : (
              <span className="admin-fs-spacer" />
            )}
            <h1 id="admin-fs-title">{screenTitle}</h1>
            <div className="admin-fs-header-actions">
              <button type="button" className="btn btn-ghost" onClick={logout}>
                {t.adminLogout}
              </button>
              <button
                type="button"
                className="glass-modal-close"
                onClick={onClose}
                aria-label={t.close}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M18.3 5.71 12 12.01l-6.3-6.3-1.4 1.41 6.29 6.3-6.3 6.29 1.42 1.42 6.29-6.3 6.3 6.3 1.41-1.42-6.3-6.29 6.3-6.3z"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div className="admin-fs-body">
            {view === "dashboard" ? (
              <div className="admin-dashboard">
                <p className="admin-lead">{t.adminDashboardLead}</p>
                <div className="admin-dashboard-actions">
                  <button type="button" className="btn btn-primary admin-dash-card" onClick={openAdd}>
                    {t.adminAddServices}
                  </button>
                  <button type="button" className="btn btn-ghost admin-dash-card" onClick={openEditMenu}>
                    {t.adminEditServicesBtn}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost admin-dash-card"
                    onClick={onExportCatalog}
                    disabled={busy}
                  >
                    {t.adminExportCatalog}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost admin-dash-card"
                    onClick={() => importInputRef.current?.click()}
                    disabled={busy}
                  >
                    {t.adminImportCatalog}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={onImportCatalog}
                  />
                </div>
                {error ? <p className="error-text">{error}</p> : null}
              </div>
            ) : null}

            {view === "edit-menu" ? (
              <div className="admin-edit-sections admin-edit-sections--wide" role="menu">
                {EDIT_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    role="menuitem"
                    className="admin-edit-section-btn"
                    onClick={() => selectEditSection(section.id)}
                    disabled={busy}
                  >
                    {t[section.labelKey]}
                  </button>
                ))}
              </div>
            ) : null}

            {view === "add" ? (
              <ServiceForm
                t={t}
                draft={draft}
                setDraft={setDraft}
                imagePreview={imagePreview}
                onPickImage={onPickImage}
                onTranslate={onTranslate}
                translating={translating}
                onSubmit={onSaveNew}
                onCancel={goDashboard}
                busy={busy}
                error={error}
                requireImage
              />
            ) : null}

            {view === "edit-services" ? (
              <div className="admin-layout">
                <aside className="admin-sidebar" aria-label="Services">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      className={`admin-service-btn${selectedId === service.id ? " active" : ""}`}
                      onClick={() => onSelectService(service.id)}
                    >
                      <span>
                        {service.icon} {service.nameEn}
                      </span>
                      <small>
                        {service.offerType && service.offerType !== "none"
                          ? Date.parse(service.offerExpiresAt) <= Date.now()
                            ? t.offerExpiredAdmin
                            : service.offerType === "eid"
                              ? t.offerEid
                              : t.offerSpecial
                          : service.outOfStock
                          ? t.outOfStock
                          : `${service.prices.month} / ${service.prices.year} KD`}
                      </small>
                    </button>
                  ))}
                </aside>
                <ServiceForm
                  t={t}
                  draft={draft}
                  setDraft={setDraft}
                  imagePreview={imagePreview}
                  onPickImage={onPickImage}
                  onTranslate={onTranslate}
                  translating={translating}
                  onSubmit={onSaveEditService}
                  onCancel={cancelServiceEdit}
                  onDelete={() => setConfirmDelete(true)}
                  busy={busy}
                  error={error}
                  disabled={!selectedId}
                  showDelete={Boolean(selectedId)}
                />
              </div>
            ) : null}

            {["edit-email", "edit-contact", "edit-about"].includes(view) &&
            !settingsDraft ? (
              <p className="catalog-note">{t.adminLoading}</p>
            ) : null}

            {view === "edit-email" && settingsDraft ? (
              <form
                className="admin-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  setConfirmEmail(true);
                }}
              >
                <label>
                  {t.adminComplaintEmail}
                  <input
                    type="email"
                    value={settingsDraft.complaintEmail}
                    onChange={(e) =>
                      setSettingsDraft((d) => ({ ...d, complaintEmail: e.target.value }))
                    }
                    required
                  />
                </label>
                {error ? <p className="error-text">{error}</p> : null}
                <div className="admin-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? t.adminWorking : t.adminSave}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setView("edit-menu")}
                  >
                    {t.adminCancel}
                  </button>
                </div>
              </form>
            ) : null}

            {view === "edit-contact" && settingsDraft ? (
              <form
                className="admin-editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  setConfirmContact(true);
                }}
              >
                <p className="admin-lead">{t.adminContactLead}</p>
                {(settingsDraft.whatsappNumbers || []).map((num, index) => (
                  <label key={`wa-${index}`}>
                    {t.adminWhatsAppNumber} {index + 1}
                    <input
                      inputMode="tel"
                      value={formatWhatsAppInput(num)}
                      onChange={(e) =>
                        setSettingsDraft((d) => {
                          const next = [...d.whatsappNumbers];
                          next[index] = e.target.value.replace(/\D/g, "");
                          return { ...d, whatsappNumbers: next };
                        })
                      }
                      required
                    />
                  </label>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    setSettingsDraft((d) => ({
                      ...d,
                      whatsappNumbers: [...d.whatsappNumbers, ""],
                    }))
                  }
                >
                  {t.adminAddWhatsApp}
                </button>
                {error ? <p className="error-text">{error}</p> : null}
                <div className="admin-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? t.adminWorking : t.adminSave}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setView("edit-menu")}
                  >
                    {t.adminCancel}
                  </button>
                </div>
              </form>
            ) : null}

            {view === "edit-about" && settingsDraft ? (
              <form className="admin-editor" onSubmit={onSaveAbout}>
                <section className="admin-owner-block">
                  <h3>{t.adminOwnerBlock}</h3>
                  <label>
                    {t.adminOwnersEn}
                    <textarea
                      value={settingsDraft.ownersEn}
                      onChange={(e) =>
                        setSettingsDraft((d) => ({ ...d, ownersEn: e.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    {t.adminOwnersAr}
                    <textarea
                      value={settingsDraft.ownersAr}
                      onChange={(e) =>
                        setSettingsDraft((d) => ({ ...d, ownersAr: e.target.value }))
                      }
                      required
                      dir="rtl"
                    />
                  </label>
                </section>
                <label>
                  {t.adminAboutEn}
                  <textarea
                    value={settingsDraft.aboutEn}
                    onChange={(e) =>
                      setSettingsDraft((d) => ({ ...d, aboutEn: e.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  {t.adminAboutAr}
                  <textarea
                    value={settingsDraft.aboutAr}
                    onChange={(e) =>
                      setSettingsDraft((d) => ({ ...d, aboutAr: e.target.value }))
                    }
                    required
                    dir="rtl"
                  />
                </label>
                {["whatsapp", "instagram", "tiktok", "youtube", "facebook"].map((key) => (
                  <label key={key}>
                    {t[SOCIAL_LABELS[key]] || key}
                    <input
                      type="url"
                      value={settingsDraft.socialLinks[key] || ""}
                      onChange={(e) =>
                        setSettingsDraft((d) => ({
                          ...d,
                          socialLinks: { ...d.socialLinks, [key]: e.target.value },
                        }))
                      }
                    />
                  </label>
                ))}
                {error ? <p className="error-text">{error}</p> : null}
                <div className="admin-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? t.adminWorking : t.adminSave}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setView("edit-menu")}
                  >
                    {t.adminCancel}
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          {toast ? (
            <div className="admin-toast" role="status">
              {toast}
            </div>
          ) : null}
        </div>
      )}

      {confirmContact ? (
        <GlassModal
          elevated
          title={t.adminConfirmContactTitle}
          onClose={() => setConfirmContact(false)}
        >
          <p className="modal-prose">{t.adminConfirmContactBody}</p>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={confirmSaveContact}>
              {busy ? t.adminWorking : t.adminConfirm}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmContact(false)}>
              {t.adminCancel}
            </button>
          </div>
        </GlassModal>
      ) : null}

      {confirmEmail ? (
        <GlassModal
          elevated
          title={t.adminConfirmEmailTitle}
          onClose={() => setConfirmEmail(false)}
        >
          <p className="modal-prose">{t.adminConfirmEmailBody}</p>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={persistEmail}>
              {busy ? t.adminWorking : t.adminConfirm}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmEmail(false)}>
              {t.adminCancel}
            </button>
          </div>
        </GlassModal>
      ) : null}

      {confirmDelete ? (
        <GlassModal
          elevated
          title={t.adminConfirmDeleteTitle}
          onClose={() => setConfirmDelete(false)}
        >
          <p className="modal-prose">
            {(t.adminConfirmDeleteBody || "").replace(
              "{name}",
              selectedService?.nameEn || "",
            )}
          </p>
          <div className="admin-form-actions">
            <button type="button" className="btn btn-danger" disabled={busy} onClick={confirmDeleteService}>
              {busy ? t.adminWorking : t.adminConfirm}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              {t.adminCancel}
            </button>
          </div>
        </GlassModal>
      ) : null}
    </>
  );
}

function ServiceForm({
  t,
  draft,
  setDraft,
  imagePreview,
  onPickImage,
  onTranslate,
  translating,
  onSubmit,
  onCancel,
  onDelete,
  busy,
  error,
  disabled = false,
  showDelete = false,
  requireImage = false,
}) {
  return (
    <form className="admin-editor admin-editor--wide" onSubmit={onSubmit}>
      <label>
        {t.adminImageUpload}
        <input
          type="file"
          accept=".jpg,.jpeg,image/jpeg"
          onChange={(e) => onPickImage(e.target.files?.[0])}
          required={requireImage && !imagePreview}
          disabled={disabled}
        />
      </label>
      {imagePreview ? (
        <div className="admin-image-preview">
          <img src={serviceImagePreviewSrc(imagePreview, draft)} alt="" />
        </div>
      ) : null}
      <div className="admin-field-head">
        <span>{t.adminNameEn}</span>
        <button
          type="button"
          className="btn btn-ghost admin-translate-btn"
          onClick={() => onTranslate("name")}
          disabled={disabled || Boolean(translating) || !draft.nameEn.trim()}
        >
          {translating === "name" ? t.adminTranslating : t.adminTranslate}
        </button>
      </div>
      <label className="admin-sr-only" htmlFor="admin-name-en">
        {t.adminNameEn}
      </label>
      <input
        id="admin-name-en"
        value={draft.nameEn}
        onChange={(e) => setDraft((d) => ({ ...d, nameEn: e.target.value }))}
        required
        disabled={disabled}
      />
      <label>
        {t.adminNameAr}
        <input
          value={draft.nameAr}
          onChange={(e) => setDraft((d) => ({ ...d, nameAr: e.target.value }))}
          dir="rtl"
          disabled={disabled}
        />
      </label>
      <div className="admin-field-head">
        <span>{t.adminDescEn}</span>
        <button
          type="button"
          className="btn btn-ghost admin-translate-btn"
          onClick={() => onTranslate("desc")}
          disabled={disabled || Boolean(translating) || !draft.descriptionEn.trim()}
        >
          {translating === "desc" ? t.adminTranslating : t.adminTranslate}
        </button>
      </div>
      <label className="admin-sr-only" htmlFor="admin-desc-en">
        {t.adminDescEn}
      </label>
      <textarea
        id="admin-desc-en"
        value={draft.descriptionEn}
        onChange={(e) =>
          setDraft((d) => ({ ...d, descriptionEn: e.target.value }))
        }
        required
        disabled={disabled}
      />
      <label>
        {t.adminDescAr}
        <textarea
          value={draft.descriptionAr}
          onChange={(e) =>
            setDraft((d) => ({ ...d, descriptionAr: e.target.value }))
          }
          required
          dir="rtl"
          disabled={disabled}
        />
      </label>
      <label>
        {t.adminOfferType}
        <select
          value={draft.offerType || "none"}
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              offerType: e.target.value,
              offerExpiresAt: e.target.value === "none" ? "" : d.offerExpiresAt,
            }))
          }
          disabled={disabled}
        >
          <option value="none">{t.adminOfferNone}</option>
          <option value="eid">{t.offerEid}</option>
          <option value="special">{t.offerSpecial}</option>
        </select>
      </label>
      {draft.offerType && draft.offerType !== "none" ? (
        <label>
          {t.adminOfferExpires}
          <input
            type="datetime-local"
            value={draft.offerExpiresAt || ""}
            onChange={(e) =>
              setDraft((d) => ({ ...d, offerExpiresAt: e.target.value }))
            }
            required
            disabled={disabled}
          />
        </label>
      ) : null}
      <div className="admin-price-row">
        <label>
          {t.adminPriceMonth}
          <input
            type="number"
            min="0"
            step="0.001"
            value={draft.prices.month}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                prices: { ...d.prices, month: e.target.value },
              }))
            }
            required
            disabled={disabled}
          />
        </label>
        <label>
          {t.adminPriceYear}
          <input
            type="number"
            min="0"
            step="0.001"
            value={draft.prices.year}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                prices: { ...d.prices, year: e.target.value },
              }))
            }
            required
            disabled={disabled}
          />
        </label>
      </div>
      <p className="admin-hint">{t.adminOutOfStockHint}</p>
      <p className="admin-hint">{t.adminOfferHint}</p>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="admin-form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || disabled}>
          {busy ? t.adminWorking : t.adminSave}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          {t.adminCancel}
        </button>
        {showDelete ? (
          <button
            type="button"
            className="btn btn-danger"
            onClick={onDelete}
            disabled={busy || disabled}
          >
            {t.adminDelete}
          </button>
        ) : null}
      </div>
    </form>
  );
}
