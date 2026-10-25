import express, { Router } from "express";
import { HttpError } from "../errors.js";
import { MAX_PLACE_RADIUS_M, placesContaining } from "../geo.js";
import { assertPreciseEnough } from "../location.js";
import { createPlaceSchema, parse } from "../validation.js";

// A new place is centered on the creator's live position, and only where no place exists yet.
export function placesRouter(db) {
  const router = Router();

  router.post("/", express.json({ limit: "16kb" }), async (req, res) => {
    const input = parse(createPlaceSchema, req.body);
    assertPreciseEnough(input.accuracy);

    const point = { lat: input.lat, lng: input.lng };
    const [existing] = placesContaining(await db.placesNear(point, MAX_PLACE_RADIUS_M), point);
    if (existing) {
      throw new HttpError(409, "already_at_place", `You're already at ${existing.name}. Leave something there instead.`);
    }

    const place = await db.insertPlace({
      name: input.name,
      description: input.description ?? null,
      lat: input.lat,
      lng: input.lng,
      radius_m: input.radius_m,
      created_by: req.userId,
    });
    res.status(201).json({ place });
  });

  return router;
}
