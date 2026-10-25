import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { createFakeAi, createFakeDb, fakeContext } from "./fake-db.js";

const ALKEK = { id: "11111111-1111-4111-8111-111111111111", name: "Alkek Library", lat: 29.8889, lng: -97.9431, radius_m: 50 };
const AT_ALKEK = { lat: 29.8889, lng: -97.9431, accuracy: 12 };
const NEAR_ALKEK_30M = { lat: 29.8889 + 30 / 111320, lng: -97.9431, accuracy: 12 };
const OUTSIDE_ALKEK_100M = { lat: 29.8889 + 100 / 111320, lng: -97.9431, accuracy: 12 };
const FAR_AWAY = { lat: 29.8, lng: -97.8, accuracy: 12 };

async function withApi(db, run, ai = createFakeAi()) {
  const server = createApp({ corsOrigins: ["https://katha.example"], db, ai, context: fakeContext }).listen(0);
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { user = "asha", body, query, audio, contentType } = {}) => {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...(user ? { Authorization: `Bearer token-${user}` } : {}),
        "Content-Type": audio ? contentType ?? "audio/webm" : "application/json",
      },
      body: audio ?? JSON.stringify(body ?? {}),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    await run(call);
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("create endpoints require a signed-in user", async () => {
  await withApi(createFakeDb(), async (call) => {
    const res = await call("/stories", { user: null, body: { ...AT_ALKEK, text: "hi" } });
    assert.equal(res.status, 401);
    assert.equal(res.body.error, "unauthorized");
  });
});

test("stories: posts at the place the user is standing in", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const res = await call("/stories", { body: { ...NEAR_ALKEK_30M, text: "  Late night again.  ", feeling: "tired" } });
    assert.equal(res.status, 201);
    assert.equal(res.body.place.id, ALKEK.id);
    assert.deepEqual(
      { place_id: db.state.stories[0].place_id, author_id: db.state.stories[0].author_id, text: db.state.stories[0].text, feeling: db.state.stories[0].feeling },
      { place_id: ALKEK.id, author_id: "asha", text: "Late night again.", feeling: "tired" },
    );
  });
});

test("stories: rejected outside the radius, with the distance in the message", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const res = await call("/stories", { body: { ...OUTSIDE_ALKEK_100M, place_id: ALKEK.id, text: "hi" } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error, "not_at_place");
    assert.match(res.body.message, /100 m from Alkek Library/);
    assert.equal(db.state.stories.length, 0);
  });
});

test("stories: asks to name the spot when no place is here", async () => {
  await withApi(createFakeDb({ places: [ALKEK] }), async (call) => {
    const res = await call("/stories", { body: { ...FAR_AWAY, text: "hi" } });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, "no_place");
  });
});

test("stories: rejects imprecise GPS and over-long text", async () => {
  await withApi(createFakeDb({ places: [ALKEK] }), async (call) => {
    const imprecise = await call("/stories", { body: { ...AT_ALKEK, accuracy: 900, text: "hi" } });
    assert.equal(imprecise.status, 422);
    assert.equal(imprecise.body.error, "gps_imprecise");

    const tooLong = await call("/stories", { body: { ...AT_ALKEK, text: "x".repeat(201) } });
    assert.equal(tooLong.status, 400);
  });
});

test("places: creates a new place only where none exists", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const taken = await call("/places", { body: { ...NEAR_ALKEK_30M, name: "Alkek steps" } });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.error, "already_at_place");

    const created = await call("/places", { body: { ...FAR_AWAY, name: "Sewell Park bench" } });
    assert.equal(created.status, 201);
    assert.equal(created.body.place.radius_m, 50);
    assert.equal(db.state.places.at(-1).created_by, "asha");
  });
});

test("voice notes: stores the audio privately under the author's folder", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const res = await call("/voice-notes", {
      query: { ...AT_ALKEK, duration_s: 31.5 },
      audio: Buffer.from("fake-opus-bytes"),
      contentType: "audio/webm;codecs=opus",
    });
    assert.equal(res.status, 201);
    const note = db.state.voiceNotes[0];
    assert.match(note.audio_path, /^asha\/[0-9a-f-]+\.webm$/);
    assert.equal(note.duration_s, 31.5);
    assert.ok(db.state.files.has(`voice-notes/${note.audio_path}`));
  });
});

test("voice notes: rejects over 45 seconds and cleans up a failed insert", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const tooLong = await call("/voice-notes", { query: { ...AT_ALKEK, duration_s: 46 }, audio: Buffer.from("x") });
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.body.message, /45 seconds/);

    db.state.failNextVoiceInsert = true;
    const failed = await call("/voice-notes", { query: { ...AT_ALKEK, duration_s: 10 }, audio: Buffer.from("x") });
    assert.equal(failed.status, 500);
    assert.equal(db.state.files.size, 0);
  });
});

test("chain letters: start, answer, and the concurrency and own-letter rules", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const first = await call("/chain-letters", {
      body: { ...AT_ALKEK, text: "Dear next person", answers_letter_id: null, theme_prompt: "What helped you here?" },
    });
    assert.equal(first.status, 201);
    assert.equal(db.state.chains[0].theme_prompt, "What helped you here?");
    const firstId = first.body.letter.id;

    const ownAnswer = await call("/chain-letters", { body: { ...AT_ALKEK, text: "me again", answers_letter_id: firstId } });
    assert.equal(ownAnswer.status, 403);
    assert.equal(ownAnswer.body.error, "own_letter");

    const benReply = await call("/chain-letters", { user: "ben", body: { ...AT_ALKEK, text: "Thank you", answers_letter_id: firstId } });
    assert.equal(benReply.status, 201);
    assert.equal(db.state.chains[0].latest_letter_id, benReply.body.letter.id);

    const stale = await call("/chain-letters", { user: "cara", body: { ...AT_ALKEK, text: "late", answers_letter_id: firstId } });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.message, "Someone just added a new letter, read it first.");

    const restart = await call("/chain-letters", { user: "cara", body: { ...AT_ALKEK, text: "new chain?", answers_letter_id: null } });
    assert.equal(restart.status, 409);

    const away = await call("/chain-letters", {
      user: "cara",
      body: { ...OUTSIDE_ALKEK_100M, place_id: ALKEK.id, text: "from afar", answers_letter_id: benReply.body.letter.id },
    });
    assert.equal(away.status, 403);
    assert.equal(db.state.letters.length, 2);
  });
});

test("chain letters: two writers answering the same letter, only one wins", async () => {
  const db = createFakeDb({ places: [ALKEK] });
  await withApi(db, async (call) => {
    const first = await call("/chain-letters", { body: { ...AT_ALKEK, text: "start", answers_letter_id: null } });
    const answer = (user) =>
      call("/chain-letters", { user, body: { ...AT_ALKEK, text: `from ${user}`, answers_letter_id: first.body.letter.id } });
    const results = await Promise.all([answer("ben"), answer("cara")]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  });
});
