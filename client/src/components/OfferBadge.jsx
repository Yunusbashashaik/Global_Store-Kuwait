import { useEffect, useState } from "react";
import {
  formatCountdown,
  isActiveOffer,
  remainingOfferMs,
} from "@shared/offers.js";

export default function OfferBadge({ service, t, lang, inline = false }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [service.id, service.offerExpiresAt]);

  if (!isActiveOffer(service, now)) return null;

  const countdown = formatCountdown(remainingOfferMs(service, now));
  const label = service.offerType === "eid" ? t.offerEid : t.offerSpecial;
  const className = [
    "service-oos-badge",
    "service-offer-badge",
    `service-offer-badge--${service.offerType}`,
    inline ? "service-oos-badge--inline" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={className} aria-label={`${label} ${countdown.label}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M12 2 9.2 8.4 2 9.3l5.5 4.8L5.8 21 12 17.6 18.2 21l-1.7-6.9L22 9.3l-7.2-.9z"
        />
      </svg>
      <span className="service-offer-copy">
        <strong>{label}</strong>
        <small dir={lang === "ar" ? "rtl" : "ltr"}>
          {t.offerEndsIn} {countdown.days}
          {t.offerDaysShort} {String(countdown.hours).padStart(2, "0")}:
          {String(countdown.minutes).padStart(2, "0")}:
          {String(countdown.seconds).padStart(2, "0")}
        </small>
      </span>
    </span>
  );
}
