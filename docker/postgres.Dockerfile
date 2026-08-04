# Local dev only — production uses Supabase's managed Postgres (which
# already ships postgis + pgvector). This mirrors that: PostGIS's official
# image plus the pgvector extension installed from the same PGDG apt repo
# the base image already trusts.
FROM postgis/postgis:16-3.4

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-pgvector \
    && rm -rf /var/lib/apt/lists/*
