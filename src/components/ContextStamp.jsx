import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  Clock,
  GraduationCap,
  Moon,
  Snowflake,
  Sun,
  Sunrise,
  Sunset,
} from "lucide-react";
import { formatStamp, stampParts } from "../lib/stamp";
import { CONTEXT_TINTS, tint } from "../lib/tints";
import { FeelingChip } from "./Feelings";

const TIME_ICONS = { dawn: Sunrise, morning: Sun, afternoon: Sun, evening: Sunset, late_night: Moon };
const WEATHER_ICONS = {
  Clear: Sun,
  "Mostly clear": CloudSun,
  "Partly cloudy": CloudSun,
  Cloudy: Cloud,
  Fog: CloudFog,
  Drizzle: CloudDrizzle,
  Rain: CloudRain,
  Snow: Snowflake,
  Thunderstorm: CloudLightning,
};

const TINTS = { time: CONTEXT_TINTS.time, weather: CONTEXT_TINTS.weather, moment: CONTEXT_TINTS.moment };

function iconFor(part) {
  if (part.kind === "time") return TIME_ICONS[part.key] ?? Clock;
  if (part.kind === "weather") return WEATHER_ICONS[part.key] ?? Cloud;
  if (part.kind === "moment") return GraduationCap;
  return Clock;
}

// "Late night · Rain, 61°F · Finals week · 2 years ago", as small labeled pills.
export default function ContextStamp({ item, showFeeling = true }) {
  const parts = stampParts(item);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {showFeeling && item.feeling && <FeelingChip feeling={item.feeling} />}
      <span className="sr-only">{formatStamp(item)}</span>
      {parts.map((part) => {
        const Icon = iconFor(part);
        return (
          <span
            key={part.kind}
            aria-hidden="true"
            className={part.kind === "age" ? "inline-flex items-center gap-1 text-[13px] text-fg-3" : "chip"}
            style={part.kind === "age" ? undefined : tint(TINTS[part.kind])}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {part.label}
          </span>
        );
      })}
    </div>
  );
}
