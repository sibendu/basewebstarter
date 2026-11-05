import "server-only";
import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import { ApiError } from "../bff/http";
import { entraTenant, isGuid } from "./settings";

let cachedKeys: { url: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

function configuration() {
  const tenant = entraTenant(process.env.EXTERNAL_API_TENANT_ID);
  const audience = process.env.EXTERNAL_API_CLIENT_ID?.trim().toLowerCase();
  const allowedClients = (process.env.EXTERNAL_API_ALLOWED_CLIENT_IDS ?? "").split(",").map(value => value.trim().toLowerCase());
  if (!tenant || !isGuid(audience) || !allowedClients.length || !allowedClients.every(isGuid)) {
    throw new ApiError(503, "Integration authentication is not configured.");
  }
  const url = `https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`;
  if (cachedKeys?.url !== url) {
    cachedKeys = { url, keys: createRemoteJWKSet(new URL(url), { timeoutDuration: 5000 }) };
  }
  return { tenant, audience, allowedClients, keys: cachedKeys.keys };
}

export async function requireIntegrationToken(request: Request) {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!match) throw new ApiError(401, "Bearer access token required.", 'Bearer realm="integration"');
  const { tenant, audience, allowedClients, keys } = configuration();
  let payload;
  try {
    ({ payload } = await jwtVerify(match[1], keys, {
      issuer: `https://login.microsoftonline.com/${tenant}/v2.0`,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "nbf", "sub", "tid", "ver", "azp", "idtyp"],
    }));
    // Entra uses typ=JWT for both token types. Require the optional idtyp=app
    // claim to distinguish app-only access tokens from ID and delegated tokens.
    if (payload.ver !== "2.0" || payload.tid !== tenant || payload.idtyp !== "app" ||
        "scp" in payload || typeof payload.sub !== "string" || !payload.sub ||
        !isGuid(payload.azp) || typeof payload.iat !== "number" ||
        payload.iat > Math.floor(Date.now() / 1000)) {
      throw new errors.JWTInvalid("Invalid application access token claims");
    }
  } catch (error) {
    if (error instanceof errors.JWKSTimeout || error instanceof errors.JWKSInvalid ||
        !(error instanceof errors.JOSEError)) {
      throw new ApiError(503, "Integration signing keys are unavailable.");
    }
    throw new ApiError(401, "Invalid application access token.", 'Bearer realm="integration", error="invalid_token"');
  }
  const clientId = (payload.azp as string).toLowerCase();
  if (!allowedClients.includes(clientId)) throw new ApiError(403, "Calling application is not allowed.");
  return { subject: payload.sub, clientId, tenant };
}
