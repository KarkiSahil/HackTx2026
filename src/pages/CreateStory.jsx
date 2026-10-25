import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { getPlace, createNote } from "../lib/api";
import { isWithinRadius } from "../lib/geo";
import LocationStatus from "../components/LocationStatus";

const MAX_CHARS = 500;

export default function CreateNote() {
  const { id: placeId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [place, setPlace] = useState(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  useEffect(() => {
    getPlace(placeId).then(setPlace).catch(() => navigate(-1));
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocLoading(false);
      },
      () => setLocLoading(false),
      { timeout: 8000 },
    );
  }, [placeId, navigate]);

  const atPlace = place ? isWithinRadius(userLocation, place) : false;
  const canSubmit = atPlace && content.trim().length > 0 && !saving;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!atPlace) {
      setError("You must be at this place to leave a note.");
      return;
    }
    if (!content.trim()) {
      setError("Write something first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const note = await createNote({ place_id: placeId, content: content.trim() }, user.id);
      navigate(`/note/${note.id}`, { replace: true });
    } catch (err) {
      setError(err.message ?? "Could not save note. Try again.");
      setSaving(false);
    }
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
          <h1 className="flex-1 text-base font-bold text-gray-900">
            Leave a note at {place?.name ?? "…"}
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-4 pb-8">
        <div className="mb-4">
          <LocationStatus isAtPlace={atPlace} distanceMeters={null} loading={locLoading} />
        </div>

        {!locLoading && !atPlace && (
          <div className="mb-4 rounded-xl bg-amber-50 p-4 flex gap-3 items-start">
            <Lock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              You can only leave a note when you're physically at this spot. Come here and try again.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Your note
            </label>
            <textarea
              rows={6}
              maxLength={MAX_CHARS}
              value={content}
              onChange={(e) => { setContent(e.target.value); if (error) setError(""); }}
              disabled={!atPlace}
              placeholder={atPlace ? "Write something for whoever finds this spot…" : "Visit this place to write a note"}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="mt-1 text-right text-xs text-gray-400">
              {content.length}/{MAX_CHARS}
            </p>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl bg-primary py-3 font-semibold text-white disabled:opacity-50 active:opacity-80"
          >
            {saving ? "Leaving note…" : "Leave note here"}
          </button>
        </form>
      </main>
    </div>
  );
}
