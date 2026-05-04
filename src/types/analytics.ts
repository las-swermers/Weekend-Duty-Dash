export interface PastoralFilters {
  startDate: string;
  endDate: string;
  categories?: string[];
  houseIds?: number[];
  yearLevels?: string[];
  watchlistOnly?: boolean;
  includeSensitive?: boolean;
  search?: string;
}

export interface EnrichedPastoral {
  id: number;
  date: string;
  category: string | null;
  description: string;
  action: string;
  note: string;
  watchlist: boolean;
  watchlistExpiry: string | null;
  sensitive: boolean;
  studentId: number;
  studentName: string;
  initials: string;
  yearLevel: string | null;
  house: string | null;
  houseId: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Proxy "time to serve": for records that were placed on the watchlist
// (watchlist_expiry is set) and are no longer on it, treat updated_at as
// the moment a staff member cleared the flag in Orah. Imperfect — any
// later edit to the record drifts the number — but useful as a directional
// KPI without extra storage.
export interface TimeToServeStats {
  count: number;
  medianHours: number | null;
  avgHours: number | null;
}

export interface PastoralAggregations {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  byHouse: Array<{ house: string; count: number }>;
  byCreator: Array<{ creator: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  watchlistCount: number;
  sensitiveCount: number;
  timeToServe: TimeToServeStats;
}

export interface PastoralResponse {
  records: EnrichedPastoral[];
  aggregations: PastoralAggregations;
  meta: {
    totalFetched: number;
    fetchedRange: { start: string; end: string };
    sensitiveRedacted: boolean;
  };
}

export interface PastoralMeta {
  categories: string[];
  houses: Array<{ id: number; name: string }>;
  yearLevels: string[];
  defaultRange: { start: string; end: string };
}
