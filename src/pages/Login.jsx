import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Lock, MapPin } from "lucide-react";
import { sendLoginCode, verifyLoginCode } from "../lib/api";
import {
  normalizeEmail,
  isValidEmail,
  isAllowedEmail,
  friendlyAuthError,
} from "../lib/format";

const DOMAIN = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN;
const RESEND_COOLDOWN = 60;

export default function Login() {
  const navigate = useNavigate();
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function handleSendCode(e) {
    e.preventDefault();
    setError("");
    const norm = normalizeEmail(email);
    if (!isValidEmail(norm)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (DOMAIN && !isAllowedEmail(norm, DOMAIN)) {
      setError(`Use your @${DOMAIN} email.`);
      return;
    }
    setLoading(true);
    try {
      await sendLoginCode(norm);
      setEmail(norm);
      setCode("");
      setStep("code");
      setCountdown(RESEND_COOLDOWN);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(codeValue) {
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await verifyLoginCode(email, codeValue);
      navigate("/");
    } catch (err) {
      setError(friendlyAuthError(err));
      setCode("");
      codeRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  function handleCodeChange(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (error) setError("");
    if (digits.length === 6) submitCode(digits);
  }

  async function handleResend() {
    if (countdown > 0 || loading) return;
    setError("");
    setCode("");
    setLoading(true);
    try {
      await sendLoginCode(email);
      setCountdown(RESEND_COOLDOWN);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-amber-700 via-amber-600 to-orange-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.14)_1px,transparent_0)] bg-[length:22px_22px]" />
        <p className="relative font-display text-3xl font-semibold">Katha</p>
        <div className="relative max-w-md space-y-6">
          <h2 className="font-display text-5xl font-semibold leading-tight">A memory for places.</h2>
          <p className="text-lg text-amber-50/90">
            How people felt, right here, at this moment. Left where it happened, for whoever comes next.
          </p>
          <ul className="space-y-3 text-amber-50">
            {[
              [MapPin, "Leave stories, voice notes and letters only where you stand."],
              [BookOpen, "Read stories from anywhere."],
              [Lock, "Voice notes and chain letters open when you show up."],
            ].map(([Icon, text]) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-glass/15">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-amber-100/80">Your words stay where they happened.</p>
      </aside>

      <div className="flex items-center justify-center px-4 py-10 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] pt-[calc(env(safe-area-inset-top)+2.5rem)]">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-display text-4xl font-semibold text-lamp lg:hidden">Katha</p>
          <h1 className="mt-2 font-display text-2xl font-semibold text-fg lg:mt-0 lg:text-3xl">
            {step === "email" ? "Welcome" : "Check your email"}
          </h1>
          <p className="mt-1 text-fg-2">
            Leave a note where it happened. Someone nearby will find it.
          </p>
        </div>

        <div className="card p-6">
          {step === "email" ? (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-fg-2">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError("");
                  }}
                  placeholder={DOMAIN ? `you@${DOMAIN}` : "you@example.com"}
                  className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-lamp focus:ring-2 focus:ring-lamp/20"
                />
                {DOMAIN && (
                  <p className="mt-1 text-xs text-fg-2">
                    Use your @{DOMAIN} email
                  </p>
                )}
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl btn-lamp py-3 font-semibold disabled:opacity-60 active:opacity-80"
              >
                {loading ? "Sending…" : "Send code"}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-fg-2">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-fg">{email}</span>.
                Check your inbox and spam folder.
              </p>

              <div>
                <label className="mb-1 block text-sm font-medium text-fg-2">
                  One-time code
                </label>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={handleCodeChange}
                  disabled={loading}
                  placeholder="000000"
                  className="w-full rounded-xl border border-line px-4 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none focus:border-lamp focus:ring-2 focus:ring-lamp/20 disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => submitCode(code)}
                disabled={loading || code.length !== 6}
                className="w-full rounded-xl btn-lamp py-3 font-semibold disabled:opacity-60 active:opacity-80"
              >
                {loading ? "Verifying…" : "Verify"}
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={countdown > 0 || loading}
                  className="text-sm font-medium text-lamp disabled:text-fg-3"
                >
                  {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError("");
                  }}
                  className="text-sm text-fg-2 underline"
                >
                  Use a different email
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-fg-3">
          We'll email you a one-time code. No password needed.
        </p>
      </div>
      </div>
    </div>
  );
}
