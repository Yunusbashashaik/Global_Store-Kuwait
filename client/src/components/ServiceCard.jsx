import { useEffect, useState } from "react";
import ServiceIcon from "./ServiceIcon.jsx";
import OfferBadge from "./OfferBadge.jsx";
import { isOutOfStock } from "../data/catalog.js";
import { isActiveOffer, isExpiredOffer } from "@shared/offers.js";

export default function ServiceCard({ service, lang, t, onViewPlans, revealDelay = 0 }) {
  const [now, setNow] = useState(() => Date.now());
  const name = lang === "ar" ? service.nameAr : service.nameEn;
  const type =
    lang === "ar"
      ? service.typeAr || "مشترك / خاص"
      : service.typeEn || "Shared / Private";
  const currency = lang === "ar" ? "د.ك" : "KD";
  const offer = isActiveOffer(service, now);
  const oos = !offer && isOutOfStock(service);
  const startingPrice = oos
    ? 0
    : Math.min(
        service.prices.month ?? Infinity,
        service.prices.year ?? Infinity,
      );

  useEffect(() => {
    if (!service.offerExpiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [service.id, service.offerExpiresAt]);

  if (isExpiredOffer(service, now)) return null;

  return (
    <article
      className={`card service-card${oos ? " service-card--oos" : ""}${offer ? " service-card--offer" : ""}`}
      id={service.id}
      data-reveal="up"
      style={{ "--reveal-delay": `${revealDelay}ms` }}
    >
      {offer ? (
        <OfferBadge service={service} t={t} lang={lang} />
      ) : oos ? (
        <span className="service-oos-badge">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 5v6.59l4.2 4.2-1.41 1.41L11 14.41V7z"
            />
          </svg>
          {t.outOfStock}
        </span>
      ) : null}
      <ServiceIcon service={service} />
      <h3 className="service-card-name">{name}</h3>
      <p className="service-card-type">{type}</p>

      <div className="service-price-row">
        <div className="service-price-meta">
          <svg className="service-cal-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
            />
          </svg>
          <span>{t.month}</span>
        </div>
        <div className="service-price-start">
          <span className="service-price-label">{t.startingFrom}</span>
          <strong className="price-tag">
            {startingPrice} {currency}
          </strong>
        </div>
      </div>

      <button
        type="button"
        className="btn btn-primary btn-view-plans"
        onClick={() => onViewPlans?.(service)}
      >
        {t.viewPlans}
      </button>
    </article>
  );
}
