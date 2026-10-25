import { supabase } from "./supabase";

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function sendLoginCode(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

export async function verifyLoginCode(email, code) {
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ─── Profiles ────────────────────────────────────────────────────────────────

export async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProfile({ id, display_name }) {
  const { data, error } = await supabase
    .from("profiles")
    .insert({ id, display_name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, { display_name }) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name })
    .eq("id", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Katha api server (GPS checks, moderation, AI) ───────────────────────────

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

async function callApi(path, { method = "POST", body, audio, query } = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ""}`,
        ...(audio ? { "Content-Type": audio.type } : body ? { "Content-Type": "application/json" } : {}),
      },
      body: audio ?? (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new Error("Could not reach the Katha server. Try again in a moment.");
  }
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(
      new Error(payload.message ?? "Something went wrong. Please try again."),
      { code: payload.error, details: payload },
    );
  }
  return payload;
}

const coords = ({ lat, lng, accuracy }) => ({ lat, lng, accuracy });

// ─── Places & the map ────────────────────────────────────────────────────────

export async function getPlaceSummaries({ north, south, east, west }) {
  const normalize = (value) => ((value + 180) % 360 + 360) % 360 - 180;
  const wide = east - west >= 360;
  const { data, error } = await supabase.rpc("place_summaries", {
    south,
    north,
    west: wide ? -180 : normalize(west),
    east: wide ? 180 : normalize(east),
  });
  if (error) throw error;
  return data ?? [];
}

export async function getPlace(id) {
  const { data, error } = await supabase
    .from("places")
    .select("id, name, description, lat, lng, radius_m")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPlace({ name, ...location }) {
  const { place } = await callApi("/places", { body: { ...coords(location), name } });
  return place;
}

export async function getBoard(placeId, { sort, feeling } = {}) {
  return callApi(`/places/${placeId}/board`, { method: "GET", query: { sort, feeling } });
}

// Voice notes (with ~5 minute audio links) and the chain's latest letter; only at the place.
export async function unlockPlace(placeId, location) {
  return callApi(`/places/${placeId}/unlock`, { body: coords(location) });
}

export async function feelingAround({ lat, lng }) {
  const { summary } = await callApi("/feeling-around", { body: { lat, lng } });
  return summary;
}

// ─── Creating (only at the place) ────────────────────────────────────────────

export async function createStory({ place_id, text, feeling, photo, ...location }) {
  return callApi("/stories", {
    body: {
      ...coords(location),
      place_id,
      text,
      feeling,
      photo_base64: photo?.base64,
      photo_type: photo?.type,
    },
  });
}

export async function createVoiceNote({ place_id, audio, duration_s, feeling, ...location }) {
  return callApi("/voice-notes", {
    audio,
    query: { ...coords(location), place_id, duration_s: duration_s.toFixed(1), feeling },
  });
}

export async function setVoiceFeeling(id, feeling) {
  return callApi(`/voice-notes/${id}/feeling`, { body: { feeling } });
}

export async function createChainLetter({ place_id, text, answers_letter_id, theme_prompt, feeling, ...location }) {
  return callApi("/chain-letters", {
    body: { ...coords(location), place_id, text, answers_letter_id, theme_prompt, feeling },
  });
}

export async function suggestFeeling(text) {
  const { feeling } = await callApi("/ai/feeling", { body: { text } });
  return feeling;
}

// AI watercolors are painted automatically after posting; this retries for the author.
export async function createPostcard(item_type, item_id) {
  const { postcard } = await callApi("/postcards", { body: { item_type, item_id } });
  return postcard;
}

const POSTCARD_COLUMN = { story: "story_id", voice_note: "voice_note_id", chain_letter: "chain_letter_id" };
const postcardUrl = (path) => supabase.storage.from("postcards").getPublicUrl(path).data.publicUrl;

// Readable for stories by anyone, and for voice notes and letters by their author.
export async function getPostcardUrl(itemType, itemId) {
  const { data, error } = await supabase
    .from("postcards")
    .select("image_path")
    .eq(POSTCARD_COLUMN[itemType], itemId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? postcardUrl(data.image_path) : null;
}

// ─── Stories, views, felt ────────────────────────────────────────────────────

const AUTHOR = "author:profiles!author_id(display_name)";

export function storyPhotoUrl(path) {
  return path ? supabase.storage.from("story-photos").getPublicUrl(path).data.publicUrl : null;
}

export async function getStory(id) {
  const { data, error } = await supabase
    .from("stories")
    .select(`*, place:places(id, name, lat, lng, radius_m), ${AUTHOR}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, author_name: data.author?.display_name ?? "Someone", photo_url: storyPhotoUrl(data.photo_path) };
}

export async function getPostcards(storyId) {
  const { data, error } = await supabase
    .from("postcards")
    .select("*")
    .eq("story_id", storyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({
    ...p,
    url: supabase.storage.from("postcards").getPublicUrl(p.image_path).data.publicUrl,
  }));
}

export async function recordView(item_type, item_id) {
  await callApi("/views", { body: { item_type, item_id } }).catch(() => {});
}

export async function feltThisToo(item_type, item_id, location) {
  await callApi("/felt", { body: { item_type, item_id, ...coords(location) } });
}

export async function hasFelt(item_type, item_id) {
  const { data, error } = await supabase
    .from("felt_this_too")
    .select("item_id")
    .eq("item_type", item_type)
    .eq("item_id", item_id)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function getMyFeltCounts() {
  const { data, error } = await supabase.rpc("my_felt_counts");
  if (error) throw error;
  return new Map((data ?? []).map((r) => [`${r.item_type}:${r.item_id}`, r.count]));
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function getComments(storyId) {
  const { data, error } = await supabase
    .from("comments")
    .select(`*, ${AUTHOR}`)
    .eq("story_id", storyId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c) => ({ ...c, author_name: c.author?.display_name ?? "Someone" }));
}

export async function createComment({ story_id, text }) {
  return callApi("/comments", { body: { story_id, text } });
}

// ─── My Katha ────────────────────────────────────────────────────────────────

export async function getMyKatha(userId) {
  const [stories, voiceNotes, letters, comments] = await Promise.all([
    supabase.from("stories").select("*, place:places(id, name), postcards(image_path)").eq("author_id", userId).order("created_at", { ascending: false }),
    supabase.from("voice_notes").select("*, place:places(id, name), postcards(image_path)").eq("author_id", userId).order("created_at", { ascending: false }),
    // chains also points back at chain_letters (latest_letter_id), so name the link.
    supabase.from("chain_letters").select("*, chain:chains!chain_id(place:places(id, name)), postcards(image_path)").eq("author_id", userId).order("created_at", { ascending: false }),
    supabase.from("comments").select("*, story:stories(id, text, place:places(id, name))").eq("author_id", userId).order("created_at", { ascending: false }),
  ]);
  for (const result of [stories, voiceNotes, letters, comments]) if (result.error) throw result.error;
  return {
    stories: stories.data.map(({ postcards, ...s }) => ({
      ...s,
      photo_url: storyPhotoUrl(s.photo_path),
      postcard_url: postcards?.[0] ? postcardUrl(postcards[0].image_path) : null,
    })),
    voiceNotes: voiceNotes.data.map(({ postcards, ...v }) => ({
      ...v,
      postcard_url: postcards?.[0] ? postcardUrl(postcards[0].image_path) : null,
    })),
    letters: letters.data.map(({ postcards, ...l }) => ({
      ...l,
      place: l.chain?.place ?? null,
      postcard_url: postcards?.[0] ? postcardUrl(postcards[0].image_path) : null,
    })),
    comments: comments.data.map((c) => ({ ...c, place: c.story?.place ?? null })),
  };
}

// Authors can always play their own voice notes (storage policy on their folder).
export async function myVoiceUrl(path) {
  const { data, error } = await supabase.storage.from("voice-notes").createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

// ─── DMs ─────────────────────────────────────────────────────────────────────

// People in a thread, plus the comment (and its story and place) that started it.
const THREAD_PEOPLE =
  "requester:profiles!requester_id(display_name), recipient:profiles!recipient_id(display_name), " +
  "source:comments!source_comment_id(text, story:stories(id, text, place:places(name)))";

function withOtherPerson(thread, userId) {
  const mine = thread.requester_id === userId;
  return {
    ...thread,
    other_id: mine ? thread.recipient_id : thread.requester_id,
    other_name: (mine ? thread.recipient : thread.requester)?.display_name ?? "Someone",
    i_requested: mine,
  };
}

export async function suggestDmOpener(comment_id) {
  const { message } = await callApi("/dm/opener", { body: { comment_id } });
  return message;
}

export async function requestDm({ comment_id, opening_message }) {
  return callApi("/dm/requests", { body: { comment_id, opening_message } });
}

export async function getThreads(userId) {
  const { data, error } = await supabase
    .from("dm_threads")
    .select(`*, ${THREAD_PEOPLE}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((t) => withOtherPerson(t, userId));
}

export async function getThread(id, userId) {
  const { data, error } = await supabase
    .from("dm_threads")
    .select(`*, ${THREAD_PEOPLE}`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? withOtherPerson(data, userId) : null;
}

export async function answerDmRequest(id, status) {
  const { error } = await supabase.from("dm_threads").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function getMessages(threadId) {
  const { data, error } = await supabase
    .from("dm_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function sendMessage(threadId, text) {
  return callApi(`/dm/threads/${threadId}/messages`, { body: { text } });
}

export async function markMessagesRead(threadId, userId) {
  await supabase
    .from("dm_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", userId)
    .is("read_at", null);
}

export function subscribeToMessages(threadId, onMessage) {
  const channel = supabase
    .channel(`dm:${threadId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "dm_messages", filter: `thread_id=eq.${threadId}` },
      (payload) => onMessage(payload.new),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function getNotifications() {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

export async function markNotificationsRead(ids) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
  if (error) throw error;
}

export function subscribeToNotifications(userId, onNotification) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      (payload) => onNotification(payload.new),
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ─── Safety ──────────────────────────────────────────────────────────────────

export async function reportItem({ item_type, item_id, reason }, userId) {
  const { error } = await supabase
    .from("reports")
    .insert({ reporter_id: userId, item_type, item_id, reason: reason || null });
  if (error && error.code !== "23505") throw error;
}

export async function blockUser(blockedId, userId) {
  const { error } = await supabase.from("blocks").insert({ blocker_id: userId, blocked_id: blockedId });
  if (error && error.code !== "23505") throw error;
}

export async function unblockUser(blockedId, userId) {
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", blockedId);
  if (error) throw error;
}

export async function getBlockedPeople() {
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, created_at, blocked:profiles!blocked_id(display_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((b) => ({ id: b.blocked_id, name: b.blocked?.display_name ?? "Someone" }));
}
