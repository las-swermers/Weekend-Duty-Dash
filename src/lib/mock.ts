// Mock data ported from prototype/data.jsx. Used by API routes when
// USE_MOCK_DATA=1 (i.e. before Phase 0 / Phase 2 are complete) and by
// the dashboard for its initial render.

import type { Resource } from "@/types/resource";

export interface HCStudent {
  id: number;
  name?: string;
  initials: string;
  dorm: string;
  reason: string;
  since: string;
  status: "in" | "overnight";
  location?: string;
  locationId?: number;
}

export interface NoPaStudent {
  id: number;
  name?: string;
  initials: string;
  dorm: string;
  restriction: string;
  until: string;
}

export interface TravelRequest {
  id: number;
  name?: string;
  initials: string;
  dorm: string;
  destination: string;
  depart: string;
  return: string;
  status: "approved" | "pending" | "denied" | "signed-out";
  chaperone: string;
}

export interface MockTrip {
  id: string;
  title: string;
  lead: string;
  count: number;
  depart: string;
  return: string;
}

export const WEEKEND = {
  label: "Weekend of May 1–3, 2026",
  short: "May 1–3, 2026",
  friday: "Fri 1 May",
  saturday: "Sat 2 May",
  sunday: "Sun 3 May",
};

export const HC_STUDENTS: HCStudent[] = [
  {
    id: 1,
    initials: "M.B.",
    dorm: "Belle Époque",
    reason: "Migraine — overnight obs.",
    since: "8h 30m",
    status: "overnight",
  },
  {
    id: 2,
    initials: "L.K.",
    dorm: "Savoy",
    reason: "Sprained ankle, PT review",
    since: "2h 15m",
    status: "in",
  },
  {
    id: 3,
    initials: "T.A.",
    dorm: "Hadsom",
    reason: "Fever 38.4°",
    since: "45m",
    status: "in",
  },
  {
    id: 4,
    initials: "S.R.",
    dorm: "Fairmont",
    reason: "Post-procedure rest",
    since: "1h",
    status: "in",
  },
];

export const NO_PA_STUDENTS: NoPaStudent[] = [
  {
    id: 5,
    initials: "J.D.",
    dorm: "Belle Époque",
    restriction: "No contact sports",
    until: "Mon 4 May",
  },
  {
    id: 6,
    initials: "C.V.",
    dorm: "Savoy",
    restriction: "No skiing / high altitude",
    until: "End of term",
  },
  {
    id: 7,
    initials: "P.M.",
    dorm: "North",
    restriction: "Cleared walking only",
    until: "Wed 6 May",
  },
];

export const TRAVEL_REQUESTS: TravelRequest[] = [
  {
    id: 8,
    initials: "A.S.",
    dorm: "Belle Époque",
    destination: "Geneva",
    depart: "Fri 16:00",
    return: "Sun 19:00",
    status: "approved",
    chaperone: "Family",
  },
  {
    id: 9,
    initials: "N.O.",
    dorm: "Savoy",
    destination: "Lausanne — orthodontist",
    depart: "Sat 09:30",
    return: "Sat 14:00",
    status: "approved",
    chaperone: "Self",
  },
  {
    id: 10,
    initials: "K.W.",
    dorm: "Fairmont",
    destination: "Zürich Airport",
    depart: "Sun 06:00",
    return: "—",
    status: "approved",
    chaperone: "Driver",
  },
  {
    id: 11,
    initials: "R.E.",
    dorm: "Hadsom",
    destination: "Montreux",
    depart: "Sat 11:00",
    return: "Sat 22:00",
    status: "pending",
    chaperone: "Host family",
  },
  {
    id: 12,
    initials: "Y.T.",
    dorm: "North",
    destination: "Bern",
    depart: "Sat 08:00",
    return: "Sun 17:00",
    status: "pending",
    chaperone: "Family",
  },
  {
    id: 13,
    initials: "I.P.",
    dorm: "Belle Époque",
    destination: "Visp — train",
    depart: "Fri 17:30",
    return: "Sun 18:00",
    status: "approved",
    chaperone: "Family",
  },
  {
    id: 14,
    initials: "B.G.",
    dorm: "Savoy",
    destination: "Vevey",
    depart: "Sat 10:00",
    return: "Sat 18:00",
    status: "approved",
    chaperone: "Host family",
  },
  {
    id: 15,
    initials: "F.A.",
    dorm: "Fairmont",
    destination: "Aigle — appointment",
    depart: "Sat 13:00",
    return: "Sat 17:00",
    status: "approved",
    chaperone: "Self",
  },
];

export const SCHEDULED_TRIPS: MockTrip[] = [
  {
    id: "t1",
    title: "Mountain bike — Col du Pillon",
    lead: "Mr. Hoffman",
    count: 14,
    depart: "Sat 08:30",
    return: "Sat 16:00",
  },
  {
    id: "t2",
    title: "Lavaux vineyard hike",
    lead: "Mme. Berger",
    count: 9,
    depart: "Sat 09:00",
    return: "Sat 15:30",
  },
  {
    id: "t3",
    title: "Cinéma Capitole — Lausanne",
    lead: "Ms. Okafor",
    count: 22,
    depart: "Sat 18:00",
    return: "Sat 23:00",
  },
  {
    id: "t4",
    title: "Sunday brunch — Aigle",
    lead: "Mr. Tanaka",
    count: 7,
    depart: "Sun 10:00",
    return: "Sun 13:30",
  },
];

export const INITIAL_RESOURCES: Resource[] = [
  {
    id: "commendation-list",
    name: "Commendation List",
    url: "#",
    icon: "award",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 0,
  },
  {
    id: "saturday-catchup",
    name: "Saturday Catch-up",
    url: "#",
    icon: "book",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 1,
  },
  {
    id: "duty-team",
    name: "Duty Team Roster",
    url: "#",
    icon: "users",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 2,
  },
  {
    id: "transport",
    name: "Weekend Transport Sheet",
    url: "#",
    icon: "bus",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 3,
  },
  {
    id: "clipboard",
    name: "Clipboard",
    url: "#",
    icon: "clipboard",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 4,
  },
  {
    id: "incident-log",
    name: "Incident Log",
    url: "#",
    icon: "flag",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 5,
  },
  {
    id: "hc-handover",
    name: "HC Handover Notes",
    url: "#",
    icon: "heart",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 6,
  },
  {
    id: "duty-whatsapp",
    name: "Duty WhatsApp",
    url: "#",
    icon: "message",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 7,
  },
  {
    id: "parent-contacts",
    name: "Parent Contacts",
    url: "#",
    icon: "phone",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 8,
  },
  {
    id: "activity-signup",
    name: "Activity Sign-up",
    url: "#",
    icon: "calendar",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 9,
  },
];

export const ICON_OPTIONS = [
  "link",
  "book",
  "award",
  "users",
  "bus",
  "clipboard",
  "flag",
  "heart",
  "message",
  "phone",
  "calendar",
  "folder",
  "map",
  "key",
  "bell",
];
