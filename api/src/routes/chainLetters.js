import express, { Router } from "express";
import { HttpError } from "../errors.js";
import { resolvePlace } from "../location.js";
import { paintInBackground } from "../postcards.js";
import { createChainLetterSchema, parse } from "../validation.js";
import { moderateOrThrow } from "./social.js";

const chainMoved = () =>
  new HttpError(409, "chain_moved", "Someone just added a new letter, read it first.");

// Each place has one chain. A new letter must answer the chain's latest letter;
// the chain_letters_set_latest trigger then makes it the new latest.
export function chainLettersRouter(db, ai, context, { log = console } = {}) {
  const router = Router();
  router.use(express.json({ limit: "16kb" }));

  router.post("/", async (req, res) => {
    const input = parse(createChainLetterSchema, req.body);
    const place = await resolvePlace(db, input);

    let chain = await db.getChainByPlace(place.id);
    const latestLetterId = chain?.latest_letter_id ?? null;
    if (input.answers_letter_id !== latestLetterId) throw chainMoved();

    if (latestLetterId) {
      const latest = await db.getChainLetter(latestLetterId);
      if (latest?.author_id === req.userId) {
        throw new HttpError(403, "own_letter", "The latest letter here is yours. Wait for someone else to answer it.");
      }
    }

    const { support } = await moderateOrThrow(ai, [input.theme_prompt, input.text].filter(Boolean).join("\n"));

    if (!chain) {
      chain = await db.insertChain({ place_id: place.id, theme_prompt: input.theme_prompt ?? null });
      if (!chain) throw chainMoved();
    }

    const letter = await db.insertChainLetter({
      chain_id: chain.id,
      author_id: req.userId,
      answers_letter_id: latestLetterId,
      text: input.text,
      feeling: input.feeling ?? null,
      ...(await context.stamp(place)),
    });
    if (!letter) throw chainMoved();

    res.status(201).json({ letter, chain: { ...chain, latest_letter_id: letter.id }, place, support, postcard_pending: ai.available });
    paintInBackground(db, ai, "chain_letter", letter, place, log);
  });

  return router;
}
