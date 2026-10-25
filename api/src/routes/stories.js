import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { HttpError } from "../errors.js";
import { resolvePlace } from "../location.js";
import { createStorySchema, parse } from "../validation.js";
import { paintInBackground } from "../postcards.js";
import { moderateOrThrow } from "./social.js";

const PHOTO_EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function decodePhoto({ photo_base64, photo_type }) {
  if (!photo_base64) return null;
  const extension = PHOTO_EXTENSIONS[photo_type];
  const bytes = Buffer.from(photo_base64, "base64");
  if (!extension || bytes.length === 0) {
    throw new HttpError(400, "invalid_photo", "Photos must be JPEG, PNG or WebP.");
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new HttpError(413, "too_large", "Photos can be at most 5 MB.");
  }
  return { bytes, extension, contentType: photo_type };
}

export function storiesRouter(db, ai, context, { log = console } = {}) {
  const router = Router();

  // Large enough for a 5 MB photo sent as base64 alongside the text.
  router.post("/", express.json({ limit: "8mb" }), async (req, res) => {
    const input = parse(createStorySchema, req.body);
    const photo = decodePhoto(input);
    const place = await resolvePlace(db, input);
    const { support } = await moderateOrThrow(ai, input.text);

    const id = randomUUID();
    const photoPath = photo ? `${req.userId}/${id}.${photo.extension}` : null;
    if (photo) await db.upload("story-photos", photoPath, photo.bytes, photo.contentType);

    let story;
    try {
      story = await db.insertStory({
        id,
        place_id: place.id,
        author_id: req.userId,
        text: input.text,
        photo_path: photoPath,
        feeling: input.feeling ?? null,
        ...(await context.stamp(place)),
      });
    } catch (error) {
      if (photoPath) await db.remove("story-photos", photoPath);
      throw error;
    }
    res.status(201).json({ story, place, support, postcard_pending: ai.available });
    paintInBackground(db, ai, "story", story, place, log);
  });

  return router;
}
