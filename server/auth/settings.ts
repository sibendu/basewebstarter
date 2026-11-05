import "server-only";

export function localPasswordLoginAllowed() {
  return process.env.ALLOW_LOCAL_PASSWORD_LOGIN === "true";
}

export function isGuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function entraTenant(value: string | undefined) {
  const tenant = value?.trim().toLowerCase();
  return isGuid(tenant) ? tenant : null;
}

export function azureSettings() {
  const tenant = entraTenant(process.env.AZURE_AD_TENANT_ID);
  const clientId = process.env.AZURE_AD_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET;
  const redirectUri = process.env.AZURE_AD_REDIRECT_URI?.trim();
  if (!tenant || !isGuid(clientId) || !clientSecret || !redirectUri) throw new Error("Azure SSO is not configured.");
  const redirect = new URL(redirectUri);
  const localHttp = process.env.NODE_ENV !== "production" && redirect.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if ((!localHttp && redirect.protocol !== "https:") || redirect.username || redirect.password ||
      redirect.pathname !== "/api/auth/azure/callback" || redirect.search || redirect.hash) {
    throw new Error("Azure SSO redirect URI is invalid.");
  }
  return { tenant, clientId, clientSecret, redirectUri: redirect.href };
}

export function azureSsoConfigured() {
  try { azureSettings(); return true; } catch { return false; }
}
