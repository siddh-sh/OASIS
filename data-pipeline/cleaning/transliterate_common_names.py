"""
Phonetic transliterations of species' English common names into each UI
language's script — "Wahoo" → वाहू (Marathi), வாஹூ (Tamil).

Why: most species have no recorded regional name (FishBase / SeaLifeBase /
Wikidata cover well-known finfish only, see load_vernacular_names.py), so a
Marathi or Tamil reader otherwise sees the English name in Latin script. A
transliteration is how such names are written in practice — the way Indian
markets and newspapers write "Wahoo" or "Bullet tuna" — without inventing a
translation of the meaning.

These are clearly labelled, never presented as recorded local names:
  * stored with source 'Transliteration' in species_vernacular_names;
  * the API picks a real sourced name first and falls back to a
    transliteration only when none exists (app/api/species.py,
    _best_vernacular_name), and the Species page says which one it shows.

Generated once by the project's configured LLM (LLM_* in .env), with an
instruction to render pronunciation only, and cached in
seeds/raw/vernacular/transliterations.csv so the database can be rebuilt
without calling the model again and so the spellings can be reviewed and
corrected by hand. Re-running only asks the model for names not yet in the
CSV.

Usage:
    python data-pipeline/cleaning/transliterate_common_names.py
"""
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv
from psycopg2.extras import execute_values

ROOT = Path(__file__).resolve().parents[2]
CSV_PATH = ROOT / "data-pipeline" / "seeds" / "raw" / "vernacular" / "transliterations.csv"
SOURCE = "Transliteration"
BATCH = 40

# UI languages other than English (frontend/src/i18n/index.ts).
LANGUAGES = {
    "mr": "Marathi, in Devanagari script",
    "ml": "Malayalam, in Malayalam script",
    "gu": "Gujarati, in Gujarati script",
    "kn": "Kannada, in Kannada script",
    "ta": "Tamil, in Tamil script",
    "te": "Telugu, in Telugu script",
    "or": "Odia, in Odia script",
    "bn": "Bengali, in Bengali script",
}
SCRIPT_RANGES = {
    "mr": "ऀ-ॿ", "ml": "ഀ-ൿ", "gu": "઀-૿", "kn": "ಀ-೿",
    "ta": "஀-௿", "te": "ఀ-౿", "or": "଀-୿", "bn": "ঀ-৿",
}

PROMPT = """You transliterate English marine species common names into {language}.

Write how each English name SOUNDS, in that script, the way an Indian \
newspaper or fish market would write an English name it borrows. Do NOT \
translate the meaning (e.g. "Bullet tuna" must not become the word for \
bullet in that language — write the sounds "bullet tuna"). Keep hyphens and \
word breaks as natural spaces. Use only that script — no Latin letters.

Example for Marathi: "Wahoo" -> "वाहू", "Bullet tuna" -> "बुलेट ट्यूना".

Reply with a JSON object mapping each input name exactly as given to its \
transliteration, and nothing else."""


def ask(names: list[str], language: str, attempts: int = 6) -> dict[str, str]:
    for attempt in range(1, attempts + 1):
        resp = _post(names, language)
        # Free-tier providers rate-limit per minute; wait as told and retry.
        if resp.status_code == 429 and attempt < attempts:
            wait = float(resp.headers.get("retry-after") or 20 * attempt)
            print(f"    rate limited; waiting {wait:.0f}s")
            time.sleep(wait)
            continue
        # 400 here is the provider rejecting output that was not valid JSON
        # (json_validate_failed); it is intermittent, so retry.
        if resp.status_code == 400 and attempt < 3:
            time.sleep(2)
            continue
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return json.loads(re.sub(r"^```(json)?|```$", "", content.strip()).strip())
    return {}


def ask_split(names: list[str], language: str) -> dict[str, str]:
    """`ask`, halving the batch when the model keeps returning invalid JSON
    — a long list is more likely to trip it."""
    try:
        return ask(names, language)
    except requests.HTTPError as exc:
        if exc.response is None or exc.response.status_code != 400 or len(names) <= 1:
            raise
        mid = len(names) // 2
        return {**ask_split(names[:mid], language), **ask_split(names[mid:], language)}


def _post(names: list[str], language: str) -> requests.Response:
    return requests.post(
        f"{os.environ['LLM_BASE_URL'].rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['LLM_API_KEY']}"},
        json={
            "model": os.environ["LLM_MODEL"],
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": PROMPT.format(language=LANGUAGES[language])},
                {"role": "user", "content": json.dumps(names, ensure_ascii=False)},
            ],
        },
        timeout=120,
    )


def valid(text: str, language: str) -> bool:
    """Non-empty, in the target script, no Latin letters left over."""
    return bool(text) and not re.search(r"[A-Za-z]", text) and bool(
        re.search(f"[{SCRIPT_RANGES[language]}]", text)
    )


def save(cached: dict[tuple[str, str], str]) -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["common_name", "language_code", "name"])
        for (name, language), text in sorted(cached.items()):
            writer.writerow([name, language, text])


def main():
    load_dotenv(ROOT / ".env")
    for var in ("DATABASE_URL", "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"):
        if not os.getenv(var):
            sys.exit(f"{var} not set — see .env.example")

    cached: dict[tuple[str, str], str] = {}
    if CSV_PATH.exists():
        with open(CSV_PATH, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                cached[(row["common_name"], row["language_code"])] = row["name"]

    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    try:
        with conn.cursor() as cur:
            cur.execute("select species_id, common_name from species where common_name is not null order by 1")
            species = cur.fetchall()
            names = sorted({c for _, c in species})

            for language in LANGUAGES:
                todo = [n for n in names if (n, language) not in cached]
                for i in range(0, len(todo), BATCH):
                    batch = todo[i:i + BATCH]
                    result = ask_split(batch, language)
                    kept = 0
                    for name in batch:
                        text = (result.get(name) or "").strip()
                        if valid(text, language):
                            cached[(name, language)] = text
                            kept += 1
                    print(f"  {language}: {kept}/{len(batch)} transliterated")
                    save(cached)  # after every batch, so a failure loses nothing
                    time.sleep(2)
            save(cached)

            rows = [
                (sid, language, cached[(common, language)], SOURCE)
                for sid, common in species
                for language in LANGUAGES
                if (common, language) in cached
            ]
            execute_values(
                cur,
                "insert into species_vernacular_names (species_id, language_code, name, source) "
                "values %s on conflict (species_id, language_code, name, source) do nothing",
                rows,
            )
            conn.commit()
            print(f"{len(rows)} transliterations offered for {len(species)} species; CSV: {CSV_PATH}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
