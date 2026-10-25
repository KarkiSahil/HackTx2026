import { FEELINGS } from "../lib/stamp";
import { MOOD_TINTS, tint } from "../lib/tints";

export function FeelingChip({ feeling, active = false, onClick }) {
  if (!onClick) {
    return (
      <span className="chip" style={tint(MOOD_TINTS[feeling])}>
        {feeling}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip min-h-[44px] px-4 text-[13px] transition-shadow ${active ? "selected shadow-[0_0_18px_rgba(252,211,77,0.35)]" : "hover:brightness-125"}`}
      style={active ? undefined : tint(MOOD_TINTS[feeling])}
    >
      {feeling}
    </button>
  );
}

// Optional #feeling; tapping the selected chip clears it.
export function FeelingPicker({ value, onChange, suggestion }) {
  return (
    <div>
      <p className="mb-3 font-display text-xl text-fg">
        How does it feel? <span className="font-sans text-[13px] text-fg-3">optional</span>
      </p>
      {suggestion && !value && (
        <p className="mb-3 text-[13px] text-fg-2">
          Suggested:{" "}
          <button type="button" onClick={() => onChange(suggestion)} className="font-semibold text-lamp underline">
            {suggestion}
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {FEELINGS.map((f) => (
          <FeelingChip key={f} feeling={f} active={value === f} onClick={() => onChange(value === f ? null : f)} />
        ))}
      </div>
    </div>
  );
}
