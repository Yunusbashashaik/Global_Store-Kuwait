import { useState } from "react";
import { useCart } from "../cart/CartContext.jsx";
import { isOutOfStock } from "../data/catalog.js";
import { isActiveOffer } from "@shared/offers.js";
import GlassModal from "./GlassModal.jsx";
import OfferBadge from "./OfferBadge.jsx";
import ServiceIcon from "./ServiceIcon.jsx";

export default function ViewPlansModal({ service, lang, t, onClose }) {
  const [duration, setDuration] = useState("month");
  const { addItem, getQty, increment, decrement, itemKey } = useCart();
  const oos = !isActiveOffer(service) && isOutOfStock(service);
  const price = oos ? 0 : service.prices[duration];
  const name = lang === "ar" ? service.nameAr : service.nameEn;
  const type =
    lang === "ar"
      ? service.typeAr || "مشترك / خاص"
      : service.typeEn || "Shared / Private";
  const description =
    lang === "ar" ? service.descriptionAr : service.descriptionEn;
  const currency = lang === "ar" ? "د.ك" : "KD";
  const qty = getQty(service.id, duration);
  const key = itemKey(service.id, duration);

  return (
    <GlassModal
      title={name}
      onClose={onClose}
      tone="light"
      className="glass-modal--compact"
    >
      <div className="view-plans-modal">
        <div className="view-plans-hero">
          <ServiceIcon service={service} size="md" />
          <p className="service-card-type">{type}</p>
          {isActiveOffer(service) ? (
            <OfferBadge service={service} t={t} lang={lang} inline />
          ) : oos ? (
            <p className="service-oos-badge service-oos-badge--inline">{t.outOfStock}</p>
          ) : null}
        </div>

        <pre className="view-plans-desc">{description}</pre>

        <div className="service-price-row view-plans-price-row">
          <div className="service-price-meta">
            <svg className="service-cal-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
              />
            </svg>
            <span>{duration === "month" ? t.month : t.year}</span>
          </div>
          <div className="service-price-start">
            <span className="service-price-label">{t.startingFrom}</span>
            <strong className="price-tag">
              {price} {currency}
            </strong>
          </div>
        </div>

        <div className="price-toggle" role="group" aria-label="Duration">
          <button
            type="button"
            className={duration === "month" ? "active" : ""}
            onClick={() => setDuration("month")}
          >
            {t.month}
            <span className="plan-price">
              {oos ? 0 : service.prices.month} {currency}
            </span>
          </button>
          <button
            type="button"
            className={duration === "year" ? "active" : ""}
            onClick={() => setDuration("year")}
          >
            {t.year}
            <span className="plan-price">
              {oos ? 0 : service.prices.year} {currency}
            </span>
          </button>
        </div>

        {oos ? (
          <button type="button" className="btn btn-primary btn-add-cart" disabled>
            {t.outOfStock}
          </button>
        ) : qty > 0 ? (
          <div className="qty-selector" aria-label={t.quantity}>
            <button
              type="button"
              aria-label={t.qtyDecrease}
              onClick={() => decrement(key)}
            >
              −
            </button>
            <span className="qty-value">{qty}</span>
            <button
              type="button"
              aria-label={t.qtyIncrease}
              onClick={() => increment(key)}
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-add-cart"
            onClick={() => addItem(service, duration, price)}
          >
            {t.addToCart}
          </button>
        )}
      </div>
    </GlassModal>
  );
}
