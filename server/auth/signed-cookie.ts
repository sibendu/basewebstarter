import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export function sessionSigningConfigured() {
  return (process.env.EINVOICE_SESSION_SECRET?.length ?? 0) >= 32;
}

function signature(purpose: string, payload: string) {
  const secret = process.env.EINVOICE_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("EINVOICE_SESSION_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(`${purpose}:${payload}`).digest();
}

export function signCookie(purpose: string, value: Record<string, unknown>, lifetimeMs: number) {
  const issuedAt = Date.now();
  const payload = Buffer.from(JSON.stringify({ ...value, issuedAt, expiresAt: issuedAt + lifetimeMs })).toString("base64url");
  return `${payload}.${signature(purpose, payload).toString("base64url")}`;
}

export function readCookie(purpose: string, value: string | undefined): Record<string, unknown> | null {
  if (!value || value.length > 4096) return null;
  try {
    const [payload, suppliedSignature, extra] = value.split(".");
    if (!payload || !suppliedSignature || extra) return null;
    const expected = signature(purpose, payload);
    const supplied = Buffer.from(suppliedSignature, "base64url");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.issuedAt !== "number" ||
        typeof parsed.expiresAt !== "number" || parsed.issuedAt > Date.now() ||
        parsed.expiresAt <= Date.now() || parsed.expiresAt <= parsed.issuedAt) return null;
    return parsed;
  } catch { return null; }
}

export const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/" };
