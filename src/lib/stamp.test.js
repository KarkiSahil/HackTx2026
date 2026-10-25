import { formatStamp, isRecent, teaserLine, timeAgo, topFeelings } from "./stamp";
import { describeNotification } from "./notifications";
import { encodeWav, downsample } from "./wav";
import { placeContaining } from "./geo";
import { randomPrompt, STORY_PROMPTS } from "./prompts";

const NOW = new Date("2026-10-25T12:00:00Z").getTime();

describe("context stamp", () => {
  it("formats the spec's example line", () => {
    expect(
      formatStamp(
        {
          time_of_day: "late_night",
          weather_label: "Rain",
          weather_temp: 61,
          campus_moment: "Finals week",
          created_at: "2024-10-20T06:00:00Z",
        },
        NOW,
      ),
    ).toBe("Late night · Rain, 61°F · Finals week · 2 years ago");
  });

  it("skips missing parts, e.g. when weather was unavailable", () => {
    expect(formatStamp({ time_of_day: "morning", created_at: "2026-10-25T11:59:30Z" }, NOW)).toBe("Morning · just now");
  });

  it("describes relative time", () => {
    expect(timeAgo("2026-10-24T12:00:00Z", NOW)).toBe("yesterday");
    expect(timeAgo("2026-10-25T09:00:00Z", NOW)).toBe("3 hours ago");
  });
});

describe("teasers", () => {
  it("names locked items without content", () => {
    expect(teaserLine({ story_count: 3, voice_count: 2, has_chain: true })).toBe(
      "3 stories · 2 voice notes · a chain letter is waiting",
    );
    expect(teaserLine({ story_count: 1 })).toBe("1 story");
    expect(teaserLine({})).toBe("Nothing here yet");
  });

  it("ranks feelings and spots recent activity", () => {
    expect(topFeelings(["calm", "tired", "calm", "hopeful", "tired", "calm"])).toEqual(["calm", "tired", "hopeful"]);
    expect(isRecent("2026-10-20T12:00:00Z", NOW)).toBe(true);
    expect(isRecent("2026-10-10T12:00:00Z", NOW)).toBe(false);
    expect(isRecent(null, NOW)).toBe(false);
  });
});

describe("notifications", () => {
  it("say what happened and link to it", () => {
    expect(describeNotification({ type: "comment", payload: { from_name: "Ben", place_name: "Alkek", story_id: "s1" } })).toEqual({
      text: "Ben commented on your story at Alkek",
      href: "/story/s1",
    });
    expect(describeNotification({ type: "chain_reply", payload: { place_name: "Alkek", place_id: "p1" } }).text).toBe(
      "The next letter after yours was written at Alkek",
    );
    expect(describeNotification({ type: "dm_request", payload: { from_name: "Cara" } }).text).toBe("Cara wants to message you");
  });
});

describe("voice recording", () => {
  it("encodes 16 kHz mono 16-bit WAV", async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -0.5, 1]));
    const buffer = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new DataView(buffer);
    const text = (offset) => String.fromCharCode(...[0, 1, 2, 3].map((i) => bytes.getUint8(offset + i)));
    expect(blob.type).toBe("audio/wav");
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(bytes.getUint16(22, true)).toBe(1);
    expect(bytes.getUint32(24, true)).toBe(16000);
    expect(bytes.getUint16(34, true)).toBe(16);
    expect(bytes.getUint32(40, true)).toBe(8);
    expect(bytes.getInt16(46, true)).toBe(16383);
  });

  it("downsamples 48 kHz to 16 kHz", () => {
    expect(downsample(new Float32Array(4800), 48000).length).toBe(1600);
  });
});

describe("places", () => {
  it("finds the place you're standing in, nearest first", () => {
    const places = [
      { id: "far", lat: 29.8889, lng: -97.9431, radius_m: 30 },
      { id: "big", lat: 29.8891, lng: -97.9431, radius_m: 200 },
    ];
    expect(placeContaining(places, { lat: 29.8889, lng: -97.9431 }).id).toBe("far");
    expect(placeContaining(places, { lat: 29.8905, lng: -97.9431 }).id).toBe("big");
    expect(placeContaining(places, { lat: 29.9, lng: -97.9 })).toBeNull();
  });

  it("offers a different prompt on refresh", () => {
    expect(randomPrompt(STORY_PROMPTS, STORY_PROMPTS[0])).not.toBe(STORY_PROMPTS[0]);
  });
});
