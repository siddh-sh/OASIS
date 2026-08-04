import { DataSourceBadge } from '@/components/DataSourceBadge'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { useMolecularRecords } from '@/hooks/useMolecularData'

export function MolecularPage() {
  const records = useMolecularRecords({ limit: 50 })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Molecular / eDNA</h1>
        <p className="text-sm text-ocean-500">BOLD Systems DNA barcode records — text sequences, not imagery.</p>
      </div>

      <div className="rounded-lg border border-dashed border-ocean-300 p-4 text-sm text-ocean-500 dark:border-ocean-700">
        Barcode similarity search (Should-Have, POST /api/molecular/match) isn't implemented yet — planned as a
        k-mer-frequency cosine similarity ranking, not full BLAST alignment (see flow.md §1).
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
