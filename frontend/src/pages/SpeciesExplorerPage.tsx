import { useState } from 'react'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { FilterField, FilterSidebar } from '@/components/FilterSidebar'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { MapView } from '@/components/MapView'
import { useSpeciesList, useSpeciesOccurrences } from '@/hooks/useSpeciesData'

export function SpeciesExplorerPage() {
  const [query, setQuery] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<number>()

  const species = useSpeciesList({ q: query || undefined, limit: 50 })
  const occurrences = useSpeciesOccurrences({ species_id: selectedSpecies, limit: 300 })
  const selected = species.data?.items.find((s) => s.species_id === selectedSpecies)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Species / Biodiversity Explorer</h1>
        <p className="text-sm text-ocean-500">
          Deduplicated across OBIS, GBIF, BOLD and Sea Around Us by binomial scientific name.
        </p>
      </div>

      <div className="flex gap-6">
        <FilterSidebar>
          <FilterField label="Search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scientific or common name"
              className="rounded-md border border-ocean-300 px-2 py-1.5 text-sm dark:border-ocean-700 dark:bg-ocean-950"
            />
          </FilterField>

          {species.isLoading ? (
            <LoadingRows rows={5} />
          ) : (
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto text-sm">
              {species.data?.items.map((s) => (
                <li key={s.species_id}>
                  <button
                    onClick={() => setSelectedSpecies(s.species_id)}
                    className={`w-full rounded px-2 py-1 text-left italic ${
                      s.species_id === selectedSpecies
                        ? 'bg-ocean-600 text-white'
                        : 'hover:bg-ocean-100 dark:hover:bg-ocean-900'
                    }`}
                  >
                    {s.scientific_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          {selected && (
            <div className="mb-4 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
              <h2 className="mb-1 text-base font-semibold italic text-ocean-950 dark:text-ocean-50">
                {selected.scientific_name}
              </h2>
              {selected.common_name && <p className="mb-2 text-ocean-600 dark:text-ocean-300">{selected.common_name}</p>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-ocean-700 dark:text-ocean-300">
                {(
                  [
                    ['Kingdom', selected.kingdom],
                    ['Phylum', selected.phylum],
                    ['Class', selected.class],
                    ['Order', selected.order],
                    ['Family', selected.family],
                    ['Genus', selected.genus],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ocean-500">{label}</dt>
                    <dd>{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <MapView
            markers={(occurrences.data?.items ?? [])
              .filter((o) => o.lat !== null && o.lon !== null)
              .map((o) => ({ id: o.id, lat: o.lat!, lon: o.lon!, kind: 'occurrence' as const }))}
            height={380}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {[...new Set((occurrences.data?.items ?? []).map((o) => o.source))].map((s) => (
              <DataSourceBadge key={s} source={s} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
