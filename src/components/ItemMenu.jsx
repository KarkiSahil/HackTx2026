import { useState } from "react";
import { MoreHorizontal, Flag, Ban } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { blockUser, reportItem } from "../lib/api";

const REASONS = ["Hurtful or harassing", "Spam", "Shares private info", "Something else"];

// Report an item, or block its author (hidden both ways, no DMs).
export default function ItemMenu({ itemType, itemId, authorId, authorName, onBlocked }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [error, setError] = useState("");

  if (!authorId || authorId === user.id) return null;

  function close() {
    setOpen(false);
    setMode(null);
    setError("");
  }

  async function run(action, message) {
    setBusy(true);
    setError("");
    try {
      await action();
      setDone(message);
      setMode(null);
      setOpen(false);
    } catch (err) {
      setError(err.message ?? "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="text-xs text-fg-3">{done}</span>;

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="rounded-lg p-1 text-fg-3 hover:text-fg-2"
        aria-label="More options"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-64 rounded-xl border border-line bg-glass p-2 shadow-lg">
          {!mode && (
            <>
              <button onClick={() => setMode("report")} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-fg-2 hover:bg-glass-raised">
                <Flag className="h-4 w-4" /> Report
              </button>
              <button onClick={() => setMode("block")} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-red-300 hover:bg-red-500/10">
                <Ban className="h-4 w-4" /> Block {authorName ?? "this person"}
              </button>
            </>
          )}
          {mode === "report" && (
            <div className="space-y-2 p-1">
              <p className="text-sm font-semibold text-fg">What's wrong?</p>
              {REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-fg-2">
                  <input type="radio" name={`reason-${itemId}`} checked={reason === r} onChange={() => setReason(r)} />
                  {r}
                </label>
              ))}
              <button
                disabled={busy}
                onClick={() => run(() => reportItem({ item_type: itemType, item_id: itemId, reason }, user.id), "Reported. Thank you.")}
                className="w-full rounded-lg btn-lamp py-2 text-sm font-semibold disabled:opacity-50"
              >
                Send report
              </button>
            </div>
          )}
          {mode === "block" && (
            <div className="space-y-2 p-1">
              <p className="text-sm text-fg-2">
                You won't see each other's stories, comments or letters, and they can't message you. You can unblock from Profile.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await blockUser(authorId, user.id);
                    onBlocked?.();
                  }, "Blocked.")
                }
                className="w-full rounded-lg bg-red-500 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Block
              </button>
            </div>
          )}
          {error && <p className="px-1 pt-1 text-xs text-red-300">{error}</p>}
        </div>
      )}
    </div>
  );
}
