import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import { startWavRecording } from "../lib/wav";

const MAX_SECONDS = 45;

export default function VoiceRecorder({ recording: value, onChange }) {
  const [state, setState] = useState(value ? "recorded" : "idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const recorder = useRef(null);
  const timer = useRef(null);

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stop();
  }, []);

  useEffect(() => {
    if (!value) return undefined;
    const url = URL.createObjectURL(value.blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function stop() {
    clearInterval(timer.current);
    const active = recorder.current;
    recorder.current = null;
    if (!active) return;
    const result = await active.stop();
    if (result.duration_s < 1) {
      setState("idle");
      setError("That was too short. Hold on a little longer.");
      return;
    }
    setState("recorded");
    onChange(result);
  }

  async function start() {
    setError("");
    try {
      recorder.current = await startWavRecording();
    } catch (err) {
      setError(
        err.name === "NotAllowedError"
          ? "Allow microphone access to record a voice note."
          : "Couldn't start the microphone on this device.",
      );
      return;
    }
    setState("recording");
    setElapsed(0);
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const seconds = (Date.now() - startedAt) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_SECONDS) stop();
    }, 200);
  }

  function reset() {
    onChange(null);
    setPreviewUrl(null);
    setState("idle");
  }

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 px-6 py-8 text-center">
      {state === "idle" && (
        <>
          <button
            type="button"
            onClick={start}
            className="btn-lamp flex h-20 w-20 items-center justify-center rounded-full shadow-[0_12px_40px_rgba(234,88,12,0.45)] transition-transform hover:scale-105"
            aria-label="Start recording"
          >
            <Mic className="h-8 w-8" strokeWidth={1.75} />
          </button>
          <p className="font-display text-xl text-fg">Tap to record</p>
          <p className="text-[13px] text-fg-3">Up to {MAX_SECONDS} seconds. Only people who come here can listen.</p>
        </>
      )}
      {state === "recording" && (
        <>
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-red-300">
            <span className="glow-dot animate-pulse text-red-400" /> Recording
          </p>
          <p className="font-display text-5xl text-fg" aria-live="polite">
            0:{String(Math.floor(elapsed)).padStart(2, "0")}
            <span className="text-2xl text-fg-3"> / 0:{MAX_SECONDS}</span>
          </p>
          <div className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-glass-raised">
            <div className="btn-lamp h-full rounded-full transition-all" style={{ width: `${(elapsed / MAX_SECONDS) * 100}%` }} />
          </div>
          <button type="button" onClick={stop} className="btn-glass mt-1 gap-2 rounded-2xl px-6 text-[15px] font-semibold">
            <Square className="h-4 w-4" strokeWidth={2} /> Stop
          </button>
        </>
      )}
      {state === "recorded" && value && (
        <div className="w-full max-w-md space-y-3">
          {previewUrl && <audio controls src={previewUrl} className="w-full" />}
          <div className="flex items-center justify-between text-[13px] text-fg-2">
            <span>{Math.round(value.duration_s)} s recorded</span>
            <button type="button" onClick={reset} className="flex min-h-[44px] items-center gap-1.5 font-medium text-lamp">
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} /> Record again
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-[13px] text-red-300">{error}</p>}
    </div>
  );
}
