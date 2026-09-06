import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { FilterField, FilterSidebar } from '@/components/FilterSidebar'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { MapView } from '@/components/MapView'
import { speciesExtrasApi } from '@/api/species'
import { useSpeciesList, useSpeciesOccurrences } from '@/hooks/useSpeciesData'
import { showsTechnicalDetail, speciesLabel, useViewModeStore } from '@/store/viewMode'

export function SpeciesExplorerPage() {
  const [query, setQuery] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<number>()

  const mode = useViewModeStore((s) => s.mode)
  const species = useSpeciesList({ q: query || undefined, limit: 50 })
  const occurrences = useSpeciesOccurrences({ species_id: selectedSpecies, limit: 300 })
  const selected = species.data?.items.find((s) => s.species_id === selectedSpecies)

  const photos = useQuery({
    queryKey: ['species', 'photos', selectedSpecies],
    queryFn: () => speciesExtrasApi.photos(selectedSpecies as number),
    enabled: selectedSpecies !== undefined,
    retry: false,
    // The backend re-queries GBIF at most once an hour per species (its own
    // cache); polling here just means a newly-uploaded photo appears while
    // this page is left open, without the visitor needing to reselect the
    // species or reload.
    refetchInterval: 10 * 60 * 1000,
  })
  const context = useQuery({
    queryKey: ['species', 'context', selectedSpecies],
    queryFn: () => speciesExtrasApi.context(selectedSpecies as number),
    enabled: selectedSpecies !== undefined,
    retry: false,
  })
  const regions = useQuery({
    queryKey: ['species', 'regions', selectedSpecies],
    queryFn: () => speciesExtrasApi.regions(selectedSpecies as number),
    enabled: selectedSpecies !== undefined,
    retry: false,
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">Species / Biodiversity Explorer</h1>
        <p className="text-sm text-ocean-500">
          Deduplicated across OBIS, GBIF, BOLD and Sea Around Us by binomial scientific name.
          {mode !== 'researcher' && ' Showing common names where we have them.'}
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
                    className={`w-full rounded px-2 py-1 text-left ${
                      s.species_id === selectedSpecies
                        ? 'bg-ocean-600 text-white'
                        : 'hover:bg-ocean-100 dark:hover:bg-ocean-900'
                    }`}
                  >
                    {(() => {
                      const l = speciesLabel(mode, s.scientific_name, s.common_name)
                      return (
                        <>
                          <span className={l.primaryIsScientific ? 'italic' : ''}>{l.primary}</span>
                          {l.secondary && (
                            <span className="ml-1 text-xs italic opacity-70">{l.secondary}</span>
                          )}
                        </>
                      )
                    })()}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FilterSidebar>

        <div className="min-w-0 flex-1">
          {selected && (
            <div className="mb-4 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
              {(() => {
                const l = speciesLabel(mode, selected.scientific_name, selected.common_name)
                return (
                  <>
                    <h2
                      className={`mb-1 text-base font-semibold text-ocean-950 dark:text-ocean-50 ${
                        l.primaryIsScientific ? 'italic' : ''
                      }`}
                    >
                      {l.primary}
                    </h2>
                    {l.secondary && (
                      <p className="mb-2 italic text-ocean-600 dark:text-ocean-300">{l.secondary}</p>
                    )}
                    {/* Honest about the gap rather than silently showing Latin
                        to an audience that asked for common names. */}
                    {l.primaryIsScientific && mode !== 'researcher' && (
                      <p className="mb-2 text-xs text-ocean-500">
                        No common name recorded for this species — showing its scientific name.
                      </p>
                    )}
                  </>
                )
              })()}
              {showsTechnicalDetail(mode) && (
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
              )}
            </div>
          )}

          {selected && (photos.data?.photos.length ?? 0) > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-ocean-700 dark:text-ocean-200">
                Recent sightings, photographed
              </h3>
              <p className="mb-2 text-[11px] text-ocean-500">
                Photographed within the last {photos.data?.recent_window_days} days. Refreshes automatically as
                new sightings are uploaded.
              </p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {photos.data?.photos.map((p) => (
                  <figure key={p.url} className="w-40 shrink-0">
                    <img
                      src={p.url}
                      alt={selected.scientific_name}
                      loading="lazy"
                      className="h-28 w-40 rounded-md object-cover"
                    />
                    <figcaption className="mt-1 text-[11px] leading-tight text-ocean-500">
                      <div>{p.grid_cell ?? '—'}{p.observed_at ? ` · ${p.observed_at.slice(0, 10)}` : ''}</div>
                      {/* Attribution is not optional: these are CC-licensed
                          photos by named people. */}
                      <div className="truncate">
                        {p.photographer ?? 'Unknown'} · {p.license ?? 'see source'}
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-[11px] text-ocean-500">{photos.data?.source}</p>
            </div>
          )}

          {selected && photos.isFetched && (photos.data?.photos.length ?? 0) === 0 && (
            <p className="mb-4 text-xs text-ocean-500">
              {(photos.data?.total_with_photos ?? 0) > 0 ? (
                <>
                  No recent photos of this species found (last {photos.data?.recent_window_days} days) — this
                  section will update automatically if a new sighting is photographed.
                </>
              ) : (
                'No photographed occurrence of this species in India is available from GBIF.'
              )}
            </p>
          )}

          {selected && context.data && (
            <div className="mb-4 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
              <h3 className="mb-1 text-sm font-semibold text-ocean-700 dark:text-ocean-200">
                Why it is found here
              </h3>
              {context.data.explanation ? (
                <p className="text-ocean-600 dark:text-ocean-300">{context.data.explanation}</p>
              ) : (
                <p className="text-ocean-500">{context.data.note}</p>
              )}
              {context.data.relocation_note && (
                // The doc asked for a relocation forecast. Saying why there
                // isn't one is more useful than a number nobody should trust.
                <p className="mt-2 text-xs text-ocean-500">
                  <strong>Future relocation:</strong> {context.data.relocation_note}
                </p>
              )}
            </div>
          )}

          <MapView
            markers={(occurrences.data?.items ?? [])
              .filter((o) => o.lat !== null && o.lon !== null)
              .map((o) => ({ id: o.id, lat: o.lat!, lon: o.lon!, kind: 'occurrence' as const }))}
            regionShapes={(regions.data?.regions ?? []).map((r) => ({
              id: r.region_id,
              name: r.name,
              positions: r.polygon,
            }))}
            height={380}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[...new Set((occurrences.data?.items ?? []).map((o) => o.source))].map((s) => (
              <DataSourceBadge key={s} source={s} />
            ))}
            {selected && regions.isFetched && (
              <span className="text-[11px] text-ocean-500">
                {regions.data && regions.data.regions.length > 0 ? (
                  <>
                    Found in: {regions.data.regions.map((r) => r.name).join(', ')} (shaded above — a
                    simplified state outline, not a surveyed boundary).
                  </>
                ) : (
                  'No sightings fall within a coastal state boundary we have on file (open water, or outside the 9 states covered).'
                )}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
