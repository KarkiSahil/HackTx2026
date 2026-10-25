import express, { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { resolvePlace } from "../location.js";
import { sortItems } from "../ranking.js";
import { FEELINGS, coordinatesSchema, parse } from "../validation.js";

const boardQuery = z.object({
  sort: z.enum(["ranked", "newest", "oldest", "feeling"]).default("ranked"),
  feeling: z.enum(FEELINGS).optional(),
});

const stampOf = (item) => ({
  id: item.id,
  feeling: item.feeling,
  time_of_day: item.time_of_day,
  weather_label: item.weather_label,
  weather_temp: item.weather_temp,
  campus_moment: item.campus_moment,
  created_at: item.created_at,
});

async function rankedWithSignals(db, itemType, items, userId, sort) {
  const ids = items.map((i) => i.id);
  const [views, felt] = await Promise.all([
    db.viewSignals(itemType, ids, userId),
    db.feltSignals(itemType, ids, userId),
  ]);
  const sorted = sortItems(items, sort, { ...views, feltCounts: felt.feltCounts });
  return sorted.map((item) => ({
    ...item,
    opened_by_me: views.openedByViewer.has(item.id),
    felt_by_me: felt.feltByViewer.has(item.id),
    // "I felt this too" counts are visible only to the author.
    felt_count: item.author_id === userId ? felt.feltCounts.get(item.id) ?? 0 : undefined,
  }));
}

export function boardRouter(db) {
  const router = Router();
  router.use(express.json({ limit: "16kb" }));

  // Public board: stories (readable from anywhere) plus locked teasers that
  // reveal only feeling tags and context stamps, never content.
  router.get("/:id/board", async (req, res) => {
    const { sort, feeling } = parse(boardQuery, req.query);
    const place = await db.getPlace(req.params.id);
    if (!place) throw new HttpError(404, "place_not_found", "That place no longer exists.");

    const blocked = await db.blockedUserIds(req.userId);
    const visible = (item) => !blocked.has(item.author_id) && (!feeling || item.feeling === feeling);

    const [stories, voiceNotes, chain] = await Promise.all([
      db.storiesAtPlace(place.id),
      db.voiceNotesAtPlace(place.id),
      db.getChainByPlace(place.id),
    ]);

    const rankedStories = await rankedWithSignals(db, "story", stories.filter(visible), req.userId, sort);
    const latestLetter = chain?.latest_letter_id ? await db.getChainLetter(chain.latest_letter_id) : null;

    res.json({
      place,
      stories: rankedStories.map((s) => ({
        ...s,
        photo_url: s.photo_path ? db.publicUrl("story-photos", s.photo_path) : null,
      })),
      locked: {
        voice_notes: voiceNotes
          .filter((v) => !blocked.has(v.author_id))
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map((v) => ({ ...stampOf(v), duration_s: v.duration_s })),
        chain: latestLetter ? { theme_prompt: chain.theme_prompt, latest: stampOf(latestLetter) } : null,
      },
    });
  });

  // At the place: voice notes with ~5 minute signed audio URLs and transcripts,
  // and the chain's latest letter. Opening the letter counts as a view.
  router.post("/:id/unlock", async (req, res) => {
    const coords = parse(coordinatesSchema, req.body);
    const place = await resolvePlace(db, { ...coords, place_id: req.params.id });
    const blocked = await db.blockedUserIds(req.userId);

    const voiceNotes = (await db.voiceNotesAtPlace(place.id)).filter((v) => !blocked.has(v.author_id));
    const ranked = await rankedWithSignals(db, "voice_note", voiceNotes, req.userId, "ranked");
    const urls = await db.signedUrls("voice-notes", ranked.map((v) => v.audio_path));

    const chain = await db.getChainByPlace(place.id);
    let latestLetter = null;
    if (chain?.latest_letter_id) {
      const letter = await db.getChainLetter(chain.latest_letter_id);
      if (blocked.has(letter.author_id)) {
        latestLetter = { id: letter.id, hidden: true };
      } else {
        const { feltByViewer } = await db.feltSignals("chain_letter", [letter.id], req.userId);
        latestLetter = {
          ...stampOf(letter),
          text: letter.text,
          postcard_url: letter.postcard_url,
          is_mine: letter.author_id === req.userId,
          felt_by_me: feltByViewer.has(letter.id),
        };
        await db.recordViews([{ item_type: "chain_letter", item_id: letter.id, user_id: req.userId }]);
      }
    }

    res.json({
      place,
      voice_notes: ranked.map(({ audio_path, ...v }) => ({ ...v, audio_url: urls.get(audio_path) ?? null })),
      chain: chain ? { id: chain.id, theme_prompt: chain.theme_prompt, latest_letter: latestLetter } : null,
    });
  });

  return router;
}
