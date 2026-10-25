import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, Send } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getNote, getReplies, createReply } from "../lib/api";
import { isWithinRadius, distanceMeters } from "../lib/geo";
import { formatTimeAgo } from "../lib/format";
import Avatar from "../components/Avatar";
import LocationStatus from "../components/LocationStatus";

const MAX_CHARS = 500;

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [userLocation, setUserLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => setLocLoading(false),
      { timeout: 8000 },
    );
  }, []);

  const load = useCallback(async () => {
    try {
      const [n, r] = await Promise.all([getNote(id), getReplies(id)]);
      setNote(n);
      setReplies(r);
    } catch {
      navigate(-1);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const place = note?.place;
  const dist = place && userLocation
    ? distanceMeters(userLocation, { lat: place.lat, lng: place.lng })
    : null;
  const atPlace = place ? isWithinRadius(userLocation, place) : false;

  async function handleReply(e) {
    e.preventDefault();
    if (!atPlace) { setReplyError("Go to the place to send a reply."); return; }
    if (!replyText.trim()) return;
    setSendingReply(true);
    setReplyError("");
    try {
      const r = await createReply({ note_id: id, content: replyText.trim() }, user.id);
      setReplies((prev) => [
        ...prev,
        { ...r, author_name: "You" },
      ]);
      setReplyText("");
    } catch (err) {
      setReplyError(err.message ?? "Could not send reply.");
    } finally {
      setSendingReply(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F0E8]">
      <header
        className="sticky top-0 z-10 border-b border-amber-100 bg-white px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="mx-auto flex max-w-md items-center gap-3">
          <button onClick={() => navigate(-1)} className="rounded-lg p-1.5 text-gray-400">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="truncate text-xs text-gray-400">{note?.place?.name}</p>
            <h1 className="text-sm font-bold text-gray-900">Note</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-8 pt-4 space-y-4">
        {/* Original note */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {note?.content}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Avatar name={note?.author_name ?? ""} size="sm" />
            <div>
              <p className="text-xs font-medium text-gray-700">{note?.author_name}</p>
              <p className="text-xs text-gray-400">{formatTimeAgo(note?.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Location status */}
        <LocationStatus isAtPlace={atPlace} distanceMeters={dist} loading={locLoading} />

        {/* Replies */}
        {replies.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">
              Replies
            </p>
            {replies.map((r) => (
              <div key={r.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
                  {r.content}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Avatar name={r.author_name ?? ""} size="sm" />
                  <div>
                    <p className="text-xs font-medium text-gray-700">{r.author_name}</p>
                    <p className="text-xs text-gray-400">{formatTimeAgo(r.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Reply form */}
        {!locLoading && !atPlace && (
          <div className="rounded-xl bg-amber-50 p-4 flex gap-3 items-start">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              You can read this note from anywhere, but to reply you need to be at{" "}
              <span className="font-semibold">{note?.place?.name}</span>.
            </p>
          </div>
        )}

        {atPlace && (
          <form onSubmit={handleReply} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Write a reply
            </label>
            <div className="flex gap-2">
              <textarea
                rows={3}
                maxLength={MAX_CHARS}
                value={replyText}
                onChange={(e) => { setReplyText(e.target.value); if (replyError) setReplyError(""); }}
                placeholder="Reply from this spot…"
                className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="submit"
                disabled={sendingReply || !replyText.trim()}
                className="self-end rounded-xl bg-primary p-3 text-white disabled:opacity-50"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
            {replyError && (
              <p className="text-xs text-red-500">{replyError}</p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
