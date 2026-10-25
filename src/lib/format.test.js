import {
  friendlyAuthError,
  isAllowedEmail,
  isValidEmail,
  normalizeEmail,
} from "./format";

describe("format utilities", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
  });

  it("validates email addresses", () => {
    expect(isValidEmail("person@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });

  it("checks allowed email domains without case sensitivity", () => {
    expect(isAllowedEmail("person@EXAMPLE.COM", "example.com")).toBe(true);
    expect(isAllowedEmail("person@notexample.com", "example.com")).toBe(false);
    expect(isAllowedEmail("person@example.com", "")).toBe(true);
  });

  it("returns a useful message for expired login codes", () => {
    expect(friendlyAuthError({ message: "Token expired" })).toContain(
      "wrong or expired",
    );
  });
});
