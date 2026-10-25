import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, CloudSun, GraduationCap, Lock, MapPin, Mic, Moon, PenLine, Sparkles, Sun, Sunrise, Sunset, X } from "lucide-react";
import {
  createPlace,
  createStory,
  createVoiceNote,
  getPlace,
  getPlaceSummaries,
  setVoiceFeeling,
  suggestFeeling,
} from "../lib/api";
import { distanceMeters, formatDistance, isPreciseEnough, placeContaining } from "../lib/geo";
import { preparePhoto } from "../lib/photo";
import { STORY_PROMPTS } from "../lib/prompts";
import { currentTimeOfDay } from "../lib/stamp";
import { useLiveLocation } from "../lib/useLiveLocation";
import AppShell from "../components/AppShell";
import { FeelingChip, FeelingPicker } from "../components/Feelings";
import PromptLine from "../components/PromptLine";
import SupportCard from "../components/SupportCard";
import VoiceRecorder from "../components/VoiceRecorder";

const MAX_STORY = 200;
const NEARBY_DEGREES = 0.006;
const TIME_ICONS = { dawn: Sunrise, morning: Sun, afternoon: Sun, evening: Sunset, late_night: Moon };

function StatusBar({ tone, icon: Icon, children }) {
  const styles = {
    here: "border-here/30 bg-here-bg text-here-fg",
    wait: "border-lamp/25 bg-lamp/10 text-lamp",
    neutral: "border-line bg-glass text-fg-2",
  };
  return (
    <div className={`flex min-h-[52px] items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] ${styles[tone]}`} role="status">
      {tone === "here" ? <span className="glow-dot shrink-0 text-here" /> : <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />}
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export default function Compose() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const placeId = searchParams.get("place");
  const { location, error: locationError, loading: locating } = useLiveLocation();
  const [place, setPlace] = useState(null);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [tab, setTab] = useState(searchParams.get("type") === "voice" ? "voice" : "story");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null);
  const [recording, setRecording] = useState(null);
  const [feeling, setFeeling] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsPlace, setNeedsPlace] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [done, setDone] = useState(null);
  const fileInput = useRef(null);
  const lookedUpAt = useRef(null);

  useEffect(() => {
    if (placeId) getPlace(placeId).then(setPlace).catch(() => {});
  }, [placeId]);

  // Without a chosen place, name the one you're standing in (if any) for the status bar.
  useEffect(() => {
    if (placeId || !isPreciseEnough(location)) return;
    if (lookedUpAt.current && distanceMeters(lookedUpAt.current, location) < 25) return;
    lookedUpAt.current = location;
    getPlaceSummaries({
      north: location.lat + NEARBY_DEGREES,
      south: location.lat - NEARBY_DEGREES,
      east: location.lng + NEARBY_DEGREES,
      west: location.lng - NEARBY_DEGREES,
    })
      .then(setNearbyPlaces)
      .catch(() => {});
  }, [placeId, location]);

  const ready = isPreciseEnough(location);
  const distance = place && location ? distanceMeters(location, place) : null;
  const content = tab === "story" ? text.trim() : recording;
  const standingIn = place ?? (ready ? placeContaining(nearbyPlaces, location) : null);
  const standingDistance = standingIn && location ? distanceMeters(location, standingIn) : null;
  const time = currentTimeOfDay();
  const TimeIcon = TIME_ICONS[time.key];

  async function choosePhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPhoto(await preparePhoto(file));
    } catch (err) {
      setError(err.message);
    }
  }

  async function askForSuggestion() {
    setSuggesting(true);
    try {
      setSuggestion(await suggestFeeling(text.trim()));
    } catch {
      setSuggestion(null);
    } finally {
      setSuggesting(false);
    }
  }

  async function post(targetPlaceId) {
    setSaving(true);
    setError("");
    try {
      const base = { ...location, place_id: targetPlaceId ?? placeId ?? undefined, feeling };
      const result =
        tab === "story"
          ? await createStory({ ...base, text: text.trim(), photo })
          : await createVoiceNote({ ...base, audio: recording.blob, duration_s: recording.duration_s });
      setDone({ ...result, suggestedFeeling: tab === "voice" && !feeling ? result.suggested_feeling : null });
      setNeedsPlace(false);
      if (!result.support && !(tab === "voice" && !feeling && result.suggested_feeling)) {
        navigate(`/place/${result.place.id}`, { replace: true });
      }
    } catch (err) {
      if (err.code === "no_place") setNeedsPlace(true);
      else {
        if (err.code === "already_at_place") setNeedsPlace(false);
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function startPlaceAndPost(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const created = await createPlace({ ...location, name: placeName.trim() });
      await post(created.id);
    } catch (err) {
      if (err.code === "already_at_place") setNeedsPlace(false);
      setError(err.message);
      setSaving(false);
    }
  }

  async function confirmVoiceFeeling(choice) {
    if (choice) await setVoiceFeeling(done.voice_note.id, choice).catch(() => {});
    setDone({ ...done, suggestedFeeling: null });
    if (!done.support) navigate(`/place/${done.place.id}`, { replace: true });
  }

  // After posting: confirm a suggested feeling, and/or show support resources.
  if (done) {
    return (
      <AppShell>
        <div className="mx-auto w-full max-w-2xl space-y-5 px-4 pt-8 md:px-8">
          <p className="label-caps text-here-fg">Pinned</p>
          <h1 className="title-display text-fg">
            Left at <em>{done.place.name}</em>
          </h1>
          {done.suggestedFeeling && (
            <div className="glass space-y-4 p-6">
              <p className="flex flex-wrap items-center gap-2 font-display text-xl text-fg">
                It sounds <FeelingChip feeling={done.suggestedFeeling} />. Tag it?
              </p>
              <div className="flex gap-2">
                <button onClick={() => confirmVoiceFeeling(done.suggestedFeeling)} className="btn-primary flex-1">
                  Yes, tag it
                </button>
                <button onClick={() => confirmVoiceFeeling(null)} className="btn-glass flex-1 rounded-2xl text-[15px]">
                  No tag
                </button>
              </div>
            </div>
          )}
          {done.support && <SupportCard />}
          {!done.suggestedFeeling && (
            <button onClick={() => navigate(`/place/${done.place.id}`, { replace: true })} className="btn-primary w-full">
              Go to {done.place.name}
            </button>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-6 md:px-8 md:pt-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="btn-glass shrink-0 rounded-full" aria-label="Go back">
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <h1 className="title-display text-fg">
            Leave something <em>here</em>
          </h1>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="space-y-5">
            {locating ? (
              <StatusBar tone="wait" icon={MapPin}>Getting your location…</StatusBar>
            ) : locationError ? (
              <StatusBar tone="wait" icon={Lock}>{locationError}</StatusBar>
            ) : !ready ? (
              <StatusBar tone="wait" icon={Lock}>
                Your GPS is rough right now (±{Math.round(location.accuracy)} m). Step outside or wait a moment.
              </StatusBar>
            ) : place && distance > place.radius_m ? (
              <StatusBar tone="wait" icon={Lock}>
                You're {formatDistance(distance)} from {place.name}. Get within {place.radius_m} m to leave something.
              </StatusBar>
            ) : standingIn ? (
              <StatusBar tone="here">
                You're at <strong className="font-semibold">{standingIn.name}</strong> · within {Math.max(1, Math.round(standingDistance))} m
              </StatusBar>
            ) : (
              <StatusBar tone="neutral" icon={MapPin}>No Katha place right here yet. You'll name this spot when you pin.</StatusBar>
            )}

            <div className="glass inline-flex rounded-2xl p-1.5" role="tablist" aria-label="What to leave">
              {[
                { id: "story", label: "Story", icon: PenLine },
                { id: "voice", label: "Voice note", icon: Mic },
              ].map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex min-h-[44px] items-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors ${
                    tab === t.id ? "bg-fg text-on-lamp" : "text-fg-2 hover:text-fg"
                  }`}
                >
                  <t.icon className="h-4 w-4" strokeWidth={1.75} /> {t.label}
                </button>
              ))}
            </div>

            <section className="glass overflow-hidden p-0">
              {tab === "story" ? (
                <>
                  <PromptLine prompts={STORY_PROMPTS} className="border-b border-line px-6 py-4" />
                  <label htmlFor="story-text" className="sr-only">Your story</label>
                  <textarea
                    id="story-text"
                    rows={5}
                    maxLength={MAX_STORY}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="What are you feeling, right here?"
                    className="block w-full resize-none bg-transparent px-6 py-5 font-display text-[22px] leading-relaxed text-fg placeholder:text-fg-3 focus:outline-none"
                  />
                  {photo && (
                    <div className="relative mx-6 mb-4">
                      <img src={photo.previewUrl} alt="Your view from here" className="w-full rounded-2xl" />
                      <button onClick={() => setPhoto(null)} className="btn-glass absolute right-2 top-2 rounded-full bg-black/50" aria-label="Remove photo">
                        <X className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3">
                    {!photo ? (
                      <button
                        onClick={() => fileInput.current?.click()}
                        className="flex min-h-[44px] items-center gap-2 rounded-xl border border-dashed border-fg-3/40 px-4 text-[13px] font-medium text-fg-2 hover:border-lamp/50 hover:text-fg"
                      >
                        <Camera className="h-4 w-4" strokeWidth={1.75} /> Add the view from here
                      </button>
                    ) : (
                      <span className="text-[13px] text-fg-3">Photo added</span>
                    )}
                    <span className={`text-[13px] tabular-nums ${text.length >= MAX_STORY ? "text-lamp" : "text-fg-3"}`}>
                      {text.length}/{MAX_STORY}
                    </span>
                  </div>
                  <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={choosePhoto} className="hidden" />
                </>
              ) : (
                <VoiceRecorder recording={recording} onChange={setRecording} />
              )}
            </section>

            <FeelingPicker value={feeling} onChange={setFeeling} suggestion={suggestion} />
            {tab === "story" && text.trim().length >= 15 && !feeling && !suggestion && (
              <button onClick={askForSuggestion} disabled={suggesting} className="flex min-h-[44px] items-center gap-1.5 text-[13px] font-medium text-lamp disabled:opacity-60">
                <Sparkles className="h-4 w-4" strokeWidth={1.75} /> {suggesting ? "Thinking…" : "Suggest a feeling"}
              </button>
            )}

            {error && <p className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

            {needsPlace ? (
              <form onSubmit={startPlaceAndPost} className="glass space-y-4 p-6">
                <div>
                  <p className="font-display text-2xl text-fg">No Katha place here yet</p>
                  <p className="mt-1 text-[13px] text-fg-2">Name this spot to start one. What you leave will be its first.</p>
                </div>
                <label htmlFor="place-name" className="sr-only">Place name</label>
                <input
                  id="place-name"
                  maxLength={80}
                  value={placeName}
                  onChange={(e) => setPlaceName(e.target.value)}
                  placeholder="Name this spot"
                  className="min-h-[52px] w-full rounded-2xl border border-line bg-glass px-4 text-[15px] text-fg placeholder:text-fg-3 focus:border-lamp/50 focus:outline-none"
                />
                <button type="submit" disabled={saving || !placeName.trim() || !content} className="btn-primary w-full">
                  {saving ? "Creating place…" : "Create place and pin it"}
                </button>
              </form>
            ) : (
              <button onClick={() => post()} disabled={saving || !ready || !content} className="btn-primary w-full text-[17px]">
                <MapPin className="h-5 w-5" strokeWidth={2} />
                {saving ? "Pinning…" : tab === "story" ? "Pin story here" : "Pin voice note here"}
              </button>
            )}
            <p className="text-center text-[13px] text-fg-3">Chain letters live on each place's page, once you're there.</p>
          </div>

          <aside className="space-y-4">
            <section className="glass p-6">
              <p className="label-caps">Katha adds the moment</p>
              <ul className="mt-4 space-y-4">
                {[
                  [TimeIcon, "#A5B4FC", "Time of day", time.label],
                  [CloudSun, "#7DD3FC", "Weather", "Live from Open-Meteo when you pin"],
                  [GraduationCap, "#FDBA74", "Campus moment", "Added when something is happening on campus"],
                ].map(([Icon, color, label, value]) => (
                  <li key={label} className="flex items-center gap-3">
                    <span className="chip h-10 w-10 shrink-0 justify-center p-0" style={{ "--chip": color }}>
                      <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] text-fg-3">{label}</span>
                      <span className="block text-[15px] text-fg">{value}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass p-6">
              <p className="label-caps">Preview on the map</p>
              <div className="mt-4 rounded-2xl border border-line bg-glass-raised p-5">
                <p className="text-[13px] font-medium text-lamp">{standingIn?.name ?? place?.name ?? "This spot"}</p>
                {tab === "story" ? (
                  <p className={`mt-2 font-display text-xl leading-snug ${text.trim() ? "text-fg" : "text-fg-3"}`}>
                    {text.trim() || "Your words appear here as you write."}
                  </p>
                ) : (
                  <p className="mt-2 flex items-center gap-2 font-display text-xl text-fg">
                    <Mic className="h-5 w-5 text-lamp" strokeWidth={1.75} />
                    {recording ? `Voice note · ${Math.round(recording.duration_s)} s` : "Your voice note"}
                  </p>
                )}
                {photo && tab === "story" && <img src={photo.previewUrl} alt="" className="mt-3 aspect-[16/9] w-full rounded-xl object-cover" />}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {feeling && <FeelingChip feeling={feeling} />}
                  <span className="chip" style={{ "--chip": "#A5B4FC" }}>
                    <TimeIcon className="h-3.5 w-3.5" strokeWidth={1.75} /> {time.label}
                  </span>
                  <span className="text-[13px] text-fg-3">just now</span>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
