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
}

export interface NoPaStudent {
  id: number;
  initials: string;
  dorm: string;
  restriction: string;
  until: string;
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
    since: "Thu 22:40",
    status: "overnight",
  },
  {
    id: 2,
    initials: "L.K.",
    dorm: "Savoy",
    reason: "Sprained ankle, PT review",
    since: "Fri 09:15",
    status: "in",
  },
  {
    id: 3,
    initials: "T.A.",
    dorm: "Hadsom",
    reason: "Fever 38.4°",
    since: "Fri 11:02",
    status: "in",
  },
  {
    id: 4,
    initials: "S.R.",
    dorm: "Fairmont",
    reason: "Post-procedure rest",
    since: "Fri 13:30",
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

export const INITIAL_RESOURCES: Resource[] = [
  {
    id: "commendation-list",
    name: "Commendation List",
    url: "#",
    icon: "award",
    category: "Reference",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 0,
  },
  {
    id: "saturday-catchup",
    name: "Saturday Catch-up",
    url: "#",
    icon: "book",
    category: "Reference",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 1,
  },
  {
    id: "duty-team",
    name: "Duty Team Roster",
    url: "#",
    icon: "users",
    category: "Logistics",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 2,
  },
  {
    id: "transport",
    name: "Weekend Transport Sheet",
    url: "#",
    icon: "bus",
    category: "Logistics",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 3,
  },
  {
    id: "clipboard",
    name: "Clipboard",
    url: "#",
    icon: "clipboard",
    category: "Discipline & Accountability",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 4,
  },
  {
    id: "incident-log",
    name: "Incident Log",
    url: "#",
    icon: "flag",
    category: "Discipline & Accountability",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 5,
  },
  {
    id: "hc-handover",
    name: "HC Handover Notes",
    url: "#",
    icon: "heart",
    category: "Health & Wellbeing",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 6,
  },
  {
    id: "duty-whatsapp",
    name: "Duty WhatsApp",
    url: "#",
    icon: "message",
    category: "Communications",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 7,
  },
  {
    id: "parent-contacts",
    name: "Parent Contacts",
    url: "#",
    icon: "phone",
    category: "Communications",
    addedBy: "system",
    addedAt: "2026-04-28T00:00:00Z",
    order: 8,
  },
  {
    id: "activity-signup",
    name: "Activity Sign-up",
    url: "#",
    icon: "calendar",
    category: "Activities",
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
