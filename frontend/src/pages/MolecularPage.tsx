import { useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { molecularApi, type SequenceMatchResult } from '@/api/molecular'
import { useMolecularRecords } from '@/hooks/useMolecularData'
import { placeName } from '@/i18n/dynamic'
import { describeError } from '@/i18n/errors'
import { useFormat } from '@/i18n/format'

export function MolecularPage() {
  const { t } = useTranslation()
  const fmt = useFormat()
  const records = useMolecularRecords({ limit: 50 })
  const [sequence, setSequence] = useState('')
  const [result, setResult] = useState<SequenceMatchResult>()
  const [error, setError] = useState<string>()
  const [searching, setSearching] = useState(false)
  const [selectedExample, setSelectedExample] = useState('')
  const searchSectionRef = useRef<HTMLDivElement>(null)
  const libraryTotal = records.data?.total

  async function runSearch(seq: string = sequence) {
    if (!seq.trim() || searching) return
    setSearching(true)
    setError(undefined)
    try {
      setResult(await molecularApi.match(seq))
    } catch (e) {
      setError(describeError(e))
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
  // but real ones are already loaded in the table below. Reusing one of
  // those (rather than asking the backend for a fresh random pick) means
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

  const b = <strong />
  const em = <em />

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.molecular.title')}</h1>
        <p className="text-sm text-ocean-500">
          {t('pages.molecular.subtitle', { count: libraryTotal ?? 0, total: libraryTotal ? fmt.int(libraryTotal) : '…' })}{' '}
          {t('molecular.subtitleSuffix')}
        </p>
      </div>

      <details className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
        <summary className="cursor-pointer font-semibold text-ocean-700 dark:text-ocean-200">
          {t('molecular.about.title')}
        </summary>
        <div className="mt-3 flex flex-col gap-3 text-ocean-600 dark:text-ocean-300">
          <p>
            <Trans i18nKey="molecular.about.barcode" components={{ b }} />
          </p>
          {/* The honest correction. The page was titled "eDNA", the data is not
              eDNA, and that mismatch is what makes the section confusing. */}
          <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <Trans i18nKey="molecular.about.notEdna" components={{ b, em }} />
          </p>
          <p>
            <Trans i18nKey="molecular.about.columns" components={{ b, em }} />
          </p>
          <p>
            <Trans
              i18nKey="molecular.about.whatYouCanDo"
              values={{ total: libraryTotal ? fmt.int(libraryTotal) : '…' }}
              components={{ b }}
            />
          </p>
        </div>
      </details>

      <div ref={searchSectionRef} className="flex flex-col gap-2 rounded-lg border border-ocean-200 p-4 dark:border-ocean-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ocean-950 dark:text-ocean-50">{t('molecular.search.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ocean-500">{t('molecular.search.noSequence')}</span>
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
              <option value="">{t('molecular.search.pickExample')}</option>
              {exampleOptions.map((o) => (
                <option key={o.id} value={o.id} translate="no">
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={tryExample}
              disabled={searching || !records.data?.items.some((r) => r.barcode_sequence)}
              className="rounded-md border border-ocean-300 px-3 py-1.5 text-xs font-medium text-ocean-700 hover:bg-ocean-100 disabled:opacity-50 dark:border-ocean-700 dark:text-ocean-200 dark:hover:bg-ocean-900"
            >
              {t('molecular.search.surprise')}
            </button>
          </div>
        </div>
        <textarea
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
          rows={4}
          translate="no"
          placeholder={t('molecular.search.placeholder')}
          className="w-full rounded-md border border-ocean-300 px-3 py-2 font-mono text-xs dark:border-ocean-700 dark:bg-ocean-900"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => void runSearch()}
            disabled={searching || !sequence.trim()}
            className="rounded-md bg-ocean-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {searching ? t('molecular.search.searching') : t('molecular.search.search')}
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>

        {result && (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-ocean-500">
              {t('molecular.result.meta', {
                compared: fmt.int(result.n_compared),
                bases: fmt.int(result.query_length),
                method: t('molecular.result.method'),
              })}
            </p>
            {/* Rendered, never hidden: this ranks by composition, so it is not
                an alignment-grade identification. The backend's caveat is
                fixed English; the same text comes from the dictionary. */}
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              {t('molecular.result.caveat')}
            </p>
            <div className="overflow-x-auto rounded-md border border-ocean-200 dark:border-ocean-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-ocean-50 text-ocean-600 dark:bg-ocean-900 dark:text-ocean-300">
                  <tr>
                    <th className="px-3 py-2">{t('molecular.columns.similarity')}</th>
                    <th className="px-3 py-2">{t('molecular.columns.processId')}</th>
                    <th className="px-3 py-2">{t('molecular.columns.species')}</th>
                    <th className="px-3 py-2">{t('molecular.columns.marker')}</th>
                    <th className="px-3 py-2">{t('molecular.columns.length')}</th>
                  </tr>
                </thead>
                <tbody translate="no">
                  {result.matches.map((m) => (
                    <tr key={m.record_id} className="border-t border-ocean-100 dark:border-ocean-800">
                      <td className="px-3 py-2 font-mono">{m.similarity.toFixed(4)}</td>
                      <td className="px-3 py-2 font-mono">{m.process_id ?? '—'}</td>
                      <td className="px-3 py-2 italic">{m.scientific_name ?? '—'}</td>
                      <td className="px-3 py-2">{m.marker_gene ?? '—'}</td>
                      <td className="px-3 py-2">{fmt.int(m.subject_length)}</td>
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
                const name = best.common_name ?? best.scientific_name ?? t('molecular.plain.unidentified')
                const band =
                  best.similarity >= 0.95
                    ? t('molecular.plain.bandStrong')
                    : best.similarity >= 0.8
                      ? t('molecular.plain.bandFair')
                      : t('molecular.plain.bandWeak')
                return (
                  <div className="rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
                    <h3 className="mb-2 font-semibold text-ocean-700 dark:text-ocean-200">
                      {t('molecular.plain.title')}
                    </h3>
                    <ul className="flex list-disc flex-col gap-1.5 pl-4 text-ocean-600 dark:text-ocean-300">
                      <li>
                        <Trans
                          i18nKey="molecular.plain.closest"
                          values={{ pct: fmt.fixed(best.similarity * 100, 1) }}
                          components={{
                            b,
                            name: (
                              <strong translate="no">
                                {name}
                                {best.scientific_name && best.scientific_name !== name && (
                                  <>
                                    {' '}
                                    (<em>{best.scientific_name}</em>)
                                  </>
                                )}
                              </strong>
                            ),
                          }}
                        />{' '}
                        {band}
                      </li>
                      <li>{t('molecular.plain.similarityMeans')}</li>
                      <li>
                        <Trans
                          i18nKey="molecular.plain.checkedAgainst"
                          values={{ count: fmt.int(result.n_compared) }}
                          components={{ b }}
                        />
                      </li>
                      <li>{t('molecular.plain.estimate')}</li>
                    </ul>
                  </div>
                )
              })()
            ) : (
              <div className="rounded-lg border border-ocean-200 p-4 text-sm text-ocean-600 dark:border-ocean-800 dark:text-ocean-300">
                {t('molecular.plain.noMatch')}
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
                <th className="px-3 py-2">{t('molecular.columns.processId')}</th>
                <th className="px-3 py-2">{t('molecular.columns.identification')}</th>
                <th className="px-3 py-2">{t('molecular.columns.marker')}</th>
                <th className="px-3 py-2">BIN</th>
                <th className="px-3 py-2">{t('molecular.columns.country')}</th>
                <th className="px-3 py-2">{t('molecular.columns.source')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {records.data?.items.map((r) => (
                <tr key={r.id} className="border-t border-ocean-100 dark:border-ocean-800">
                  <td translate="no" className="px-3 py-2 font-mono text-xs">
                    {r.process_id}
                  </td>
                  <td translate="no" className="px-3 py-2 italic">
                    {r.identification ?? '—'}
                  </td>
                  <td translate="no" className="px-3 py-2">
                    {r.marker_gene ?? '—'}
                  </td>
                  <td translate="no" className="px-3 py-2 font-mono text-xs">
                    {r.bin_uri ?? '—'}
                  </td>
                  <td className="px-3 py-2">{r.country ? placeName(r.country) : '—'}</td>
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
                        {t('molecular.useSequence')}
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
