import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { resolvePlace } from "../location.js";
import { paintInBackground } from "../postcards.js";
import { FEELINGS, createVoiceNoteSchema, parse } from "../validation.js";

const AUDIO_EXTENSIONS = {
  "audio/wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
};

// 45 s of 16 kHz mono WAV is ~1.4 MB; 2 MB matches the storage bucket limit.
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

// The recording is the raw request body (Content-Type audio/*); its details travel in the query string.
// Katha's recorder sends WAV, the only format Muse Voice Transcribe accepts; other formats are stored without captions.
export function voiceNotesRouter(db, ai, context, { log = console } = {}) {
  const router = Router();

  router.post("/", express.raw({ type: "audio/*", limit: MAX_AUDIO_BYTES }), async (req, res) => {
    const input = parse(createVoiceNoteSchema, req.query);
    const contentType = req.get("content-type")?.split(";")[0].trim();
    const extension = AUDIO_EXTENSIONS[contentType];
    if (!extension || !Buffer.isBuffer(req.body) || req.body.length === 0) {
      throw new HttpError(400, "invalid_audio", "Send the recording as wav, webm, ogg, mp4 or mpeg audio.");
    }

    const place = await resolvePlace(db, input);
    const transcript = contentType === "audio/wav" ? await ai.transcribe(req.body) : null;
    const verdict = transcript ? await ai.moderate(transcript) : { allowed: true, struggling: false };
    if (!verdict.allowed) {
      throw new HttpError(422, "needs_rewording", "This might hurt someone. Could you record it a little more gently?");
    }
    const suggestedFeeling = transcript && !input.feeling ? await ai.suggestFeeling(transcript) : null;

    const id = randomUUID();
    const audioPath = `${req.userId}/${id}.${extension}`;
    await db.upload("voice-notes", audioPath, req.body, contentType);
    try {
      const voiceNote = await db.insertVoiceNote({
        id,
        place_id: place.id,
        author_id: req.userId,
        audio_path: audioPath,
        duration_s: input.duration_s,
        transcript,
        feeling: input.feeling ?? null,
        ...(await context.stamp(place)),
      });
      res.status(201).json({
        voice_note: voiceNote,
        place,
        support: verdict.struggling,
        suggested_feeling: suggestedFeeling,
        postcard_pending: ai.available,
      });
      paintInBackground(db, ai, "voice_note", voiceNote, place, log);
    } catch (error) {
      await db.remove("voice-notes", audioPath);
      throw error;
    }
  });

  // The author confirms or changes the #feeling after posting.
  router.post("/:id/feeling", express.json({ limit: "1kb" }), async (req, res) => {
    const { feeling } = parse(z.object({ feeling: z.enum(FEELINGS).nullable() }), req.body);
    const voiceNote = await db.updateVoiceFeeling(req.params.id, req.userId, feeling);
    if (!voiceNote) throw new HttpError(404, "voice_note_not_found", "That voice note isn't yours.");
    res.json({ voice_note: voiceNote });
  });

  return router;
}
