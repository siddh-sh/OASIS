# Deployment (Phase 7)

Everything that can be committed is committed: `render.yaml` describes the
backend service, `frontend/vercel.json` the frontend, and both CI workflows
already deploy on merge to `main` once their secrets exist.

**What is left needs your accounts.** Creating a Render service and a Vercel
project requires signing in as you; nobody else can do it. The steps below
are the whole remainder.

---

## 1. Backend → Render

1. [dashboard.render.com](https://dashboard.render.com) → **New +** →
   **Blueprint** → connect `siddh-sh/OASIS`. Render reads `render.yaml`; do
   not hand-configure a web service instead, or the config stops being
   reproducible.
2. It will prompt for the six `sync: false` values. Paste from your `.env`:
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `LLM_API_KEY`, and `CORS_ORIGINS` (leave
   `CORS_ORIGINS` blank for now — you fill it in after step 2).
3. First build takes ~5–8 minutes: scikit-learn, SHAP and onnxruntime are
   large wheels.
4. Verify: `curl https://<your-service>.onrender.com/health`

> **Use the Supabase *session pooler* connection string.** The direct
> connection is IPv6-only on the free tier and Render cannot reach it. The
> pooler host contains the word `pooler`.

## 2. Frontend → Vercel

1. [vercel.com/new](https://vercel.com/new) → import `siddh-sh/OASIS` → set
   **Root Directory** to `frontend`. It picks up `vercel.json` from there.
2. Environment variables:
   - `VITE_API_BASE_URL` = the Render URL from step 1
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (optional; auth goes
     through the backend proxy, these are only for direct Supabase calls)
3. Deploy, then go **back to Render** and set `CORS_ORIGINS` to the Vercel
   URL. Skipping this is the single most common failure — the site loads and
   every API call fails in the browser with an opaque CORS error while
   `curl` works fine.

## 3. Turn the CI deploy steps on

Both workflows already have deploy jobs that no-op when their secret is
absent. Add these under **Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `RENDER_DEPLOY_HOOK_URL` | Render service → Settings → Deploy Hook |
| `VERCEL_TOKEN` | vercel.com/account/tokens |

After that, merging to `main` deploys both.

## 4. Before a demo

- **Wake the free tier.** Render free instances sleep after 15 minutes idle
  and take ~50 s to cold start. Hit `/health` a few minutes before you
  present.
- **Check Supabase is awake.** Free projects pause after 7 days idle and need
  a manual resume from the dashboard.
- **First `/api/analytics/*` call after a deploy is slow.** Model artifacts
  load from disk on first use. Hit `/api/analytics/anomalies?limit=1` once to
  warm it.
- The embedding model (~130 MB) downloads on first use of chat or species
  search. Ask the chatbot one question to warm it before demoing.

---

## Known constraints of the free tier

These are real limits, worth knowing before they surprise you in front of an
evaluator:

- **512 MB RAM on Render.** The service runs a single uvicorn worker for this
  reason (see `render.yaml`). scikit-learn + SHAP + onnxruntime is most of
  that budget; adding a worker gets the process OOM-killed.
- **Cold starts.** Both Render and Supabase sleep. The backup plan in
  `docs/demo-script.md` exists for this.
- **Groq free tier** is ~1,000 requests/day and ~6k tokens/minute. Ample for
  a demo, but a rate-limited turn returns a graceful fallback rather than an
  answer — swap `LLM_BASE_URL`/`LLM_MODEL` to Cerebras if you hit it.

## Local alternative

`docker compose up --build` at the repo root runs Postgres+PostGIS+pgvector,
the backend and the frontend together. Supabase Auth still needs a real
Supabase project — its REST API is not something local Postgres replicates.
