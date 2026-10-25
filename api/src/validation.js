import { z } from "zod";
import { HttpError } from "./errors.js";

export const FEELINGS = ["calm", "homesick", "hopeful", "tired", "grateful", "lonely", "happy", "nervous"];

const coordinates = {
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy: z.coerce.number().min(0),
};

export const coordinatesSchema = z.object(coordinates);

const trimmedText = (max) => z.string().trim().min(1, "Write something first.").max(max);
const feeling = z.enum(FEELINGS).nullish();

export const createPlaceSchema = z.object({
  ...coordinates,
  name: trimmedText(80),
  description: z.string().trim().max(200).nullish(),
  radius_m: z.coerce.number().int().min(30).max(200).default(50),
});

export const createStorySchema = z.object({
  ...coordinates,
  place_id: z.uuid().optional(),
  text: trimmedText(200),
  feeling,
  photo_base64: z.string().max(7_200_000).optional(),
  photo_type: z.enum(["image/jpeg", "image/png", "image/webp"]).optional(),
});

export const createVoiceNoteSchema = z.object({
  ...coordinates,
  place_id: z.uuid().optional(),
  duration_s: z.coerce.number().positive().max(45, "Voice notes can be at most 45 seconds."),
  feeling,
});

export const createChainLetterSchema = z.object({
  ...coordinates,
  place_id: z.uuid().optional(),
  text: trimmedText(1000),
  answers_letter_id: z.uuid().nullable(),
  theme_prompt: z.string().trim().min(1).max(200).nullish(),
  feeling,
});

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    // Our own messages are full sentences for people; zod's defaults need the field name.
    const message = issue.message.endsWith(".") || !field ? issue.message : `${field}: ${issue.message}`;
    throw new HttpError(400, "invalid_request", message);
  }
  return result.data;
}
