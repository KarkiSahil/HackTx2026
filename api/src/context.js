import { CAMPUS_MOMENTS, CAMPUS_TIMEZONE } from "./campusMoments.js";

const WEATHER_TIMEOUT_MS = 2500;

function localParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export function timeOfDay(date, timeZone = CAMPUS_TIMEZONE) {
  const { hour } = localParts(date, timeZone);
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "late_night";
}

export function campusMoment(date, moments = CAMPUS_MOMENTS, timeZone = CAMPUS_TIMEZONE) {
  const { day } = localParts(date, timeZone);
  return moments.find((m) => day >= m.start && day <= m.end)?.label ?? null;
}

// WMO weather codes used by Open-Meteo.
export function weatherLabel(code) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "Rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "Snow";
  if (code >= 95) return "Thunderstorm";
  return null;
}

export function createContextService({ fetchImpl = fetch } = {}) {
  async function weather({ lat, lng }) {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", lat.toFixed(4));
      url.searchParams.set("longitude", lng.toFixed(4));
      url.searchParams.set("current", "temperature_2m,weather_code");
      url.searchParams.set("temperature_unit", "fahrenheit");
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
      if (!response.ok) return { weather_label: null, weather_temp: null };
      const { current } = await response.json();
      return {
        weather_label: weatherLabel(current?.weather_code),
        weather_temp: Number.isFinite(current?.temperature_2m) ? Math.round(current.temperature_2m) : null,
      };
    } catch {
      return { weather_label: null, weather_temp: null };
    }
  }

  // Context stamp for an item created now at this place. Never throws.
  return {
    async stamp(place, now = new Date()) {
      return {
        time_of_day: timeOfDay(now),
        campus_moment: campusMoment(now),
        ...(await weather(place)),
      };
    },
  };
}
