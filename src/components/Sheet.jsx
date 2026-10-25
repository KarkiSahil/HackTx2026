import { useEffect } from "react";
import { X } from "lucide-react";

// Detail views open here instead of navigating: a bottom sheet on phones,
// a side panel on wider screens.
export default function Sheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2000]" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 bg-black/30" onClick={onClose} aria-label="Close" tabIndex={-1} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl bg-[#15120F]/95 backdrop-blur-xl border border-line shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[28rem] md:rounded-none md:rounded-l-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-lamp/20 px-4 py-3">
          <h2 className="min-w-0 truncate text-sm font-bold text-fg">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-fg-3 hover:text-fg-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">{children}</div>
      </div>
    </div>
  );
}
