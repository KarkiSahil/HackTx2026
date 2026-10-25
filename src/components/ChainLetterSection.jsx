import { useState } from "react";
import { Mail } from "lucide-react";
import { createChainLetter } from "../lib/api";
import { CHAIN_PROMPTS } from "../lib/prompts";
import ContextStamp from "./ContextStamp";
import { FeelingPicker } from "./Feelings";
import FeltButton from "./FeltButton";
import PromptLine from "./PromptLine";
import SupportCard from "./SupportCard";
import { usePostcard } from "../lib/usePostcard";
import Watercolor from "./Watercolor";

const MAX_CHARS = 1000;

function LatestLetter({ latest, location }) {
  const postcard = usePostcard({
    itemType: "chain_letter",
    itemId: latest.id,
    createdAt: latest.created_at,
    initialUrl: latest.postcard_url,
    watch: latest.is_mine,
  });
  return (
    <article className="space-y-2 rounded-xl bg-glass p-3 shadow-sm">
      <Watercolor url={postcard.url} painting={postcard.painting} wide />
      <p className="eyebrow">{latest.is_mine ? "Your letter is the one waiting here" : "The letter waiting here"}</p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{latest.text}</p>
      <ContextStamp item={latest} />
      {!latest.is_mine && (
        <FeltButton itemType="chain_letter" itemId={latest.id} feltByMe={latest.felt_by_me} atPlace location={location} />
      )}
    </article>
  );
}

// The place's single chain, unlocked: read the latest letter, then write the next.
export default function ChainLetterSection({ placeId, chain, location, onChanged }) {
  const latest = chain?.latest_letter ?? null;
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [theme, setTheme] = useState("");
  const [feeling, setFeeling] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(null);

  async function send(e) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const result = await createChainLetter({
        ...location,
        place_id: placeId,
        text: text.trim(),
        answers_letter_id: latest?.id ?? null,
        theme_prompt: latest ? undefined : theme.trim() || undefined,
        feeling,
      });
      setSent(result);
      setText("");
      setWriting(false);
      onChanged();
    } catch (err) {
      setError(err.message);
      // Someone else's letter is now the latest: show it, keep the draft.
      if (err.code === "chain_moved") onChanged();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-lamp/20 bg-lamp/5 p-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-lamp" />
        <h3 className="text-sm font-bold text-fg">Chain letter</h3>
      </div>

      {chain?.theme_prompt && <p className="text-sm italic text-lamp">“{chain.theme_prompt}”</p>}

      {latest?.hidden && (
        <p className="text-sm text-fg-2">The latest letter is from someone you've blocked, so it's hidden. You can still write the next one.</p>
      )}

      {latest && !latest.hidden && <LatestLetter key={latest.id} latest={latest} location={location} />}

      {sent && (
        <div className="space-y-2">
          <p className="text-sm text-here-fg">Your letter is now the one waiting here. Older letters stay with their writers in My Katha.</p>
          {sent.support && <SupportCard onDismiss={() => setSent({ ...sent, support: false })} />}
        </div>
      )}

      {latest?.is_mine ? (
        <p className="text-xs text-fg-2">When someone answers it, you'll get a notification.</p>
      ) : !writing ? (
        <button onClick={() => setWriting(true)} className="w-full rounded-xl btn-lamp py-2.5 text-sm font-semibold">
          {latest ? "Write the next letter" : "Start this place's chain"}
        </button>
      ) : (
        <form onSubmit={send} className="space-y-3">
          {!latest && (
            <div>
              <label htmlFor="chain-theme" className="mb-1 block text-xs font-medium text-fg-2">
                A question for every letter here <span className="font-normal text-fg-3">(optional)</span>
              </label>
              <input
                id="chain-theme"
                maxLength={200}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="w-full rounded-xl border border-line bg-glass px-3 py-2 text-sm outline-none focus:border-lamp"
              />
            </div>
          )}
          <PromptLine prompts={CHAIN_PROMPTS} />
          <label htmlFor="chain-text" className="sr-only">Your letter</label>
          <textarea
            id="chain-text"
            rows={6}
            maxLength={MAX_CHARS}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError("");
            }}
            placeholder="Dear next person…"
            className="w-full resize-none rounded-xl border border-line bg-glass px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-lamp"
          />
          <p className="text-right text-xs text-fg-3">{text.length}/{MAX_CHARS}</p>
          <FeelingPicker value={feeling} onChange={setFeeling} />
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={sending || !text.trim()}
              className="flex-1 rounded-xl btn-lamp py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              {sending ? "Leaving your letter…" : "Leave this letter"}
            </button>
            <button type="button" onClick={() => setWriting(false)} className="rounded-xl px-4 text-sm text-fg-2">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
