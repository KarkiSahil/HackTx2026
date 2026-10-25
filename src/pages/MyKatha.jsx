import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookHeart, HeartHandshake, Lock, Pause, Play } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { getMyFeltCounts, getMyKatha, myVoiceUrl } from "../lib/api";
import { useLiveLocation } from "../lib/useLiveLocation";
import { timeAgo } from "../lib/stamp";
import { usePostcard } from "../lib/usePostcard";
import AppShell from "../components/AppShell";
import ContextStamp from "../components/ContextStamp";
import EmptyState from "../components/EmptyState";
import Sheet from "../components/Sheet";
import { StoryCardSkeleton } from "../components/Skeleton";
import StoryPanel from "../components/StoryPanel";
import Watercolor from "../components/Watercolor";

const TABS = [
  { id: "all", label: "All" },
  { id: "stories", label: "Stories" },
  { id: "voiceNotes", label: "Voice notes" },
  { id: "letters", label: "Chain letters" },
  { id: "comments", label: "Comments" },
];

const WAVE_BARS = 40;

// Stable bar heights per note so its waveform keeps its shape.
function waveform(id) {
  let seed = [...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return Array.from({ length: WAVE_BARS }, () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return 0.25 + ((seed >>> 16) % 1000) / 1333;
  });
}

function CardFooter({ place, createdAt, feltCount }) {
  const navigate = useNavigate();
  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
      <span className="text-[13px] text-fg-3">
        <span className="text-fg-2">{place?.name ?? "A place"}</span> · {timeAgo(createdAt)}
      </span>
      <div className="flex items-center gap-3">
        {feltCount > 0 && (
          <span className="flex items-center gap-1 text-[13px] text-fg-2" title="Only you can see this">
            <HeartHandshake className="h-4 w-4 text-lamp" strokeWidth={1.75} /> {feltCount}
          </span>
        )}
        {place && (
          <button
            onClick={() => navigate(`/?place=${place.id}`)}
            className="flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-lamp hover:underline"
          >
            Show on map <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}

function StoryTile({ story, feltCount, newest, onOpen }) {
  const image = story.photo_url ?? story.postcard_url;
  return (
    <article
      className={`glass relative flex flex-col gap-3 overflow-hidden p-6 ${newest ? "border-lamp/30" : ""}`}
      style={newest ? { background: "linear-gradient(160deg, rgba(252,211,77,0.14), rgba(255,248,235,0.04) 55%)" } : undefined}
    >
      <span aria-hidden="true" className="pointer-events-none absolute right-5 top-1 font-display text-[120px] leading-none text-fg opacity-[0.06]">
        “
      </span>
      {newest && <p className="label-caps text-lamp">Newest</p>}
      {image && <img src={image} alt="" className="aspect-[16/9] w-full rounded-2xl object-cover" loading="lazy" />}
      <button onClick={onOpen} className="text-left">
        <p className="font-display text-2xl leading-snug text-fg">{story.text}</p>
      </button>
      <ContextStamp item={story} />
      <CardFooter place={story.place} createdAt={story.created_at} feltCount={feltCount} />
    </article>
  );
}

function VoiceTile({ note, feltCount }) {
  const postcard = usePostcard({ itemType: "voice_note", itemId: note.id, createdAt: note.created_at, initialUrl: note.postcard_url, watch: true });
  const audio = useRef(null);
  const [src, setSrc] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const bars = useMemo(() => waveform(note.id), [note.id]);

  async function toggle() {
    setError("");
    if (!src) {
      try {
        setSrc(await myVoiceUrl(note.audio_path));
      } catch {
        setError("Couldn't load this recording.");
      }
      return;
    }
    if (audio.current.paused) audio.current.play();
    else audio.current.pause();
  }

  return (
    <article className="glass flex flex-col gap-4 p-6">
      <Watercolor url={postcard.url} painting={postcard.painting} wide />
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="btn-lamp flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
          aria-label={playing ? "Pause voice note" : "Play voice note"}
        >
          {playing ? <Pause className="h-6 w-6" strokeWidth={2} /> : <Play className="ml-0.5 h-6 w-6" strokeWidth={2} />}
        </button>
        <div className="flex h-12 min-w-0 flex-1 items-center gap-[3px]" aria-hidden="true">
          {bars.map((h, i) => (
            <span
              key={i}
              className={`w-full rounded-full ${i / WAVE_BARS < progress ? "bg-lamp" : "bg-fg-3/35"}`}
              style={{ height: `${Math.round(h * 100)}%` }}
            />
          ))}
        </div>
        <span className="shrink-0 font-display text-lg text-fg-2">{Math.round(note.duration_s)}s</span>
      </div>
      {src && (
        <audio
          ref={audio}
          src={src}
          autoPlay
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
          }}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || note.duration_s))}
          className="hidden"
        />
      )}
      {error && <p className="text-[13px] text-red-300">{error}</p>}
      {note.transcript && <p className="font-display text-lg italic leading-snug text-fg-2">“{note.transcript}”</p>}
      <ContextStamp item={note} />
      <CardFooter place={note.place} createdAt={note.created_at} feltCount={feltCount} />
    </article>
  );
}

function LetterTile({ letter, feltCount }) {
  const postcard = usePostcard({ itemType: "chain_letter", itemId: letter.id, createdAt: letter.created_at, initialUrl: letter.postcard_url, watch: true });
  return (
    <article className="glass flex flex-col gap-3 p-6">
      <p className="label-caps flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5" strokeWidth={1.75} /> Chain letter · only you see this copy
      </p>
      <Watercolor url={postcard.url} painting={postcard.painting} wide />
      <p className="whitespace-pre-wrap font-display text-xl leading-relaxed text-fg">{letter.text}</p>
      <ContextStamp item={letter} />
      <CardFooter place={letter.place} createdAt={letter.created_at} feltCount={feltCount} />
    </article>
  );
}

function CommentTile({ comment, onOpen }) {
  return (
    <article className="flex flex-col gap-3 rounded-3xl border border-dashed border-line p-6">
      <p className="text-[13px] text-fg-3">
        You replied to a story at <span className="text-fg-2">{comment.place?.name ?? "a place"}</span> · {timeAgo(comment.created_at)}
      </p>
      {comment.story?.text && <p className="border-l-2 border-lamp/40 pl-3 text-[13px] italic text-fg-3 line-clamp-2">{comment.story.text}</p>}
      <p className="text-[15px] text-fg">{comment.text}</p>
      {comment.story && (
        <button onClick={onOpen} className="mt-auto flex min-h-[44px] items-center gap-1 self-start text-[13px] font-medium text-lamp hover:underline">
          Open thread <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </article>
  );
}

export default function MyKatha() {
  const { user } = useAuth();
  const { location } = useLiveLocation();
  const [tab, setTab] = useState("all");
  const [data, setData] = useState(null);
  const [felt, setFelt] = useState(new Map());
  const [error, setError] = useState("");
  const [openStory, setOpenStory] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [katha, counts] = await Promise.all([getMyKatha(user.id), getMyFeltCounts()]);
      setData(katha);
      setFelt(counts);
    } catch {
      setError("Could not load your Katha.");
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const all = useMemo(() => {
    if (!data) return [];
    return [
      ...data.stories.map((item) => ({ kind: "story", item })),
      ...data.voiceNotes.map((item) => ({ kind: "voice", item })),
      ...data.letters.map((item) => ({ kind: "letter", item })),
      ...data.comments.map((item) => ({ kind: "comment", item })),
    ].sort((a, b) => new Date(b.item.created_at) - new Date(a.item.created_at));
  }, [data]);

  const counts = data && {
    all: all.length,
    stories: data.stories.length,
    voiceNotes: data.voiceNotes.length,
    letters: data.letters.length,
    comments: data.comments.length,
  };
  const memories = data ? data.stories.length + data.voiceNotes.length + data.letters.length : null;
  const placeCount = data
    ? new Set([...data.stories, ...data.voiceNotes, ...data.letters].map((i) => i.place?.id).filter(Boolean)).size
    : null;
  const newestId = all.find((e) => e.kind !== "comment")?.item.id;

  const kindFor = { stories: "story", voiceNotes: "voice", letters: "letter", comments: "comment" };
  const shown = tab === "all" ? all : all.filter((e) => e.kind === kindFor[tab]);

  function renderEntry({ kind, item }) {
    if (kind === "story") {
      return (
        <StoryTile key={`s-${item.id}`} story={item} feltCount={felt.get(`story:${item.id}`)} newest={item.id === newestId} onOpen={() => setOpenStory(item)} />
      );
    }
    if (kind === "voice") return <VoiceTile key={`v-${item.id}`} note={item} feltCount={felt.get(`voice_note:${item.id}`)} />;
    if (kind === "letter") return <LetterTile key={`l-${item.id}`} letter={item} feltCount={felt.get(`chain_letter:${item.id}`)} />;
    return <CommentTile key={`c-${item.id}`} comment={item} onOpen={() => setOpenStory(item.story)} />;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1280px] space-y-8 px-4 pt-6 md:px-8 md:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="label-caps text-lamp">Your archive</p>
            <h1 className="title-display mt-2 text-fg">
              My <em>Katha</em>
            </h1>
            <p className="mt-3 text-[15px] text-fg-2">Everything you've left, all-time. Your own things open from anywhere.</p>
          </div>
          <div className="flex gap-3">
            {[
              [memories, "Memories left"],
              [placeCount, "Places"],
            ].map(([value, label]) => (
              <div key={label} className="glass min-w-[132px] rounded-2xl px-5 py-4">
                <p className="font-display text-4xl font-semibold text-fg">{value ?? "–"}</p>
                <p className="label-caps mt-1">{label}</p>
              </div>
            ))}
          </div>
        </header>

        <div className="glass flex gap-1 overflow-x-auto rounded-2xl p-1.5" role="tablist" aria-label="Filter your archive">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors ${
                tab === t.id ? "bg-fg text-on-lamp" : "text-fg-2 hover:text-fg"
              }`}
            >
              {t.label}
              {counts && <span className={`ml-1.5 ${tab === t.id ? "text-on-lamp/60" : "text-fg-3"}`}>{counts[t.id]}</span>}
            </button>
          ))}
        </div>

        {error && (
          <div className="glass flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-fg-2">{error}</p>
            <button onClick={load} className="btn-glass rounded-xl px-5 text-sm">Retry</button>
          </div>
        )}
        {!data && !error && (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]">
            {[1, 2, 3].map((i) => <StoryCardSkeleton key={i} />)}
          </div>
        )}
        {data && shown.length === 0 && (
          <EmptyState icon={BookHeart} message="Nothing here yet. Go somewhere that matters to you and leave something." />
        )}

        <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr))]">
          {shown.map(renderEntry)}
        </div>
      </div>

      <Sheet open={Boolean(openStory)} onClose={() => setOpenStory(null)} title="Story">
        {openStory && <StoryPanel storyId={openStory.id} location={location} onBlocked={() => setOpenStory(null)} />}
      </Sheet>
    </AppShell>
  );
}
