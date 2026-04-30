// Read-only Google Calendar fetcher. Pulls events from the activities
// office calendar via service-account auth and the Calendar v3 REST API.
// Returns a normalized shape suitable for direct rendering.

import { fetchAccessToken, hasServiceAccount } from "@/lib/google-auth";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  htmlLink?: string;
}

export function isCalendarConfigured(): boolean {
  return Boolean(CALENDAR_ID && hasServiceAccount());
}

interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export async function listCalendarEvents(
  timeMinISO: string,
  timeMaxISO: string,
): Promise<CalendarEvent[]> {
  if (!isCalendarConfigured()) return [];
  const token = await fetchAccessToken(CALENDAR_SCOPE);
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    CALENDAR_ID!,
  )}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Calendar fetch failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { items?: RawEvent[] };
  const items = json.items ?? [];
  return items
    .filter((e) => e.status !== "cancelled")
    .map((e): CalendarEvent => {
      const allDay = Boolean(e.start?.date && !e.start?.dateTime);
      return {
        id: e.id,
        summary: e.summary ?? "(no title)",
        description: e.description,
        location: e.location,
        start: e.start?.dateTime ?? e.start?.date ?? "",
        end: e.end?.dateTime ?? e.end?.date ?? "",
        allDay,
        htmlLink: e.htmlLink,
      };
    });
}
