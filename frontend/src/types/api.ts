// Mirrors backend/app/schemas/*.py. Keep in sync by hand for now — see
// docs/api-reference.md (Phase 9) for the generated source of truth once
// that exists.

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

// ---------------------------------------------------------------- ocean
export type StationType = 'in-situ-buoy' | 'coastal-anchor' | 'satellite-grid'

export interface Station {
  station_id: number
  name: string | null
  station_type: StationType
  wmo_platform_code: number | null
  lat: number
  lon: number
  region_id: number | null
}

export interface Reading {
  id: number
  station_id: number
  timestamp: string
  sst: number | null
  chlorophyll_a: number | null
  salinity: number | null
  dissolved_oxygen: number | null
  ph: number | null
  source: string
}

export interface ReadingsSummary {
  variable: string
  region_id: number | null
  count: number
  avg_value: number | null
  min_value: number | null
  max_value: number | null
}

export interface SensorReading {
  id: number
  station_id: number
  obs_date: string
  sst_c: number | null
  air_temp_c: number | null
  wind_speed_ms: number | null
  rel_humidity_pct: number | null
  barometric_pressure_hpa: number | null
  salinity_psu: number | null
  source: string
}

// --------------------------------------------------------------- weather
export interface WeatherObservation {
  id: number
  region_id: number
  station_id: number | null
  obs_date: string
  temp_max_c: number | null
  temp_min_c: number | null
  precipitation_mm: number | null
  wind_speed_kmh: number | null
  pressure_hpa: number | null
  source: string
}

// --------------------------------------------------------------- species
export interface Species {
  species_id: number
  scientific_name: string
  common_name: string | null
  kingdom: string | null
  phylum: string | null
  class?: string | null
  order?: string | null
  family: string | null
  genus: string | null
  species_epithet: string | null
  iucn_status: string | null
}

export interface SpeciesOccurrence {
  id: number
  species_id: number | null
  lat: number | null
  lon: number | null
  occurred_at: string | null
  depth: number | null
  basis_of_record: string | null
  sst: number | null
  sss: number | null
  bathymetry: number | null
  shoredistance: number | null
  source: string
  external_id: string | null
}

// ------------------------------------------------------------- fisheries
export interface FisheriesNationalTotal {
  id: number
  country: string
  year: number
  catch_metric_tons: number
  source: string
}

export interface FisheriesCatch {
  id: number
  species_id: number | null
  region_id: number | null
  catch_date: string
  catch_weight_kg: number
  gear_type: string | null
  source: string
}

export interface FisheriesSummary {
  national_totals: FisheriesNationalTotal[]
  granular_catch: FisheriesCatch[]
  granular_catch_note: string
}

// ------------------------------------------------------------- molecular
export interface MolecularRecord {
  id: number
  species_id: number | null
  process_id: string
  bin_uri: string | null
  barcode_sequence: string | null
  marker_gene: string | null
  identification: string | null
  country: string | null
  province_state: string | null
  lat: number | null
  lon: number | null
  collected_at: string | null
  source: string
}

// ----------------------------------------------------------------- admin
export interface DatasetStatus {
  id: number
  source_name: string
  dataset_type: string
  last_synced_at: string | null
  record_count: number | null
  license: string | null
  last_cleaning_notes: string | null
}

// ------------------------------------------------------------------ auth
export type UserRole = 'researcher' | 'policymaker' | 'admin'

export interface Profile {
  user_id: string
  email: string | null
  full_name: string | null
  role: UserRole
  institution: string | null
  created_at: string
}

export interface AuthTokenResponse {
  access_token: string
  refresh_token: string | null
  token_type: string
  expires_in: number | null
}
