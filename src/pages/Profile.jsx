import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Ban, BellRing, Check, Heart, LogOut, Mail, Mic, PenLine, Pencil, ShieldCheck, X } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useNotifications } from "../context/useNotifications";
import { getBlockedPeople, getMyFeltCounts, getMyKatha, unblockUser, updateProfile } from "../lib/api";
import { timeAgo } from "../lib/stamp";
import AppShell from "../components/AppShell";
import Avatar from "../components/Avatar";

const ITEM_ICONS = { story: PenLine, voice: Mic, letter: Mail };

// A public handle from the display name ("Asha B." -> "ashab").
const handleFor = (name = "") => name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "katha";

function Stat({ value, label }) {
  return (
    <div className="glass rounded-2xl px-5 py-5">
      <p className="font-display text-[40px] font-semibold leading-none text-fg">{value ?? "–"}</p>
      <p className="label-caps mt-2">{label}</p>
    </div>
  );
}

function SettingRow({ icon: Icon, iconTone = "#B5AC9F", title, children, action }) {
  return (
    <div className="flex items-start gap-4 py-4">
      <span className="chip h-11 w-11 shrink-0 justify-center p-0" style={{ "--chip": iconTone }}>
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-fg">{title}</p>
        <div className="mt-0.5 text-[13px] leading-relaxed text-fg-2">{children}</div>
      </div>
      {action}
    </div>
  );
}

function Toggle({ on, disabled, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-8 w-14 shrink-0 rounded-full border border-line transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        on ? "btn-lamp" : "bg-glass-raised"
      }`}
    >
      <span className={`absolute top-1 h-6 w-6 rounded-full bg-fg shadow transition-all ${on ? "left-7" : "left-1"}`} />
    </button>
  );
}

export default function Profile() {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const { permission, requestBrowserAlerts } = useNotifications();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [katha, setKatha] = useState(null);
  const [feltTotal, setFeltTotal] = useState(0);
  const [blocked, setBlocked] = useState(null);
  const [showBlocked, setShowBlocked] = useState(false);

  const loadBlocked = useCallback(() => {
    getBlockedPeople().then(setBlocked).catch(() => setBlocked([]));
  }, []);

  useEffect(() => {
    loadBlocked();
    getMyKatha(user.id).then(setKatha).catch(() => setKatha(null));
    getMyFeltCounts()
      .then((counts) => setFeltTotal([...counts.values()].reduce((a, b) => a + b, 0)))
      .catch(() => {});
  }, [user.id, loadBlocked]);

  const stats = useMemo(() => {
    if (!katha) return null;
    const places = new Set(
      [...katha.stories, ...katha.voiceNotes, ...katha.letters].map((i) => i.place?.id).filter(Boolean),
    );
    return {
      stories: katha.stories.length,
      voice: katha.voiceNotes.length,
      letters: katha.letters.length,
      places: places.size,
    };
  }, [katha]);

  const recent = useMemo(() => {
    if (!katha) return [];
    return [
      ...katha.stories.map((s) => ({ id: s.id, type: "story", text: s.text, place: s.place, created_at: s.created_at })),
      ...katha.voiceNotes.map((v) => ({
        id: v.id,
        type: "voice",
        text: v.transcript ?? `Voice note · ${Math.round(v.duration_s)} s`,
        italic: Boolean(v.transcript),
        place: v.place,
        created_at: v.created_at,
      })),
      ...katha.letters.map((l) => ({ id: l.id, type: "letter", text: l.text, place: l.place, created_at: l.created_at })),
    ]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 4);
  }, [katha]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!displayName.trim()) {
      setEditError("Your name can't be empty.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await updateProfile(user.id, { display_name: displayName.trim() });
      await refreshProfile();
      setEditing(false);
    } catch (err) {
      setEditError(err.message ?? "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function unblock(id) {
    await unblockUser(id, user.id).catch(() => {});
    loadBlocked();
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString([], { month: "long", year: "numeric" })
    : null;

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-[1100px] space-y-6 px-4 pt-6 md:px-8 md:pt-10">
        {/* Identity */}
        <section className="glass overflow-hidden rounded-[28px] p-0">
          <div
            className="h-[170px]"
            aria-hidden="true"
            style={{
              background:
                "radial-gradient(28rem 12rem at 15% 20%, rgba(252,211,77,0.55), transparent 70%)," +
                "radial-gradient(26rem 12rem at 70% 0%, rgba(244,114,182,0.45), transparent 70%)," +
                "radial-gradient(30rem 14rem at 95% 100%, rgba(234,88,12,0.5), transparent 70%)," +
                "#1A1410",
            }}
          />
          <div className="px-6 pb-7 md:px-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div
                className="-mt-[62px] rounded-full p-[3px] shadow-[0_12px_40px_rgba(234,88,12,0.35)]"
                style={{ background: "linear-gradient(135deg, #FCD34D, #F472B6, #EA580C)" }}
              >
                <Avatar name={profile?.display_name ?? ""} size="xl" className="ring-4 ring-bg" />
              </div>
              {!editing && (
                <button onClick={() => setEditing(true)} className="btn-glass gap-2 rounded-2xl px-4 text-[15px] font-semibold">
                  <Pencil className="h-4 w-4" strokeWidth={1.75} /> Edit profile
                </button>
              )}
            </div>

            {editing ? (
              <form onSubmit={saveProfile} className="mt-5 max-w-md space-y-2">
                <label htmlFor="display-name" className="label-caps block">Display name</label>
                <div className="flex gap-2">
                  <input
                    id="display-name"
                    autoFocus
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={40}
                    className="min-h-[48px] min-w-0 flex-1 rounded-2xl border border-line bg-glass px-4 text-[15px] text-fg focus:border-lamp/50 focus:outline-none"
                  />
                  <button type="submit" disabled={saving} className="btn-lamp flex min-h-[48px] items-center gap-1 rounded-2xl px-4 text-sm">
                    <Check className="h-4 w-4" strokeWidth={2} /> {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDisplayName(profile?.display_name ?? "");
                      setEditError("");
                      setEditing(false);
                    }}
                    className="btn-glass rounded-2xl"
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
                {editError && <p className="text-[13px] text-red-300">{editError}</p>}
              </form>
            ) : (
              <div className="mt-4">
                <h1 className="font-display text-[48px] font-semibold leading-none tracking-[-0.02em] text-fg">{profile?.display_name}</h1>
                <p className="mt-2 text-[15px] text-fg-2">
                  @{handleFor(profile?.display_name)}
                  {memberSince && <> · Leaving notes since {memberSince}</>}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat value={stats?.stories} label="Stories" />
          <Stat value={stats?.voice} label="Voice notes" />
          <Stat value={stats?.letters} label="Letters" />
          <Stat value={stats?.places} label="Places" />
        </div>

        {feltTotal > 0 && (
          <p
            className="inline-flex items-center gap-2.5 rounded-full border border-rose-300/20 px-5 py-3 text-[15px] text-fg"
            style={{ background: "linear-gradient(90deg, rgba(244,114,182,0.18), rgba(252,211,77,0.14))" }}
          >
            <Heart className="h-4 w-4 text-rose-300" strokeWidth={1.75} fill="currentColor" />
            {feltTotal} {feltTotal === 1 ? "person" : "people"} felt your words. Only you can see this.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start">
          {/* Recently left */}
          <section className="glass p-6 md:p-7">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-semibold text-fg">Recently left</h2>
              <Link to="/me" className="flex min-h-[44px] items-center gap-1 text-[13px] font-medium text-lamp hover:underline">
                My Katha <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </div>
            {!katha ? (
              <p className="mt-4 text-[13px] text-fg-3">Loading…</p>
            ) : recent.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-line p-6 text-center">
                <p className="text-[15px] text-fg-2">Nothing yet. Go somewhere that matters to you and leave something.</p>
                <button onClick={() => navigate("/compose")} className="btn-primary mt-4">
                  Leave something
                </button>
              </div>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {recent.map((item) => {
                  const Icon = ITEM_ICONS[item.type];
                  return (
                    <li key={`${item.type}-${item.id}`} className="flex gap-4 py-4">
                      <span className="chip h-11 w-11 shrink-0 justify-center p-0" style={{ "--chip": "#FCD34D" }}>
                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`line-clamp-2 font-display text-lg leading-snug text-fg ${item.italic ? "italic" : ""}`}>
                          {item.italic ? `“${item.text}”` : item.text}
                        </p>
                        <p className="mt-1 text-[13px] text-fg-3">
                          {item.place?.name ?? "A place"} · {timeAgo(item.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Settings */}
          <section className="glass px-6 pb-6 md:px-7">
            <h2 className="pt-6 font-display text-2xl font-semibold text-fg">Settings</h2>
            <div className="divide-y divide-line">
              <SettingRow
                icon={BellRing}
                iconTone="#FCD34D"
                title="Browser alerts"
                action={
                  <Toggle
                    on={permission === "granted"}
                    disabled={permission !== "default"}
                    onClick={requestBrowserAlerts}
                    label="Browser alerts"
                  />
                }
              >
                {permission === "granted" && "On. To turn them off, use your browser's site settings."}
                {permission === "default" && "Know when someone answers you, even in another tab."}
                {permission === "denied" && "Blocked in your browser settings. The bell still shows everything."}
                {permission === "unsupported" && "Not supported in this browser. The bell still shows everything."}
              </SettingRow>

              <SettingRow
                icon={Ban}
                iconTone="#FCA5A5"
                title="Blocked people"
                action={
                  blocked?.length > 0 && (
                    <button onClick={() => setShowBlocked((v) => !v)} className="min-h-[44px] shrink-0 text-[13px] font-medium text-lamp">
                      {showBlocked ? "Hide" : "Manage"}
                    </button>
                  )
                }
              >
                {blocked === null
                  ? "Loading…"
                  : blocked.length === 0
                    ? "You haven't blocked anyone."
                    : `${blocked.length} ${blocked.length === 1 ? "person" : "people"} can't see your things or message you.`}
                {showBlocked && blocked?.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {blocked.map((b) => (
                      <li key={b.id} className="flex items-center justify-between rounded-xl bg-glass px-3 py-1">
                        <span className="text-[15px] text-fg">{b.name}</span>
                        <button onClick={() => unblock(b.id)} className="min-h-[40px] text-[13px] font-medium text-lamp">Unblock</button>
                      </li>
                    ))}
                  </ul>
                )}
              </SettingRow>

              <SettingRow icon={ShieldCheck} iconTone="#6EE7B7" title="Your location">
                Checked only when you leave or unlock something. Nobody else ever sees where you are.
              </SettingRow>
            </div>
            <button
              onClick={signOut}
              className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-line text-[15px] font-semibold text-fg-2 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.75} /> Sign out
            </button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
