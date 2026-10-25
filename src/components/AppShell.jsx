import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/useAuth";
import Avatar from "./Avatar";
import BottomNav from "./BottomNav";
import NotificationBell from "./NotificationBell";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="Katha, home">
      <span
        className="flex h-[38px] w-[38px] items-center justify-center rounded-xl text-xl font-semibold text-on-lamp shadow-[0_8px_24px_rgba(234,88,12,0.35)]"
        style={{ background: "linear-gradient(135deg, #FCD34D, #F59E0B 55%, #EA580C)" }}
        aria-hidden="true"
      >
        क
      </span>
      <span className="font-display text-[26px] italic leading-none text-fg">Katha</span>
    </Link>
  );
}

// Page frame: brand header, page content, floating dock. Pages without their own
// big title (place board, story) pass `title` for a compact back + title row.
export default function AppShell({ title, subtitle, back = false, actions, children }) {
  const navigate = useNavigate();
  const { profile } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-[1100] bg-bg/70 backdrop-blur-xl" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex w-full max-w-[1280px] items-center justify-between gap-3 px-4 py-3 md:px-8">
          <Logo />
          <div className="flex items-center gap-2">
            {actions}
            <NotificationBell />
            <Link to="/profile" aria-label="Your profile" className="rounded-full">
              <Avatar name={profile?.display_name ?? ""} size="header" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-36">
        {(title || back) && (
          <div className="mx-auto flex w-full max-w-[1280px] items-center gap-3 px-4 pt-4 md:px-8">
            {back && (
              <button onClick={() => navigate(-1)} className="btn-glass shrink-0 rounded-full" aria-label="Go back">
                <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
              </button>
            )}
            {title && (
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-semibold tracking-tight text-fg md:text-3xl">{title}</h1>
                {subtitle && <p className="truncate text-[13px] text-fg-2">{subtitle}</p>}
              </div>
            )}
          </div>
        )}
        {children}
      </main>

      <BottomNav />
    </div>
  );
}

// Standard content area.
export function PageBody({ size = "md", className = "", children }) {
  const width = { sm: "max-w-2xl", md: "max-w-4xl", lg: "max-w-[1280px]" }[size];
  return <div className={`mx-auto w-full ${width} px-4 pt-5 md:px-8 md:pt-8 ${className}`}>{children}</div>;
}
