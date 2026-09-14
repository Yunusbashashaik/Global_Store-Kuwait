/**
 * Optional runtime API base URL for hosts where the static site and Node API
 * are on different origins (common on GoDaddy).
 *
 * Leave empty when Node serves both the built client and `/api` (recommended):
 *   npm run build && npm start
 *
 * Example split deploy:
 *   window.__GLOBALSTORE_CONFIG__ = { apiUrl: "https://api.yourdomain.com" };
 */
window.__GLOBALSTORE_CONFIG__ = window.__GLOBALSTORE_CONFIG__ || {
  apiUrl: "",
};
