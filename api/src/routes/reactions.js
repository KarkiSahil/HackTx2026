import express, { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { resolvePlace } from "../location.js";
import { coordinatesSchema, parse } from "../validation.js";

const itemSchema = z.object({
  item_type: z.enum(["story", "voice_note", "chain_letter"]),
  item_id: z.uuid(),
});

async function visibleItem(db, userId, { item_type, item_id }) {
  const item = await db.getItemRef(item_type, item_id);
  const blocked = item ? await db.blockedUserIds(userId) : null;
  if (!item || blocked.has(item.author_id)) {
    throw new HttpError(404, "item_not_found", "That item is no longer here.");
  }
  return item;
}

export function reactionsRouter(db) {
  const router = Router();
  router.use(express.json({ limit: "16kb" }));

  // Opening an item; feeds the "unheard first" ranking.
  router.post("/views", async (req, res) => {
    const input = parse(itemSchema, req.body);
    await visibleItem(db, req.userId, input);
    await db.recordViews([{ ...input, user_id: req.userId }]);
    res.status(204).end();
  });

  // "I felt this too": only at the item's place, once per person, never on your own item.
  router.post("/felt", async (req, res) => {
    const input = parse(itemSchema.extend(coordinatesSchema.shape), req.body);
    const item = await visibleItem(db, req.userId, input);
    if (item.author_id === req.userId) {
      throw new HttpError(400, "own_item", "This one is yours.");
    }
    await resolvePlace(db, { ...input, place_id: item.place_id });
    await db.insertFelt({ item_type: input.item_type, item_id: input.item_id, user_id: req.userId });
    res.status(204).end();
  });

  return router;
}
