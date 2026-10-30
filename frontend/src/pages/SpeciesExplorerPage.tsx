import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trans, useTranslation } from 'react-i18next'
import { DataSourceBadge } from '@/components/DataSourceBadge'
import { FilterField, FilterSidebar } from '@/components/FilterSidebar'
import { LoadingRows } from '@/components/LoadingSkeleton'
import { MapView } from '@/components/MapView'
import { speciesExtrasApi } from '@/api/species'
import { useSpeciesList, useSpeciesOccurrences } from '@/hooks/useSpeciesData'
import { placeName } from '@/i18n/dynamic'
import { useFormat } from '@/i18n/format'
import { showsTechnicalDetail, speciesLabel, useViewModeStore } from '@/store/viewMode'

export function SpeciesExplorerPage() {
  const { t, i18n } = useTranslation()
  const fmt = useFormat()
  const [query, setQuery] = useState('')
  const [selectedSpecies, setSelectedSpecies] = useState<number>()

  const mode = useViewModeStore((s) => s.mode)
  // English has no vernacular_name rows at all (common_name already covers
  // it) — skip sending the param so the backend doesn't run a pointless join.
  const species = useSpeciesList({
    q: query || undefined,
    language: i18n.language !== 'en' ? i18n.language : undefined,
    limit: 50,
  })
  const occurrences = useSpeciesOccurrences({ species_id: selectedSpecies, limit: 300 })
  const selected = species.data?.items.find((s) => s.species_id === selectedSpecies)

  const photos = useQuery({
    queryKey: ['species', 'photos', selectedSpecies],
    queryFn: () => speciesExtrasApi.photos(selectedSpecies as number),
    enabled: selectedSpecies !== undefined,
    // GBIF itself (not our backend) occasionally 429s under bursty traffic —
    // a couple of backed-off retries recovers from that automatically,
    // rather than immediately showing "no photos" for what is actually a
    // transient upstream error.
    retry: 2,
    retryDelay: (attempt) => 1000 * 2 ** attempt,
    // The backend re-queries GBIF at most once an hour per species (its own
    // cache); polling here just means a newly-uploaded photo appears while
    // this page is left open, without the visitor needing to reselect the
    // species or reload.
    refetchInterval: 10 * 60 * 1000,
  })
  const context = useQuery({
    // The explanation is model-written in the active language, so it is
    // cached per language.
    queryKey: ['species', 'context', selectedSpecies, i18n.language],
    queryFn: () => speciesExtrasApi.context(selectedSpecies as number, i18n.language),
    enabled: selectedSpecies !== undefined,
    retry: false,
  })
  const regions = useQuery({
    queryKey: ['species', 'regions', selectedSpecies],
    queryFn: () => speciesExtrasApi.regions(selectedSpecies as number),
    enabled: selectedSpecies !== undefined,
    retry: false,
  })
  const vernacularNames = useQuery({
    queryKey: ['species', 'vernacular-names', selectedSpecies],
    queryFn: () => speciesExtrasApi.vernacularNames(selectedSpecies as number),
    enabled: selectedSpecies !== undefined,
    retry: false,
  })
  // Only fetched/applied for the selected species' detail panel, not the
  // sidebar list — labelling all 50 visible list rows would mean 50 extra
  // requests just to populate a dropdown.
  const vernacularName = vernacularNames.data?.names[i18n.language]?.name

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-ocean-950 dark:text-ocean-50">{t('pages.species.title')}</h1>
        <p className="text-sm text-ocean-500">
          {t('pages.species.subtitle')}
          {mode !== 'researcher' && ` ${t('species.commonNamesNote')}`}
        </p>
      </div>

      <div className="flex gap-6">
        <FilterSidebar>
          <FilterField label={t('species.search')}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('species.searchPlaceholder')}
              className="rounded-md border border-ocean-300 px-2 py-1.5 text-sm dark:border-ocean-700 dark:bg-ocean-950"
            />
          </FilterField>

          {species.data && (
            <p className="text-xs text-ocean-500">
              {t('species.resultCount', {
                count: species.data.total,
                shown: fmt.int(species.data.items.length),
                total: fmt.int(species.data.total),
              })}
            </p>
          )}
          {species.isLoading ? (
            <LoadingRows rows={5} />
          ) : species.data && species.data.items.length === 0 ? (
            <p className="text-sm text-ocean-500">{t('species.noResults')}</p>
          ) : (
            <ul className="oasis-scroll flex max-h-96 flex-col gap-1 overflow-y-auto text-sm" data-lenis-prevent>
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
                      const l = speciesLabel(mode, s.scientific_name, s.common_name, s.vernacular_name)
                      return (
                        <>
                          {/* Names are data: scientific binomials are never
                              translated, common/regional names are sourced. */}
                          <span translate="no" className={l.primaryIsScientific ? 'italic' : ''}>
                            {l.primary}
                          </span>
                          {l.secondary && (
                            <span translate="no" className="ml-1 text-xs italic opacity-70">
                              {l.secondary}
                            </span>
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
                const l = speciesLabel(mode, selected.scientific_name, selected.common_name, vernacularName)
                return (
                  <>
                    <h2
                      translate="no"
                      className={`mb-1 text-base font-semibold text-ocean-950 dark:text-ocean-50 ${
                        l.primaryIsScientific ? 'italic' : ''
                      }`}
                    >
                      {l.primary}
                    </h2>
                    {l.secondary && (
                      <p translate="no" className="mb-2 italic text-ocean-600 dark:text-ocean-300">
                        {l.secondary}
                      </p>
                    )}
                    {/* Attribution, same reasoning as the photo credits below:
                        this is a real term sourced from a named reference,
                        not a machine translation, and that's worth saying. */}
                    {vernacularName && l.primary === vernacularName && (
                      <p className="mb-2 text-xs text-ocean-500">
                        {/* A phonetic rendering of the English name is never
                            passed off as a recorded local name. */}
                        {vernacularNames.data?.names[i18n.language]?.source === 'Transliteration'
                          ? t('species.transliterated')
                          : (
                            <Trans
                              i18nKey="species.regionalNameVia"
                              values={{ source: vernacularNames.data?.names[i18n.language]?.source }}
                              components={{ name: <span translate="no" /> }}
                            />
                          )}
                      </p>
                    )}
                    {/* Honest about the gap rather than silently showing Latin
                        to an audience that asked for common names. */}
                    {l.primaryIsScientific && mode !== 'researcher' && (
                      <p className="mb-2 text-xs text-ocean-500">
                        {t('species.noCommonName')}
                      </p>
                    )}
                  </>
                )
              })()}
              {showsTechnicalDetail(mode) && (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-ocean-700 dark:text-ocean-300">
                {(
                  [
                    [t('species.rank.kingdom'), selected.kingdom],
                    [t('species.rank.phylum'), selected.phylum],
                    [t('species.rank.class'), selected.class],
                    [t('species.rank.order'), selected.order],
                    [t('species.rank.family'), selected.family],
                    [t('species.rank.genus'), selected.genus],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-ocean-500">{label}</dt>
                    {/* Taxon names are scientific and stay as recorded. */}
                    <dd translate="no">{value ?? '—'}</dd>
                  </div>
                ))}
              </dl>
              )}
            </div>
          )}

          {selected && (photos.data?.photos.length ?? 0) > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-ocean-700 dark:text-ocean-200">
                {photos.data?.photos_are_recent ? t('species.photos.recentTitle') : t('species.photos.title')}
              </h3>
              <p className="mb-2 text-[11px] text-ocean-500">
                {photos.data?.photos_are_recent
                  ? t('species.photos.recentNote', { count: photos.data?.recent_window_days ?? 0 })
                  : t('species.photos.olderNote', { count: photos.data?.recent_window_days ?? 0 })}
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
                      <div translate="no">{p.grid_cell ?? '—'}</div>
                      {/* Attribution is not optional: these are CC-licensed
                          photos by named people. */}
                      <div className="truncate">
                        <span translate="no">{p.photographer ?? t('species.photos.unknownPhotographer')}</span> ·{' '}
                        <span translate="no">{p.license ?? t('species.photos.seeSource')}</span>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <p className="text-[11px] text-ocean-500">{t('species.photos.source')}</p>
            </div>
          )}

          {selected && photos.isError && (
            <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
              {t('species.photos.unavailable')}
            </p>
          )}

          {selected && photos.isFetched && !photos.isError && (photos.data?.photos.length ?? 0) === 0 && (
            <p className="mb-4 text-xs text-ocean-500">
              {(photos.data?.total_with_photos ?? 0) > 0
                ? t('species.photos.noneRecent', { count: photos.data?.recent_window_days ?? 0 })
                : t('species.photos.none')}
            </p>
          )}

          {selected && context.data && (
            <div className="mb-4 rounded-lg border border-ocean-200 p-4 text-sm dark:border-ocean-800">
              <h3 className="mb-1 text-sm font-semibold text-ocean-700 dark:text-ocean-200">
                {t('species.context.title')}
              </h3>
              {context.data.explanation ? (
                // Model-written, in the reader's language (see the context
                // query); species names inside it stay scientific.
                <p data-generated="llm" className="text-ocean-600 dark:text-ocean-300">
                  {context.data.explanation}
                </p>
              ) : (
                <p className="text-ocean-500">{t('species.context.noLlm')}</p>
              )}
              {context.data.relocation_note && (
                // The doc asked for a relocation forecast. Saying why there
                // isn't one is more useful than a number nobody should trust.
                <p className="mt-2 text-xs text-ocean-500">
                  <strong>{t('species.context.relocationLabel')}</strong> {t('species.context.relocationNote')}
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
              name: placeName(r.name),
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
                {regions.data && regions.data.regions.length > 0
                  ? t('species.foundIn', { regions: regions.data.regions.map((r) => placeName(r.name)).join(', ') })
                  : t('species.notInState')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
