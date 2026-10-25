import { useRef } from "react";
import { useAuth } from "../context/useAuth";
import { recordView } from "../lib/api";
import ContextStamp from "./ContextStamp";
import FeltButton from "./FeltButton";
import ItemMenu from "./ItemMenu";
import { usePostcard } from "../lib/usePostcard";
import Watercolor from "./Watercolor";

// An unlocked voice note: its watercolor, audio from a short-lived link, and captions.
export default function VoiceNoteCard({ note, atPlace, location, onBlocked }) {
  const { user } = useAuth();
  const viewed = useRef(Boolean(note.opened_by_me));
  const postcard = usePostcard({
    itemType: "voice_note",
    itemId: note.id,
    createdAt: note.created_at,
    initialUrl: note.postcard_url,
    watch: note.author_id === user.id,
  });

  function onPlay() {
    if (viewed.current) return;
    viewed.current = true;
    recordView("voice_note", note.id);
  }

  return (
    <div className="space-y-2 p-4 card">
      <Watercolor url={postcard.url} painting={postcard.painting} wide />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-2">
          {note.author_id === user.id ? "You" : note.author_name} · {Math.round(note.duration_s)} s
        </span>
        <ItemMenu itemType="voice_note" itemId={note.id} authorId={note.author_id} authorName={note.author_name} onBlocked={onBlocked} />
      </div>
      {note.audio_url ? (
        <audio controls preload="none" src={note.audio_url} onPlay={onPlay} className="w-full" />
      ) : (
        <p className="text-xs text-fg-3">Audio unavailable. Refresh to try again.</p>
      )}
      {note.transcript && (
        <p className="rounded-lg bg-glass px-3 py-2 text-sm italic text-fg-2">
          <span className="sr-only">Captions: </span>“{note.transcript}”
        </p>
      )}
      <ContextStamp item={note} />
      <FeltButton
        itemType="voice_note"
        itemId={note.id}
        authorId={note.author_id}
        feltByMe={note.felt_by_me}
        feltCount={note.felt_count}
        atPlace={atPlace}
        location={location}
      />
    </div>
  );
}
