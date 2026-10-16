import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { molecularApi, type SequenceMatchResult } from '@/api/molecular'
import { useMolecularRecords } from '@/hooks/useMolecularData'

export function MolecularPage() {
  const { t } = useTranslation()
  const records = useMolecularRecords({ limit: 50 })
  const [sequence, setSequence] = useState('')
  const [result, setResult] = useState<SequenceMatchResult>()
  const [error, setError] = useState<string>()
  const [searching, setSearching] = useState(false)
  const [selectedExample, setSelectedExample] = useState('')
  const searchSectionRef = useRef<HTMLDivElement>(null)

  async function runSearch(seq: string = sequence) {
    if (!seq.trim() || searching) return
    setSearching(true)
    setError(undefined)
    try {
      setResult(await molecularApi.match(seq))
    } catch (e) {
      setError((e as Error).message)
      setResult(undefined)
    } finally {
      setSearching(false)
    }
  }

  function applyExample(record: { barcode_sequence: string | null }) {
    if (!record.barcode_sequence) return
    setSequence(record.barcode_sequence)
    void runSearch(record.barcode_sequence)
  }

  // Most visitors don't have a nucleotide sequence sitting around to paste —
  // but 1,812 real ones are already loaded in the table below. Reusing one
  // of those (rather than asking the backend for a fresh random pick) means
  // this never needs its own request and never needs to wait on `records`
  // loading twice. Deduplicated by identification (several records are the
  // same species from different specimens) so the dropdown offers a handful
  // of genuinely different examples rather than five near-identical ones.
  const exampleOptions = (() => {
    const seen = new Set<string>()
    const out: { id: number; label: string; barcode_sequence: string }[] = []
    for (const r of records.data?.items ?? []) {
      if (!r.barcode_sequence || !r.identification || seen.has(r.identification)) continue
      seen.add(r.identification)
      out.push({ id: r.id, label: `${r.identification} (${r.process_id})`, barcode_sequence: r.barcode_sequence })
      if (out.length >= 8) break
    }
    return out
  })()

  function tryExample() {
    const withSequence = records.data?.items.filter((r) => r.barcode_sequence)
    if (!withSequence || withSequence.length === 0) return
    applyExample(withSequence[Math.floor(Math.random() * withSequence.length)])
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.molecular.title')}</h1>
        <p className="text-sm text-ocean-500">
          {t('pages.molecular.subtitle')} This is the reference library you match unknown sequences against.
        </p>
      </div>

      <details className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <summary className="cursor-pointer font-semibold text-ocean-700 dark:text-ocean-200">
          What is this section, and is it eDNA?
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-ocean-600 dark:text-ocean-300">
          <p>
            <strong>A DNA barcode</strong> is a short, standardised stretch of an organism&rsquo;s DNA that acts
            like a fingerprint for its species. Most records here use <strong>COI-5P</strong> (1,812 of them), the
            standard marker for animals; the rest use 16S, rbcL and a few others.
          </p>
          {/* The honest correction. The page was titled "eDNA", the data is not
              eDNA, and that mismatch is what makes the section confusing. */}
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <strong>Strictly, this is not eDNA.</strong> Environmental DNA means genetic traces recovered from a
            water sample, letting you detect species without catching them. These records come from physical
            specimens that were collected and sequenced. They are the <em>reference library</em> an eDNA study
            would compare its water samples against — necessary for eDNA work, but not eDNA results themselves.
            Actual water-sample detections would need a separate data source and are not in this platform.
          </p>
          <p>
            <strong>What each column means.</strong> <em>Process ID</em> is BOLD&rsquo;s identifier for the
            record. <em>Identification</em> is the species the specimen was assigned to. <em>Marker</em> is which
            gene region was sequenced. <em>BIN</em> is BOLD&rsquo;s own cluster of near-identical barcodes,
            roughly a species-level grouping — useful when two records agree genetically but were named
            differently.
          </p>
          <p>
            <strong>What you can do here.</strong> Paste a sequence into the search above and it will be ranked
            against all 1,993 records by composition similarity, returning the most likely species matches.
          </p>
        </div>
      </details>

      <div ref={searchSectionRef} className="flex flex-col gap-2 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ocean-950 dark:text-ocean-50">Barcode similarity search</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ocean-500">Don&rsquo;t have a sequence?</span>
            <select
              value={selectedExample}
              onChange={(e) => {
                const picked = exampleOptions.find((o) => String(o.id) === e.target.value)
                if (picked) applyExample(picked)
                setSelectedExample('')
              }}
              disabled={searching || exampleOptions.length === 0}
              className="rounded-md border border-ocean-300 px-2 py-1.5 text-xs text-ocean-700 disabled:opacity-50 dark:border-ocean-700 dark:bg-ocean-900 dark:text-ocean-200"
            >
              <option value="">Pick a real example…</option>
              {exampleOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={tryExample}
              disabled={searching || !records.data?.items.some((r) => r.barcode_sequence)}
              className="rounded-md border border-ocean-300 px-3 py-1.5 text-xs font-medium text-ocean-700 hover:bg-ocean-100 disabled:opacity-50 dark:border-ocean-700 dark:text-ocean-200 dark:hover:bg-ocean-900"
            >
              Surprise me
            </button>
          </div>
        </div>
        <textarea
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
          rows={4}
          placeholder="Paste a nucleotide sequence (FASTA headers, gaps and ambiguity codes are stripped automatically)…"
          className="w-full rounded-md border border-ocean-300 px-3 py-2 font-mono text-xs dark:border-ocean-700 dark:bg-ocean-900"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => void runSearch()}
            disabled={searching || !sequence.trim()}
            className="rounded-md bg-ocean-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {searching ? 'Searching…' : 'Search'}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>

        {result && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-ocean-500">
              Compared against {result.n_compared.toLocaleString()} records · {result.method} · query{' '}
              {result.query_length} bases
            </p>
            {/* Rendered, never hidden: this ranks by composition, so it is not
                an alignment-grade identification. */}
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {result.caveat}
            </p>
            <div className="overflow-x-auto rounded-md border border-ocean-200 dark:border-ocean-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-ocean-50 text-ocean-600 dark:bg-ocean-900 dark:text-ocean-300">
                  <tr>
                    <th className="px-3 py-2">Similarity</th>
                    <th className="px-3 py-2">Process ID</th>
                    <th className="px-3 py-2">Species</th>
                    <th className="px-3 py-2">Marker</th>
                    <th className="px-3 py-2">Length</th>
                  </tr>
                </thead>
                <tbody>
                  {result.matches.map((m) => (
                    <tr key={m.record_id} className="border-t border-ocean-100 dark:border-ocean-800">
                      <td className="px-3 py-2 font-mono">{m.similarity.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono">{m.process_id ?? '—'}</td>
                      <td className="px-3 py-2 italic">{m.scientific_name ?? '—'}</td>
                      <td className="px-3 py-2">{m.marker_gene ?? '—'}</td>
                      <td className="px-3 py-2">{m.subject_length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Plain-language reading of the table above, computed from this
                specific result (not fixed text) — the table itself assumes
                the reader already knows what "similarity" means here. */}
            {result.matches.length > 0 ? (
              (() => {
                const best = result.matches[0]
                const pct = (best.similarity * 100).toFixed(1)
                const name = best.common_name ?? best.scientific_name ?? 'an unidentified record'
                const band =
                  best.similarity >= 0.95
                    ? 'That is a very close match — this sample most likely belongs to that species.'
                    : best.similarity >= 0.8
                      ? 'That is a fairly close match — probably that species or a close relative, but not certain enough to say for sure.'
                      : "That isn't a strong match to anything in the library — treat this result as inconclusive."
                return (
                  <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
                    <h3 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">
                      In plain words, what this result means
                    </h3>
                    <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ocean-600 dark:text-ocean-300">
                      <li>
                        The closest match found is <strong>{name}</strong>
                        {best.scientific_name && best.scientific_name !== name && (
                          <>
                            {' '}
                            (<em>{best.scientific_name}</em>)
                          </>
                        )}
                        , at <strong>{pct}% similarity</strong>. {band}
                      </li>
                      <li>
                        &ldquo;Similarity&rdquo; here means how alike the short repeating DNA patterns are between
                        your sequence and each library record — like comparing two pieces of text for how many
                        5-letter chunks they share, not reading and matching every single letter in order.
                      </li>
                      <li>
                        Your sequence was checked against <strong>{result.n_compared.toLocaleString()}</strong>{' '}
                        real DNA records in the library, and the table above shows the closest ones found, best
                        match first.
                      </li>
                      <li>
                        This is a quick estimate, not a lab-certified identification — it can be fooled by
                        sequences that share a similar pattern but aren&rsquo;t actually related. For a confirmed
                        identification, the result would need checking with proper alignment tools (like BLAST).
                      </li>
                    </ul>
                  </div>
                )
              })()
            ) : (
              <div className="rounded-lg border border-ocean-200 p-4 text-sm text-ocean-600 dark:border-ocean-800 dark:text-ocean-300">
                No record in the library shared any DNA pattern with this sequence — it may belong to a species
                that simply isn&rsquo;t in this reference library yet.
              </div>
            )}
          </div>
        )}
      </div>

      {records.isLoading ? (
        <LoadingRows rows={6} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ocean-200 dark:border-ocean-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-ocean-50 text-ocean-600 dark:bg-ocean-900 dark:text-ocean-300">
              <tr>
                <th className="px-3 py-2">Process ID</th>
                <th className="px-3 py-2">Identification</th>
                <th className="px-3 py-2">Marker</th>
                <th className="px-3 py-2">BIN</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {records.data?.items.map((r) => (
                <tr key={r.id} className="border-t border-ocean-100 dark:border-ocean-800">
                  <td className="px-3 py-2 font-mono text-xs">{r.process_id}</td>
                  <td className="px-3 py-2 italic">{r.identification ?? '—'}</td>
                  <td className="px-3 py-2">{r.marker_gene ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.bin_uri ?? '—'}</td>
                  <td className="px-3 py-2">{r.country ?? '—'}</td>
                  <td className="px-3 py-2">
                    <DataSourceBadge source={r.source} />
                  </td>
                  <td className="px-3 py-2">
                    {r.barcode_sequence && (
                      <button
                        onClick={() => {
                          setSequence(r.barcode_sequence!)
                          void runSearch(r.barcode_sequence!)
                          searchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                        className="text-xs font-medium text-ocean-600 hover:underline dark:text-ocean-300"
                      >
                        Use this sequence
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
