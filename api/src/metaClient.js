// Minimal client for the Meta Model API (https://api.meta.ai/v1).
// Muse Spark uses the OpenAI-compatible chat format; Muse Voice Transcribe takes
// multipart WAV at /asr/transcribe; Muse Image returns base64 from /images/generations.
export function createMetaClient({ apiKey, baseUrl, models, fetchImpl = fetch }) {
  if (!apiKey) return null;

  async function post(path, { json, form, timeoutMs }) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body: json ? JSON.stringify(json) : form,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Meta API ${path} returned ${response.status}`);
    }
    return response.json();
  }

  return {
    async chat(messages, { timeoutMs = 10000 } = {}) {
      const data = await post("/chat/completions", {
        json: { model: models.spark, messages, reasoning_effort: "minimal" },
        timeoutMs,
      });
      return data.choices?.[0]?.message?.content ?? "";
    },

    async transcribeWav(wav, { timeoutMs = 30000 } = {}) {
      const form = new FormData();
      form.append(
        "request",
        new Blob(
          [JSON.stringify({ model: models.transcribe, audioEncoding: "WAV", mode: "PUSH_TO_TALK" })],
          { type: "application/json" },
        ),
      );
      form.append("audio", new Blob([wav], { type: "audio/wav" }), "voice-note.wav");
      const data = await post("/asr/transcribe", { form, timeoutMs });
      return data.transcript ?? "";
    },

    async generateImage(prompt, { timeoutMs = 60000 } = {}) {
      const data = await post("/images/generations", {
        json: {
          model: models.image,
          prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json",
          output_format: "png",
        },
        timeoutMs,
      });
      const encoded = data.data?.[0]?.b64_json;
      if (!encoded) throw new Error("Meta API returned no image");
      return Buffer.from(encoded, "base64");
    },
  };
}
