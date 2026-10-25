export const FEELINGS = ["calm", "homesick", "hopeful", "tired", "grateful", "lonely", "happy", "nervous"];

const TIME_OF_DAY = {
  dawn: "Dawn",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  late_night: "Late night",
};

const UNITS = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(date, now = Date.now()) {
  const seconds = Math.round((now - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return rtf.format(-Math.floor(seconds / size), unit);
  }
  return "just now";
}

// Time of day on campus right now (same bands the server stamps with).
export function currentTimeOfDay(now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  const key =
    hour >= 5 && hour < 7 ? "dawn"
    : hour >= 7 && hour < 12 ? "morning"
    : hour >= 12 && hour < 17 ? "afternoon"
    : hour >= 17 && hour < 22 ? "evening"
    : "late_night";
  return { key, label: TIME_OF_DAY[key] };
}

// The stamp as separate parts, for rendering each as its own pill.
export function stampParts(item, now = Date.now()) {
  const weather =
    item.weather_label && item.weather_temp != null
      ? `${item.weather_label}, ${Math.round(item.weather_temp)}°F`
      : item.weather_label;
  return [
    item.time_of_day && { kind: "time", key: item.time_of_day, label: TIME_OF_DAY[item.time_of_day] },
    weather && { kind: "weather", key: item.weather_label, label: weather },
    item.campus_moment && { kind: "moment", label: item.campus_moment },
    item.created_at && { kind: "age", label: timeAgo(item.created_at, now) },
  ].filter(Boolean);
}

// "Late night · Rain, 61°F · Finals week · 2 years ago"
export function formatStamp(item, now = Date.now()) {
  const weather =
    item.weather_label && item.weather_temp != null
      ? `${item.weather_label}, ${Math.round(item.weather_temp)}°F`
      : item.weather_label;
  return [TIME_OF_DAY[item.time_of_day], weather, item.campus_moment, timeAgo(item.created_at, now)]
    .filter(Boolean)
    .join(" · ");
}

// "3 stories · 2 voice notes · a chain letter is waiting"
export function teaserLine({ story_count = 0, voice_count = 0, has_chain = false }) {
  const parts = [];
  if (story_count) parts.push(`${story_count} ${story_count === 1 ? "story" : "stories"}`);
  const locked = [];
  if (voice_count) locked.push(`${voice_count} voice ${voice_count === 1 ? "note" : "notes"}`);
  if (has_chain) locked.push("a chain letter is waiting");
  if (locked.length) parts.push(locked.join(" · "));
  return parts.join(" · ") || "Nothing here yet";
}

export function topFeelings(feelings = [], limit = 3) {
  const counts = new Map();
  for (const f of feelings) counts.set(f, (counts.get(f) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([f]) => f);
}

const WEEK_MS = 7 * 24 * 3600 * 1000;
export const isRecent = (date, now = Date.now()) => Boolean(date) && now - new Date(date).getTime() < WEEK_MS;
