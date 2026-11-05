"use client";

// All UI API calls use the cookie session and this request-shape marker.
// The marker is not a secret and never substitutes for session authentication.
export function uiApiFetch(path: string, init: RequestInit = {}) {
  const target = new URL(path, window.location.origin);
  if (!path.startsWith("/api/ui/") || path.includes("\\") || target.hash ||
      target.origin !== window.location.origin || !target.pathname.startsWith("/api/ui/")) {
    throw new Error("UI API requests must target /api/ui/.");
  }
  const headers = new Headers(init.headers);
  headers.set("X-UI-Request", "1");
  headers.set("Accept", "application/json");
  headers.delete("Authorization");
  return fetch(path, { ...init, headers, credentials: "same-origin", mode: "same-origin", redirect: "error", cache: "no-store" });
}
