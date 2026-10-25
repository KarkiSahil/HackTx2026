import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Lock, MapPin, Mic, PenLine, RefreshCw } from "lucide-react";
import { getBoard, unlockPlace } from "../lib/api";
import { distanceMeters, formatDistance, isPreciseEnough } from "../lib/geo";
import { FEELINGS } from "../lib/stamp";
import { useLiveLocation } from "../lib/useLiveLocation";
import AppShell, { PageBody } from "../components/AppShell";
import ChainLetterSection from "../components/ChainLetterSection";
import ContextStamp from "../components/ContextStamp";
import EmptyState from "../components/EmptyState";
import { FeelingChip } from "../components/Feelings";
import Sheet from "../components/Sheet";
import { StoryCardSkeleton } from "../components/Skeleton";
import StoryCard from "../components/StoryCard";
import StoryPanel from "../components/StoryPanel";
import VoiceNoteCard from "../components/VoiceNoteCard";

const VIEWS = [
  { id: "ranked", label: "For you" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest first" },
  { id: "feeling", label: "By feeling" },
];

export default function PlaceBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { location, loading: locating } = useLiveLocation();
  const [sort, setSort] = useState("ranked");
  const [feeling, setFeeling] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unlocked, setUnlocked] = useState(null);
  const [unlockError, setUnlockError] = useState("");
  const [openStory, setOpenStory] = useState(null);
  const unlocking = useRef(false);

  const loadBoard = useCallback(async () => {
    setError("");
    try {
      setBoard(await getBoard(id, { sort, feeling: sort === "feeling" ? feeling ?? undefined : undefined }));
    } catch (err) {
      setError(err.code === "place_not_found" ? err.message : "Could not load this place.");
    } finally {
      setLoading(false);
    }
  }, [id, sort, feeling]);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  const place = board?.place;
  const distance = place && location ? distanceMeters(location, place) : null;
  const atPlace = Boolean(place) && isPreciseEnough(location) && distance <= place.radius_m;

  const unlock = useCallback(async () => {
    if (!location || unlocking.current) return;
    unlocking.current = true;
    setUnlockError("");
    try {
      setUnlocked(await unlockPlace(id, location));
    } catch (err) {
      setUnlockError(err.message);
    } finally {
      unlocking.current = false;
    }
  }, [id, location]);

  // Unlock once on arrival (a failure waits for a manual refresh); lock again on leaving.
  useEffect(() => {
    if (atPlace && !unlocked && !unlockError) unlock();
    if (!atPlace && unlocked) setUnlocked(null);
  }, [atPlace, unlocked, unlockError, unlock]);

  function refreshAll() {
    loadBoard();
    setUnlockError("");
    setUnlocked(null);
  }

  const locked = board?.locked;

  return (
    <AppShell back title={place?.name ?? "Place"} subtitle={place?.description} actions={
      <button onClick={refreshAll} className="rounded-lg p-1.5 text-fg-3" aria-label="Refresh">
        <RefreshCw className="h-4 w-4" />
      </button>
    }>
      <PageBody size="lg" className="space-y-5">
        {loading && <div className="space-y-3">{[1, 2].map((i) => <StoryCardSkeleton key={i} />)}</div>}

        {!loading && error && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="h-10 w-10 text-red-300" />
            <p className="text-fg-2">{error}</p>
            <button onClick={loadBoard} className="rounded-xl btn-lamp px-5 py-2.5 text-sm font-semibold">Retry</button>
          </div>
        )}

        {!loading && board && (
          <>
            {atPlace ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-here-bg p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-here-fg">
                  <MapPin className="h-4 w-4" /> You're here
                </p>
                <button
                  onClick={() => navigate(`/compose?place=${place.id}`)}
                  className="btn-primary min-h-[48px] gap-1.5 px-5 text-sm"
                >
                  <PenLine className="h-4 w-4" /> Leave something
                </button>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded-xl bg-lamp/10 px-3 py-2 text-xs text-lamp">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {locating
                  ? "Finding your location…"
                  : distance != null
                    ? `${formatDistance(distance)} away. Voice notes and the chain letter open when you're within ${place.radius_m} m.`
                    : "Voice notes and the chain letter open when you're here."}
              </p>
            )}
            {unlockError && <p className="text-xs text-red-300">{unlockError}</p>}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] md:items-start">
            <div className="space-y-4">
            {/* Voice notes */}
            {unlocked ? (
              unlocked.voice_notes.length > 0 && (
                <section className="space-y-3">
                  <h2 className="flex items-center gap-1.5 eyebrow">
                    <Mic className="h-3.5 w-3.5" /> Voice notes
                  </h2>
                  {unlocked.voice_notes.map((note) => (
                    <VoiceNoteCard key={note.id} note={note} atPlace={atPlace} location={location} onBlocked={refreshAll} />
                  ))}
                </section>
              )
            ) : (
              locked.voice_notes.length > 0 && (
                <section className="space-y-2 p-4 card">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <Lock className="h-4 w-4 text-lamp" /> {locked.voice_notes.length}{" "}
                    {locked.voice_notes.length === 1 ? "voice note" : "voice notes"}, listen when you're here
                  </p>
                  <ul className="space-y-1.5">
                    {locked.voice_notes.slice(0, 5).map((v) => (
                      <li key={v.id}><ContextStamp item={v} /></li>
                    ))}
                  </ul>
                </section>
              )
            )}

            {/* Chain letter */}
            {unlocked ? (
              <ChainLetterSection placeId={place.id} chain={unlocked.chain} location={location} onChanged={() => setUnlocked(null)} />
            ) : (
              locked.chain && (
                <section className="space-y-2 rounded-2xl border border-lamp/20 bg-lamp/5 p-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <Lock className="h-4 w-4 text-lamp" /> A chain letter is waiting
                  </p>
                  <ContextStamp item={locked.chain.latest} />
                </section>
              )
            )}
            {!unlocked && locked.voice_notes.length === 0 && !locked.chain && (
              <p className="rounded-2xl border border-dashed border-lamp/20 p-4 text-sm text-fg-2">
                No voice notes or chain letter here yet. Be the first when you visit.
              </p>
            )}
            </div>

            {/* Stories */}
            <section className="space-y-3">
              <h2 className="eyebrow">Stories</h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Order stories">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    role="tab"
                    aria-selected={sort === v.id}
                    onClick={() => setSort(v.id)}
                    className={`min-h-[40px] shrink-0 rounded-full px-4 text-[13px] font-semibold ${sort === v.id ? "bg-fg text-on-lamp" : "border border-line bg-glass text-fg-2 hover:text-fg"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              {sort === "feeling" && (
                <div className="flex flex-wrap gap-1.5">
                  {FEELINGS.map((f) => (
                    <FeelingChip key={f} feeling={f} active={feeling === f} onClick={() => setFeeling(feeling === f ? null : f)} />
                  ))}
                </div>
              )}

              {board.stories.length === 0 ? (
                <EmptyState
                  icon={PenLine}
                  message={feeling ? `No #${feeling} stories here yet.` : "No stories here yet."}
                  action={atPlace ? "Leave the first one" : undefined}
                  onAction={atPlace ? () => navigate(`/compose?place=${place.id}`) : undefined}
                />
              ) : (
                board.stories.map((story) => (
                  <StoryCard key={story.id} story={story} onOpen={(s) => setOpenStory(s)} />
                ))
              )}
            </section>
            </div>
          </>
        )}
      </PageBody>

      <Sheet open={Boolean(openStory)} onClose={() => setOpenStory(null)} title={place?.name ?? "Story"}>
        {openStory && (
          <StoryPanel
            storyId={openStory.id}
            location={location}
            onBlocked={() => {
              setOpenStory(null);
              refreshAll();
            }}
          />
        )}
      </Sheet>
    </AppShell>
  );
}
