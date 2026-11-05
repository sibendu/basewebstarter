import "server-only";
import * as oidc from "openid-client";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { azureSettings, isGuid } from "./settings";
import { cookieOptions, readCookie, sessionSigningConfigured, signCookie } from "./signed-cookie";
import { createAzureSession, setSession } from "./session";

export const AZURE_TRANSACTION_COOKIE = "einvoice_azure_transaction";
export const AZURE_LOGOUT_COOKIE = "einvoice_azure_logout";
const TRANSACTION_LIFETIME_MS = 10 * 60 * 1000;

function configuration(settings: ReturnType<typeof azureSettings>) {
  const authority = `https://login.microsoftonline.com/${settings.tenant}`;
  // Tenant-specific endpoints prevent common/organizations or caller-provided
  // issuers from expanding the trust boundary. openid-client handles OIDC/PKCE.
  const config = new oidc.Configuration({
    issuer: `${authority}/v2.0`,
    authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
    token_endpoint: `${authority}/oauth2/v2.0/token`,
    jwks_uri: `${authority}/discovery/v2.0/keys`,
    id_token_signing_alg_values_supported: ["RS256"],
  }, settings.clientId, {
    client_secret: settings.clientSecret,
    id_token_signed_response_alg: "RS256",
  }, oidc.ClientSecretPost(settings.clientSecret));
  config.timeout = 5;
  oidc.enableNonRepudiationChecks(config);
  return config;
}

function noStoreRedirect(url: URL) {
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function startAzureLogin(request: Request) {
  if (!sessionSigningConfigured()) {
    console.error("[auth] Configure EINVOICE_SESSION_SECRET with at least 32 characters before signing in.");
    return noStoreRedirect(new URL("/login?error=signin_unavailable", request.url));
  }
  try {
    const settings = azureSettings();
    const config = configuration(settings);
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const authorization = oidc.buildAuthorizationUrl(config, {
      redirect_uri: settings.redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: "openid profile email",
      prompt: "login",
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
    });
    (await cookies()).set(AZURE_TRANSACTION_COOKIE, signCookie("azure-transaction", {
      verifier, state, nonce, tenant: settings.tenant, clientId: settings.clientId, redirectUri: settings.redirectUri,
    }, TRANSACTION_LIFETIME_MS), {
      ...cookieOptions,
      secure: process.env.NODE_ENV === "production",
      maxAge: TRANSACTION_LIFETIME_MS / 1000,
    });
    return noStoreRedirect(authorization);
  } catch {
    console.error("[auth] Could not start Microsoft sign-in. Check the Azure SSO configuration.");
    return noStoreRedirect(new URL("/login?error=sso_unavailable", request.url));
  }
}

export async function completeAzureLogin(request: Request) {
  const jar = await cookies();
  const logout = readCookie("azure-logout", jar.get(AZURE_LOGOUT_COOKIE)?.value);
  jar.delete(AZURE_LOGOUT_COOKIE);
  const transaction = readCookie("azure-transaction", jar.get(AZURE_TRANSACTION_COOKIE)?.value);
  jar.delete(AZURE_TRANSACTION_COOKIE);
  let loginOrigin = new URL(request.url).origin;
  try {
    const settings = azureSettings();
    loginOrigin = new URL(settings.redirectUri).origin;
    const query = new URL(request.url).searchParams;
    if (logout?.tenant === settings.tenant && logout?.redirectUri === settings.redirectUri &&
        !query.has("code") && !query.has("state") && !query.has("error")) {
      return noStoreRedirect(new URL("/login", loginOrigin));
    }
    if (!sessionSigningConfigured()) return noStoreRedirect(new URL("/login?error=signin_unavailable", loginOrigin));
    if (!transaction || typeof transaction.verifier !== "string" ||
        typeof transaction.state !== "string" || typeof transaction.nonce !== "string" ||
        transaction.tenant !== settings.tenant || transaction.clientId !== settings.clientId ||
        transaction.redirectUri !== settings.redirectUri) {
      return noStoreRedirect(new URL("/login?error=sso_expired", loginOrigin));
    }
    // Use the configured public URI when behind a container ingress/proxy.
    // Only the authorization-response query is taken from the incoming URL.
    const callback = new URL(settings.redirectUri);
    callback.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(configuration(settings), callback, {
      pkceCodeVerifier: transaction.verifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims || claims.tid !== settings.tenant || !isGuid(claims.oid)) throw new Error("Invalid tenant user.");
    await setSession(createAzureSession(settings.tenant, claims.oid));
    return noStoreRedirect(new URL("/", loginOrigin));
  } catch (error) {
    if (error instanceof oidc.AuthorizationResponseError && error.error === "access_denied") {
      return noStoreRedirect(new URL("/login?error=sso_cancelled", loginOrigin));
    }
    // Do not log provider response bodies, authorization codes, tokens or secrets.
    console.error("[auth] Could not complete Microsoft sign-in.");
    return noStoreRedirect(new URL("/login?error=sso_failed", loginOrigin));
  }
}

export async function azureLogoutUrl() {
  const settings = azureSettings();
  // Reuse the registered SSO callback so logout needs no additional redirect
  // registration. A separate signed transaction distinguishes its return.
  (await cookies()).set(AZURE_LOGOUT_COOKIE, signCookie("azure-logout", {
    tenant: settings.tenant, redirectUri: settings.redirectUri,
  }, TRANSACTION_LIFETIME_MS), {
    ...cookieOptions, secure: process.env.NODE_ENV === "production", maxAge: TRANSACTION_LIFETIME_MS / 1000,
  });
  const url = new URL(`https://login.microsoftonline.com/${settings.tenant}/oauth2/v2.0/logout`);
  url.searchParams.set("post_logout_redirect_uri", settings.redirectUri);
  return url.href;
}
