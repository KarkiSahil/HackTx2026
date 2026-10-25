import { NavLink, useNavigate } from "react-router-dom";
import { Map, BookHeart, Plus, MessageCircle, User } from "lucide-react";

const TABS = [
  { to: "/", label: "Map", icon: Map },
  { to: "/me", label: "My Katha", icon: BookHeart },
  null,
  { to: "/messages", label: "Messages", icon: MessageCircle },
  { to: "/profile", label: "Profile", icon: User },
];

// Floating glass dock, 28px above the bottom edge.
export default function BottomNav() {
  const navigate = useNavigate();

  return (
    <nav
      className="fixed inset-x-0 z-[1100] flex justify-center px-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 28px)" }}
      aria-label="Main"
    >
      <div
        className="flex items-center gap-1 rounded-[26px] border border-line px-2 py-2 shadow-[0_24px_48px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-2xl"
        style={{ background: "rgba(22, 18, 14, 0.78)" }}
      >
        {TABS.map((tab) =>
          tab ? (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/"}
              className={({ isActive }) =>
                `flex min-h-[52px] min-w-[54px] flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-1.5 text-[11px] font-medium transition-colors sm:min-w-[72px] sm:px-2.5 ${
                  isActive ? "selected" : "text-fg-3 hover:text-fg"
                }`
              }
            >
              <tab.icon className="h-5 w-5" strokeWidth={1.75} />
              <span>{tab.label}</span>
            </NavLink>
          ) : (
            <button
              key="compose"
              onClick={() => navigate("/compose")}
              className="btn-lamp mx-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-[0_12px_32px_rgba(234,88,12,0.45)] transition-transform hover:scale-105 active:scale-95"
              aria-label="Leave something here"
            >
              <Plus className="h-6 w-6" strokeWidth={2} />
            </button>
          ),
        )}
      </div>
    </nav>
  );
}
