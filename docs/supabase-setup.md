# Supabase Setup (Developer C, Week 1)

Supabase gives us Postgres + PostGIS + pgvector + Auth + storage in one free service — the consolidation that makes the 5-week timeline viable (`flow.md` §2).

Steps 1–4 need a browser and your email, so you have to do them. Everything from step 5 on is automated.

---

## 1. Create the account and project

1. Go to **https://supabase.com** → *Start your project* → sign in with GitHub (fastest — you already have an account).
2. *New project*, and set:

   | Field | Value | Why |
   |---|---|---|
   | **Name** | `oasis` | — |
   | **Database Password** | generate a strong one — **save it immediately** | Shown only once. You need it for the connection string, and resetting it means re-editing every `.env`. |
   | **Region** | **South Asia (Mumbai) `ap-south-1`** | Lowest latency for you and for evaluators in India. |
   | **Plan** | Free | Enough for this project: 500 MB database, 5 GB bandwidth. Our seed data is ~10 MB. |

3. Wait ~2 minutes for provisioning.

> **Free-tier pause:** projects sleep after **7 days without activity** and need a manual resume from the dashboard. Harmless during active development, but **check the project is awake the day before your demo** — a cold project is a bad surprise on demo day.

---

## 2. Enable PostGIS and pgvector

Dashboard → **Database** → **Extensions**, search and enable:

- **`postgis`** — geospatial types and indexes (the GIS maps and all spatial joins)
- **`vector`** — pgvector, for the RAG embeddings in Week 3

`schema.sql` also issues `create extension if not exists` for both, so if the UI toggle gives you trouble, applying the schema handles it — as long as your Postgres role has permission.

---

## 3. Copy the connection string

Dashboard → **Project Settings** → **Database** → *Connection string* → **URI** tab.

> **Pick the Session pooler string, not "Direct connection".**
> Direct connections are **IPv6-only** on the free tier, and most home/college networks — and GitHub Actions runners — are IPv4-only. Using the direct string produces a confusing `Network is unreachable` error. The pooler host contains the word `pooler`.

It looks like:

```
postgresql://postgres.abcdefghijklm:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Replace `[YOUR-PASSWORD]` with the password from step 1. **If it contains special characters, URL-encode them** or the connection silently fails to parse:

| Character | Encode as |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `#` | `%23` |

---

## 4. Create your `.env`

From the repo root:

```bash
cp .env.example .env
```

Open `.env` and paste in your `DATABASE_URL`. While you're in Project Settings → **API**, also grab `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` — Developer B needs the first two for frontend auth in Week 1.

> `.env` is gitignored. **Never commit it.** The `service_role` key bypasses row-level security entirely — treat it like a root password. Share credentials with Anadya and Vedika over a DM, not the repo.

---

## 5. Apply the schema

```bash
python backend/db/apply_schema.py --check    # verify connection + extensions first
python backend/db/apply_schema.py            # create all 15 tables
```

`--check` prints the Postgres version, whether `postgis`/`vector` are present, and a row count per table. Run it first — it separates "can't connect" from "schema is broken", which are very different problems.

Useful flags:

| Command | Effect |
|---|---|
| `--check` | Connection and extension check only. No writes. |
| *(none)* | Apply `schema.sql`. |
| `--reset` | **Drops all 15 tables**, then recreates. Destroys data — fine in Week 1, dangerous later. |

The script maps the two most common failures to specific hints: `Network is unreachable` → you used the direct connection string; `password authentication failed` → wrong password or an unencoded special character.

---

## 6. Load the seed data

```bash
python data-pipeline/cleaning/load_seeds.py
```

*(Not written yet — this is the next task after the schema applies cleanly.)*

Loads the committed CSVs in `data-pipeline/seeds/raw/` into the tables. Idempotent via the natural keys already in the schema (`molecular_records.process_id`, `species_occurrences(source, external_id)`, `sensor_readings(station_id, obs_date, source)`), so re-running inserts only genuinely new rows instead of duplicating.

---

## 7. Verify

```bash
python backend/db/apply_schema.py --check
```

Expected once loading is done — roughly:

| Table | Rows |
|---|---|
| `oceanographic_readings` | ~84,700 (SST + chlorophyll) |
| `weather_observations` | ~13,000 |
| `species_occurrences` | ~10,000 (OBIS + GBIF) |
| `sensor_readings` | ~5,000 |
| `molecular_records` | ~2,000 |
| `species` | ~1,500 (deduplicated across four sources) |
| `fisheries_national_totals` | 65 |
| `oceanographic_stations` | 31 (18 coastal anchors + 13 buoys) |

---

## Sharing with the team

Anadya and Vedika do **not** need their own Supabase project — one shared instance for the team is simpler and matches how the app is deployed. Send them:

- `DATABASE_URL` (only if they need direct DB access)
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` (Developer B needs these for frontend auth)

Send over DM. Not in the repo, not in a commit, not in the shared doc.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Network is unreachable` | Direct (IPv6-only) connection string | Use the session pooler string — host contains `pooler` |
| `password authentication failed` | Wrong password, or unencoded `@ : / #` | URL-encode special characters (table in step 3) |
| `type "geography" does not exist` | PostGIS not enabled | Step 2, or run `create extension postgis;` in the SQL Editor |
| `type "vector" does not exist` | pgvector not enabled | Step 2, or `create extension vector;` |
| `relation already exists` | Schema already applied | Expected on re-run. Use `--reset` to start clean. |
| Project unreachable after a week | Free-tier auto-pause (7 days idle) | Resume from the dashboard. **Check this before the demo.** |
| `ivfflat` index error on `embeddings` | pgvector needs rows before building an ivfflat index | Harmless in Week 1 (table is empty). Create the index in Week 3 after embeddings are loaded. |
