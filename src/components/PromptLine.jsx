import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { randomPrompt } from "../lib/prompts";

// A writing prompt strip: Fraunces italic with an "Another prompt" button.
export default function PromptLine({ prompts, className = "" }) {
  const [prompt, setPrompt] = useState(() => randomPrompt(prompts));
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <p className="font-display text-lg italic leading-snug text-lamp">{prompt}</p>
      <button
        type="button"
        onClick={() => setPrompt((current) => randomPrompt(prompts, current))}
        className="flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-2 text-[13px] font-medium text-fg-2 hover:text-fg"
      >
        <RefreshCw className="h-4 w-4" strokeWidth={1.75} /> Another prompt
      </button>
    </div>
  );
}
