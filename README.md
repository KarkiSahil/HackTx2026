# Katha

Katha is a memory for places: stories, voice notes, and chain letters that can
only be created while you are physically at a place. It is a React + Vite
single-page web app (not a PWA). The browser reads from hosted Supabase with
its public anon key; everything that must be location-checked goes through the
separate Express API, which keeps the Supabase service-role key private.

## Database setup

In the Supabase SQL Editor, run `supabase/schema.sql`, then every file in
`supabase/migrations/` in name order. Both are safe to re-run.

## Run the containers locally

1. Copy `.env.example` to `.env`.
2. Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_URL` to
   your Supabase project values. Set `SUPABASE_SERVICE_ROLE_KEY` only in this
   local `.env`; never use it in a `VITE_` variable or the web build.
3. Start both containers:

   ```bash
   docker compose up --build
   ```

Open the web app at <http://localhost:8080>. The API health endpoint is
<http://localhost:3000/health>. Nginx serves the SPA with deep-link fallback.
Allow location access in the browser; production deployments must use HTTPS for
browser geolocation and microphone access.

To stop the containers, press Ctrl+C and run `docker compose down`.

## Run for development without Docker

With `.env` filled in, start each in its own terminal:

```bash
npm run dev               # web app on http://localhost:5173
npm run dev --prefix api  # API on http://localhost:3000, reads ../.env
```

`CORS_ORIGIN` accepts a comma-separated list of allowed web origins.

## Meta AI (optional)

Set `MODEL_API_KEY` (Meta Model API, https://api.meta.ai/v1) in `.env` for the
API only. It powers voice-note captions (Muse Voice Transcribe, WAV), feeling
suggestions, moderation, the DM opener and the "feeling around you" line (Muse
Spark), and memory postcards (Muse Image). Without a key, each feature falls
back: no captions, no suggestions, a simple feeling summary, a template DM
opener, keyword-based support detection, and postcards unavailable.

Campus moments for context stamps live in `api/src/campusMoments.js`; update
the dates from the academic calendar each year.

## Run checks without Docker

```bash
npm ci
npm run lint
npm test -- --run
npm run build

npm ci --prefix api
npm run lint --prefix api
npm test --prefix api
```

The API requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGIN`,
and optionally `PORT` at runtime. It is an independent service and does not
receive frontend `VITE_` environment variables.
