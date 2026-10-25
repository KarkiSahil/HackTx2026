import { Heart } from "lucide-react";
import { SUPPORT_RESOURCES } from "../lib/support";

// Shown gently, never as a block: what you wrote is posted either way.
export default function SupportCard({ onDismiss }) {
  return (
    <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4" role="note">
      <div className="flex items-start gap-3">
        <Heart className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-rose-100">It sounds like a lot right now.</p>
          <p className="text-sm text-rose-100">
            You don't have to carry it alone. If you'd like to talk to someone, these are free and private:
          </p>
          <ul className="space-y-1.5">
            {SUPPORT_RESOURCES.map((r) => (
              <li key={r.name} className="text-sm text-rose-100">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-rose-200">
                  {r.detail} · <span className="select-all font-semibold">{r.contact}</span>
                </span>
              </li>
            ))}
          </ul>
          {onDismiss && (
            <button onClick={onDismiss} className="text-xs font-medium text-rose-200 underline">
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
