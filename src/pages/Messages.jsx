import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Info, MessageCircle } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useNotifications } from "../context/useNotifications";
import { getThreads } from "../lib/api";
import { timeAgo } from "../lib/stamp";
import AppShell from "../components/AppShell";
import Avatar from "../components/Avatar";
import Chat from "./Chat";

// Two panes: conversations on the left, the open thread on the right.
// On phones, one pane at a time.
export default function Messages() {
  const { id: openId } = useParams();
  const { user } = useAuth();
  const { items: notifications, markRead } = useNotifications();
  const navigate = useNavigate();
  const [threads, setThreads] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setThreads(await getThreads(user.id));
    } catch {
      setError("Could not load your messages.");
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const unreadFor = (threadId) =>
    notifications.filter((n) => !n.read_at && n.payload?.thread_id === threadId && (n.type === "dm_message" || n.type === "dm_request"));

  // Opening a conversation clears its message notifications.
  useEffect(() => {
    if (!openId) return;
    const ids = notifications
      .filter((n) => !n.read_at && n.payload?.thread_id === openId)
      .map((n) => n.id);
    if (ids.length) markRead(ids);
  }, [openId, notifications, markRead]);

  const visible = (threads ?? []).filter((t) => t.status !== "declined" || t.id === openId);

  return (
    <AppShell>
      <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-6 px-4 pt-6 md:px-8 md:pt-10 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start">
        {/* Conversations */}
        <div className={`space-y-4 ${openId ? "hidden lg:block" : ""}`}>
          <div>
            <h1 className="title-display text-fg">
              <em>Messages</em>
            </h1>
            <p className="mt-2 text-[15px] text-fg-2">People who found your stories, and the ones you found.</p>
          </div>

          {error && <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
          {!threads && !error && <p className="text-[13px] text-fg-3">Loading…</p>}

          {threads && visible.length === 0 && (
            <div className="glass flex flex-col items-center gap-3 p-8 text-center">
              <span className="chip h-12 w-12 justify-center p-0" style={{ "--chip": "#FCD34D" }}>
                <MessageCircle className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <p className="text-[15px] text-fg-2">No conversations yet.</p>
            </div>
          )}

          <ul className="space-y-2">
            {visible.map((t) => {
              const active = t.id === openId;
              const unread = unreadFor(t.id).length > 0;
              const waiting = t.status === "requested" && t.i_requested;
              const incoming = t.status === "requested" && !t.i_requested;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => navigate(`/messages/${t.id}`)}
                    className={`glass flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-colors hover:bg-glass-raised ${
                      active ? "border-lamp/45 shadow-[0_0_28px_rgba(252,211,77,0.2)]" : ""
                    }`}
                  >
                    <Avatar name={t.other_name} size="header" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[15px] ${unread ? "font-semibold text-fg" : "font-medium text-fg"}`}>{t.other_name}</span>
                        <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(t.created_at)}</span>
                      </span>
                      <span className={`block truncate text-[13px] ${waiting || incoming ? "text-lamp" : "text-fg-2"}`}>
                        {waiting
                          ? "Waiting for them to accept"
                          : incoming
                            ? "Wants to talk with you"
                            : t.source?.story?.place?.name
                              ? `Met at ${t.source.story.place.name}`
                              : t.opening_message}
                      </span>
                    </span>
                    {unread && <span className="glow-dot shrink-0 text-lamp" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex gap-3 rounded-2xl border border-dashed border-line p-4">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-fg-3" strokeWidth={1.75} />
            <p className="text-[13px] leading-relaxed text-fg-3">
              Conversations start from a story. Its author can invite someone who commented, and nothing opens until they
              accept. You can block anyone from the menu in a conversation.
            </p>
          </div>
        </div>

        {/* Thread */}
        <div className={openId ? "" : "hidden lg:block"}>
          {openId ? (
            <Chat key={openId} threadId={openId} onBack={() => navigate("/messages")} onChanged={load} />
          ) : (
            <div className="glass flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-[28px] p-10 text-center">
              <span className="chip h-14 w-14 justify-center p-0" style={{ "--chip": "#FCD34D" }}>
                <MessageCircle className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <p className="font-display text-2xl text-fg">Pick a conversation</p>
              <p className="max-w-xs text-[13px] text-fg-2">Choose someone on the left to read and reply.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
