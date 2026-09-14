/**
 * Hardcoded store catalog. Edit this file, commit, and deploy.
 * These rows ship with the GitHub code, so they do not vanish on GoDaddy
 * the way Admin-only database rows did.
 *
 * Add one object per service, plus a JPEG at
 * `client/public/service-images/{id}.jpg`.
 *
 * Example:
 * {
 *   id: "example-service",
 *   icon: "✨",
 *   accent: "#38bdf8",
 *   typeEn: "Shared / Private",
 *   typeAr: "مشترك / خاص",
 *   nameEn: "Example",
 *   nameAr: "مثال",
 *   descriptionEn: "English description",
 *   descriptionAr: "الوصف بالعربية",
 *   prices: { month: 1, year: 8 },
 *   imageUrl: "/service-images/example-service.jpg",
 * }
 */
export const DEFAULT_SERVICES = [];
