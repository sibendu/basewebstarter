"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, createSession, setSession } from "./session";
import { authenticateLocalUser } from "./local-users";
import { localPasswordLoginAllowed } from "./settings";
import { readCookie, sessionSigningConfigured } from "./signed-cookie";
import { AZURE_LOGOUT_COOKIE, AZURE_TRANSACTION_COOKIE, azureLogoutUrl } from "./azure";

export async function login(formData: FormData) {
  if (!localPasswordLoginAllowed()) redirect("/login?error=local_disabled");
  if (!sessionSigningConfigured()) {
    console.error("[auth] Configure EINVOICE_SESSION_SECRET with at least 32 characters before signing in.");
    redirect("/login?error=signin_unavailable");
  }
  const user = authenticateLocalUser(String(formData.get("username") || ""), String(formData.get("password") || ""));
  if (!user) {
    redirect("/login?error=invalid");
  }

  try {
    await setSession(createSession(user.email));
  } catch {
    console.error("[auth] Could not establish a local sign-in session.");
    redirect("/login?error=signin_unavailable");
  }
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  const session = readCookie("ui-session", jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  jar.delete(AZURE_TRANSACTION_COOKIE);
  jar.delete(AZURE_LOGOUT_COOKIE);
  let destination = "/login";
  if (session?.provider === "azure") {
    try {
      destination = await azureLogoutUrl();
    } catch {
      console.error("[auth] App session cleared, but Microsoft sign-out could not start. Check the Azure SSO configuration.");
    }
  }
  redirect(destination);
}

