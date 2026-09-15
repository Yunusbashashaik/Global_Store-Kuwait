import { useEffect, useMemo, useState } from "react";
import CatalogSearchBar from "../components/CatalogSearchBar.jsx";
import ServicesSection from "../components/ServicesSection.jsx";
import { UiIcon } from "../components/UiIcon.jsx";
import ViewPlansModal from "../components/ViewPlansModal.jsx";
import { SERVICES, fetchServices } from "../data/catalog.js";
import { cachedPublicServices } from "../lib/adminApi.js";
import { wallpaperUrl } from "../data/serviceImages.js";
import { filterCatalog } from "../lib/filterCatalog.js";
import { filterPublicServices } from "@shared/offers.js";

export default function HomePage({ lang, t }) {
  const [services, setServices] = useState(
    () => cachedPublicServices() || SERVICES,
  );
  const [loadError, setLoadError] = useState("");
  const [plansService, setPlansService] = useState(null);
  const [query, setQuery] = useState("");
  const wallpaper = wallpaperUrl();

  useEffect(() => {
    // Keep first paint at the hero — never auto-jump to Popular Subscriptions.
    if (window.location.hash === "#services" || window.location.hash === "#top") {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = (event) => {
      const fromEvent = event?.detail?.services;
      if (Array.isArray(fromEvent)) {
        if (!cancelled) {
          setServices(fromEvent);
          setLoadError("");
        }
        return;
      }
      fetchServices()
        .then((list) => {
          if (!cancelled && Array.isArray(list)) {
            setServices(list);
            setLoadError("");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLoadError(t.servicesLoadFallback);
          }
        });
    };
    load();
    window.addEventListener("gs:services-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("gs:services-updated", load);
    };
  }, [t.servicesLoadFallback]);

  const visibleServices = useMemo(
    () => filterCatalog(filterPublicServices(services), query),
    [services, query],
  );

  const headline = t.heroHeadlineParts || {
    before: t.heroHeadline,
    highlight: "",
    after: "",
  };

  const scrollToServices = () => {
    document.getElementById("services")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="home-main">
      <section
        className="hero-banner"
        id="top"
        style={{ "--hero-wallpaper": `url(${wallpaper})` }}
      >
        <div className="hero-banner-media" aria-hidden="true" />
        <div className="container hero">
          <div className="hero-layout">
            <div className="hero-copy">
              <p className="hero-badge" data-reveal="fade">
                <span aria-hidden="true">★</span> {t.heroBadge}
              </p>
              <h1 data-reveal="up" style={{ "--reveal-delay": "80ms" }}>
                {headline.before}
                {headline.highlight ? (
                  <span className="hero-highlight">{headline.highlight}</span>
                ) : null}
                {headline.after}
              </h1>
              <p className="hero-tagline" data-reveal="up" style={{ "--reveal-delay": "160ms" }}>{t.tagline}</p>
              <div className="hero-actions" data-reveal="up" style={{ "--reveal-delay": "240ms" }}>
                <button type="button" className="btn btn-primary" onClick={scrollToServices}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                    <path
                      fill="currentColor"
                      d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1 1 0 0 0 20 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                    />
                  </svg>
                  {t.heroCta}
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent("gs:open-modal", { detail: "how" }),
                    )
                  }
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
                    <path fill="currentColor" d="M8 5v14l11-7z" />
                  </svg>
                  {t.navHowItWorks}
                </button>
              </div>
              <ul className="hero-trust">
                {t.heroTrust.map((item, index) => (
                  <li
                    key={item.title}
                    data-reveal="up"
                    style={{ "--reveal-delay": `${320 + index * 90}ms` }}
                  >
                    <span className="hero-trust-icon" aria-hidden="true">
                      <UiIcon name={item.icon} />
                    </span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-bar-wrap" data-reveal="up">
        <div className="trust-bar container" aria-label={t.trustBarLabel}>
          {t.trustBarDetailed.map((item, index) => (
            <div
              key={item.title}
              className="trust-bar-item"
              data-reveal="up"
              style={{ "--reveal-delay": `${index * 80}ms` }}
            >
              <span className="trust-icon" aria-hidden="true">
                <UiIcon name={item.icon} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="catalog-band" id="services">
        <div className="container catalog">
          <div className="catalog-header" data-reveal="up">
            <h2>
              <span className="catalog-bar" aria-hidden="true" />
              {t.catalogTitle}
            </h2>
            <CatalogSearchBar
              id="catalog-search"
              query={query}
              onQueryChange={setQuery}
              placeholder={t.catalogSearchPlaceholder}
              label={t.catalogSearchLabel}
            />
          </div>
          {loadError ? <p className="catalog-note">{loadError}</p> : null}
          {visibleServices.length ? (
            <ServicesSection
              services={visibleServices}
              lang={lang}
              t={t}
              onViewPlans={setPlansService}
            />
          ) : (
            <p className="catalog-empty" role="status">
              {query.trim() ? t.catalogSearchEmpty : t.catalogEmpty}
            </p>
          )}
        </div>
      </section>

      <section className="feature-bars container" aria-label={t.featureBarsLabel}>
        <div className="feature-bar feature-bar--dark" data-reveal="up">
          {t.featureBarDark.map((item, index) => (
            <div
              key={item.title}
              className="feature-bar-item"
              data-reveal="up"
              style={{ "--reveal-delay": `${index * 80}ms` }}
            >
              <span className="feature-bar-icon" aria-hidden="true">
                <UiIcon name={item.icon} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="feature-bar feature-bar--support" data-reveal="up">
          {t.featureBarSupport.map((item, index) => (
            <div
              key={item.title}
              className="feature-bar-item"
              data-reveal="up"
              style={{ "--reveal-delay": `${index * 80}ms` }}
            >
              <span className="feature-bar-icon" aria-hidden="true">
                <UiIcon name={item.icon} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.body}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {plansService ? (
        <ViewPlansModal
          service={plansService}
          lang={lang}
          t={t}
          onClose={() => setPlansService(null)}
        />
      ) : null}
    </main>
  );
}
