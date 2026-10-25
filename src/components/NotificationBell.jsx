import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, BellRing, CheckCheck, Mail, MessageCircle, MessageSquare, UserPlus } from "lucide-react";
import { useNotifications } from "../context/useNotifications";
import { describeNotification } from "../lib/notifications";
import { timeAgo } from "../lib/stamp";
import { tint } from "../lib/tints";

const TYPE_STYLE = {
  comment: { icon: MessageCircle, color: "#FCD34D" },
  chain_reply: { icon: Mail, color: "#FDA4AF" },
  dm_request: { icon: UserPlus, color: "#A5B4FC" },
  dm_message: { icon: MessageSquare, color: "#6EE7B7" },
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const { items, unreadCount, markRead, permission, requestBrowserAlerts } = useNotifications();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function openItem(notification) {
    markRead([notification.id]);
    setOpen(false);
    navigate(describeNotification(notification).href);
  }

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        onClick={() => setOpen((v) => !v)}
        className={`btn-glass relative rounded-full ${open ? "selected" : "text-fg-2"}`}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unreadCount > 0 && <span className="glow-dot absolute right-2.5 top-2.5 text-lamp" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[1200] flex max-h-[min(70vh,32rem)] flex-col overflow-hidden rounded-3xl border border-line bg-[#16120E]/95 shadow-[0_24px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-3 md:w-96"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-display text-lg font-semibold text-fg">
              Notifications
              {unreadCount > 0 && (
                <span className="chip ml-2 align-middle font-sans" style={tint("#FCD34D")}>{unreadCount} new</span>
              )}
            </p>
            {unreadCount > 0 && (
              <button onClick={() => markRead(items.map((n) => n.id))} className="flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-lamp hover:underline">
                <CheckCheck className="h-4 w-4" strokeWidth={1.75} /> Mark all read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-glass-raised text-fg-3">
                  <BellOff className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="text-sm font-medium text-fg">You're all caught up</p>
                <p className="text-[13px] text-fg-2">When someone comments, answers your letter or messages you, it shows up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((n) => {
                  const { icon: Icon, color } = TYPE_STYLE[n.type] ?? TYPE_STYLE.comment;
                  const unread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => openItem(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-glass-raised ${unread ? "bg-lamp/5" : ""}`}
                      >
                        <span className="chip mt-0.5 h-9 w-9 shrink-0 justify-center p-0" style={tint(color)}>
                          <Icon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm leading-snug ${unread ? "font-medium text-fg" : "text-fg-2"}`}>
                            {describeNotification(n).text}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-fg-3">{timeAgo(n.created_at)}</span>
                        </span>
                        {unread && <span className="glow-dot mt-2 shrink-0 text-lamp" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {permission === "default" && (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-glass px-4 py-3">
              <p className="text-[13px] text-fg-2">Get alerts in this browser, even in another tab.</p>
              <button onClick={requestBrowserAlerts} className="btn-lamp flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl px-3 text-[13px]">
                <BellRing className="h-4 w-4" strokeWidth={1.75} /> Turn on
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
