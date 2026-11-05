const messages: Record<string, string> = {
  invalid: "The user ID or password is incorrect. Please try again.",
  local_disabled: "Password sign-in is unavailable. Please sign in with Microsoft.",
  signin_unavailable: "Sign-in is temporarily unavailable. Please contact your administrator.",
  sso_unavailable: "Microsoft sign-in is temporarily unavailable. Please try again later or contact your administrator.",
  sso_expired: "Your Microsoft sign-in session has expired. Please select Sign in with Microsoft to try again.",
  sso_cancelled: "Microsoft sign-in was cancelled or access was not granted. Please try again or contact your administrator.",
  sso_failed: "We couldn’t verify your Microsoft sign-in. Please try again or contact your administrator.",
};

export function loginErrorMessage(error: unknown): string | null {
  if (!error) return null;
  return typeof error === "string" && Object.hasOwn(messages, error)
    ? messages[error]
    : "We couldn’t sign you in. Please try again or contact your administrator.";
}
