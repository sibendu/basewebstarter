/* eslint-disable @typescript-eslint/no-require-imports -- Postman executes CommonJS handlers. */
/* Test-only subset of the documented Entra OIDC token/JWKS contract.
   Never deployed with the application. Authorization codes encode synthetic
   test inputs; this is not an authorization server. */
const http = require("node:http");
const { createHash, generateKeyPairSync, sign } = require("node:crypto");
const tenant = "11111111-1111-1111-1111-111111111111";
const clientId = "22222222-2222-2222-2222-222222222222";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "fixture-key", use: "sig", alg: "RS256" };

function jwt(claims, invalidSignature) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "fixture-key" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const input = header + "." + body;
  return input + "." + sign("RSA-SHA256", Buffer.from(input), invalidSignature ? otherKey : privateKey).toString("base64url");
}

async function handle(req, res) {
  const path = new URL(req.url, "http://localhost").pathname;
  const send = (status, body) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
  if (req.method === "GET" && path === "/" + tenant + "/discovery/v2.0/keys") return send(200, { keys: [jwk] });
  if (req.method !== "POST" || path !== "/" + tenant + "/oauth2/v2.0/token") return send(501, { error: "unsupported_fixture_endpoint" });
  let raw = "";
  if (req.body !== undefined) {
    raw = typeof req.body === "string" || Buffer.isBuffer(req.body) ? String(req.body) : new URLSearchParams(req.body).toString();
  } else {
    for await (const chunk of req) raw += chunk;
  }
  const body = new URLSearchParams(raw);
  let code;
  try { code = JSON.parse(Buffer.from(body.get("code") || "", "base64url").toString()); } catch { return send(400, { error: "invalid_grant" }); }
  if (code.mode === "unavailable") return send(503, { error: "temporarily_unavailable" });
  if (body.get("grant_type") !== "authorization_code" || body.get("client_id") !== clientId ||
      body.get("client_secret") !== "test-client-secret" ||
      body.get("redirect_uri") !== "http://localhost:3000/api/auth/azure/callback" ||
      createHash("sha256").update(body.get("code_verifier") || "").digest("base64url") !== code.challenge) {
    return send(400, { error: "invalid_grant" });
  }
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "https://login.microsoftonline.com/" + tenant + "/v2.0", aud: clientId, sub: "tenant-user",
    tid: tenant, oid: "44444444-4444-4444-4444-444444444444", iat: now, nbf: now, exp: now + 300,
    nonce: code.nonce, ...code.claims,
  };
  return send(200, {
    token_type: "Bearer", expires_in: 300, access_token: "synthetic-access-token",
    ...(code.mode === "missing_id_token" ? {} : { id_token: jwt(claims, code.mode === "invalid_signature") }),
  });
}

function createFixtureServer() {
  return http.createServer((req, res) => { handle(req, res).catch(() => { res.writeHead(500); res.end(); }); });
}

module.exports = { createFixtureServer };
if (require.main === module) createFixtureServer().listen(Number(process.env.PORT || 4117), "127.0.0.1");
