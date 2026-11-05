import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";

const fixture = vi.hoisted(() => ({
  url: "", requests: [] as string[],
  cookies: new Map<string, string>(),
  options: new Map<string, Record<string, unknown>>(),
  localUsers: vi.fn(() => { throw new Error("SSO must not read local users."); }),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => fixture.cookies.has(name) ? { value: fixture.cookies.get(name) } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => {
    fixture.cookies.set(name, value); fixture.options.set(name, options);
  },
  delete: (name: string) => fixture.cookies.delete(name),
}) }));
vi.mock("../server/auth/local-users", () => ({ loadLocalUsers: fixture.localUsers }));
vi.mock("openid-client", async importOriginal => {
  const original = await importOriginal<typeof import("openid-client")>();
  return { ...original, Configuration: function (...args: ConstructorParameters<typeof original.Configuration>) {
      const config = new original.Configuration(...args);
      config[original.customFetch] = async (input, options) => {
        const target = new URL(String(input));
        fixture.requests.push(target.pathname);
        return fetch(fixture.url + target.pathname, options as RequestInit);
      };
      return config;
  } };
});

import { startAzureLogin, completeAzureLogin, azureLogoutUrl, AZURE_LOGOUT_COOKIE, AZURE_TRANSACTION_COOKIE } from "../server/auth/azure";
import { SESSION_COOKIE, hasSession } from "../server/auth/session";
import { azureSettings, azureSsoConfigured } from "../server/auth/settings";
import { readCookie, signCookie } from "../server/auth/signed-cookie";

const tenant = "11111111-1111-1111-1111-111111111111";
const clientId = "22222222-2222-2222-2222-222222222222";
const callbackUri = "http://localhost:3000/api/auth/azure/callback";
let server: Server | undefined;
beforeAll(async () => {
  if (process.env.AUTH_SIMULATION_URL) {
    fixture.url = process.env.AUTH_SIMULATION_URL;
    return;
  }
  const { createFixtureServer } = createRequire(import.meta.url)("./fixtures/entra-provider.cjs");
  server = createFixtureServer();
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  fixture.url = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => {
    server!.close(error => error ? reject(error) : resolve()); server!.closeAllConnections();
  });
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("EINVOICE_SESSION_SECRET", "test-session-secret-at-least-32-characters");
  vi.stubEnv("ALLOW_LOCAL_PASSWORD_LOGIN", "false");
  vi.stubEnv("AZURE_AD_TENANT_ID", tenant);
  vi.stubEnv("AZURE_AD_CLIENT_ID", clientId);
  vi.stubEnv("AZURE_AD_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("AZURE_AD_REDIRECT_URI", callbackUri);
  fixture.cookies.clear(); fixture.options.clear(); fixture.requests.length = 0;
  fixture.localUsers.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function begin() {
  const response = await startAzureLogin(new Request("http://localhost:3000/api/auth/azure/login"));
  expect(response.status).toBe(303);
  const authorization = new URL(response.headers.get("location")!);
  expect(authorization.origin).toBe("https://login.microsoftonline.com");
  return authorization;
}
function callback(authorization: URL, overrides: Record<string, unknown> = {}, state = authorization.searchParams.get("state")!) {
  const code = Buffer.from(JSON.stringify({
    nonce: authorization.searchParams.get("nonce"), challenge: authorization.searchParams.get("code_challenge"), ...overrides,
  })).toString("base64url");
  return new Request(`${callbackUri}?code=${code}&state=${encodeURIComponent(state)}`);
}

describe("Azure SSO over the HTTP provider fixture", () => {
  it("starts tenant-specific authorization with state, nonce and PKCE in an HttpOnly transaction", async () => {
    const authorization = await begin();
    expect(authorization.origin).toBe("https://login.microsoftonline.com");
    expect(authorization.pathname).toBe(`/${tenant}/oauth2/v2.0/authorize`);
    expect(authorization.searchParams.get("redirect_uri")).toBe(callbackUri);
    expect(authorization.searchParams.get("client_id")).toBe(clientId);
    expect(authorization.searchParams.get("response_type")).toBe("code");
    expect(authorization.searchParams.get("prompt")).toBe("login");
    expect(authorization.searchParams.get("scope")).toBe("openid profile email");
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.has("client_secret")).toBe(false);
    const transaction = readCookie("azure-transaction", fixture.cookies.get(AZURE_TRANSACTION_COOKIE))!;
    expect(transaction.state).toBe(authorization.searchParams.get("state"));
    expect(transaction.nonce).toBe(authorization.searchParams.get("nonce"));
    expect(createHash("sha256").update(String(transaction.verifier)).digest("base64url")).toBe(authorization.searchParams.get("code_challenge"));
    expect(fixture.options.get(AZURE_TRANSACTION_COOKIE)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  });
  it("exchanges the code, verifies the ID token signature and creates a tenant session without local users", async () => {
    const response = await completeAzureLogin(callback(await begin()));
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fixture.requests).toContain(`/${tenant}/oauth2/v2.0/token`);
    expect(fixture.requests).toContain(`/${tenant}/discovery/v2.0/keys`);
    expect(fixture.cookies.has(AZURE_TRANSACTION_COOKIE)).toBe(false);
    expect(await hasSession()).toBe(true);
    expect(fixture.localUsers).not.toHaveBeenCalled();
    expect(fixture.cookies.get(SESSION_COOKIE)).not.toContain("synthetic-access-token");
  });
  it("rejects state mismatch before any token exchange", async () => {
    const response = await completeAzureLogin(callback(await begin(), {}, "wrong-state"));
    expect(response.headers.get("location")).toContain("error=sso_failed");
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
  });
  it.each(["missing", "tampered", "expired"])("rejects a %s transaction before token exchange", async mode => {
    const auth = await begin();
    if (mode === "missing") fixture.cookies.delete(AZURE_TRANSACTION_COOKIE);
    if (mode === "tampered") fixture.cookies.set(AZURE_TRANSACTION_COOKIE, "x" + fixture.cookies.get(AZURE_TRANSACTION_COOKIE));
    if (mode === "expired") fixture.cookies.set(AZURE_TRANSACTION_COOKIE, signCookie("azure-transaction", {}, -1000));
    expect((await completeAzureLogin(callback(auth))).headers.get("location")).toContain("error=sso_expired");
    expect(fixture.requests).toHaveLength(0);
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
  });
  it.each([
    { nonce: "wrong" }, { iss: "https://untrusted.example.com" }, { aud: "wrong-client" },
    { tid: "55555555-5555-5555-5555-555555555555" }, { oid: "invalid" }, { exp: 1 },
  ])("rejects signed ID tokens with invalid claims: %j", async claims => {
    const response = await completeAzureLogin(callback(await begin(), { claims }));
    expect(response.headers.get("location")).toContain("error=sso_failed");
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
  });
  it.each(["invalid_signature", "missing_id_token", "unavailable"])("fails closed for %s", async mode => {
    const response = await completeAzureLogin(callback(await begin(), { mode }));
    expect(response.headers.get("location")).toContain("error=sso_failed");
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(fixture.cookies.has(AZURE_TRANSACTION_COOKIE)).toBe(false);
  });
  it("fails when PKCE does not match", async () => {
    const response = await completeAzureLogin(callback(await begin(), { challenge: "wrong-challenge" }));
    expect(response.headers.get("location")).toContain("error=sso_failed");
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
  });
  it("handles denied consent without exchanging a code", async () => {
    const auth = await begin();
    const response = await completeAzureLogin(new Request(`${callbackUri}?error=access_denied&state=${auth.searchParams.get("state")}`));
    expect(response.headers.get("location")).toContain("error=sso_cancelled");
    expect(fixture.requests).toHaveLength(0);
  });
  it("does not reuse a consumed transaction", async () => {
    const request = callback(await begin());
    expect((await completeAzureLogin(request)).headers.get("location")).toBe("http://localhost:3000/");
    fixture.cookies.delete(SESSION_COOKIE);
    expect((await completeAzureLogin(request)).headers.get("location")).toContain("error=sso_expired");
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
  });
  it("uses the configured public redirect URI behind container ingress", async () => {
    const request = callback(await begin());
    const internal = new URL(request.url);
    internal.host = "internal-container:3000";
    const response = await completeAzureLogin(new Request(internal));
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });
});

describe("SSO configuration", () => {
  it("handles the signed logout return without creating a session or showing a login error", async () => {
    const logout = new URL(await azureLogoutUrl());
    expect(logout.searchParams.get("post_logout_redirect_uri")).toBe(callbackUri);
    expect(fixture.cookies.has(AZURE_LOGOUT_COOKIE)).toBe(true);
    const response = await completeAzureLogin(new Request(callbackUri));
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(fixture.cookies.has(SESSION_COOKIE)).toBe(false);
    expect(fixture.cookies.has(AZURE_LOGOUT_COOKIE)).toBe(false);
    expect(fixture.requests).toHaveLength(0);
  });
  it("does not treat a login response as logout while a logout marker exists", async () => {
    await azureLogoutUrl();
    const response = await completeAzureLogin(callback(await begin()));
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
    expect(await hasSession()).toBe(true);
  });
  it.each(["", "too-short"])("returns a friendly failure when the session key is %j", async secret => {
    vi.stubEnv("EINVOICE_SESSION_SECRET", secret);
    const response = await startAzureLogin(new Request("http://localhost:3000/api/auth/azure/login"));
    expect(response.headers.get("location")).toContain("error=signin_unavailable");
    expect(fixture.cookies.has(AZURE_TRANSACTION_COOKIE)).toBe(false);
    expect(fixture.requests).toHaveLength(0);
  });
  it("rejects a generic authority and missing secrets", async () => {
    vi.stubEnv("AZURE_AD_TENANT_ID", "common");
    expect(azureSsoConfigured()).toBe(false);
    vi.stubEnv("AZURE_AD_TENANT_ID", tenant);
    vi.stubEnv("AZURE_AD_CLIENT_SECRET", "");
    const response = await startAzureLogin(new Request("http://localhost:3000/api/auth/azure/login"));
    expect(response.headers.get("location")).toContain("sso_unavailable");
    expect(fixture.cookies.has(AZURE_TRANSACTION_COOKIE)).toBe(false);
  });
  it.each(["http://example.com/api/auth/azure/callback", "https://example.com/wrong", "https://example.com/api/auth/azure/callback?next=evil"])("rejects unsafe redirect URI %s", uri => {
    vi.stubEnv("AZURE_AD_REDIRECT_URI", uri);
    expect(azureSsoConfigured()).toBe(false);
  });
  it("requires HTTPS and secure cookies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(azureSsoConfigured()).toBe(false);
    vi.stubEnv("AZURE_AD_REDIRECT_URI", "https://app.example.com/api/auth/azure/callback");
    expect(azureSettings().redirectUri).toBe("https://app.example.com/api/auth/azure/callback");
    await begin();
    expect(fixture.options.get(AZURE_TRANSACTION_COOKIE)?.secure).toBe(true);
  });
});
