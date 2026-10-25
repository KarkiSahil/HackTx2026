export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isAllowedEmail(email, domain) {
  if (!domain) return true;
  return email.toLowerCase().endsWith("@" + domain.toLowerCase());
}

export function friendlyAuthError(error) {
  if (!error) return "Something went wrong. Please try again.";
  const msg = (error.message ?? "").toLowerCase();
  const status = error.status;
  if (
    msg.includes("expired") ||
    msg.includes("invalid") ||
    msg.includes("otp") ||
    msg.includes("token")
  ) {
    return "That code is wrong or expired. Try again or resend a new one.";
  }
  if (
    status === 429 ||
    msg.includes("rate limit") ||
    msg.includes("security purposes")
  ) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (
    msg.includes("not authorized") ||
    msg.includes("unable to send") ||
    msg.includes("email")
  ) {
    return "We couldn't send an email to that address. Check it and try again.";
  }
  return "Something went wrong. Please try again.";
}
