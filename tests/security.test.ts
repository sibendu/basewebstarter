import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, exportJWK, SignJWT, errors, type JSONWebKeySet } from "jose";

const tenant = "11111111-1111-1111-1111-111111111111";
const audience = "22222222-2222-2222-2222-222222222222";
const client = "33333333-3333-3333-3333-333333333333";
const objectId = "44444444-4444-4444-4444-444444444444";
const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined, active: true, jwks: {} as JSONWebKeySet,
  unavailable: false, cookiesSet: vi.fn(), redirect: vi.fn((path: string) => { throw new Error("REDIRECT:" + path); }),
  authenticate: vi.fn(),
  cookiesDeleted: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => state.cookie ? { value: state.cookie } : undefined, set: state.cookiesSet,
  delete: (name: string) => { state.cookiesDeleted(name); if (name === "einvoice_demo_session") state.cookie = undefined; },
}) }));
vi.mock("next/navigation", () => ({ redirect: state.redirect }));
vi.mock("../server/auth/local-users", () => ({
  loadLocalUsers: () => [{ email: "user@example.com", active: state.active }],
  authenticateLocalUser: state.authenticate,
}));
vi.mock("jose", async (importOriginal) => {
  const original = await importOriginal<typeof import("jose")>();
  return { ...original, createRemoteJWKSet: () => (...args: Parameters<ReturnType<typeof original.createLocalJWKSet>>) => {
    if (state.unavailable) throw new errors.JWKSTimeout();
    return original.createLocalJWKSet(state.jwks)(...args);
  } };
});

import { createSession, createAzureSession } from "../server/auth/session";
import { login, logout } from "../server/auth/actions";
import { GET as uiHello } from "../app/api/ui/hello/route";
import { GET as integrationHello } from "../app/api/integration/v1/hello/route";
import { withUiSession } from "../server/bff/routes";
import { readCookie, signCookie } from "../server/auth/signed-cookie";

let privateKey: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  state.jwks = { keys: [{ ...await exportJWK(pair.publicKey), kid: "test-key", alg: "RS256", use: "sig" }] };
});
beforeEach(() => {
  vi.stubEnv("EINVOICE_SESSION_SECRET", "test-session-secret-at-least-32-characters");
  vi.stubEnv("ALLOW_LOCAL_PASSWORD_LOGIN", "true");
  vi.stubEnv("AZURE_AD_TENANT_ID", tenant);
  vi.stubEnv("AZURE_AD_CLIENT_ID", audience);
  vi.stubEnv("AZURE_AD_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("AZURE_AD_REDIRECT_URI", "https://app.example.com/api/auth/azure/callback");
  vi.stubEnv("EXTERNAL_API_TENANT_ID", tenant);
  vi.stubEnv("EXTERNAL_API_CLIENT_ID", audience);
  vi.stubEnv("EXTERNAL_API_ALLOWED_CLIENT_IDS", client);
  state.cookie = undefined;
  state.active = true;
  state.unavailable = false;
  state.authenticate.mockReset();
  state.cookiesSet.mockClear();
  state.cookiesDeleted.mockClear();
  state.redirect.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: `https://login.microsoftonline.com/${tenant}/v2.0`, aud: audience, tid: tenant,
    ver: "2.0", sub: "integration", azp: client, idtyp: "app", iat: now, nbf: now, exp: now + 300, ...overrides,
  }).setProtectedHeader({ alg: "RS256", typ: "JWT", kid: "test-key" }).sign(privateKey);
}
function integrationRequest(value?: string) {
  return new Request("https://app.example.com/api/integration/v1/hello", { headers: value ? { authorization: `Bearer ${value}` } : {} });
}
function uiRequest(headers: Record<string, string> = {}, method = "GET") {
  return new Request("https://app.example.com/api/ui/hello", { method, headers: { "X-UI-Request": "1", ...headers } });
}

describe("UI sessions and request boundary", () => {
  it("returns JSON 401 without a session", async () => {
    const response = await uiHello(uiRequest());
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
  });
  it("accepts an authenticated UI fetch", async () => {
    state.cookie = createSession("user@example.com");
    const response = await uiHello(uiRequest({ "sec-fetch-site": "same-origin", "sec-fetch-mode": "same-origin" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    {}, { "sec-fetch-mode": "navigate", "X-UI-Request": "1" },
    { "sec-fetch-dest": "document", "X-UI-Request": "1" }, { accept: "text/html", "X-UI-Request": "1" },
    { "sec-fetch-dest": "iframe", "X-UI-Request": "1" },
    { "sec-fetch-site": "cross-site", "X-UI-Request": "1" },
    { "sec-fetch-site": "same-site", "X-UI-Request": "1" },
    { origin: "https://other.example.com", "X-UI-Request": "1" },
  ])("blocks signed-in navigation and non-UI request shapes: %j", async (headers) => {
    state.cookie = createSession("user@example.com");
    expect((await uiHello(new Request("https://app.example.com/api/ui/hello", { headers: headers as Record<string, string> }))).status).toBe(403);
  });
  it("rejects tampered, expired and disabled-user sessions", async () => {
    const session = createSession("user@example.com");
    state.cookie = `x${session}`;
    expect((await uiHello(uiRequest())).status).toBe(401);
    state.cookie = session;
    state.active = false;
    expect((await uiHello(uiRequest())).status).toBe(401);
    state.active = true;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000);
    expect((await uiHello(uiRequest())).status).toBe(401);
  });
  it.each(["false", "", "TRUE", "1"])("disables local sessions and login when flag is %j", async flag => {
    state.cookie = createSession("user@example.com");
    vi.stubEnv("ALLOW_LOCAL_PASSWORD_LOGIN", flag);
    expect((await uiHello(uiRequest())).status).toBe(401);
    await expect(login(new FormData())).rejects.toThrow("REDIRECT:/login?error=local_disabled");
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.cookiesSet).not.toHaveBeenCalled();
  });
  it("permits enabled valid local login and rejects bad credentials", async () => {
    state.authenticate.mockReturnValue(null);
    await expect(login(new FormData())).rejects.toThrow("REDIRECT:/login?error=invalid");
    state.authenticate.mockReturnValue({ email: "user@example.com" });
    await expect(login(new FormData())).rejects.toThrow("REDIRECT:/");
    expect(state.cookiesSet).toHaveBeenCalledWith("einvoice_demo_session", expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
  });
  it.each(["", "too-short"])("returns a friendly failure when the session key is %j", async secret => {
    vi.stubEnv("EINVOICE_SESSION_SECRET", secret);
    await expect(login(new FormData())).rejects.toThrow("REDIRECT:/login?error=signin_unavailable");
    expect(state.authenticate).not.toHaveBeenCalled();
    expect(state.cookiesSet).not.toHaveBeenCalled();
  });
  it("handles session-write failures without exposing an exception page", async () => {
    state.authenticate.mockReturnValue({ email: "user@example.com" });
    state.cookiesSet.mockImplementationOnce(() => { throw new Error("private internal error"); });
    await expect(login(new FormData())).rejects.toThrow("REDIRECT:/login?error=signin_unavailable");
  });
  it("permits tenant SSO users independently of the local flag and account file", async () => {
    vi.stubEnv("ALLOW_LOCAL_PASSWORD_LOGIN", "false");
    state.active = false;
    state.cookie = createAzureSession(tenant, objectId);
    expect((await uiHello(uiRequest())).status).toBe(200);
    state.cookie = createAzureSession("55555555-5555-5555-5555-555555555555", objectId);
    expect((await uiHello(uiRequest())).status).toBe(401);
  });
  it("does not accept a transaction cookie or OAuth token as a UI session", async () => {
    state.cookie = signCookie("azure-transaction", { provider: "local", email: "user@example.com" }, 10000);
    expect((await uiHello(uiRequest())).status).toBe(401);
    state.cookie = undefined;
    expect((await uiHello(uiRequest({ authorization: `Bearer ${await token()}` }))).status).toBe(401);
    state.cookie = await token();
    expect((await uiHello(uiRequest())).status).toBe(401);
  });
  it("requires an explicit matching origin for mutations", async () => {
    state.cookie = createSession("user@example.com");
    const handler = withUiSession(() => ({ ok: true }));
    expect((await handler(uiRequest({}, "POST"))).status).toBe(403);
    expect((await handler(uiRequest({ origin: "https://other.example.com" }, "POST"))).status).toBe(403);
    expect((await handler(uiRequest({ origin: "https://app.example.com" }, "POST"))).status).toBe(200);
  });
});

describe("Entra app-only integrations", () => {
  it("does not accept either kind of UI session", async () => {
    for (const session of [createSession("user@example.com"), createAzureSession(tenant, objectId)]) {
      state.cookie = session;
      const response = await integrationHello(integrationRequest());
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
    }
  });
  it("accepts an allowed application JWT without roles or scopes", async () => {
    const response = await integrationHello(integrationRequest(await token()));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ message: "Hello" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it.each([
    { iss: "https://wrong.example.com" }, { aud: "wrong-api" }, { exp: 1 },
    { nbf: Math.floor(Date.now() / 1000) + 3600 }, { exp: undefined }, { iat: undefined }, { sub: "" },
    { iat: Math.floor(Date.now() / 1000) + 3600 }, { tid: "wrong-tenant" }, { ver: "1.0" },
    { azp: undefined }, { idtyp: undefined }, { idtyp: "user" },
    { scp: "access_as_user" }, { scp: "" }, { idtyp: undefined, nonce: "id-token-nonce" },
  ])("rejects invalid, delegated and ID token claims: %j", async claims => {
    const response = await integrationHello(integrationRequest(await token(claims)));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("invalid_token");
  });
  it("rejects malformed tokens and invalid signatures", async () => {
    expect((await integrationHello(integrationRequest("malformed"))).status).toBe(401);
    const other = await generateKeyPair("RS256");
    const bad = await new SignJWT({}).setProtectedHeader({ alg: "RS256", kid: "test-key" }).sign(other.privateKey);
    expect((await integrationHello(integrationRequest(bad))).status).toBe(401);
  });
  it("rejects unapproved clients and supports a comma-separated allowlist", async () => {
    const other = "55555555-5555-5555-5555-555555555555";
    expect((await integrationHello(integrationRequest(await token({ azp: other })))).status).toBe(403);
    vi.stubEnv("EXTERNAL_API_ALLOWED_CLIENT_IDS", ` ${other}, ${client} `);
    expect((await integrationHello(integrationRequest(await token({ azp: other })))).status).toBe(200);
  });
  it.each(["EXTERNAL_API_TENANT_ID", "EXTERNAL_API_CLIENT_ID", "EXTERNAL_API_ALLOWED_CLIENT_IDS"])("fails closed without %s", async name => {
    vi.stubEnv(name, "");
    expect((await integrationHello(integrationRequest(await token()))).status).toBe(503);
  });
  it("fails closed when signing keys cannot be fetched", async () => {
    state.unavailable = true;
    expect((await integrationHello(integrationRequest(await token()))).status).toBe(503);
  });
});


describe("sign-out", () => {
  it("clears local sessions and pending SSO before returning to login", async () => {
    state.cookie = createSession("user@example.com");
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(state.cookiesDeleted.mock.calls.map(call => call[0])).toEqual([
      "einvoice_demo_session", "einvoice_azure_transaction", "einvoice_azure_logout",
    ]);
    expect((await uiHello(uiRequest())).status).toBe(401);
    expect(state.cookiesSet).not.toHaveBeenCalled();
  });
  it("clears the Azure app session and redirects to tenant logout with a signed return transaction", async () => {
    state.cookie = createAzureSession(tenant, objectId);
    await expect(logout()).rejects.toThrow("REDIRECT:https://login.microsoftonline.com/");
    expect((await uiHello(uiRequest())).status).toBe(401);
    const url = new URL(state.redirect.mock.calls.at(-1)![0]);
    expect(url.origin).toBe("https://login.microsoftonline.com");
    expect(url.pathname).toBe(`/${tenant}/oauth2/v2.0/logout`);
    expect(url.searchParams.get("post_logout_redirect_uri")).toBe("https://app.example.com/api/auth/azure/callback");
    expect(url.searchParams.has("client_secret")).toBe(false);
    const [name, value, options] = state.cookiesSet.mock.calls.at(-1)!;
    expect(name).toBe("einvoice_azure_logout");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 600 });
    expect(readCookie("azure-logout", value)).toMatchObject({ tenant, redirectUri: "https://app.example.com/api/auth/azure/callback" });
  });
  it("still clears the app session if Microsoft logout is not configured", async () => {
    state.cookie = createAzureSession(tenant, objectId);
    vi.stubEnv("AZURE_AD_CLIENT_SECRET", "");
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect((await uiHello(uiRequest())).status).toBe(401);
  });
  it("does not send missing or tampered sessions to Microsoft logout", async () => {
    for (const value of [undefined, "tampered"]) {
      state.cookie = value;
      await expect(logout()).rejects.toThrow("REDIRECT:/login");
    }
    expect(state.cookiesSet).not.toHaveBeenCalled();
  });
});
