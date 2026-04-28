// Orah Open API response types.
//
// These shapes are based on the public help-center summary. They are
// expected to be confirmed and tightened during Phase 0 — see
// docs/orah-discovery.md.

export interface OrahHouse {
  id: number;
  name: string;
}

export interface OrahStudent {
  id: number;
  sis_id: string | null;
  first_name?: string;
  last_name?: string;
  house?: OrahHouse;
}

export interface LocationRecord {
  model: "location_record";
  id: number;
  type: "in" | "out";
  record_time: string; // ISO 8601
  location: { id: number; name: string };
  student: OrahStudent;
  created_at: string;
  updated_at: string;
}

// PastoralRecord, LeaveRequest, ScheduledTrip — define after Phase 0
// confirms the field shapes.
export interface PastoralRecord {
  id: number;
  student: OrahStudent;
  category?: string;
  note?: string;
  starts_at?: string;
  ends_at?: string;
}

export interface LeaveRequest {
  id: number;
  student: OrahStudent;
  destination?: string;
  status: "pending" | "approved" | "denied" | string;
  depart_at?: string;
  return_at?: string;
  chaperone?: string;
}

export interface ScheduledTrip {
  id: string | number;
  title: string;
  lead?: string;
  count: number;
  depart_at?: string;
  return_at?: string;
}
