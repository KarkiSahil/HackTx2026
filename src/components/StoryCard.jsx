import { MessageCircle } from "lucide-react";
import Avatar from "./Avatar";
import ContextStamp from "./ContextStamp";

export default function StoryCard({ story, onOpen, showPlace = false }) {
  return (
    <button
      onClick={() => onOpen(story)}
      className={`card w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${
        story.opened_by_me ? "opacity-80" : ""
      }`}
    >
      {showPlace && story.place?.name && (
        <p className="mb-2 text-xs font-medium tracking-wide text-lamp/75">{story.place.name}</p>
      )}
      <div className="flex gap-3">
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg line-clamp-3">{story.text}</p>
        {(story.photo_url || story.postcard_url) && (
          <img src={story.photo_url ?? story.postcard_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
        )}
      </div>
      <div className="mt-2">
        <ContextStamp item={story} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={story.author_name} size="sm" />
          <p className="text-xs font-medium text-fg-2">{story.author_name}</p>
        </div>
        {story.comment_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-fg-3">
            <MessageCircle className="h-3.5 w-3.5" />
            {story.comment_count}
          </span>
        )}
      </div>
    </button>
  );
}
