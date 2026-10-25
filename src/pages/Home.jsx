import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { AlertCircle, ChevronRight, Crosshair, Lock, MapPin, Minus, Plus, Search, Sparkles } from "lucide-react";
import { feelingAround, getPlace, getPlaceSummaries } from "../lib/api";
import { distanceMeters, formatDistance, isPreciseEnough, placeContaining } from "../lib/geo";
import { FEELINGS, isRecent, teaserLine, topFeelings } from "../lib/stamp";
import { useLiveLocation } from "../lib/useLiveLocation";
import AppShell from "../components/AppShell";
import { FeelingChip } from "../components/Feelings";

// Dark basemap. CARTO Dark Matter now needs an API key, so the default is Esri's
// keyless Dark Gray Canvas; set VITE_MAP_TILES_URL (and _ATTRIBUTION) to use another.
const TILE_URL =
  import.meta.env.VITE_MAP_TILES_URL ??
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const TILE_ATTRIBUTION =
  import.meta.env.VITE_MAP_TILES_ATTRIBUTION ?? "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors";

// Where you can write: the default place radius around you.
const WRITE_RADIUS_M = 50;
const FEELING_REFRESH_METERS = 300;
const LIST_PREVIEW = 5;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open now" },
  { id: "new", label: "New this week" },
  { id: "voice", label: "Voice notes" },
  { id: "letters", label: "Chain letters" },
];

const hereIcon = (count) =>
  L.divIcon({
    className: "",
    html: `<div class="katha-pin-here"><span>${count}</span></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 46],
    popupAnchor: [0, -46],
  });

const placeIcon = (count, recent, focused) =>
  L.divIcon({
    className: "",
    html: `<div class="katha-pin${recent ? " katha-pin--glow" : ""}${focused ? " katha-pin--focus" : ""}">${count}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });

const userIcon = L.divIcon({ className: "", html: '<div class="katha-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });

function MapEvents({ onBounds, center }) {
  const map = useMap();
  useMapEvents({ moveend: () => onBounds(map.getBounds()) });
  useEffect(() => {
    onBounds(map.getBounds());
  }, [map, onBounds]);
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), center.zoom ?? 16));
  }, [map, center]);
  return null;
}

function MapControls({ location }) {
  const map = useMap();
  return (
    <div className="absolute bottom-4 right-4 z-[1000] flex flex-col items-end gap-2">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-[#16120E]/80 backdrop-blur-xl">
        <button onClick={() => map.zoomIn()} className="flex h-11 w-11 items-center justify-center text-fg hover:bg-glass-raised" aria-label="Zoom in">
          <Plus className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <span className="h-px bg-line" />
        <button onClick={() => map.zoomOut()} className="flex h-11 w-11 items-center justify-center text-fg hover:bg-glass-raised" aria-label="Zoom out">
          <Minus className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>
      {location && (
        <button
          onClick={() => map.flyTo([location.lat, location.lng], 17)}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fg text-on-lamp shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
          aria-label="Center map on my location"
        >
          <Crosshair className="h-5 w-5" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

// The sentence with mood words lit in amber.
function MoodSentence({ text }) {
  const pattern = new RegExp(`\\b(${FEELINGS.join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  return (
    <p className="font-display text-[22px] leading-snug text-fg">
      {parts.map((part, i) =>
        FEELINGS.includes(part.toLowerCase()) ? (
          <span key={i} className="italic text-lamp">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get("place");
  const { location, error: locationError, loading: locating } = useLiveLocation();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [center, setCenter] = useState(null);
  const [feelingLine, setFeelingLine] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const lastBounds = useRef(null);
  const loadTimer = useRef(null);
  const feelingFrom = useRef(null);
  const centeredOnUser = useRef(false);

  const load = useCallback(async (bounds) => {
    lastBounds.current = bounds;
    setError("");
    try {
      setPlaces(
        await getPlaceSummaries({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        }),
      );
    } catch {
      setError("Could not load places for this area. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onBounds = useCallback(
    (bounds) => {
      clearTimeout(loadTimer.current);
      loadTimer.current = setTimeout(() => load(bounds), 250);
    },
    [load],
  );

  useEffect(() => () => clearTimeout(loadTimer.current), []);

  // "Show on map" from My Katha focuses a place; otherwise center on the user once.
  useEffect(() => {
    if (!focusId) return;
    getPlace(focusId).then((p) => p && setCenter({ lat: p.lat, lng: p.lng, zoom: 18 })).catch(() => {});
  }, [focusId]);

  useEffect(() => {
    if (location && !focusId && !centeredOnUser.current) {
      centeredOnUser.current = true;
      setCenter({ lat: location.lat, lng: location.lng, zoom: 16 });
    }
  }, [location, focusId]);

  useEffect(() => {
    if (!location) return;
    if (feelingFrom.current && distanceMeters(feelingFrom.current, location) < FEELING_REFRESH_METERS) return;
    feelingFrom.current = location;
    feelingAround(location).then(setFeelingLine).catch(() => {});
  }, [location]);

  const precise = isPreciseEnough(location);
  const here = precise ? placeContaining(places, location) : null;
  const reachable = (place) => precise && distanceMeters(location, place) <= place.radius_m;

  const sorted = useMemo(
    () =>
      [...places].sort((a, b) =>
        location
          ? distanceMeters(location, a) - distanceMeters(location, b)
          : new Date(b.last_activity ?? 0) - new Date(a.last_activity ?? 0),
      ),
    [places, location],
  );

  const visible = sorted.filter((p) => {
    if (query.trim() && !p.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (filter === "open") return reachable(p);
    if (filter === "new") return isRecent(p.last_activity);
    if (filter === "voice") return p.voice_count > 0;
    if (filter === "letters") return p.has_chain;
    return true;
  });

  const nearest = !here ? sorted[0] : null;
  const moods = topFeelings(places.flatMap((p) => p.feelings ?? []), 4);
  const listed = showAll ? visible : visible.slice(0, LIST_PREVIEW);

  return (
    <AppShell>
      <div className="mx-auto grid w-full grid-cols-1 max-w-[1280px] gap-6 px-4 pt-4 md:px-8 md:pt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* Map */}
        <section className="glass relative h-[52vh] min-h-[340px] overflow-hidden rounded-[28px] p-0 lg:sticky lg:top-24 lg:h-[calc(100vh-12rem)]">
          <MapContainer center={[29.8884, -97.9384]} zoom={15} zoomControl={false} style={{ height: "100%", width: "100%", zIndex: 0 }} worldCopyJump>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxNativeZoom={16} maxZoom={20} />
            <MapEvents onBounds={onBounds} center={center} />
            {visible.map((place) => (
              <Marker
                key={place.id}
                position={[place.lat, place.lng]}
                icon={
                  place.id === here?.id
                    ? hereIcon(place.story_count)
                    : placeIcon(place.story_count, isRecent(place.last_activity), place.id === focusId)
                }
              >
                <Popup>
                  <div style={{ minWidth: 180 }}>
                    <p className="font-display text-base font-semibold text-fg">{place.name}</p>
                    <p className="mt-1 text-[13px] text-fg-2">{teaserLine(place)}</p>
                    <button onClick={() => navigate(`/place/${place.id}`)} className="btn-lamp mt-3 min-h-[40px] w-full rounded-xl text-[13px]">
                      Open this place
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
            {location && (
              <>
                <Circle
                  center={[location.lat, location.lng]}
                  radius={here?.radius_m ?? WRITE_RADIUS_M}
                  pathOptions={{ color: "#34D399", weight: 1.5, dashArray: "6 8", fillColor: "#34D399", fillOpacity: 0.07 }}
                />
                <Marker position={[location.lat, location.lng]} icon={userIcon} interactive={false} />
              </>
            )}
            <MapControls location={location} />
          </MapContainer>

          {/* Search and filters, floating over the map */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] space-y-2 md:inset-x-4 md:top-4">
            <label className="pointer-events-auto flex min-h-[48px] items-center gap-2 rounded-2xl border border-line bg-[#16120E]/80 px-4 backdrop-blur-xl md:max-w-sm">
              <Search className="h-4 w-4 shrink-0 text-fg-3" strokeWidth={1.75} />
              <span className="sr-only">Search places</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search places on the map"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-3 focus:outline-none"
              />
            </label>
            <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter places">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-[13px] font-semibold backdrop-blur-xl transition-colors ${
                    filter === f.id ? "selected border-transparent" : "border-line bg-[#16120E]/75 text-fg-2 hover:text-fg"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Side column */}
        <aside className="space-y-4">
          {here ? (
            <section
              className="glass p-6"
              style={{ background: "linear-gradient(160deg, rgba(52,211,153,0.16), rgba(255,248,235,0.04) 60%)" }}
            >
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-here-fg">
                <span className="glow-dot text-here" /> You're here
              </p>
              <h2 className="mt-3 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">{here.name}</h2>
              <p className="mt-2 text-[15px] text-fg-2">
                {here.story_count > 0
                  ? `${here.story_count} ${here.story_count === 1 ? "story is" : "stories are"} waiting here`
                  : "Nothing here yet. Be the first."}
              </p>
              <button onClick={() => navigate(`/compose?place=${here.id}`)} className="btn-primary mt-5 w-full">
                <Plus className="h-5 w-5" strokeWidth={2} /> Leave something here
              </button>
              <button onClick={() => navigate(`/place/${here.id}`)} className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1 text-[13px] font-medium text-fg-2 hover:text-fg">
                Open this place <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </section>
          ) : nearest ? (
            <section className="glass p-6">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">
                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} /> Nearest place
              </p>
              <h2 className="mt-3 font-display text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-fg">{nearest.name}</h2>
              <p className="mt-2 text-[15px] text-fg-2">
                {location ? `${formatDistance(distanceMeters(location, nearest))} away. ` : ""}
                Walk there to leave something and unlock its voice notes and letters.
              </p>
              <button onClick={() => navigate(`/place/${nearest.id}`)} className="btn-glass mt-5 w-full rounded-2xl text-[15px] font-semibold">
                Read its stories <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
              </button>
              {precise && (
                <button onClick={() => navigate("/compose")} className="mt-2 flex min-h-[44px] w-full items-center justify-center text-[13px] font-medium text-lamp hover:underline">
                  Or start a new place where you are
                </button>
              )}
            </section>
          ) : (
            <section className="glass p-6">
              <p className="label-caps">Around you</p>
              <h2 className="mt-3 font-display text-[32px] font-semibold leading-tight text-fg">
                {loading ? "Looking around…" : "No places here yet"}
              </h2>
              {!loading && precise && (
                <button onClick={() => navigate("/compose")} className="btn-primary mt-5 w-full">
                  <Plus className="h-5 w-5" /> Start a place here
                </button>
              )}
            </section>
          )}

          {(locationError || (!locating && location && !precise)) && (
            <p role="alert" className="rounded-2xl border border-lamp/20 bg-lamp/10 px-4 py-3 text-[13px] text-lamp">
              {locationError || `Your GPS is rough right now (±${Math.round(location.accuracy)} m). Step outside to unlock places.`}
            </p>
          )}

          {(feelingLine || moods.length > 0) && (
            <section className="glass p-6">
              <p className="label-caps flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-lamp" strokeWidth={1.75} /> Mood around you
              </p>
              {feelingLine && <div className="mt-3"><MoodSentence text={feelingLine} /></div>}
              {moods.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {moods.map((f) => <FeelingChip key={f} feeling={f} />)}
                </div>
              )}
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="label-caps">Stories around you</p>
              {visible.length > LIST_PREVIEW && (
                <button onClick={() => setShowAll((v) => !v)} className="min-h-[44px] text-[13px] font-medium text-lamp hover:underline">
                  {showAll ? "Show less" : `See all ${visible.length}`}
                </button>
              )}
            </div>

            {error && (
              <div className="glass flex flex-col items-center gap-3 p-6 text-center">
                <AlertCircle className="h-8 w-8 text-red-300" strokeWidth={1.75} />
                <p className="text-sm text-fg-2">{error}</p>
                <button onClick={() => lastBounds.current && load(lastBounds.current)} className="btn-glass rounded-xl px-4 text-sm">Retry</button>
              </div>
            )}

            {!error && !loading && visible.length === 0 && (
              <p className="glass p-5 text-[13px] text-fg-2">
                {places.length === 0 ? "No places in this part of the map yet." : "No places match this filter."}
              </p>
            )}

            <ul className="space-y-2.5">
              {listed.map((place) => {
                const open = reachable(place);
                return (
                  <li key={place.id}>
                    <button
                      onClick={() => navigate(`/place/${place.id}`)}
                      className={`glass flex w-full items-center gap-3 rounded-2xl p-3.5 text-left transition-colors hover:bg-glass-raised ${
                        open ? "border-lamp/40 shadow-[0_0_24px_rgba(252,211,77,0.18)]" : "opacity-80"
                      } ${place.id === focusId ? "ring-1 ring-lamp" : ""}`}
                    >
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${open ? "btn-lamp" : "bg-glass-raised text-fg-3"}`}
                      >
                        {open ? <MapPin className="h-5 w-5" strokeWidth={1.75} /> : <Lock className="h-4.5 w-4.5" strokeWidth={1.75} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-lg font-semibold text-fg">{place.name}</span>
                        <span className="block truncate text-[13px] text-fg-2">{teaserLine(place)}</span>
                      </span>
                      {open ? (
                        <span className="chip shrink-0" style={{ "--chip": "#FCD34D" }}>Open now</span>
                      ) : (
                        location && <span className="shrink-0 text-[13px] text-fg-3">{formatDistance(distanceMeters(location, place))}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
