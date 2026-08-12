import { useState } from 'react'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { molecularApi, type SequenceMatchResult } from '@/api/molecular'
import { useMolecularRecords } from '@/hooks/useMolecularData'

export function MolecularPage() {
  const records = useMolecularRecords({ limit: 50 })
  const [sequence, setSequence] = useState('')
  const [result, setResult] = useState<SequenceMatchResult>()
  const [error, setError] = useState<string>()
  const [searching, setSearching] = useState(false)

  async function runSearch() {
    if (!sequence.trim() || searching) return
    setSearching(true)
    setError(undefined)
    try {
      setResult(await molecularApi.match(sequence))
    } catch (e) {
      setError((e as Error).message)
      setResult(undefined)
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">
          Molecular — DNA barcode reference library
        </h1>
        <p className="text-sm text-ocean-500">
          1,993 DNA barcodes from BOLD Systems, collected in India. This is the reference library you match
          unknown sequences against.
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

      <div className="flex flex-col gap-2 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
        <h2 className="text-sm font-semibold text-ocean-950 dark:text-ocean-50">Barcode similarity search</h2>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
