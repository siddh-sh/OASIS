"""species_vernacular_names: regional-language common names, sourced not translated

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-29

Backs the language-switcher feature: a species' *common_name* (English,
sourced from Sea Around Us) is not the same thing as what a Malayalam- or
Marathi-speaking fisherman actually calls it — "Ayala" for Indian mackerel
in Malayalam is a real market term, not a translation of "Indian mackerel".
Machine-translating the English name would produce the latter, which is
worse than useless for the audience this is for, so these rows are sourced
per-language from FishBase (finfish) / SeaLifeBase (everything else —
FishBase does not cover non-fish taxa) and supplemented from Wikidata, by
`data-pipeline/cleaning/load_vernacular_names.py`. Never machine-translated,
never invented: a species/language pair with no row here means no source
had one, which is real and expected for most crustaceans/molluscs and for
languages with thinner reference coverage (see that script's docstring for
the evidence behind this).

One row per (species, language, name) rather than one name per language:
FishBase/SeaLifeBase/Wikidata often disagree or list regional variants (four
different Malayalam spellings for the same fish is normal), and picking a
single "winner" at load time would silently discard real, sourced
alternatives. The API picks a display name at read time instead.
"""
from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "create table if not exists species_vernacular_names ("
        "  id bigserial primary key,"
        "  species_id integer not null references species(species_id),"
        "  language_code text not null,"
        "  name text not null,"
        "  source text not null,"
        "  unique (species_id, language_code, name, source)"
        ")"
    )
    op.execute(
        "create index if not exists idx_vernacular_species_lang "
        "on species_vernacular_names (species_id, language_code)"
    )


def downgrade() -> None:
    op.execute("drop index if exists idx_vernacular_species_lang")
    op.execute("drop table if exists species_vernacular_names")
