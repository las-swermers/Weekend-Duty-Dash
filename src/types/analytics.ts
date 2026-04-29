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
  sensitive: boolean;
  studentId: number;
  studentName: string;
  initials: string;
  yearLevel: string | null;
  house: string | null;
  houseId: number | null;
  createdBy: string | null;
}

export interface PastoralAggregations {
  total: number;
  byCategory: Array<{ category: string; count: number }>;
  byHouse: Array<{ house: string; count: number }>;
  byCreator: Array<{ creator: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
  watchlistCount: number;
  sensitiveCount: number;
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
