import { HttpError } from "./errors.js";
import { boundingBox } from "./geo.js";

const PLACE_COLUMNS = "id, name, description, lat, lng, radius_m";
const AUTHOR = "author:profiles!author_id(display_name)";
const SIGNED_URL_SECONDS = 300;

function check({ data, error }) {
  if (!error) return data;
  if (error.code === "23503") {
    throw new HttpError(400, "invalid_reference", "Finish setting up your profile first.");
  }
  throw Object.assign(new Error(error.message), { code: error.code });
}

const POSTCARD_COLUMN = { story: "story_id", voice_note: "voice_note_id", chain_letter: "chain_letter_id" };

// Replaces an embedded postcards(image_path) list with a single public URL.
const withPostcardUrl = (row, db) => {
  const { postcards, ...rest } = row;
  const path = postcards?.[0]?.image_path;
  return { ...rest, postcard_url: path ? db.publicUrl("postcards", path) : null };
};

const withAuthorName = (row) => {
  if (!row) return row;
  const { author, ...rest } = row;
  return { ...rest, author_name: author?.display_name ?? "Someone" };
};

// All service_role database and storage access. The service role bypasses RLS,
// so callers apply block filtering themselves via blockedUserIds().
// Routes depend on this interface only, so tests can swap in an in-memory version.
export function createDb(supabase) {
  const table = (name) => supabase.from(name);

  return {
    async userIdFromToken(token) {
      const { data, error } = await supabase.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },

    async blockedUserIds(userId) {
      const rows = check(
        await table("blocks").select("blocker_id, blocked_id").or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      );
      return new Set(rows.map((r) => (r.blocker_id === userId ? r.blocked_id : r.blocker_id)));
    },

    // ── Places ──
    async getPlace(id) {
      return check(await table("places").select(PLACE_COLUMNS).eq("id", id).maybeSingle());
    },

    async placesNear(point, meters) {
      const box = boundingBox(point, meters);
      return check(
        await table("places")
          .select(PLACE_COLUMNS)
          .gte("lat", box.south)
          .lte("lat", box.north)
          .gte("lng", box.west)
          .lte("lng", box.east),
      );
    },

    async feelingsNear(point, meters, limit = 40) {
      const places = await this.placesNear(point, meters);
      if (!places.length) return [];
      const ids = places.map((p) => p.id);
      const [stories, voices] = await Promise.all([
        table("stories").select("author_id, feeling, created_at").in("place_id", ids).not("feeling", "is", null).order("created_at", { ascending: false }).limit(limit),
        table("voice_notes").select("author_id, feeling, created_at").in("place_id", ids).not("feeling", "is", null).order("created_at", { ascending: false }).limit(limit),
      ]);
      return [...check(stories), ...check(voices)];
    },

    async insertPlace(row) {
      return check(await table("places").insert(row).select(PLACE_COLUMNS).single());
    },

    // ── Content at a place ──
    async storiesAtPlace(placeId) {
      const rows = check(
        await table("stories").select(`*, ${AUTHOR}, comments(count), postcards(image_path)`).eq("place_id", placeId),
      );
      return rows.map((r) => {
        const { comments, ...rest } = withPostcardUrl(withAuthorName(r), this);
        return { ...rest, comment_count: comments?.[0]?.count ?? 0 };
      });
    },

    async voiceNotesAtPlace(placeId) {
      const rows = check(await table("voice_notes").select(`*, ${AUTHOR}, postcards(image_path)`).eq("place_id", placeId));
      return rows.map((r) => withPostcardUrl(withAuthorName(r), this));
    },

    async getChainByPlace(placeId) {
      return check(await table("chains").select("*").eq("place_id", placeId).maybeSingle());
    },

    async getChainLetter(id) {
      const row = check(await table("chain_letters").select("*, postcards(image_path)").eq("id", id).maybeSingle());
      return row && withPostcardUrl(row, this);
    },

    async getStory(id) {
      return check(
        await table("stories").select(`*, ${AUTHOR}, place:places(${PLACE_COLUMNS})`).eq("id", id).maybeSingle(),
      );
    },

    // { id, place_id, author_id } for any item type, or null.
    async getItemRef(itemType, id) {
      if (itemType === "chain_letter") {
        const row = check(
          // chains also points back at chain_letters (latest_letter_id), so name the link.
          await table("chain_letters").select("id, author_id, chain:chains!chain_id(place_id)").eq("id", id).maybeSingle(),
        );
        return row && { id: row.id, author_id: row.author_id, place_id: row.chain.place_id };
      }
      const name = itemType === "story" ? "stories" : "voice_notes";
      return check(await table(name).select("id, place_id, author_id").eq("id", id).maybeSingle());
    },

    // ── Signals for ranking ──
    async viewSignals(itemType, ids, userId) {
      const viewCounts = new Map();
      const openedByViewer = new Set();
      if (ids.length) {
        const rows = check(await table("item_views").select("item_id, user_id").eq("item_type", itemType).in("item_id", ids));
        for (const r of rows) {
          viewCounts.set(r.item_id, (viewCounts.get(r.item_id) ?? 0) + 1);
          if (r.user_id === userId) openedByViewer.add(r.item_id);
        }
      }
      return { viewCounts, openedByViewer };
    },

    async feltSignals(itemType, ids, userId) {
      const feltCounts = new Map();
      const feltByViewer = new Set();
      if (ids.length) {
        const rows = check(await table("felt_this_too").select("item_id, user_id").eq("item_type", itemType).in("item_id", ids));
        for (const r of rows) {
          feltCounts.set(r.item_id, (feltCounts.get(r.item_id) ?? 0) + 1);
          if (r.user_id === userId) feltByViewer.add(r.item_id);
        }
      }
      return { feltCounts, feltByViewer };
    },

    async recordViews(rows) {
      if (!rows.length) return;
      check(await table("item_views").upsert(rows, { onConflict: "item_type,item_id,user_id", ignoreDuplicates: true }));
    },

    async insertFelt(row) {
      check(await table("felt_this_too").upsert(row, { onConflict: "item_type,item_id,user_id", ignoreDuplicates: true }));
    },

    // ── Creating content ──
    async insertStory(row) {
      return check(await table("stories").insert(row).select().single());
    },

    async insertVoiceNote(row) {
      return check(await table("voice_notes").insert(row).select().single());
    },

    async updateVoiceFeeling(id, authorId, feeling) {
      return check(
        await table("voice_notes").update({ feeling }).eq("id", id).eq("author_id", authorId).select().maybeSingle(),
      );
    },

    // Returns null when another visitor started this place's chain first.
    async insertChain(row) {
      const result = await table("chains").insert(row).select().single();
      if (result.error?.code === "23505") return null;
      return check(result);
    },

    // Returns null when another letter already answered the same letter.
    async insertChainLetter(row) {
      const result = await table("chain_letters").insert(row).select().single();
      if (result.error?.code === "23505") return null;
      return check(result);
    },

    // ── Comments & DMs ──
    async insertComment(row) {
      return withAuthorName(check(await table("comments").insert(row).select(`*, ${AUTHOR}`).single()));
    },

    async getComment(id) {
      return check(await table("comments").select("id, story_id, author_id, text").eq("id", id).maybeSingle());
    },

    async threadBetween(a, b) {
      return check(
        await table("dm_threads")
          .select("*")
          .or(`and(requester_id.eq.${a},recipient_id.eq.${b}),and(requester_id.eq.${b},recipient_id.eq.${a})`)
          .maybeSingle(),
      );
    },

    async insertThread(row) {
      const result = await table("dm_threads").insert(row).select().single();
      if (result.error?.code === "23505") return null;
      return check(result);
    },

    async getThread(id) {
      return check(await table("dm_threads").select("*").eq("id", id).maybeSingle());
    },

    async insertMessage(row) {
      return check(await table("dm_messages").insert(row).select().single());
    },

    async getPostcardFor(itemType, itemId) {
      const row = check(
        await table("postcards").select("*").eq(POSTCARD_COLUMN[itemType], itemId).limit(1).maybeSingle(),
      );
      return row && { ...row, url: this.publicUrl("postcards", row.image_path) };
    },

    // One watercolor per item; a concurrent second one returns the first.
    async insertPostcard(itemType, itemId, imagePath) {
      const result = await table("postcards")
        .insert({ [POSTCARD_COLUMN[itemType]]: itemId, image_path: imagePath })
        .select()
        .single();
      if (result.error?.code === "23505") {
        await this.remove("postcards", imagePath);
        return this.getPostcardFor(itemType, itemId);
      }
      const row = check(result);
      return { ...row, url: this.publicUrl("postcards", row.image_path) };
    },

    // What a watercolor is painted from: the item's mood, stamp, author and place.
    async getPostcardSubject(itemType, id) {
      const fields = "id, author_id, feeling, weather_label, time_of_day";
      if (itemType === "chain_letter") {
        const row = check(
          await table("chain_letters").select(`${fields}, chain:chains!chain_id(place:places(${PLACE_COLUMNS}))`).eq("id", id).maybeSingle(),
        );
        if (!row) return null;
        const { chain, ...rest } = row;
        return { ...rest, place: chain.place };
      }
      const name = itemType === "story" ? "stories" : "voice_notes";
      return check(await table(name).select(`${fields}, place:places(${PLACE_COLUMNS})`).eq("id", id).maybeSingle());
    },

    // ── Storage ──
    async upload(bucket, path, body, contentType) {
      const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType });
      if (error) throw new Error(`${bucket} upload failed: ${error.message}`);
    },

    async remove(bucket, path) {
      await supabase.storage.from(bucket).remove([path]);
    },

    async download(bucket, path) {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      if (error) throw new Error(`${bucket} download failed: ${error.message}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async signedUrls(bucket, paths) {
      if (!paths.length) return new Map();
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS);
      if (error) throw new Error(`signing ${bucket} failed: ${error.message}`);
      return new Map(data.map((d) => [d.path, d.signedUrl]));
    },

    publicUrl(bucket, path) {
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    },
  };
}
