import { useNavigate } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { formatTimeAgo } from "../lib/format";
import Avatar from "./Avatar";

export default function NoteCard({ note }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(`/note/${note.id}`)}
      className="w-full rounded-2xl bg-white p-4 shadow-sm text-left active:scale-[0.98] transition-transform"
    >
      <p className="text-sm text-gray-800 leading-relaxed line-clamp-3">
        {note.content}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={note.author_name} size="sm" />
          <div>
            <p className="text-xs font-medium text-gray-700">{note.author_name}</p>
            <p className="text-xs text-gray-400">{formatTimeAgo(note.created_at)}</p>
          </div>
        </div>
        {note.reply_count > 0 && (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <MessageCircle className="h-3.5 w-3.5" />
            {note.reply_count}
          </span>
        )}
      </div>
    </button>
  );
}
