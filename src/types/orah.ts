// Orah Open API response types. Confirmed against the LAS tenant on
// 2026-04-28 by hitting house/list, location/tree and others through
// /api/orah/diagnose. See docs/orah-discovery.md.

export interface OrahEnvelope<T> {
  data: T;
}

export interface OrahHouse {
  model: "house";
  id: number;
  name: string;
  sis_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrahHouseRef {
  id: number;
  sis_id?: string | null;
  name?: string;
}

export interface OrahStudent {
  model: "student";
  id: number;
  first_name?: string;
  last_name?: string;
  alt_name?: string;
  email?: string;
  year_level?: string;
  room_number?: string;
  bed_number?: string;
  deactivated?: boolean;
  sis_id?: string | null;
  house?: OrahHouseRef;
}

export interface OrahLocationRef {
  id: number;
  name: string;
}

export interface OrahLocation {
  model: "location";
  id: number;
  name: string;
  description?: string;
  type?: string;
  state?: "on_grounds" | "off_grounds" | "home" | string;
  child_locations?: Array<{ id: number; name: string }>;
  created_at?: string;
  updated_at?: string;
}

export interface OrahLocationRecord {
  model: "location_record";
  id: number;
  type: "in" | "out";
  record_time: string;
  location: OrahLocationRef;
  student: { id: number; sis_id?: string | null };
  created_at: string;
  updated_at: string;
}

export interface OrahPastoralRecord {
  model: "pastoral";
  id: number;
  date: string;
  description?: string;
  action?: string;
  note?: string;
  watchlist?: boolean;
  watchlist_expiry?: string | null;
  sensitive?: boolean;
  pastoral_category?: { id: number; name: string };
  student: { id: number; sis_id?: string | null };
  created_by?: { id: number; name: string };
  created_at: string;
  updated_at: string;
}

export interface OrahLeave {
  model: "leave";
  id: number;
  status: string;
  start_time: string;
  end_time: string;
  note?: string;
  location?: OrahLocationRef;
  leave_type?: { id: number; name: string; short_code?: string };
  student: { id: number; sis_id?: string | null };
  created_at: string;
  updated_at: string;
}
