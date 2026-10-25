import express, { Router } from "express";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { parse } from "../validation.js";

const text = (max) => z.string().trim().min(1, "Write something first.").max(max);

export const needsRewording = () =>
  new HttpError(422, "needs_rewording", "This might hurt someone. Could you say it a little more gently?");

// Moderation never blocks someone for struggling; it only flags support resources.
export async function moderateOrThrow(ai, content) {
  const verdict = await ai.moderate(content);
  if (!verdict.allowed) throw needsRewording();
  return { support: verdict.struggling };
}

async function storyFor(db, userId, storyId) {
  const story = await db.getStory(storyId);
  const blocked = story ? await db.blockedUserIds(userId) : null;
  if (!story || blocked.has(story.author_id)) {
    throw new HttpError(404, "story_not_found", "That story is no longer here.");
  }
  return story;
}

// The story's author may invite a commenter on that story to chat.
async function dmTarget(db, userId, commentId) {
  const comment = await db.getComment(commentId);
  if (!comment) throw new HttpError(404, "comment_not_found", "That comment is no longer here.");
  const story = await db.getStory(comment.story_id);
  if (story?.author_id !== userId) {
    throw new HttpError(403, "not_story_author", "Only the story's author can start a conversation here.");
  }
  if (comment.author_id === userId) throw new HttpError(400, "own_comment", "That comment is yours.");
  if ((await db.blockedUserIds(userId)).has(comment.author_id)) {
    throw new HttpError(403, "blocked", "You can't message this person.");
  }
  return { comment, story };
}

export function socialRouter(db, ai) {
  const router = Router();
  router.use(express.json({ limit: "16kb" }));

  // Public comments on stories, from anywhere.
  router.post("/comments", async (req, res) => {
    const input = parse(z.object({ story_id: z.uuid(), text: text(500) }), req.body);
    await storyFor(db, req.userId, input.story_id);
    const { support } = await moderateOrThrow(ai, input.text);
    const comment = await db.insertComment({ story_id: input.story_id, author_id: req.userId, text: input.text });
    res.status(201).json({ comment, support });
  });

  router.post("/dm/opener", async (req, res) => {
    const { comment_id } = parse(z.object({ comment_id: z.uuid() }), req.body);
    const { comment, story } = await dmTarget(db, req.userId, comment_id);
    const message = await ai.dmOpener({ storyText: story.text, commentText: comment.text, placeName: story.place.name });
    res.json({ message });
  });

  router.post("/dm/requests", async (req, res) => {
    const input = parse(z.object({ comment_id: z.uuid(), opening_message: text(500) }), req.body);
    const { comment } = await dmTarget(db, req.userId, input.comment_id);
    const existing = await db.threadBetween(req.userId, comment.author_id);
    if (existing) {
      throw new HttpError(409, "thread_exists", "You already have a conversation with this person.", {
        thread_id: existing.id,
      });
    }
    const { support } = await moderateOrThrow(ai, input.opening_message);
    const thread = await db.insertThread({
      requester_id: req.userId,
      recipient_id: comment.author_id,
      source_comment_id: comment.id,
      opening_message: input.opening_message,
    });
    if (!thread) throw new HttpError(409, "thread_exists", "You already have a conversation with this person.");
    res.status(201).json({ thread, support });
  });

  router.post("/dm/threads/:id/messages", async (req, res) => {
    const input = parse(z.object({ text: text(2000) }), req.body);
    const thread = await db.getThread(req.params.id);
    if (!thread || ![thread.requester_id, thread.recipient_id].includes(req.userId)) {
      throw new HttpError(404, "thread_not_found", "That conversation is no longer here.");
    }
    const other = thread.requester_id === req.userId ? thread.recipient_id : thread.requester_id;
    if (thread.status !== "accepted" || (await db.blockedUserIds(req.userId)).has(other)) {
      throw new HttpError(403, "thread_closed", "You can't send messages in this conversation.");
    }
    const { support } = await moderateOrThrow(ai, input.text);
    const message = await db.insertMessage({ thread_id: thread.id, sender_id: req.userId, text: input.text });
    res.status(201).json({ message, support });
  });

  router.post("/ai/feeling", async (req, res) => {
    const input = parse(z.object({ text: text(1000) }), req.body);
    res.json({ feeling: await ai.suggestFeeling(input.text) });
  });

  // One line about how people nearby have felt, from feeling tags only.
  router.post("/feeling-around", async (req, res) => {
    const point = parse(
      z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
      req.body,
    );
    const blocked = await db.blockedUserIds(req.userId);
    const feelings = (await db.feelingsNear(point, 1500))
      .filter((f) => !blocked.has(f.author_id))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((f) => f.feeling);
    res.json({ summary: await ai.feelingSummary(feelings) });
  });

  return router;
}
