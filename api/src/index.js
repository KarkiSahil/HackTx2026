import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createAiFeatures } from "./aiFeatures.js";
import { createApp } from "./app.js";
import { createContextService } from "./context.js";
import { createDb } from "./db.js";
import { createMetaClient } from "./metaClient.js";

const origin = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === value, {
    message: "each CORS_ORIGIN entry must be an origin with no path or trailing slash",
  });

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Comma-separated, e.g. "http://localhost:5173,http://localhost:8080".
  CORS_ORIGIN: z
    .string()
    .transform((value) => value.split(",").map((entry) => entry.trim()).filter(Boolean))
    .pipe(z.array(origin).min(1)),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Meta Model API. Optional: without a key every AI feature falls back gracefully.
  MODEL_API_KEY: z.string().optional(),
  MODEL_API_BASE_URL: z.string().url().default("https://api.meta.ai/v1"),
  MUSE_SPARK_MODEL: z.string().default("muse-spark-1.1"),
  MUSE_TRANSCRIBE_MODEL: z.string().default("muse-voice-transcribe-1.0"),
  MUSE_IMAGE_MODEL: z.string().default("muse-image-1.0"),
});

const environmentResult = environmentSchema.safeParse(process.env);
if (!environmentResult.success) {
  console.error(
    JSON.stringify({
      level: "error",
      message: "invalid_environment",
      issues: environmentResult.error.issues.map(({ path, message }) => ({
        path,
        message,
      })),
    }),
  );
  process.exit(1);
}

const environment = environmentResult.data;
const supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const metaClient = createMetaClient({
  apiKey: environment.MODEL_API_KEY,
  baseUrl: environment.MODEL_API_BASE_URL,
  models: {
    spark: environment.MUSE_SPARK_MODEL,
    transcribe: environment.MUSE_TRANSCRIBE_MODEL,
    image: environment.MUSE_IMAGE_MODEL,
  },
});
const app = createApp({
  corsOrigins: environment.CORS_ORIGIN,
  db: createDb(supabase),
  ai: createAiFeatures(metaClient),
  context: createContextService(),
});
const server = app.listen(environment.PORT, "0.0.0.0", () => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "server_started",
      port: environment.PORT,
      meta_ai: metaClient ? "enabled" : "disabled (no MODEL_API_KEY)",
    }),
  );
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(JSON.stringify({ level: "info", message: "shutdown_started", signal }));
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ level: "error", message: "shutdown_failed", error: error.message }),
      );
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify({ level: "info", message: "shutdown_complete" }));
  });
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
