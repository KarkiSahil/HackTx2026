import { Sparkles } from "lucide-react";

export default function Watercolor({ url, painting, caption = "AI illustration of this place", wide = false }) {
  const frame = wide ? "aspect-[16/9]" : "aspect-square";
  if (url) {
    return (
      <figure>
        <img src={url} alt="AI watercolor of this place" className={`w-full rounded-2xl object-cover ${frame}`} loading="lazy" />
        <figcaption className="mt-1 flex items-center gap-1 text-xs text-fg-3">
          <Sparkles className="h-3 w-3" /> {caption}
        </figcaption>
      </figure>
    );
  }
  if (!painting) return null;
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-100 via-amber-50 to-rose-100 ${frame}`}
      role="status"
    >
      <Sparkles className="h-6 w-6 animate-pulse text-lamp" />
      <p className="text-sm font-medium text-fg-2">Painting a watercolor of this place…</p>
      <p className="text-xs text-fg-2">AI illustration · about half a minute</p>
    </div>
  );
}
