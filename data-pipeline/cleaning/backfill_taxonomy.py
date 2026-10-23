"""
Fill blank taxonomy (kingdom..genus) on species rows from the GBIF Backbone
Taxonomy's name-matching API, then fill any class still blank from WoRMS.

Why this is needed: load_seeds.py takes classification from whichever source
first mentions a species. Sea Around Us and FAO supply only names, and OBIS
leaves `class` empty for groups that modern taxonomy no longer ranks as a
class (sea snakes and turtles: "Reptilia" is not monophyletic). Those rows
otherwise show up with no class/family in the Species pages and the agent's
answers.

The WoRMS pass exists because GBIF's backbone has no class for ray-finned
fishes, while the rest of this database (via OBIS, which uses WoRMS) calls
them Teleostei; filling from WoRMS keeps one convention.

Only NULL fields are written (coalesce), so nothing a primary source supplied
is ever overwritten, and only EXACT, ACCEPTED-or-SYNONYM matches at species
rank are used — a fuzzy match to a different species would put a wrong
family on a real record, which is worse than leaving it blank.

Usage:
    python data-pipeline/cleaning/backfill_taxonomy.py

Idempotent: a species with nothing left to fill is not queried again.
Docs: https://techdocs.gbif.org/en/openapi/v1/species#/Searching%20names/matchNames
"""
import os
import sys
import time
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
MATCH_URL = "https://api.gbif.org/v1/species/match"
WORMS_URL = "https://www.marinespecies.org/rest/AphiaRecordsByName/{name}"
RANKS = ["kingdom", "phylum", "class", "order", "family", "genus"]


def main():
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL not set — see docs/supabase-setup.md")
    conn = psycopg2.connect(url, connect_timeout=30)
    try:
        with conn.cursor() as cur:
            cur.execute(
                'select species_id, scientific_name from species where '
                + " or ".join(f'"{r}" is null' for r in RANKS)
            )
            todo = cur.fetchall()
            print(f"{len(todo)} species with blank taxonomy fields")
            filled = skipped = 0
            for species_id, name in todo:
                resp = requests.get(MATCH_URL, params={"name": name, "strict": "true"}, timeout=30)
                resp.raise_for_status()
                m = resp.json()
                if (m.get("matchType") != "EXACT" or m.get("rank") != "SPECIES"
                        or m.get("status") not in ("ACCEPTED", "SYNONYM")):
                    skipped += 1
                    continue
                cur.execute(
                    "update species set "
                    + ", ".join(f'"{r}" = coalesce("{r}", %s)' for r in RANKS)
                    + " where species_id = %s",
                    [m.get(r) for r in RANKS] + [species_id],
                )
                filled += 1
                time.sleep(0.1)  # polite to a free public API
            conn.commit()
            print(f"  GBIF: filled {filled}, no exact match for {skipped}")

            cur.execute("select species_id, scientific_name from species where class is null")
            worms_filled = 0
            for species_id, name in cur.fetchall():
                resp = requests.get(WORMS_URL.format(name=name), params={"like": "false"}, timeout=30)
                if resp.status_code == 204:  # WoRMS: no match
                    continue
                resp.raise_for_status()
                accepted = [r for r in resp.json() if r.get("status") == "accepted" and r.get("class")]
                if len(accepted) != 1:  # none, or ambiguous homonyms — leave blank
                    continue
                cur.execute('update species set class = coalesce(class, %s) where species_id = %s',
                            (accepted[0]["class"], species_id))
                worms_filled += 1
                time.sleep(0.1)
            conn.commit()
            print(f"  WoRMS: filled class for {worms_filled}")
            cur.execute(
                "select count(*) filter (where class is null), count(*) filter (where family is null) from species"
            )
            print("  still blank — class: %s, family: %s" % cur.fetchone())
    finally:
        conn.close()


if __name__ == "__main__":
    main()
