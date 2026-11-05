import "server-only";
import { hasSession } from "../auth/session";
import { requireIntegrationToken } from "../auth/oauth";
import { ApiError, json } from "./http";

type Handler = (request: Request) => unknown | Promise<unknown>;

function guarded(authenticate: (request: Request) => Promise<unknown>, handler: Handler) {
  return async (request: Request) => {
    try {
      await authenticate(request);
      return json(await handler(request));
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message }, error.status, error.challenge);
      return json({ error: "Internal server error." }, 500);
    }
  };
}

export function withUiSession(handler: Handler) {
  return guarded(async (request) => {
    if (!(await hasSession())) throw new ApiError(401, "Sign in required.");
    // Request-shape/CSRF checks supplement session authentication. These
    // headers are reproducible and must never be treated as credentials.
    if (request.headers.get("x-ui-request") !== "1" ||
        request.headers.get("sec-fetch-mode") === "navigate" ||
        ["document", "iframe", "frame"].includes(request.headers.get("sec-fetch-dest") ?? "") ||
        request.headers.get("accept")?.includes("text/html") ||
        (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin") ||
        (request.headers.has("origin") && request.headers.get("origin") !== new URL(request.url).origin)) {
      throw new ApiError(403, "Same-origin UI request required.");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      if (request.headers.get("origin") !== new URL(request.url).origin) {
        throw new ApiError(403, "Same-origin request required.");
      }
    }
  }, handler);
}

export function withIntegrationToken(handler: Handler) {
  return guarded(requireIntegrationToken, handler);
}
