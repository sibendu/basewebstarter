import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { localPasswordLoginAllowed } from "./settings";

export type LocalUser = {
  email: string;
  displayName: string;
  passwordHash: string;
  active: boolean;
};


function userFilePath() {
  if (process.env.EINVOICE_USERS_FILE) return process.env.EINVOICE_USERS_FILE;
  return path.join(process.cwd(), "config", "users.local.json");
}

export function loadLocalUsers(): LocalUser[] {
  if (!existsSync(/* turbopackIgnore: true */ userFilePath())) return [];
  const raw = readFileSync(/* turbopackIgnore: true */ userFilePath(), "utf-8");
  const parsed = JSON.parse(raw) as { users?: LocalUser[] };
  const users = parsed.users ?? [];
  const seen = new Set<string>();
  for (const user of users) {
    const email = user.email?.trim().toLowerCase();
    if (!email || seen.has(email)) throw new Error("Local user configuration is invalid.");
    if (!user.passwordHash || !user.displayName) throw new Error("Local user configuration is invalid.");
    seen.add(email);
  }
  return users;
}

function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterations, salt, expected] = encoded.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !expected) return false;
  const actual = pbkdf2Sync(password, salt, Number(iterations), 32, "sha256").toString("base64");
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function authenticateLocalUser(email: string, password: string) {
  if (!localPasswordLoginAllowed()) return null;
  try {
    const normalized = email.trim().toLowerCase();
    const user = loadLocalUsers().find((candidate) => candidate.email.toLowerCase() === normalized);
    if (!user || !user.active || !verifyPassword(password, user.passwordHash)) return null;
    return { email: user.email, displayName: user.displayName };
  } catch {
    return null;
  }
}

