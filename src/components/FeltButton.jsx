import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { feltThisToo } from "../lib/api";

// No likes: one quiet "I felt this too" per person, only at the place.
// Authors see how many people felt it; nobody else does.
export default function FeltButton({ itemType, itemId, authorId, feltByMe, feltCount, atPlace, location }) {
  const { user } = useAuth();
  const [felt, setFelt] = useState(Boolean(feltByMe));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (authorId === user.id) {
    return feltCount ? (
      <span className="flex items-center gap-1 text-xs text-fg-2">
        <HeartHandshake className="h-3.5 w-3.5 text-lamp" />
        {feltCount} {feltCount === 1 ? "person" : "people"} felt this too
      </span>
    ) : null;
  }

  async function press() {
    setBusy(true);
    setError("");
    try {
      await feltThisToo(itemType, itemId, location);
      setFelt(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start">
      <button
        onClick={press}
        disabled={felt || busy || !atPlace}
        title={!atPlace && !felt ? "Only at the place" : undefined}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
          felt ? "bg-lamp/10 text-lamp" : "bg-glass-raised text-fg-2 disabled:opacity-60"
        }`}
      >
        <HeartHandshake className="h-3.5 w-3.5" />
        {felt ? "You felt this too" : atPlace ? "I felt this too" : "I felt this too · only here"}
      </button>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
