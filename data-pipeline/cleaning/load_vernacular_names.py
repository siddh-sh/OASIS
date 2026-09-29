"""
Source real regional-language vernacular names for the species that already
carry an English common_name (~110 of 1,482 — see load_seeds.py), from
FishBase (finfish) / SeaLifeBase (everything else — FishBase does not cover
non-fish taxa) plus Wikidata as a supplementary pass.

Why not just machine-translate the English common_name: that produces a
generic translated phrase, not the term a Malayalam- or Marathi-speaking
fisherman actually uses. "Ayala" is what Kerala calls Indian mackerel in the
market; it is not a translation of the words "Indian" and "mackerel". These
are real vernacular/market terms recorded by fisheries-specific references,
which is a fundamentally different (and slower, messier) thing to source
than running a string through a translator.

Evidence-based ceiling, found by hand-testing several species across four
databases (FishBase, SeaLifeBase, Wikidata, WoRMS, GBIF's own vernacular
extension) before writing this script: finfish get strong, often
full-language coverage once FishBase is in the mix. Crustaceans and molluscs
stay very sparse — FishBase does not cover them, SeaLifeBase's coverage for
them is much thinner, and WoRMS/GBIF added zero additional Indian-language
names in every case tested. That is a real absence in the world's available
structured data for that taxon, not a scraping gap this script can close by
trying harder — a species/language pair with nothing found stays absent
rather than getting an invented name.

Usage:
    python data-pipeline/cleaning/load_vernacular_names.py
    python data-pipeline/cleaning/load_vernacular_names.py --limit 5   # smoke test

Idempotent: inserts use ON CONFLICT DO NOTHING against the natural key
(species_id, language_code, name, source) declared in alembic 0005, so a
re-run only adds genuinely new names.
"""
import argparse
import html
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

# FishBase/SeaLifeBase spell some of these differently than our ISO-639-1
# codes; both variants route to the same code.
TARGET_LANGUAGES = {
    "hindi": "hi",
    "malayalam": "ml",
    "tamil": "ta",
    "telugu": "te",
    "kannada": "kn",
    "kannada (canarese)": "kn",
    "marathi": "mr",
    "gujarati": "gu",
    "oriya": "or",
    "odia": "or",
    "bengali": "bn",
}

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; OASIS-student-project/1.0)"}
TIMEOUT = 20
# Deliberately polite: none of FishBase/SeaLifeBase/Wikidata offer this as a
# bulk API, so this is a few hundred individual page fetches, not a
# documented endpoint built for this volume.
DELAY = 1.5

FISHBASE = "https://www.fishbase.se"
SEALIFEBASE = "https://www.sealifebase.se"

# FishBase/SeaLifeBase embed their common-names table as a JS array literal
# (DataTables), each row `["<a href=...>Name</a>","Country","Language","Type","Official?"]`,
# escaped inside a <script> string. Matches that shape regardless of which
# quoting a given page uses.
ROW_PATTERN = re.compile(r'\[\\?"(.*?)\\?",\\?"(.*?)\\?",\\?"(.*?)\\?",\\?"(.*?)\\?",\\?"(.*?)\\?"\]')

_session = requests.Session()
_session.headers.update(HEADERS)


def connect():
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set — see docs/supabase-setup.md")
    return psycopg2.connect(url, connect_timeout=30)


def _clean_name(raw: str) -> str:
    """Strip the <a href=...> wrapper some rows carry, and un-escape the
    backslash/HTML/unicode escaping both sites' templates leave in — some
    pages emit native-script names as literal UTF-8, others as \\uXXXX JS
    escapes, sometimes both within the same page."""
    text = re.sub(r"<[^>]+>", "", raw)
    text = text.replace('\\"', '"').replace("\\/", "/").replace("\\'", "'")
    text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
    return html.unescape(text).strip()


def _fetch(url: str) -> str | None:
    try:
        resp = _session.get(url, timeout=TIMEOUT)
        if resp.status_code != 200:
            return None
        return resp.text
    except requests.RequestException:
        return None


def _find_common_names_url(base: str, genus: str, species_epithet: str) -> str | None:
    html_text = _fetch(f"{base}/summary/SpeciesSummary.php?genusname={genus}&speciesname={species_epithet}")
    if not html_text:
        return None
    m = re.search(r'[a-zA-Z]*[Cc]om[Nn]ames[a-zA-Z]*/CommonNamesList\.php\?ID=\d+[^"\'\\]*', html_text)
    if not m:
        return None
    return f"{base}/{m.group(0)}"


def _extract_vernacular_rows(html_text: str) -> list[tuple[str, str]]:
    """Returns [(our_language_code, name), ...] — the JS-array rows are
    `[name, country, language, type, official_trade_name]`; language and
    name are what we need, country/type aren't used (see module docstring
    on why language alone, not country, is the right filter: these are
    India-specific languages almost by definition)."""
    out = []
    for m in ROW_PATTERN.finditer(html_text):
        name_raw, _country, language_raw, _type, _official = m.groups()
        code = TARGET_LANGUAGES.get(html.unescape(language_raw).strip().lower())
        if not code:
            continue
        name = _clean_name(name_raw)
        if name:
            out.append((code, name))
    return out


def _extract_static_table_rows(html_text: str) -> list[tuple[str, str]]:
    """SeaLifeBase's older template ships a plain <table id="dataTable">
    instead of a JS-rendered DataTable — same five columns, different
    delivery. Tried when the JS-array pattern finds nothing."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html_text, "lxml")
    table = soup.find("table", id="dataTable")
    if table is None:
        return []
    out = []
    for row in table.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in row.find_all("td")]
        if len(cells) < 3:
            continue
        name, _country, language = cells[0], cells[1], cells[2]
        code = TARGET_LANGUAGES.get(language.strip().lower())
        if code and name:
            out.append((code, name))
    return out


def fishbase_or_sealifebase_names(genus: str, species_epithet: str) -> list[tuple[str, str]]:
    for base in (FISHBASE, SEALIFEBASE):
        url = _find_common_names_url(base, genus, species_epithet)
        if not url:
            continue
        page = _fetch(url)
        if not page:
            continue
        rows = _extract_vernacular_rows(page) or _extract_static_table_rows(page)
        if rows:
            source = "FishBase" if base == FISHBASE else "SeaLifeBase"
            return [(code, name, source) for code, name in rows]
        time.sleep(DELAY)
    return []


def wikidata_names(scientific_name: str) -> list[tuple[str, str, str]]:
    try:
        resp = _session.get(
            "https://www.wikidata.org/w/api.php",
            params={
                "action": "wbsearchentities",
                "search": scientific_name,
                "language": "en",
                "format": "json",
            },
            timeout=TIMEOUT,
        )
        results = resp.json().get("search", [])
        if not results:
            return []
        qid = results[0]["id"]
        entity_resp = _session.get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json", timeout=TIMEOUT)
        labels = entity_resp.json()["entities"][qid].get("labels", {})
    except (requests.RequestException, KeyError, ValueError):
        return []

    out = []
    for code in set(TARGET_LANGUAGES.values()):
        if code in labels:
            out.append((code, labels[code]["value"], "Wikidata"))
    return out


def insert_rows(rows: list[tuple[int, str, str, str]]) -> None:
    """Opens its own short-lived connection per call rather than sharing one
    across the whole scrape — the scrape is minutes of HTTP requests with no
    DB activity in between, and Supabase's pooler kills a connection left
    idle that long (verified: the very first insert after a full scrape pass
    hit `QueryCanceled: canceling statement due to statement timeout` on a
    connection opened before the scraping started)."""
    if not rows:
        return
    conn = connect()
    try:
        with conn.cursor() as cur:
            execute_values(
                cur,
                "insert into species_vernacular_names (species_id, language_code, name, source) "
                "values %s on conflict (species_id, language_code, name, source) do nothing",
                rows,
            )
        conn.commit()
    finally:
        conn.close()


def load_vernacular_names(limit: int | None = None, resume: bool = True):
    conn = connect()
    try:
        with conn.cursor() as cur:
            # `resume` skips species that already have at least one row —
            # ~110 species at several seconds each runs long enough that a
            # timed-out or interrupted run is the normal case, not an edge
            # case, and every insert already commits per-species (see
            # insert_rows), so "already has a row" reliably means "already
            # attempted", not "partially written".
            query = (
                "select species_id, scientific_name, genus, species_epithet, common_name "
                "from species where common_name is not null "
                + ("and species_id not in (select distinct species_id from species_vernacular_names) " if resume else "")
                + "order by species_id"
            )
            cur.execute(query)
            species_rows = cur.fetchall()
    finally:
        conn.close()

    if limit:
        species_rows = species_rows[:limit]

    total_inserted = 0
    for species_id, scientific_name, genus, species_epithet, common_name in species_rows:
        # `genus`/`species_epithet` are only populated for OBIS/GBIF/BOLD-
        # merged species (see load_species in load_seeds.py); SAU-only rows
        # need splitting the binomial ourselves.
        g, sep = genus, species_epithet
        if not g or not sep:
            parts = scientific_name.split(" ", 1)
            if len(parts) != 2:
                continue
            g, sep = parts

        names: list[tuple[str, str, str]] = []
        names.extend(fishbase_or_sealifebase_names(g, sep))
        time.sleep(DELAY)
        names.extend(wikidata_names(scientific_name))
        time.sleep(DELAY)

        if not names:
            # Recorded as a sentinel (filtered out by the API — see
            # species.py's vernacular-names endpoint) purely so `resume`
            # doesn't re-scrape a species that was already genuinely checked
            # and came up empty everywhere, on every subsequent run.
            insert_rows([(species_id, "_none", "checked, nothing found", "none")])
            print(f"  {scientific_name:40s} ({common_name}) - nothing found")
            continue

        rows = [(species_id, code, name, source) for code, name, source in set(names)]
        # Written immediately, species by species, rather than batched to the
        # end: a network hiccup or one bad page 80 species in must not throw
        # away everything scraped before it.
        insert_rows(rows)
        total_inserted += len(rows)
        langs = sorted({code for code, _, _ in names})
        print(f"  {scientific_name:40s} ({common_name}) - {len(rows)} names, languages: {', '.join(langs)}")

    print(f"\nTotal rows inserted (or already present): {total_inserted}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="only process the first N species (smoke test)")
    args = parser.parse_args()
    load_vernacular_names(limit=args.limit)


if __name__ == "__main__":
    main()
