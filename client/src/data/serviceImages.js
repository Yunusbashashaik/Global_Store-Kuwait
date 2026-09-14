/** Optional bundled JPEG at client/public/service-images/{id}.jpg */
export function serviceImageUrl(id) {
  if (!id) return null;
  const assetBase = import.meta.env.BASE_URL || "/";
  return `${assetBase}service-images/${id}.jpg`;
}

const assetBase = import.meta.env.BASE_URL || "/";

export function wallpaperUrl() {
  return `${assetBase}kuwait-living-room.jpg`;
}
