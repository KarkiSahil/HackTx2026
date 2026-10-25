import { randomUUID } from "node:crypto";
import { boundingBox } from "../src/geo.js";

const POSTCARD_COLUMN = { story: "story_id", voice_note: "voice_note_id", chain_letter: "chain_letter_id" };

// In-memory stand-in for src/db.js. Mirrors the database rules the routes rely on:
// one chain per place, one opening letter per chain, each letter answered once,
// one thread per pair, and the trigger that moves chains.latest_letter_id.
export function createFakeDb({ places = [], profiles = {} } = {}) {
  const state = {
    places: places.map((p) => ({ radius_m: 50, ...p })),
    stories: [],
    voiceNotes: [],
    chains: [],
    letters: [],
    comments: [],
    threads: [],
    messages: [],
    views: [],
    felt: [],
    blocks: [],
    postcards: [],
    files: new Map(),
    failNextVoiceInsert: false,
  };
  const name = (id) => profiles[id] ?? id;
  const withName = (row) => ({ ...row, author_name: name(row.author_id) });
  const urlFor = (column, id) => {
    const postcard = state.postcards.find((p) => p[column] === id);
    return postcard ? `https://public.example/postcards/${postcard.image_path}` : null;
  };
  const signals = (rows, ids, userId) => {
    const counts = new Map();
    const mine = new Set();
    for (const r of rows.filter((r) => ids.includes(r.item_id))) {
      counts.set(r.item_id, (counts.get(r.item_id) ?? 0) + 1);
      if (r.user_id === userId) mine.add(r.item_id);
    }
    return { counts, mine };
  };

  return {
    state,

    async userIdFromToken(token) {
      return token.startsWith("token-") ? token.slice("token-".length) : null;
    },

    async blockedUserIds(userId) {
      return new Set(
        state.blocks
          .filter((b) => b.blocker_id === userId || b.blocked_id === userId)
          .map((b) => (b.blocker_id === userId ? b.blocked_id : b.blocker_id)),
      );
    },

    async getPlace(id) {
      return state.places.find((p) => p.id === id) ?? null;
    },

    async placesNear(point, meters) {
      const box = boundingBox(point, meters);
      return state.places.filter(
        (p) => p.lat >= box.south && p.lat <= box.north && p.lng >= box.west && p.lng <= box.east,
      );
    },

    async feelingsNear(point, meters) {
      const ids = (await this.placesNear(point, meters)).map((p) => p.id);
      return [...state.stories, ...state.voiceNotes].filter((i) => ids.includes(i.place_id) && i.feeling);
    },

    async insertPlace(row) {
      const place = { id: randomUUID(), ...row };
      state.places.push(place);
      return place;
    },

    async storiesAtPlace(placeId) {
      return state.stories
        .filter((s) => s.place_id === placeId)
        .map((s) => {
          return {
            ...withName(s),
            comment_count: state.comments.filter((c) => c.story_id === s.id).length,
            postcard_url: urlFor("story_id", s.id),
          };
        });
    },

    async voiceNotesAtPlace(placeId) {
      return state.voiceNotes.filter((v) => v.place_id === placeId).map((v) => ({ ...withName(v), postcard_url: urlFor("voice_note_id", v.id) }));
    },

    async getChainByPlace(placeId) {
      return state.chains.find((c) => c.place_id === placeId) ?? null;
    },

    async getChainLetter(id) {
      const letter = state.letters.find((l) => l.id === id);
      return letter ? { ...letter, postcard_url: urlFor("chain_letter_id", id) } : null;
    },

    async getStory(id) {
      const story = state.stories.find((s) => s.id === id);
      return story ? { ...withName(story), place: state.places.find((p) => p.id === story.place_id) } : null;
    },

    async getItemRef(itemType, id) {
      if (itemType === "chain_letter") {
        const letter = state.letters.find((l) => l.id === id);
        if (!letter) return null;
        const chain = state.chains.find((c) => c.id === letter.chain_id);
        return { id, author_id: letter.author_id, place_id: chain.place_id };
      }
      const list = itemType === "story" ? state.stories : state.voiceNotes;
      return list.find((i) => i.id === id) ?? null;
    },

    async viewSignals(itemType, ids, userId) {
      const { counts, mine } = signals(state.views.filter((v) => v.item_type === itemType), ids, userId);
      return { viewCounts: counts, openedByViewer: mine };
    },

    async feltSignals(itemType, ids, userId) {
      const { counts, mine } = signals(state.felt.filter((f) => f.item_type === itemType), ids, userId);
      return { feltCounts: counts, feltByViewer: mine };
    },

    async recordViews(rows) {
      for (const row of rows) {
        const exists = state.views.some(
          (v) => v.item_type === row.item_type && v.item_id === row.item_id && v.user_id === row.user_id,
        );
        if (!exists) state.views.push(row);
      }
    },

    async insertFelt(row) {
      const exists = state.felt.some(
        (f) => f.item_type === row.item_type && f.item_id === row.item_id && f.user_id === row.user_id,
      );
      if (!exists) state.felt.push(row);
    },

    async insertStory(row) {
      const story = { created_at: new Date().toISOString(), ...row };
      state.stories.push(story);
      return story;
    },

    async insertVoiceNote(row) {
      if (state.failNextVoiceInsert) {
        state.failNextVoiceInsert = false;
        throw new Error("insert failed");
      }
      const note = { created_at: new Date().toISOString(), ...row };
      state.voiceNotes.push(note);
      return note;
    },

    async updateVoiceFeeling(id, authorId, feeling) {
      const note = state.voiceNotes.find((v) => v.id === id && v.author_id === authorId);
      if (!note) return null;
      note.feeling = feeling;
      return note;
    },

    async insertChain(row) {
      if (state.chains.some((c) => c.place_id === row.place_id)) return null;
      const chain = { id: randomUUID(), latest_letter_id: null, ...row };
      state.chains.push(chain);
      return chain;
    },

    async insertChainLetter(row) {
      const clash = state.letters.some(
        (l) =>
          l.chain_id === row.chain_id &&
          (row.answers_letter_id ? l.answers_letter_id === row.answers_letter_id : l.answers_letter_id === null),
      );
      if (clash) return null;
      const letter = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
      state.letters.push(letter);
      state.chains.find((c) => c.id === row.chain_id).latest_letter_id = letter.id;
      return letter;
    },

    async insertComment(row) {
      const comment = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
      state.comments.push(comment);
      return withName(comment);
    },

    async getComment(id) {
      return state.comments.find((c) => c.id === id) ?? null;
    },

    async threadBetween(a, b) {
      return (
        state.threads.find(
          (t) => (t.requester_id === a && t.recipient_id === b) || (t.requester_id === b && t.recipient_id === a),
        ) ?? null
      );
    },

    async insertThread(row) {
      if (await this.threadBetween(row.requester_id, row.recipient_id)) return null;
      const thread = { id: randomUUID(), status: "requested", ...row };
      state.threads.push(thread);
      return thread;
    },

    async getThread(id) {
      return state.threads.find((t) => t.id === id) ?? null;
    },

    async insertMessage(row) {
      const message = { id: randomUUID(), ...row };
      state.messages.push(message);
      return message;
    },

    async getPostcardFor(itemType, itemId) {
      const postcard = state.postcards.find((p) => p[POSTCARD_COLUMN[itemType]] === itemId);
      return postcard ? { ...postcard, url: this.publicUrl("postcards", postcard.image_path) } : null;
    },

    async insertPostcard(itemType, itemId, imagePath) {
      const existing = await this.getPostcardFor(itemType, itemId);
      if (existing) return existing;
      const postcard = { id: randomUUID(), [POSTCARD_COLUMN[itemType]]: itemId, image_path: imagePath };
      state.postcards.push(postcard);
      return { ...postcard, url: this.publicUrl("postcards", imagePath) };
    },

    async getPostcardSubject(itemType, id) {
      const ref = await this.getItemRef(itemType, id);
      if (!ref) return null;
      const list = { story: state.stories, voice_note: state.voiceNotes, chain_letter: state.letters }[itemType];
      const item = list.find((i) => i.id === id);
      return { ...item, place: state.places.find((p) => p.id === ref.place_id) };
    },

    async upload(bucket, path, body) {
      state.files.set(`${bucket}/${path}`, body);
    },

    async remove(bucket, path) {
      state.files.delete(`${bucket}/${path}`);
    },

    async signedUrls(bucket, paths) {
      return new Map(paths.map((p) => [p, `https://signed.example/${bucket}/${p}?token=short`]));
    },

    publicUrl(bucket, path) {
      return `https://public.example/${bucket}/${path}`;
    },
  };
}

// AI stand-in: deterministic, and records what it was asked.
export function createFakeAi({ harmful = [], transcript = null, feeling = null, image = null, available = true } = {}) {
  const calls = [];
  return {
    calls,
    available,
    async moderate(text) {
      calls.push(["moderate", text]);
      return { allowed: !harmful.some((h) => text.includes(h)), struggling: /want to die/i.test(text) };
    },
    async suggestFeeling(text) {
      calls.push(["suggestFeeling", text]);
      return feeling;
    },
    async dmOpener({ placeName }) {
      return `Hi from ${placeName}`;
    },
    async feelingSummary(feelings) {
      return feelings.length ? `Around you: ${feelings.join(", ")}` : null;
    },
    async transcribe(wav) {
      calls.push(["transcribe", wav.length]);
      return transcript;
    },
    async postcard() {
      calls.push(["postcard"]);
      return image;
    },
  };
}

export const fakeContext = {
  async stamp() {
    return { time_of_day: "late_night", weather_label: "Rain", weather_temp: 61, campus_moment: "Finals week" };
  },
};
