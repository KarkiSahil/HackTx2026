import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { HttpError } from "./errors.js";
import { parse } from "./validation.js";

export const POSTCARD_ITEM_TYPES = ["story", "voice_note", "chain_letter"];

// The "memory postcard": an AI watercolor of the place, never the real photo.
// Returns the postcard, or null when the AI is unavailable.
export async function paintPostcard(db, ai, itemType, item, place) {
  const existing = await db.getPostcardFor(itemType, item.id);
  if (existing) return existing;
  const image = await ai.postcard({
    placeName: place.name,
    feeling: item.feeling,
    weatherLabel: item.weather_label,
    timeOfDay: item.time_of_day,
  });
  if (!image) return null;
  const imagePath = `${item.id}/${randomUUID()}.png`;
  await db.upload("postcards", imagePath, image, "image/png");
  return db.insertPostcard(itemType, item.id, imagePath);
}

// Paints after the response is sent (~30 s); creating something never waits on it.
export function paintInBackground(db, ai, itemType, item, place, log = console) {
  if (!ai.available) return;
  paintPostcard(db, ai, itemType, item, place).catch((error) =>
    log.error(
      JSON.stringify({ level: "error", message: "postcard_failed", item_type: itemType, item_id: item.id, error: error.message }),
    ),
  );
}

// Retry for an author when automatic painting didn't produce one.
export function postcardsRouter(db, ai) {
  const router = Router();
  router.post("/", express.json({ limit: "1kb" }), async (req, res) => {
    const { item_type, item_id } = parse(
      z.object({ item_type: z.enum(POSTCARD_ITEM_TYPES), item_id: z.uuid() }),
      req.body,
    );
    const item = await db.getPostcardSubject(item_type, item_id);
    if (!item || item.author_id !== req.userId) {
      throw new HttpError(404, "item_not_found", "Only the author can paint this watercolor.");
    }
    const postcard = await paintPostcard(db, ai, item_type, item, item.place);
    if (!postcard) {
      throw new HttpError(503, "ai_unavailable", "Watercolors aren't available right now. Try again later.");
    }
    res.status(201).json({ postcard });
  });
  return router;
}
