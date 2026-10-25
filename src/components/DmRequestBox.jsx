import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { requestDm, suggestDmOpener } from "../lib/api";
import SupportCard from "./SupportCard";

// The story's author invites a commenter to chat. A kind opener is suggested;
// the author edits it before sending, and the commenter must accept.
export default function DmRequestBox({ comment, onClose }) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let cancelled = false;
    suggestDmOpener(comment.id)
      .then((text) => !cancelled && setMessage(text))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [comment.id]);

  async function send() {
    setSending(true);
    setError("");
    try {
      setResult(await requestDm({ comment_id: comment.id, opening_message: message.trim() }));
    } catch (err) {
      if (err.code === "thread_exists") setResult({ existing: err.details.thread_id });
      else setError(err.message);
    } finally {
      setSending(false);
    }
  }

  if (result?.existing) {
    return (
      <p className="mt-2 text-xs text-fg-2">
        You already have a conversation with {comment.author_name}.{" "}
        <Link to={`/messages/${result.existing}`} className="font-semibold text-lamp underline">Open it</Link>
      </p>
    );
  }
  if (result) {
    return (
      <div className="mt-2 space-y-2">
        <p className="text-xs text-here-fg">Request sent. {comment.author_name} will see it in Messages.</p>
        {result.support && <SupportCard />}
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-lamp/10 p-3">
      <label htmlFor={`dm-${comment.id}`} className="block text-xs font-medium text-lamp">
        Message {comment.author_name}
      </label>
      <textarea
        id={`dm-${comment.id}`}
        rows={3}
        maxLength={500}
        value={message}
        disabled={loading}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={loading ? "Writing a kind first message…" : "Say hello"}
        className="w-full resize-none rounded-lg border border-lamp/20 bg-glass px-3 py-2 text-sm outline-none focus:border-lamp"
      />
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={send}
          disabled={sending || loading || !message.trim()}
          className="rounded-lg btn-lamp px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send request"}
        </button>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-fg-2">Cancel</button>
      </div>
    </div>
  );
}
