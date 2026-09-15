import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  FEATURED_SERVICE_IDS,
  SERVICES,
  buildWhatsAppUrl,
  fetchServices,
  nextSupportNumber,
  setSupportNumbers,
} from "../data/catalog.js";
import { cachedPublicServices } from "../lib/adminApi.js";
import { filterPublicServices } from "@shared/offers.js";
import { useSettings } from "../context/SettingsContext.jsx";
import AdminPanel from "./AdminPanel.jsx";
import ComplaintForm from "./ComplaintForm.jsx";
import CartPopup from "./CartPopup.jsx";
import GlassModal from "./GlassModal.jsx";
import Logo from "./Logo.jsx";
import OwnerBlock from "./OwnerBlock.jsx";
import SocialLinks from "./SocialLinks.jsx";
import { useCart } from "../cart/CartContext.jsx";
import useScrollMotion from "../hooks/useScrollMotion.js";

function formatWhatsAppDisplay(num) {
  const digits = String(num || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

export default function Layout({ lang, setLang, t }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const isHome = location.pathname === "/" || location.pathname === "";
  const [modal, setModal] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [subsOpen, setSubsOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [services, setServices] = useState(
    () => cachedPublicServices() || SERVICES,
  );
  const subsRef = useRef(null);
  const cartRef = useRef(null);
  const langRef = useRef(null);
  const shellRef = useRef(null);
  const [cartOpen, setCartOpen] = useState(false);
  useScrollMotion(shellRef);
  const { totalItems } = useCart();

  const whatsappNumbers = useMemo(
    () =>
      settings.whatsappNumbers?.length
        ? settings.whatsappNumbers
        : ["923228791573", "923014968769"],
    [settings.whatsappNumbers],
  );
  const complaintEmail = settings.complaintEmail || "global2stor2@gmail.com";
  const aboutText = lang === "ar" ? settings.aboutAr : settings.aboutEn;
  const ownersText =
    (lang === "ar" ? settings.ownersAr : settings.ownersEn) || t.footerOwners;

  useEffect(() => {
    setSupportNumbers(whatsappNumbers);
  }, [whatsappNumbers]);

  const refreshServices = useCallback((list) => {
    if (Array.isArray(list)) {
      setServices(list);
      return;
    }
    fetchServices()
      .then((next) => {
        if (Array.isArray(next)) {
          setServices(next);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshServices();
    const onUpdate = (event) => refreshServices(event.detail?.services);
    window.addEventListener("gs:services-updated", onUpdate);
    return () => window.removeEventListener("gs:services-updated", onUpdate);
  }, [refreshServices]);

  useEffect(() => {
    setMenuOpen(false);
    setSubsOpen(false);
    setLangOpen(false);
    setCartOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onDoc = (e) => {
      if (subsRef.current && !subsRef.current.contains(e.target)) {
        setSubsOpen(false);
      }
      if (langRef.current && !langRef.current.contains(e.target)) {
        setLangOpen(false);
      }
      if (
        cartOpen &&
        cartRef.current &&
        !cartRef.current.contains(e.target) &&
        !e.target.closest?.(".cart-sheet") &&
        !e.target.closest?.(".cart-backdrop")
      ) {
        setCartOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [cartOpen]);

  const featured = useMemo(() => {
    const visible = filterPublicServices(services);
    const byId = new Map(visible.map((s) => [s.id, s]));
    const picked = FEATURED_SERVICE_IDS.map((id) => byId.get(id)).filter(Boolean);
    if (picked.length >= 3) return picked.slice(0, 3);
    return visible.slice(0, 3);
  }, [services]);

  const openFab = useCallback(() => {
    const phone = nextSupportNumber();
    const msg =
      lang === "ar"
        ? "مرحباً، أحتاج مساعدة من GlobalStore.com"
        : "Hello, I need help from GlobalStore.com";
    window.open(buildWhatsAppUrl(phone, msg), "_blank", "noopener,noreferrer");
  }, [lang]);

  const goHome = useCallback(() => {
    setModal(null);
    setMenuOpen(false);
    setSubsOpen(false);
    if (isHome) {
      if (window.location.hash) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    navigate("/");
  }, [isHome, navigate]);

  const reloadHome = useCallback((event) => {
    event.preventDefault();
    window.location.assign("/");
  }, []);

  const openServices = useCallback(() => {
    setSubsOpen(false);
    setMenuOpen(false);
    setModal(null);
    if (isHome) {
      document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
    } else {
      sessionStorage.setItem("gs_scroll_services", "1");
      navigate("/#services");
    }
  }, [isHome, navigate]);

  const openModal = useCallback((id) => {
    setModal(id);
    setMenuOpen(false);
    setSubsOpen(false);
  }, []);

  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    if (!isHome || location.hash !== "#services") return;
    const fromNav = sessionStorage.getItem("gs_scroll_services") === "1";
    if (!fromNav) {
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
      return;
    }
    sessionStorage.removeItem("gs_scroll_services");
    requestAnimationFrame(() => {
      document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
    });
  }, [location.hash, location.pathname, location.search, isHome]);

  useEffect(() => {
    const onOpen = (e) => {
      if (typeof e.detail === "string") openModal(e.detail);
    };
    window.addEventListener("gs:open-modal", onOpen);
    return () => window.removeEventListener("gs:open-modal", onOpen);
  }, [openModal]);

  return (
    <div className="app-shell" ref={shellRef}>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="logo" aria-label="Global Store" onClick={reloadHome}>
            <Logo showTagline />
          </Link>

          <nav className={`site-nav${menuOpen ? " open" : ""}`} aria-label="Primary">
            <ul className="nav-links">
              <li>
                <button type="button" className="nav-link-btn" onClick={goHome}>
                  {t.navHome}
                </button>
              </li>
              <li className={`nav-dropdown${subsOpen ? " open" : ""}`} ref={subsRef}>
                <button
                  type="button"
                  className="nav-link-btn"
                  aria-expanded={subsOpen}
                  aria-haspopup="true"
                  onClick={() => setSubsOpen((v) => !v)}
                >
                  {t.navSubscriptions}
                  <svg className="nav-caret" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="currentColor" d="M7 10l5 5 5-5z" />
                  </svg>
                </button>
                {subsOpen ? (
                  <div className="nav-dropdown-panel" role="menu">
                    {featured.map((service) => {
                      const label = lang === "ar" ? service.nameAr : service.nameEn;
                      return (
                        <a
                          key={service.id}
                          role="menuitem"
                          href={`/#${service.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            setSubsOpen(false);
                            setMenuOpen(false);
                            if (!isHome) {
                              navigate(`/#${service.id}`);
                              return;
                            }
                            document
                              .getElementById(service.id)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }}
                        >
                          <span aria-hidden="true">{service.icon}</span>
                          {label}
                        </a>
                      );
                    })}
                    <button
                      type="button"
                      className="nav-dropdown-more"
                      role="menuitem"
                      onClick={openServices}
                    >
                      {t.navViewMore}
                    </button>
                  </div>
                ) : null}
              </li>
              <li>
                <button
                  type="button"
                  className="nav-link-btn"
                  onClick={() => openModal("how")}
                >
                  {t.navHowItWorks}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-link-btn"
                  onClick={() => openModal("about")}
                >
                  {t.aboutTitle}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-link-btn"
                  onClick={() => openModal("contact")}
                >
                  {t.navContact}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="nav-link-btn"
                  onClick={() => openModal("complaint")}
                >
                  {t.navComplaint}
                </button>
              </li>
            </ul>
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="header-icon-btn header-whatsapp"
              aria-label={t.fabLabel}
              onClick={openFab}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  fill="currentColor"
                  d="M12.04 2c-5.46 0-9.91 4.43-9.91 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.9-4.44 9.9-9.9C21.95 6.44 17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.55-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.48-1.38-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74 1.75.76 2.22.76 2.64.68.4-.08 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.17-.47-.29z"
                />
              </svg>
            </button>

            <div className="header-cart" ref={cartRef}>
              <button
                type="button"
                className="header-icon-btn header-cart-btn"
                aria-label={t.cartTitle}
                aria-expanded={cartOpen}
                onClick={() => setCartOpen((v) => !v)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    fill="currentColor"
                    d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                  />
                </svg>
                {totalItems > 0 ? (
                  <span className="cart-badge">{totalItems > 99 ? "99+" : totalItems}</span>
                ) : null}
              </button>
              <CartPopup
                open={cartOpen}
                onClose={() => setCartOpen(false)}
                lang={lang}
                t={t}
              />
            </div>

            <div className="lang-switch" ref={langRef}>
              <button
                type="button"
                className="lang-menu-toggle"
                aria-label="Language"
                aria-haspopup="menu"
                aria-expanded={langOpen}
                onClick={() => setLangOpen((open) => !open)}
              >
                {lang.toUpperCase()}
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="m7 10 5 5 5-5z" />
                </svg>
              </button>
              {langOpen ? (
                <div className="lang-menu" role="menu" aria-label="Language">
                  <button
                    type="button"
                    className={`lang-option${lang === "en" ? " active" : ""}`}
                    role="menuitemradio"
                    aria-checked={lang === "en"}
                    onClick={() => {
                      setLang("en");
                      setLangOpen(false);
                    }}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={`lang-option${lang === "ar" ? " active" : ""}`}
                    role="menuitemradio"
                    aria-checked={lang === "ar"}
                    onClick={() => {
                      setLang("ar");
                      setLangOpen(false);
                    }}
                  >
                    العربية
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="header-icon-btn header-admin"
              aria-label={t.navAdmin}
              title={t.navAdmin}
              onClick={() => {
                setModal(null);
                setAdminOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path
                  fill="currentColor"
                  d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"
                />
              </svg>
            </button>

            <button
              type="button"
              className={`nav-toggle${menuOpen ? " open" : ""}`}
              aria-expanded={menuOpen}
              aria-label={t.navMenu}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="site-footer" data-reveal="up">
        <div className="container footer-grid footer-grid--compact">
          <div className="footer-brand-block">
            <strong className="footer-brand">
              <Logo className="logo-footer" />
            </strong>
            <p className="footer-meta-line">
              <span>{ownersText}</span>
              {whatsappNumbers.map((num) => (
                <span key={num}>
                  <span className="footer-meta-sep" aria-hidden="true">
                    ·
                  </span>
                  <span>{formatWhatsAppDisplay(num)}</span>
                </span>
              ))}
              <span className="footer-meta-sep" aria-hidden="true">
                |
              </span>
              <a href={`mailto:${complaintEmail}`}>{complaintEmail}</a>
            </p>
          </div>
        </div>
      </footer>

      <button
        type="button"
        className="fab"
        aria-label={t.fabLabel}
        onClick={openFab}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M12.04 2c-5.46 0-9.91 4.43-9.91 9.9 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.9-4.44 9.9-9.9C21.95 6.44 17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.55-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.8-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.48-1.38-1.73-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.76-1.85-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.22.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74 1.75.76 2.22.76 2.64.68.4-.08 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.17-.47-.29z"
          />
        </svg>
      </button>

      {modal === "how" ? (
        <GlassModal title={t.howTitle} onClose={closeModal}>
          <ol className="how-steps">
            {t.howSteps.map((step) => (
              <li key={step.title}>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </GlassModal>
      ) : null}

      {modal === "about" ? (
        <GlassModal title={t.aboutTitle} onClose={closeModal}>
          <p className="modal-prose">{aboutText || t.brandIntro}</p>
          <OwnerBlock label={t.adminOwnerBlock} text={ownersText} />
          <SocialLinks t={t} />
        </GlassModal>
      ) : null}

      {modal === "contact" ? (
        <GlassModal title={t.contactTitle} onClose={closeModal}>
          <div className="contact-details">
            <OwnerBlock label={t.adminOwnerBlock} text={ownersText} />
            <ul>
              {whatsappNumbers.map((num) => (
                <li key={num}>
                  <span>{t.contactPhone}</span>
                  <a href={`https://wa.me/${String(num).replace(/\D/g, "")}`}>
                    {formatWhatsAppDisplay(num)}
                  </a>
                </li>
              ))}
              <li>
                <span>{t.contactEmail}</span>
                <a href={`mailto:${complaintEmail}`}>{complaintEmail}</a>
              </li>
            </ul>
            <button type="button" className="btn btn-whatsapp" onClick={openFab}>
              {t.fabLabel}
            </button>
          </div>
        </GlassModal>
      ) : null}

      {modal === "complaint" ? (
        <GlassModal title={t.complaintTitle} onClose={closeModal} wide>
          <p className="modal-prose complaint-modal-lead">{t.complaintLead}</p>
          <ComplaintForm t={t} />
        </GlassModal>
      ) : null}

      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} t={t} />
    </div>
  );
}
