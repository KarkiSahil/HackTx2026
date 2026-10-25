import cors from "cors";
import express from "express";
import { requireUser } from "./auth.js";
import { HttpError } from "./errors.js";
import { postcardsRouter } from "./postcards.js";
import { boardRouter } from "./routes/board.js";
import { chainLettersRouter } from "./routes/chainLetters.js";
import { placesRouter } from "./routes/places.js";
import { reactionsRouter } from "./routes/reactions.js";
import { socialRouter } from "./routes/social.js";
import { storiesRouter } from "./routes/stories.js";
import { voiceNotesRouter } from "./routes/voiceNotes.js";

export function createApp({ corsOrigins, db, ai, context }) {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        callback(null, !requestOrigin || corsOrigins.includes(requestOrigin));
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
      maxAge: 600,
    }),
  );
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        JSON.stringify({
          level: "info",
          message: "http_request",
          method: req.method,
          // originalUrl keeps the mount prefix; the query string (which can hold coordinates) is dropped.
          path: req.originalUrl.split("?")[0],
          status: res.statusCode,
          duration_ms: Date.now() - startedAt,
        }),
      );
    });
    next();
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Each router parses its own body, sized for what it accepts.
  const signedIn = requireUser(db);
  app.use("/places", signedIn, placesRouter(db), boardRouter(db));
  app.use("/stories", signedIn, storiesRouter(db, ai, context));
  app.use("/voice-notes", signedIn, voiceNotesRouter(db, ai, context));
  app.use("/chain-letters", signedIn, chainLettersRouter(db, ai, context));
  app.use("/postcards", signedIn, postcardsRouter(db, ai));
  app.use("/", signedIn, reactionsRouter(db), socialRouter(db, ai));

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.code, message: error.message, ...error.details });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "too_large", message: "That upload is too large." });
      return;
    }

    const status =
      Number.isInteger(error.status) && error.status >= 400 && error.status < 500
        ? error.status
        : 500;
    const code = status === 500 ? "internal_server_error" : "invalid_request";

    console.error(
      JSON.stringify({
        level: "error",
        message: "request_failed",
        status,
        error: code,
        detail: status === 500 ? error.message : undefined,
      }),
    );
    res.status(status).json({ error: code });
  });

  return app;
}
