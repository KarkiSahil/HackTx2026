import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MapPin, Send } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { answerDmRequest, getMessages, getThread, markMessagesRead, sendMessage, subscribeToMessages } from "../lib/api";
import { timeAgo } from "../lib/stamp";
import Avatar from "../components/Avatar";
import ItemMenu from "../components/ItemMenu";
import SupportCard from "../components/SupportCard";

function Bubble({ mine, text, time, children }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] px-4 py-2.5 ${
          mine
            ? "btn-lamp rounded-[22px] rounded-br-[6px]"
            : "rounded-[22px] rounded-bl-[6px] border border-line bg-glass-raised text-fg"
        }`}
      >
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
        <div className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-on-lamp/65" : "text-fg-3"}`}>
          {time && timeAgo(time)}
          {children}
        </div>
      </div>
    </div>
  );
}

// One conversation: the story it started from, the messages, and the composer.
export default function Chat({ threadId, onBack, onChanged }) {
  const { user } = useAuth();
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [showSupport, setShowSupport] = useState(false);
  const [answering, setAnswering] = useState(false);
  const bottom = useRef(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const t = await getThread(threadId, user.id);
      if (!t) {
        setError("This conversation isn't available.");
        return;
      }
      setThread(t);
      setMessages(await getMessages(threadId));
      markMessagesRead(threadId, user.id);
    } catch {
      setError("Could not load this conversation.");
    }
  }, [threadId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(
    () =>
      subscribeToMessages(threadId, (message) => {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
        if (message.sender_id !== user.id) markMessagesRead(threadId, user.id);
      }),
    [threadId, user.id],
  );

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setSendError("");
    try {
      const { message, support } = await sendMessage(threadId, text.trim());
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setText("");
      setShowSupport(support);
    } catch (err) {
      setSendError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function answer(status) {
    setAnswering(true);
    try {
      await answerDmRequest(threadId, status);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnswering(false);
    }
  }

  const canSend = thread?.status === "accepted";
  const story = thread?.source?.story;
  const incomingRequest = thread?.status === "requested" && !thread.i_requested;

  return (
    <section className="glass flex h-full min-h-[60vh] flex-col overflow-hidden rounded-[28px] p-0">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3 md:px-6">
        {onBack && (
          <button onClick={onBack} className="btn-glass shrink-0 rounded-full lg:hidden" aria-label="Back to conversations">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </button>
        )}
        {thread && <Avatar name={thread.other_name} size="header" />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold text-fg">{thread?.other_name ?? "Conversation"}</p>
          {story?.place?.name && (
            <p className="flex items-center gap-1 truncate text-[13px] text-fg-2">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-lamp" strokeWidth={1.75} /> Met at {story.place.name}
            </p>
          )}
        </div>
        {thread && (
          <ItemMenu
            itemType="dm_message"
            // Reports the latest message from them; with none yet, the thread itself.
            itemId={[...messages].reverse().find((m) => m.sender_id !== user.id)?.id ?? thread.id}
            authorId={thread.other_id}
            authorName={thread.other_name}
            onBlocked={() => {
              onChanged?.();
              onBack?.();
            }}
          />
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5 md:px-6">
        {error && <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

        {story && (
          <div
            className="rounded-2xl border border-lamp/25 p-4"
            style={{ background: "linear-gradient(160deg, rgba(252,211,77,0.12), rgba(255,248,235,0.03))" }}
          >
            <p className="label-caps text-lamp">The story this started from</p>
            <p className="mt-2 font-display text-lg leading-snug text-fg">{story.text}</p>
            {thread.source?.text && (
              <p className="mt-2 border-l-2 border-lamp/40 pl-3 text-[13px] text-fg-2">
                {thread.i_requested ? `${thread.other_name} commented: ` : "You commented: "}
                {thread.source.text}
              </p>
            )}
            <Link to={`/story/${story.id}`} className="mt-2 inline-flex min-h-[44px] items-center text-[13px] font-medium text-lamp hover:underline">
              Open the story
            </Link>
          </div>
        )}

        {thread?.opening_message && <Bubble mine={thread.i_requested} text={thread.opening_message} time={thread.created_at} />}
        {messages.map((m) => (
          <Bubble key={m.id} mine={m.sender_id === user.id} text={m.text} time={m.created_at}>
            {m.sender_id === user.id && m.read_at && <span>· Seen</span>}
          </Bubble>
        ))}

        {thread?.status === "requested" && thread.i_requested && (
          <p className="mx-auto w-fit rounded-full border border-lamp/25 bg-lamp/10 px-4 py-2 text-[13px] font-medium text-lamp">
            Waiting for {thread.other_name} to accept
          </p>
        )}
        {incomingRequest && (
          <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-line bg-glass p-4 text-center">
            <p className="text-[15px] text-fg">{thread.other_name} would like to talk.</p>
            <div className="flex w-full gap-2">
              <button disabled={answering} onClick={() => answer("accepted")} className="btn-primary min-h-[48px] flex-1">
                Accept
              </button>
              <button disabled={answering} onClick={() => answer("declined")} className="btn-glass flex-1 rounded-2xl text-[15px]">
                Decline
              </button>
            </div>
          </div>
        )}
        {thread?.status === "declined" && (
          <p className="mx-auto w-fit rounded-full bg-glass px-4 py-2 text-[13px] text-fg-3">This request was declined.</p>
        )}
        {showSupport && <SupportCard onDismiss={() => setShowSupport(false)} />}
        <div ref={bottom} />
      </div>

      {canSend && (
        <form onSubmit={send} className="border-t border-line px-3 py-3 md:px-5">
          {sendError && <p className="pb-2 text-[13px] text-red-300">{sendError}</p>}
          <div className="flex items-center gap-2">
            <label htmlFor="dm-text" className="sr-only">Message</label>
            <input
              id="dm-text"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message ${thread.other_name}`}
              className="min-h-[48px] flex-1 rounded-full border border-line bg-glass px-5 text-[15px] text-fg placeholder:text-fg-3 focus:border-lamp/50 focus:outline-none"
            />
            <button type="submit" disabled={sending || !text.trim()} className="btn-lamp flex h-12 w-12 shrink-0 items-center justify-center rounded-full" aria-label="Send">
              <Send className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
