import { useCallback, useEffect, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { useAuth } from "../context/useAuth";
import {
  createComment,
  createPostcard,
  getComments,
  getMyFeltCounts,
  getPostcards,
  getStory,
  hasFelt,
  recordView,
} from "../lib/api";
import { distanceMeters, isPreciseEnough } from "../lib/geo";
import { timeAgo } from "../lib/stamp";
import Avatar from "./Avatar";
import ContextStamp from "./ContextStamp";
import DmRequestBox from "./DmRequestBox";
import FeltButton from "./FeltButton";
import ItemMenu from "./ItemMenu";
import SupportCard from "./SupportCard";

const PAINT_WINDOW_MS = 3 * 60 * 1000;
const PAINT_POLL_MS = 4000;

export default function StoryPanel({ storyId, location, onBlocked }) {
  const { user } = useAuth();
  const [story, setStory] = useState(null);
  const [comments, setComments] = useState([]);
  const [postcards, setPostcards] = useState([]);
  const [felt, setFelt] = useState({ byMe: false, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [showSupport, setShowSupport] = useState(false);
  const [dmFor, setDmFor] = useState(null);
  const [postcardState, setPostcardState] = useState({ busy: false, error: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const s = await getStory(storyId);
      if (!s) {
        setError("This story isn't available.");
        return;
      }
      const mine = s.author_id === user.id;
      const [c, p, byMe, counts] = await Promise.all([
        getComments(storyId),
        getPostcards(storyId),
        mine ? false : hasFelt("story", storyId),
        mine ? getMyFeltCounts() : null,
      ]);
      setStory(s);
      setComments(c);
      setPostcards(p);
      setFelt({ byMe, count: counts?.get(`story:${storyId}`) ?? 0 });
      if (!mine) recordView("story", storyId);
    } catch {
      setError("This story could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [storyId, user.id]);

  useEffect(() => {
    load();
  }, [load]);

  // A new story's watercolor is painted in the background (~30 s); check until it arrives.
  const painting =
    Boolean(story) && postcards.length === 0 && Date.now() - new Date(story.created_at).getTime() < PAINT_WINDOW_MS;

  useEffect(() => {
    if (!painting) return undefined;
    const timer = setInterval(async () => {
      if (Date.now() - new Date(story.created_at).getTime() > PAINT_WINDOW_MS) {
        clearInterval(timer);
        setPostcards((prev) => [...prev]);
        return;
      }
      const latest = await getPostcards(storyId).catch(() => []);
      if (latest.length) setPostcards(latest);
    }, PAINT_POLL_MS);
    return () => clearInterval(timer);
  }, [painting, story, storyId]);

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSending(true);
    setCommentError("");
    try {
      const { comment, support } = await createComment({ story_id: storyId, text: commentText.trim() });
      setComments((prev) => [...prev, comment]);
      setCommentText("");
      setShowSupport(support);
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function makePostcard() {
    setPostcardState({ busy: true, error: "" });
    try {
      const postcard = await createPostcard("story", storyId);
      setPostcards((prev) => [postcard, ...prev]);
      setPostcardState({ busy: false, error: "" });
    } catch (err) {
      setPostcardState({ busy: false, error: err.message });
    }
  }

  if (loading) {
    return <div className="mx-auto mt-10 h-8 w-8 animate-spin rounded-full border-4 border-lamp border-t-transparent" />;
  }
  if (error) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-fg-2">{error}</p>
        <button onClick={load} className="rounded-xl btn-lamp px-4 py-2 text-sm font-semibold">Retry</button>
      </div>
    );
  }

  const isAuthor = story.author_id === user.id;
  const atPlace =
    isPreciseEnough(location) && story.place && distanceMeters(location, story.place) <= story.place.radius_m;

  return (
    <div className="space-y-5">
      <article className="space-y-3">
        {story.photo_url && (
          <figure>
            <img src={story.photo_url} alt="The view from here" className="w-full rounded-2xl object-cover" />
            <figcaption className="mt-1 text-xs text-fg-3">View from here</figcaption>
          </figure>
        )}
        <p className="whitespace-pre-wrap text-base leading-relaxed text-fg">{story.text}</p>
        <ContextStamp item={story} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar name={story.author_name} size="sm" />
            <span className="text-xs font-medium text-fg-2">{isAuthor ? "You" : story.author_name}</span>
          </div>
          <ItemMenu itemType="story" itemId={story.id} authorId={story.author_id} authorName={story.author_name} onBlocked={onBlocked} />
        </div>
        <FeltButton
          itemType="story"
          itemId={story.id}
          authorId={story.author_id}
          feltByMe={felt.byMe}
          feltCount={felt.count}
          atPlace={atPlace}
          location={location}
        />
      </article>

      {postcards.length > 0 ? (
        <section className="space-y-2">
          {postcards.map((p) => (
            <figure key={p.id}>
              <img src={p.url} alt="AI watercolor postcard of this place" className="w-full rounded-2xl" loading="lazy" />
              <figcaption className="mt-1 flex items-center gap-1 text-xs text-fg-3">
                <Sparkles className="h-3 w-3" />
                {story.photo_url ? "AI illustration · the real photo is the one above" : "AI illustration of this place"}
              </figcaption>
            </figure>
          ))}
        </section>
      ) : painting || postcardState.busy ? (
        <div
          className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-100 via-amber-50 to-rose-100"
          role="status"
        >
          <Sparkles className="h-6 w-6 animate-pulse text-lamp" />
          <p className="text-sm font-medium text-fg-2">Painting a watercolor of this place…</p>
          <p className="text-xs text-fg-2">AI illustration · appears here in about half a minute</p>
        </div>
      ) : (
        isAuthor && (
          <div className="space-y-1">
            <button
              onClick={makePostcard}
              className="flex items-center gap-1.5 rounded-xl border border-lamp/20 px-3 py-2 text-xs font-medium text-lamp"
            >
              <Sparkles className="h-3.5 w-3.5" /> Paint this place's watercolor (AI illustration)
            </button>
            {postcardState.error && <p className="text-xs text-red-300">{postcardState.error}</p>}
          </div>
        )
      )}

      <section className="space-y-3">
        <h3 className="eyebrow">
          Comments {comments.length > 0 && `· ${comments.length}`}
        </h3>
        {comments.map((c) => (
          <div key={c.id} className="p-3 card">
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm text-fg">{c.text}</p>
              <ItemMenu itemType="comment" itemId={c.id} authorId={c.author_id} authorName={c.author_name} onBlocked={load} />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-fg-3">
                {c.author_id === user.id ? "You" : c.author_name} · {timeAgo(c.created_at)}
              </span>
              {isAuthor && c.author_id !== user.id && dmFor !== c.id && (
                <button onClick={() => setDmFor(c.id)} className="text-xs font-medium text-lamp">Message</button>
              )}
            </div>
            {dmFor === c.id && <DmRequestBox comment={c} onClose={() => setDmFor(null)} />}
          </div>
        ))}

        {showSupport && <SupportCard onDismiss={() => setShowSupport(false)} />}

        <form onSubmit={submitComment} className="space-y-1">
          <label htmlFor={`comment-${storyId}`} className="sr-only">Add a comment</label>
          <div className="flex gap-2">
            <textarea
              id={`comment-${storyId}`}
              rows={2}
              maxLength={500}
              value={commentText}
              onChange={(e) => {
                setCommentText(e.target.value);
                if (commentError) setCommentError("");
              }}
              placeholder="Add a kind comment…"
              className="flex-1 resize-none rounded-xl border border-line bg-glass px-3 py-2 text-sm outline-none focus:border-lamp"
            />
            <button
              type="submit"
              disabled={sending || !commentText.trim()}
              className="self-end rounded-xl btn-lamp p-2.5 disabled:opacity-50"
              aria-label="Post comment"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          {commentError && <p className="text-xs text-red-300">{commentError}</p>}
        </form>
      </section>
    </div>
  );
}
