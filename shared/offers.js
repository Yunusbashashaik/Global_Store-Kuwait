export const OFFER_TYPES = {
  NONE: "none",
  EID: "eid",
  SPECIAL: "special",
};

export const OFFER_TYPE_VALUES = [OFFER_TYPES.NONE, OFFER_TYPES.EID, OFFER_TYPES.SPECIAL];

export function normalizeOfferType(value) {
  const type = String(value || OFFER_TYPES.NONE)
    .trim()
    .toLowerCase();
  if (type === "eid" || type === "eid offer") return OFFER_TYPES.EID;
  if (type === "special" || type === "special offer") return OFFER_TYPES.SPECIAL;
  return OFFER_TYPES.NONE;
}

export function parseOfferExpiry(value) {
  if (value === null || value === undefined || value === "") return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function hasOffer(service) {
  const type = normalizeOfferType(service?.offerType);
  return type === OFFER_TYPES.EID || type === OFFER_TYPES.SPECIAL;
}

export function offerExpiryMs(service) {
  if (!hasOffer(service) || !service?.offerExpiresAt) return null;
  const ms = Date.parse(service.offerExpiresAt);
  return Number.isFinite(ms) ? ms : null;
}

export function isExpiredOffer(service, now = Date.now()) {
  if (!hasOffer(service)) return false;
  const expires = offerExpiryMs(service);
  if (expires === null) return true;
  return expires <= now;
}

export function isActiveOffer(service, now = Date.now()) {
  return hasOffer(service) && !isExpiredOffer(service, now);
}

export function remainingOfferMs(service, now = Date.now()) {
  const expires = offerExpiryMs(service);
  if (expires === null) return 0;
  return Math.max(0, expires - now);
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return {
    days,
    hours,
    minutes,
    seconds,
    label: `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`,
  };
}

export function filterPublicServices(services, now = Date.now()) {
  if (!Array.isArray(services)) return [];
  return services.filter((service) => !isExpiredOffer(service, now));
}
