# Demo Script

The target walkthrough per `flow.md` §14/§7 is: **login → dashboard →
domain explorer → anomaly alert → recommendation → chatbot follow-up.**
This document tracks two things: what that full walkthrough will look like
once every phase lands, and — since Phases 4–6 aren't built yet — what can
actually be demoed today.

## Prerequisites (not yet done in this environment)

1. A provisioned Supabase project — `docs/supabase-setup.md`.
2. `python backend/db/apply_schema.py` then `python data-pipeline/cleaning/load_seeds.py`.
3. Backend running (`uvicorn app.main:app`) with `DATABASE_URL`/`SUPABASE_*` set.
4. Frontend running (`npm run dev`) with `VITE_API_BASE_URL` pointing at it.
5. For the full walkthrough below: `ANTHROPIC_API_KEY` set and Phases 4–5 built.

## What's demoable right now (Phases 0–3)

1. **Login / signup** — `/login`, backed by real Supabase Auth via the
   backend's `/auth/*` proxy.
2. **Dashboard** — KPI tiles (station count, avg SST, species catalogued,
   molecular record count, weather observation count, latest annual catch)
   computed from real rows, plus a clustered GIS map of every real ocean
   station (satellite grid / buoy / coastal anchor, color-coded).
3. **Ocean & Satellite Explorer** — filter by station type, click a station
   on the map, see its real SST/chlorophyll time series and source
   provenance badges.
4. **Weather Explorer** — filter by region, real max/min temperature time
   series from Open-Meteo.
5. **Species Explorer** — search real deduplicated species (OBIS/GBIF/BOLD),
   see taxonomy detail and a real occurrence map.
6. **Fisheries** — real FAO-via-OWID national annual catch trend, with an
   honest note that region/species-level catch is empty pending CMFRI data
   (not faked).
7. **Molecular / eDNA** — real BOLD barcode record table.
8. **Correlation Studio / Risk & Anomaly Alerts / Chatbot / Admin** — pages
   render and call the real (stubbed) endpoints; each shows an explicit
   "not implemented yet" message rather than fabricated data. As of Phase 6
   the only such surface left is session-report export.

## Full target walkthrough (once Phases 4–5 land)

1. **Login** as a researcher account.
2. **Dashboard** — KPI tiles + summary map, as above.
3. **Domain explorer** (e.g. Ocean) — filter to a region with a known
   real event (e.g. a period NOAA's SST data shows an actual elevated
   reading), show the time series.
4. **Risk & Anomaly Alerts** — the same region shows a real flagged
   anomaly (rolling z-score vs. climatology over that real SST series),
   with severity.
5. **Recommendation** — click through to the Explainable Recommendation
   Agent's plain-language narrative for that anomaly, generated from its
   actual statistical attribution (not a canned string).
6. **Chatbot follow-up** — ask a natural-language question that references
   the same event ("is there a heatwave risk in that region, and what
   should we do?") and get a DB-grounded answer with source citations,
   demonstrating the same anomaly/recommendation data via the conversational
   path.

## Demo-day mitigations (per `flow.md` §15, not yet exercised)

- Pre-warm the backend a few minutes before a live demo (Render free-tier
  cold starts).
- Keep a recorded backup video once the full walkthrough is buildable.
- Verify the Supabase project isn't paused (free-tier auto-pauses after 7
  days idle) the day before demoing.
