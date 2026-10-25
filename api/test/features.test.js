import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { fallbackFeelingSummary, looksLikeStruggling, createAiFeatures } from "../src/aiFeatures.js";
import { createApp } from "../src/app.js";
import { campusMoment, createContextService, timeOfDay, weatherLabel } from "../src/context.js";
import { sortItems } from "../src/ranking.js";
import { createFakeAi, createFakeDb, fakeContext } from "./fake-db.js";

const ALKEK = { id: "11111111-1111-4111-8111-111111111111", name: "Alkek Library", lat: 29.8889, lng: -97.9431, radius_m: 50 };
const HERE = { lat: 29.8889, lng: -97.9431, accuracy: 10 };
const AWAY = { lat: 29.8889 + 200 / 111320, lng: -97.9431, accuracy: 10 };
const DAY = 24 * 60 * 60 * 1000;

async function withApi({ db = createFakeDb({ places: [ALKEK] }), ai = createFakeAi() } = {}, run) {
  const server = createApp({ corsOrigins: ["https://katha.example"], db, ai, context: fakeContext }).listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { user = "asha", body, query, audio } = {}) => {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer token-${user}`,
        ...(body || audio ? { "Content-Type": audio ? "audio/wav" : "application/json" } : {}),
      },
      body: audio ?? (body ? JSON.stringify(body) : undefined),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  try {
    await run(call, db, ai);
  } finally {
    server.close();
    await once(server, "close");
  }
}

// ── Context stamp ──

test("context: time of day and campus moment use campus time", () => {
  assert.equal(timeOfDay(new Date("2026-12-05T07:30:00Z")), "late_night"); // 1:30 am in Texas
  assert.equal(timeOfDay(new Date("2026-12-05T12:00:00Z")), "dawn"); // 6 am
  assert.equal(timeOfDay(new Date("2026-12-05T20:00:00Z")), "afternoon");
  assert.equal(campusMoment(new Date("2026-12-05T20:00:00Z")), "Finals week");
  assert.equal(campusMoment(new Date("2026-10-01T20:00:00Z")), null);
  assert.equal(weatherLabel(63), "Rain");
  assert.equal(weatherLabel(0), "Clear");
});

test("context: weather comes from Open-Meteo and never blocks posting", async () => {
  const ok = createContextService({
    fetchImpl: async (url) => {
      assert.match(String(url), /api\.open-meteo\.com.*temperature_unit=fahrenheit/);
      return new Response(JSON.stringify({ current: { temperature_2m: 61.4, weather_code: 61 } }));
    },
  });
  assert.deepEqual(
    { ...(await ok.stamp(ALKEK, new Date("2026-12-05T07:30:00Z"))) },
    { time_of_day: "late_night", campus_moment: "Finals week", weather_label: "Rain", weather_temp: 61 },
  );

  const down = createContextService({ fetchImpl: async () => { throw new Error("offline"); } });
  const stamp = await down.stamp(ALKEK);
  assert.equal(stamp.weather_label, null);
  assert.equal(stamp.weather_temp, null);
});

// ── Ranking ──

test("ranking: fresh and unheard first, already-opened items move down", () => {
  const now = Date.now();
  const items = [
    { id: "old-unheard", created_at: new Date(now - 30 * DAY).toISOString() },
    { id: "fresh-popular", created_at: new Date(now - 1 * DAY).toISOString() },
    { id: "fresh-unheard", created_at: new Date(now - 2 * DAY).toISOString() },
    { id: "fresh-opened", created_at: new Date(now - 1 * DAY).toISOString() },
  ];
  const signals = {
    now,
    viewCounts: new Map([["fresh-popular", 9]]),
    feltCounts: new Map(),
    openedByViewer: new Set(["fresh-opened"]),
  };
  assert.deepEqual(
    sortItems(items, "ranked", signals).map((i) => i.id),
    ["fresh-unheard", "old-unheard", "fresh-popular", "fresh-opened"],
  );
  assert.deepEqual(sortItems(items, "oldest", signals)[0].id, "old-unheard");
});

// ── AI features ──

test("ai: fallbacks without a Meta API key", async () => {
  const ai = createAiFeatures(null);
  assert.deepEqual(await ai.moderate("I just want to die after this exam"), { allowed: true, struggling: true });
  assert.deepEqual(await ai.moderate("rough day, coffee helped"), { allowed: true, struggling: false });
  assert.equal(await ai.suggestFeeling("so tired"), null);
  assert.equal(await ai.transcribe(Buffer.from("x")), null);
  assert.equal(await ai.postcard({ placeName: "Alkek" }), null);
  assert.match(await ai.dmOpener({ placeName: "Alkek", storyText: "", commentText: "" }), /Alkek/);
  assert.equal(await ai.feelingSummary(["calm", "tired", "calm"]), "Around you, people have mostly felt calm and tired.");
  assert.equal(fallbackFeelingSummary([]), null);
  assert.equal(looksLikeStruggling("I can't go on like this"), true);
});

test("ai: uses Muse Spark replies and survives bad ones", async () => {
  const replies = ['{"harmful": true, "struggling": false}', "Tired.", "not json at all"];
  const client = { chat: async () => replies.shift() };
  const ai = createAiFeatures(client, { log: { error() {} } });
  assert.deepEqual(await ai.moderate("you are worthless"), { allowed: false, struggling: false });
  assert.equal(await ai.suggestFeeling("long night"), "tired");
  assert.deepEqual(await ai.moderate("hello"), { allowed: true, struggling: false });

  const failing = createAiFeatures({ chat: async () => { throw new Error("503"); } }, { log: { error() {} } });
  assert.equal((await failing.moderate("hello")).allowed, true);
});

// ── Board & unlock (steps 4-6) ──

test("board: stories ranked, locked items teased with stamps only, blocked authors hidden", async () => {
  const db = createFakeDb({ places: [ALKEK], profiles: { ben: "Ben" } });
  const now = Date.now();
  db.state.stories.push(
    { id: "s-old", place_id: ALKEK.id, author_id: "ben", text: "old", created_at: new Date(now - 40 * DAY).toISOString() },
    { id: "s-new", place_id: ALKEK.id, author_id: "ben", text: "new", feeling: "calm", created_at: new Date(now - DAY).toISOString() },
    { id: "s-blocked", place_id: ALKEK.id, author_id: "troll", text: "hidden", created_at: new Date(now).toISOString() },
  );
  db.state.voiceNotes.push({ id: "v1", place_id: ALKEK.id, author_id: "ben", audio_path: "ben/v1.wav", transcript: "secret words", feeling: "lonely", time_of_day: "evening", duration_s: 20, created_at: new Date(now).toISOString() });
  db.state.blocks.push({ blocker_id: "asha", blocked_id: "troll" });

  await withApi({ db }, async (call) => {
    const res = await call("GET", `/places/${ALKEK.id}/board`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.stories.map((s) => s.id), ["s-new", "s-old"]);
    assert.equal(res.body.stories[0].author_name, "Ben");
    assert.equal(res.body.stories[0].felt_count, undefined, "felt counts are private to authors");
    const teaser = res.body.locked.voice_notes[0];
    assert.equal(teaser.feeling, "lonely");
    assert.equal(teaser.transcript, undefined);
    assert.equal(teaser.audio_path, undefined);

    const calm = await call("GET", `/places/${ALKEK.id}/board`, { query: { sort: "feeling", feeling: "calm" } });
    assert.deepEqual(calm.body.stories.map((s) => s.id), ["s-new"]);
  });
});

test("unlock: only at the place; returns signed audio, transcript, and the latest letter", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  db.state.voiceNotes.push({ id: "v1", place_id: ALKEK.id, author_id: "ben", audio_path: "ben/v1.wav", transcript: "hello there", duration_s: 9, created_at: new Date().toISOString() });

  await withApi({ db }, async (call) => {
    const away = await call("POST", `/places/${ALKEK.id}/unlock`, { body: AWAY });
    assert.equal(away.status, 403);

    await call("POST", "/chain-letters", { user: "ben", body: { ...HERE, text: "Dear next person", answers_letter_id: null } });
    const res = await call("POST", `/places/${ALKEK.id}/unlock`, { body: HERE });
    assert.equal(res.status, 200);
    assert.match(res.body.voice_notes[0].audio_url, /signed\.example\/voice-notes\/ben\/v1\.wav/);
    assert.equal(res.body.voice_notes[0].transcript, "hello there");
    assert.equal(res.body.voice_notes[0].audio_path, undefined);
    assert.equal(res.body.chain.latest_letter.text, "Dear next person");
    assert.equal(res.body.chain.latest_letter.is_mine, false);
    assert.equal(db.state.views.length, 1, "reading the letter counts as a view");
  });
});

// ── Felt, views, comments (step 9) ──

test("felt this too: at the place only, once, not on your own item", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  db.state.stories.push({ id: "22222222-2222-4222-8222-222222222222", place_id: ALKEK.id, author_id: "ben", text: "hi", created_at: new Date().toISOString() });
  const item = { item_type: "story", item_id: "22222222-2222-4222-8222-222222222222" };

  await withApi({ db }, async (call) => {
    assert.equal((await call("POST", "/felt", { body: { ...item, ...AWAY } })).status, 403);
    assert.equal((await call("POST", "/felt", { body: { ...item, ...HERE } })).status, 204);
    assert.equal((await call("POST", "/felt", { body: { ...item, ...HERE } })).status, 204);
    assert.equal(db.state.felt.length, 1);
    assert.equal((await call("POST", "/felt", { user: "ben", body: { ...item, ...HERE } })).status, 400);

    assert.equal((await call("POST", "/views", { body: item })).status, 204);
    assert.equal(db.state.views.length, 1);

    const board = await call("GET", `/places/${ALKEK.id}/board`, { user: "ben" });
    assert.equal(board.body.stories[0].felt_count, 1, "the author sees the count");
  });
});

test("comments: from anywhere, moderated, with support flagged gently", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  db.state.stories.push({ id: "22222222-2222-4222-8222-222222222222", place_id: ALKEK.id, author_id: "ben", text: "hi", created_at: new Date().toISOString() });
  const ai = createFakeAi({ harmful: ["idiot"] });

  await withApi({ db, ai }, async (call) => {
    const ok = await call("POST", "/comments", { body: { story_id: "22222222-2222-4222-8222-222222222222", text: "Same here" } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.support, false);

    const rude = await call("POST", "/comments", { body: { story_id: "22222222-2222-4222-8222-222222222222", text: "you idiot" } });
    assert.equal(rude.status, 422);
    assert.equal(rude.body.error, "needs_rewording");

    const struggling = await call("POST", "/comments", { body: { story_id: "22222222-2222-4222-8222-222222222222", text: "I want to die some days" } });
    assert.equal(struggling.status, 201, "never blocked for struggling");
    assert.equal(struggling.body.support, true);

    db.state.blocks.push({ blocker_id: "ben", blocked_id: "asha" });
    const blocked = await call("POST", "/comments", { body: { story_id: "22222222-2222-4222-8222-222222222222", text: "hello?" } });
    assert.equal(blocked.status, 404);
  });
});

// ── DMs (step 10) ──

test("dms: author invites a commenter, recipient must accept before messages", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  db.state.stories.push({ id: "22222222-2222-4222-8222-222222222222", place_id: ALKEK.id, author_id: "asha", text: "Late night again", created_at: new Date().toISOString() });

  await withApi({ db }, async (call) => {
    const comment = await call("POST", "/comments", { user: "ben", body: { story_id: "22222222-2222-4222-8222-222222222222", text: "Me too" } });
    const commentId = comment.body.comment.id;

    assert.equal((await call("POST", "/dm/opener", { user: "cara", body: { comment_id: commentId } })).status, 403);
    const opener = await call("POST", "/dm/opener", { body: { comment_id: commentId } });
    assert.equal(opener.body.message, "Hi from Alkek Library");

    const request = await call("POST", "/dm/requests", { body: { comment_id: commentId, opening_message: "Want to talk?" } });
    assert.equal(request.status, 201);
    const threadId = request.body.thread.id;

    const again = await call("POST", "/dm/requests", { body: { comment_id: commentId, opening_message: "Hello?" } });
    assert.equal(again.status, 409);
    assert.equal(again.body.thread_id, threadId);

    const early = await call("POST", `/dm/threads/${threadId}/messages`, { user: "ben", body: { text: "hi" } });
    assert.equal(early.status, 403);

    db.state.threads[0].status = "accepted";
    assert.equal((await call("POST", `/dm/threads/${threadId}/messages`, { user: "ben", body: { text: "hi" } })).status, 201);
    assert.equal((await call("POST", `/dm/threads/${threadId}/messages`, { user: "cara", body: { text: "hi" } })).status, 404);

    db.state.blocks.push({ blocker_id: "ben", blocked_id: "asha" });
    assert.equal((await call("POST", `/dm/threads/${threadId}/messages`, { body: { text: "hello" } })).status, 403);
  });
});

// ── Composer extras (steps 7, 12) ──

test("stories: photo upload, context stamp, and postcards", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  const ai = createFakeAi({ image: Buffer.from("png-bytes") });
  await withApi({ db, ai }, async (call) => {
    const res = await call("POST", "/stories", {
      body: { ...HERE, text: "View from the 3rd floor", photo_base64: Buffer.from("jpeg-bytes").toString("base64"), photo_type: "image/jpeg" },
    });
    assert.equal(res.status, 201);
    const story = db.state.stories[0];
    assert.match(story.photo_path, /^asha\/.+\.jpg$/);
    assert.ok(db.state.files.has(`story-photos/${story.photo_path}`));
    assert.equal(story.campus_moment, "Finals week");
    assert.equal(story.weather_temp, 61);

    assert.equal((await call("POST", "/postcards", { user: "ben", body: { item_type: "story", item_id: story.id } })).status, 404);
    const postcard = await call("POST", "/postcards", { body: { item_type: "story", item_id: story.id } });
    assert.equal(postcard.status, 201);
    assert.match(postcard.body.postcard.url, /public\.example\/postcards\//);
  });
});

test("stories: the postcard paints itself in the background after posting", async () => {
  const waitFor = async (check) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  };

  const db = createFakeDb({ places: [ALKEK] });
  const ai = createFakeAi({ image: Buffer.from("png-bytes") });
  await withApi({ db, ai }, async (call) => {
    const res = await call("POST", "/stories", { body: { ...HERE, text: "Hello from Welch Hall" } });
    assert.equal(res.status, 201);
    assert.equal(res.body.postcard_pending, true);
    await waitFor(() => db.state.postcards.length === 1);
    assert.equal(db.state.postcards.length, 1);
    assert.equal(db.state.postcards[0].story_id, res.body.story.id);

    const board = await call("GET", `/places/${ALKEK.id}/board`);
    assert.match(board.body.stories[0].postcard_url, /public\.example\/postcards\//);

    const retry = await call("POST", "/postcards", { body: { item_type: "story", item_id: res.body.story.id } });
    assert.equal(retry.status, 201);
    assert.equal(db.state.postcards.length, 1, "never paints a second one");
  });

  const quiet = createFakeDb({ places: [ALKEK] });
  const offline = createFakeAi({ available: false });
  await withApi({ db: quiet, ai: offline }, async (call) => {
    const res = await call("POST", "/stories", { body: { ...HERE, text: "No AI today" } });
    assert.equal(res.body.postcard_pending, false);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(offline.calls.filter(([name]) => name === "postcard").length, 0);
  });
});

test("voice notes: WAV is transcribed, tagged by suggestion, and the author confirms the feeling", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  const ai = createFakeAi({ transcript: "first snow on campus", feeling: "happy" });
  await withApi({ db, ai }, async (call) => {
    const res = await call("POST", "/voice-notes", { query: { ...HERE, duration_s: 12 }, audio: Buffer.from("RIFF....WAVE") });
    assert.equal(res.status, 201);
    assert.equal(res.body.voice_note.transcript, "first snow on campus");
    assert.equal(res.body.suggested_feeling, "happy");
    assert.equal(res.body.voice_note.feeling, null, "suggestion waits for the author");

    const id = res.body.voice_note.id;
    assert.equal((await call("POST", `/voice-notes/${id}/feeling`, { user: "ben", body: { feeling: "happy" } })).status, 404);
    const confirmed = await call("POST", `/voice-notes/${id}/feeling`, { body: { feeling: "happy" } });
    assert.equal(confirmed.body.voice_note.feeling, "happy");
  });
});

test("feeling around you summarizes tags near the user", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  db.state.stories.push({ id: "s", place_id: ALKEK.id, author_id: "ben", feeling: "calm", created_at: new Date().toISOString() });
  await withApi({ db }, async (call) => {
    const res = await call("POST", "/feeling-around", { body: { lat: HERE.lat, lng: HERE.lng } });
    assert.equal(res.body.summary, "Around you: calm");
  });
});

test("voice notes and chain letters get their watercolor too, shown when unlocked", async () => {
  const waitFor = async (check) => {
    for (let i = 0; i < 50 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  };
  const db = createFakeDb({ places: [ALKEK] });
  const ai = createFakeAi({ image: Buffer.from("png-bytes"), transcript: "hello" });
  await withApi({ db, ai }, async (call) => {
    const voice = await call("POST", "/voice-notes", { user: "ben", query: { ...HERE, duration_s: 8 }, audio: Buffer.from("RIFF") });
    assert.equal(voice.body.postcard_pending, true);
    const letter = await call("POST", "/chain-letters", { user: "ben", body: { ...HERE, text: "Dear next person", answers_letter_id: null } });
    assert.equal(letter.body.postcard_pending, true);

    await waitFor(() => db.state.postcards.length === 2);
    assert.deepEqual(
      db.state.postcards.map((p) => (p.voice_note_id ? "voice" : p.chain_letter_id ? "letter" : "story")).sort(),
      ["letter", "voice"],
    );

    const board = await call("GET", `/places/${ALKEK.id}/board`);
    assert.equal(board.body.locked.voice_notes[0].postcard_url, undefined, "locked teasers never include the watercolor");

    const unlocked = await call("POST", `/places/${ALKEK.id}/unlock`, { body: HERE });
    assert.match(unlocked.body.voice_notes[0].postcard_url, /public\.example\/postcards\//);
    assert.match(unlocked.body.chain.latest_letter.postcard_url, /public\.example\/postcards\//);

    const retry = await call("POST", "/postcards", { user: "ben", body: { item_type: "voice_note", item_id: voice.body.voice_note.id } });
    assert.equal(retry.status, 201);
    assert.equal(db.state.postcards.length, 2, "retry returns the existing watercolor");
    assert.equal((await call("POST", "/postcards", { body: { item_type: "chain_letter", item_id: letter.body.letter.id } })).status, 404);
  });
});
