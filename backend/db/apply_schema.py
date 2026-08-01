"""
Apply backend/db/schema.sql to the Supabase Postgres instance.

Usage:
    python backend/db/apply_schema.py            # create schema
    python backend/db/apply_schema.py --check    # connection + extension check only
    python backend/db/apply_schema.py --reset    # DROP everything first, then recreate

Reads DATABASE_URL from .env (see .env.example). Safe to re-run: every
statement in schema.sql uses `if not exists` where Postgres supports it,
and --reset is the escape hatch when it doesn't (create table).
"""
import argparse
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = Path(__file__).parent / "schema.sql"

# Order matters — children before parents, so FKs don't block the drop.
TABLES = [
    "recommendations",
    "anomaly_events",
    "ml_predictions",
    "embeddings",
    "agent_messages",
    "agent_conversations",
    "molecular_records",
    "fisheries_catch",
    "fisheries_national_totals",
    "species_occurrences",
    "species",
    "weather_observations",
    "sensor_readings",
    "oceanographic_readings",
    "oceanographic_stations",
    "regions",
    "datasets_metadata",
    "profiles",
]


def connect():
    load_dotenv(ROOT / ".env")
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit(
            "DATABASE_URL not set.\n"
            "  1. cp .env.example .env\n"
            "  2. paste your Supabase session-pooler connection string into it\n"
            "See docs/supabase-setup.md for where to find it."
        )
    if "[YOUR-PASSWORD]" in url or url.endswith("YOUR-PASSWORD@"):
        sys.exit("DATABASE_URL still contains the placeholder password — edit .env.")
    try:
        return psycopg2.connect(url, connect_timeout=30)
    except psycopg2.OperationalError as e:
        msg = str(e)
        hint = ""
        if "Network is unreachable" in msg or "could not translate host" in msg:
            hint = (
                "\nHint: this usually means you used the DIRECT connection string "
                "(IPv6-only on Supabase free tier). Use the SESSION POOLER string "
                "instead — its host contains 'pooler'."
            )
        elif "password authentication failed" in msg:
            hint = (
                "\nHint: wrong password, or a special character needs URL-encoding "
                "(@ -> %40, : -> %3A, / -> %2F, # -> %23)."
            )
        sys.exit(f"Could not connect: {msg}{hint}")


def check(conn):
    with conn.cursor() as cur:
        cur.execute("select version()")
        print("Connected:", cur.fetchone()[0].split(",")[0])

        cur.execute("select extname from pg_extension order by extname")
        installed = {r[0] for r in cur.fetchall()}
        for ext in ("postgis", "vector"):
            mark = "OK " if ext in installed else "missing"
            print(f"  extension {ext:8s} {mark}")

        cur.execute(
            "select table_name from information_schema.tables "
            "where table_schema = 'public' order by table_name"
        )
        tables = [r[0] for r in cur.fetchall()]
        print(f"  public tables: {len(tables)}")
        for t in tables:
            cur.execute(f'select count(*) from public."{t}"')
            print(f"    {t:28s} {cur.fetchone()[0]:>8,} rows")


def reset(conn):
    with conn.cursor() as cur:
        for t in TABLES:
            cur.execute(f'drop table if exists public."{t}" cascade')
    conn.commit()
    print(f"Dropped {len(TABLES)} tables (if they existed).")


def apply(conn):
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print(f"Applied {SCHEMA_PATH.name}.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="connection/extension check only")
    ap.add_argument("--reset", action="store_true", help="drop all tables first")
    args = ap.parse_args()

    conn = connect()
    try:
        if args.check:
            check(conn)
            return
        if args.reset:
            reset(conn)
        apply(conn)
        print()
        check(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
