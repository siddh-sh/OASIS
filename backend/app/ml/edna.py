"""eDNA / barcode similarity search (flow.md Phase 6, Should-Have).

Given a DNA sequence, rank the BOLD barcode records in the database by
similarity and report the likely species.

**This is k-mer cosine similarity, not alignment.** flow.md explicitly puts
"full genomic alignment (BLAST-style matching, phylogenetic trees)" in Future
Scope, and that boundary is honest rather than convenient: BLAST scores local
alignments with gap penalties and reports statistical significance (E-values);
this reports neither.

Being precise about what is and isn't lost, since it is easy to overstate:
a 5-mer profile is *not* pure base composition — it preserves local ordering
inside every 5-base window, so two sequences with identical base counts in a
different arrangement do separate (AAAAACCCCC vs CCCCCAAAAA scores 0.33, not
1.0). What it genuinely cannot do is model indels, weight substitutions by
biological plausibility, align subsequences, or attach a significance value
to a hit. Long-range rearrangement is also invisible to it.

What it is good for: matching a query against records of the *same* marker
gene, where composition is genuinely discriminative — which is the demo case
(submit a COI-5P barcode, find its species). What it must not be sold as:
a substitute for alignment-based identification.

Implementation notes tied to the real data:
  * k=5 over the 4-letter nucleotide alphabet gives 1,024 possible k-mers,
    enough to discriminate several hundred-base barcodes without the vector
    becoming mostly zeros.
  * BOLD sequences contain '-' gap characters (one record in the loaded data
    has a run of 184). Non-ACGT characters are skipped rather than treated as
    a fifth base, so a gappy record is compared on the bases it does have.
  * Records shorter than one k-mer, or empty after cleaning, are excluded.
"""
from __future__ import annotations

import re
from collections import Counter

import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MolecularRecord, Species

K = 5
VALID = re.compile(r"[^ACGT]")
MIN_QUERY_LEN = 20


def clean_sequence(sequence: str) -> str:
    """Upper-case, strip FASTA headers, drop gaps and ambiguity codes."""
    lines = [ln for ln in sequence.strip().splitlines() if not ln.startswith(">")]
    return VALID.sub("", "".join(lines).upper())


def kmer_vector(sequence: str, k: int = K) -> Counter:
    return Counter(sequence[i : i + k] for i in range(len(sequence) - k + 1))


def cosine(a: Counter, b: Counter) -> float:
    if not a or not b:
        return 0.0
    shared = set(a) & set(b)
    if not shared:
        return 0.0
    dot = sum(a[x] * b[x] for x in shared)
    na = np.sqrt(sum(v * v for v in a.values()))
    nb = np.sqrt(sum(v * v for v in b.values()))
    return float(dot / (na * nb)) if na and nb else 0.0


def search(db: Session, sequence: str, limit: int = 10, marker_gene: str | None = None) -> dict:
    query = clean_sequence(sequence)
    if len(query) < MIN_QUERY_LEN:
        raise ValueError(
            f"sequence too short after cleaning ({len(query)} valid bases); "
            f"need at least {MIN_QUERY_LEN} A/C/G/T characters"
        )

    query_vec = kmer_vector(query)

    stmt = select(
        MolecularRecord.id, MolecularRecord.process_id, MolecularRecord.barcode_sequence,
        MolecularRecord.marker_gene, MolecularRecord.species_id, MolecularRecord.bin_uri,
    ).where(MolecularRecord.barcode_sequence.is_not(None))
    if marker_gene:
        stmt = stmt.where(MolecularRecord.marker_gene == marker_gene)

    scored = []
    for rec_id, process_id, seq, marker, species_id, bin_uri in db.execute(stmt).all():
        subject = clean_sequence(seq or "")
        if len(subject) < K:
            continue
        score = cosine(query_vec, kmer_vector(subject))
        if score > 0:
            scored.append((score, rec_id, process_id, marker, species_id, bin_uri, len(subject)))

    scored.sort(reverse=True, key=lambda t: t[0])
    top = scored[:limit]

    names = {}
    ids = [t[4] for t in top if t[4]]
    if ids:
        names = {
            sid: (sci, common)
            for sid, sci, common in db.execute(
                select(Species.species_id, Species.scientific_name, Species.common_name).where(
                    Species.species_id.in_(ids)
                )
            ).all()
        }

    return {
        "query_length": len(query),
        "n_compared": len(scored),
        "method": f"{K}-mer frequency cosine similarity",
        "caveat": (
            "Composition-based ranking, not sequence alignment. It cannot detect "
            "indels or report an E-value, and two sequences sharing composition in a "
            "different order will score as near-identical. Use BLAST/BOLD ID Engine "
            "for authoritative identification."
        ),
        "matches": [
            {
                "record_id": rec_id,
                "process_id": process_id,
                "marker_gene": marker,
                "bin_uri": bin_uri,
                "species_id": species_id,
                "scientific_name": names.get(species_id, (None, None))[0],
                "common_name": names.get(species_id, (None, None))[1],
                "subject_length": length,
                "similarity": round(score, 4),
            }
            for score, rec_id, process_id, marker, species_id, bin_uri, length in top
        ],
    }
