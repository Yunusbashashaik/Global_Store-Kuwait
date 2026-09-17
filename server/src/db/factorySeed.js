/** Factory DEFAULT_SERVICES insert is never allowed in production. */
export function isFactorySeedAllowed() {
  if (String(process.env.NODE_ENV || "").toLowerCase() === "production") {
    return false;
  }
  return process.env.ALLOW_FACTORY_SEED === "1";
}

export function isFactorySeedDisabled() {
  return !isFactorySeedAllowed();
}
