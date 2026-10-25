# Katha - project context

Katha (meaning "story/tale") is a memory for places. Stories, voice notes, and chain letters can only be CREATED while physically at a place and stay pinned there. Stories are readable from anywhere; voice notes and chain letters unlock only at the place. The full v1 feature spec is the source of truth; when old code conflicts with it, change the code to match.

Platform: a responsive browser single-page app. NOT a PWA (no manifest, no install prompt, no offline mode).

Stack: React + Vite in JavaScript (not TypeScript), Tailwind CSS v4, lucide-react icons, react-router-dom v6, Leaflet/react-leaflet with OpenStreetMap tiles, @supabase/supabase-js, Vitest + React Testing Library + jsdom, ESLint. Express API container in `api/`. Two Docker containers; GitHub Actions CI and deploy to Render.

Database (Supabase; full definition in supabase/schema.sql):

- profiles, places(lat, lng, radius_m)
- stories (text ≤200, optional photo), voice_notes (≤45 s, private), chains (one per place) + chain_letters (≤1000, private)
- context fields on content: feeling, time_of_day, weather_label, weather_temp (°F), campus_moment
- felt_this_too, item_views, comments, dm_threads, dm_messages, postcards, notifications, reports, blocks
- legacy_notes / legacy_replies: pre-v1 data kept read-only for its authors

Schema changes: edit supabase/schema.sql so it stays runnable on fresh and existing databases, and add a migration under supabase/migrations/ when existing rows must move. Never drop a table with data without migrating it first.

Folder structure:
src/main.jsx, src/App.jsx (routes)
src/lib/supabase.js (one shared client), src/lib/api.js (ALL Supabase and api-server calls), src/lib/geo.js (browser GPS + Haversine distance), src/lib/format.js (pure helpers)
src/lib/stamp.js (context stamp + teaser text), prompts.js, support.js, wav.js (16 kHz WAV recorder), photo.js, useLiveLocation.js, notifications.js
src/context/ (AuthContext + useAuth, NotificationsProvider + useNotifications: Realtime bell and browser alerts)
src/components/ (AppShell, BottomNav, Sheet side panel, StoryPanel, ChainLetterSection, VoiceRecorder, ItemMenu report/block, …)
src/pages/: Home (map) /, PlaceBoard /place/:id, Compose /compose, StoryPage /story/:id, MyKatha /me, Messages /messages, Chat /messages/:id, Profile
api/src/: app.js, routes/ (places, board+unlock, stories, voiceNotes, chainLetters, reactions, social), location.js (GPS check), ranking.js, context.js (+ campusMoments.js), metaClient.js + aiFeatures.js (Meta AI with fallbacks), db.js
supabase/, .github/workflows/

Design: the "lantern" style (dark, warm, glassy). Tokens and utilities live in src/index.css (bg, glass, line, fg/fg-2/fg-3, lamp, ember, here; glass, btn-primary, btn-lamp, btn-glass, chip, selected, title-display, label-caps, glow-dot); chip tints in src/lib/tints.js. Fraunces for titles and story text, Inter for UI. Lucide icons at 1.75 stroke, no emoji, touch targets at least 44px. Map tiles default to Esri Dark Gray (CARTO needs a key; override with VITE_MAP_TILES_URL).

Rules:

- Pages never call Supabase directly; they use functions from src/lib/api.js.
- Clients never insert places, stories, voice notes, chain letters, felt_this_too, item_views, postcards, comments, DM requests or DM messages. Those go through the api, which re-checks GPS where needed, moderates text, applies blocks (the service role bypasses RLS, so the api filters blocked users itself) and writes with the service_role key. Browser GPS cannot be cryptographically verified, so never describe it as tamper-proof.
- Notifications are created by database triggers; clients only read them and set read_at.
- Moderation never blocks someone for struggling; it returns `support: true` and the UI shows SupportCard.
- Voice notes and chain letters are not selectable by other clients; the api returns their content plus ~5 minute signed URLs after the GPS check.
- Never show other users' locations.
- Every page handles loading, empty and error states.
- Secrets: web uses only VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL, optional VITE_ALLOWED_EMAIL_DOMAIN. SUPABASE_SERVICE_ROLE_KEY and Meta AI keys live only in the api container. Never commit .env.
- Production web and API endpoints must use HTTPS (geolocation and microphone require it).
- Keep components small and readable.

Working style:

- Work in small steps. After each step, summarize what changed, was removed, or was migrated, and why, plus how to test it.
- Label every git command as local-only or affecting the remote.
- Never push, merge, deploy, or open a PR without asking first.
- Do not add AI attribution lines to commits or PRs.
