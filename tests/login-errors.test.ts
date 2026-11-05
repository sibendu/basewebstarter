import { describe, expect, it } from "vitest";
import { loginErrorMessage } from "../lib/login-errors";

describe("login messages", () => {
  it("does not show an error before a login attempt", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
  });
  it("explains a sign-in configuration failure without exposing server settings", () => {
    expect(loginErrorMessage("signin_unavailable")).toBe("Sign-in is temporarily unavailable. Please contact your administrator.");
  });
  it("gives a recovery action for expired and cancelled Microsoft login", () => {
    expect(loginErrorMessage("sso_expired")).toContain("select Sign in with Microsoft to try again");
    expect(loginErrorMessage("sso_cancelled")).toContain("cancelled or access was not granted");
  });
  it.each(["<script>private provider error</script>", "constructor", ["invalid", "sso_failed"]])("does not reflect unknown query input: %j", value => {
    expect(loginErrorMessage(value)).toBe("We couldn’t sign you in. Please try again or contact your administrator.");
  });
});
