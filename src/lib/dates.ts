import { TZDate } from "@date-fns/tz";

const TZ = "Europe/Zurich";

export interface WeekendRange {
  start: Date;
  end: Date;
}

// "This weekend" = Friday 00:00 Europe/Zurich → Sunday 23:59:59.
// On Sat/Sun the current weekend is returned; on Mon–Thu the upcoming one.
export function currentWeekendRange(now: Date = new Date()): WeekendRange {
  const local = new TZDate(now, TZ);
  const day = local.getDay(); // 0 Sun, 5 Fri, 6 Sat
  const friday = new TZDate(local, TZ);

  if (day === 0) {
    friday.setDate(local.getDate() - 2);
  } else if (day === 6) {
    friday.setDate(local.getDate() - 1);
  } else if (day === 5) {
    // friday is today
  } else {
    friday.setDate(local.getDate() + (5 - day));
  }
  friday.setHours(0, 0, 0, 0);

  const sunday = new TZDate(friday, TZ);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);

  return { start: friday, end: sunday };
}

// Friday-only window of the current weekend.
export function fridayOfCurrentWeekend(now: Date = new Date()): WeekendRange {
  const { start } = currentWeekendRange(now);
  const end = new TZDate(start, TZ);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Friday "rest period" window: 08:00 → 16:00 Europe/Zurich. This is the
// school-day stretch when students may be excused to rest in the Health
// Center. The weekend HC snapshot reports who overlapped with this slot.
export function fridayRestWindow(now: Date = new Date()): WeekendRange {
  const { start: friday } = currentWeekendRange(now);
  const start = new TZDate(friday, TZ);
  start.setHours(8, 0, 0, 0);
  const end = new TZDate(friday, TZ);
  end.setHours(16, 0, 0, 0);
  return { start, end };
}

// Broader timeline fetch range used to compute the Friday rest window.
// Reaches back to Thursday 00:00 so that an "in" record from before
// Friday is still picked up for students who were already in HC when
// the rest window began.
export function fridayRestFetchRange(now: Date = new Date()): WeekendRange {
  const { start: friday } = currentWeekendRange(now);
  const start = new TZDate(friday, TZ);
  start.setDate(friday.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new TZDate(friday, TZ);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// "Last night": previous evening 18:00 → today 06:00 (Europe/Zurich).
// If called before 06:00, "last night" is yesterday-evening → this morning;
// if called after 06:00, it's last-evening → this morning of the same day.
export function lastNightRange(now: Date = new Date()): WeekendRange {
  const local = new TZDate(now, TZ);
  const todaySix = new TZDate(local, TZ);
  todaySix.setHours(6, 0, 0, 0);

  const end = new TZDate(todaySix, TZ);
  if (local.getTime() < todaySix.getTime()) {
    end.setDate(end.getDate());
  }
  const start = new TZDate(end, TZ);
  start.setDate(end.getDate() - 1);
  start.setHours(18, 0, 0, 0);
  return { start, end };
}

// True when the dashboard should default to the Weekend page rather than
// Live. Window: Friday 00:00 → Monday 05:00 Europe/Zurich. Outside that,
// "live" is more relevant. Used by the root redirect at `/`.
export function isWeekendMode(now: Date = new Date()): boolean {
  const local = new TZDate(now, TZ);
  const day = local.getDay();
  const hour = local.getHours();
  if (day === 5) return true;
  if (day === 6 || day === 0) return true;
  if (day === 1 && hour < 5) return true;
  return false;
}

// Today's local-day window: 00:00 → 23:59:59.999 Europe/Zurich.
export function todayRange(now: Date = new Date()): WeekendRange {
  const start = new TZDate(now, TZ);
  start.setHours(0, 0, 0, 0);
  const end = new TZDate(start, TZ);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Categories shown in the Live "Today's Infractions" section. Early
// check-ins are scheduled per-day in Orah via the note's date, so the
// base set applies every day. On Fri/Sat/Sun we additionally surface
// that day's clipboard / dorm-night categories.
export function serveCategoriesForToday(now: Date = new Date()): string[] {
  const day = new TZDate(now, TZ).getDay();
  const base = ["1-hour early check-in", "2-hour early check-in"];
  if (day === 5) return [...base, "Friday Night in the Dorm"];
  if (day === 6)
    return [...base, "Saturday Clipboard", "Saturday Night in the Dorm"];
  if (day === 0) return [...base, "Sunday Clipboard"];
  return base;
}

// Categories that only apply on weekend duty: clipboard service and
// dorm-night service. Early check-ins are deliberately excluded —
// they're nightly events surfaced via serveCategoriesForToday() in
// the Live "Today's Infractions" view, so including them here would
// double-list the same records under "Weekend Infractions".
export const WEEKEND_INFRACTION_CATEGORIES = [
  "Friday Night in the Dorm",
  "Saturday Clipboard",
  "Saturday Night in the Dorm",
  "Sunday Clipboard",
];

// Window for the upcoming-Wednesday makeup cycle. Start is the day after
// the most recent already-passed Wednesday (Thursday 00:00 Zurich), end is
// now. After Wed 23:59:59 the cycle resets, so Thursday morning shows only
// Thursday's entries — Tuesday's entries (which referred to the makeup
// that already happened) are dropped.
export function currentMakeupWindow(now: Date = new Date()): WeekendRange {
  const local = new TZDate(now, TZ);
  const day = local.getDay(); // 0 Sun … 3 Wed … 6 Sat
  const daysBack = day === 3 ? 7 : (day - 3 + 7) % 7;
  const start = new TZDate(local, TZ);
  start.setDate(local.getDate() - daysBack + 1);
  start.setHours(0, 0, 0, 0);
  return { start, end: local };
}

// "May 1–3, 2026" style label for emails / headers.
export function formatWeekendLabel(range: WeekendRange): string {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    month: "long",
    day: "numeric",
  });
  const year = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
  }).format(range.end);
  const startStr = fmt.format(range.start);
  const endDay = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
  }).format(range.end);
  return `${startStr}–${endDay}, ${year}`;
}

// ─── Warnings review (weekly) ────────────────────────────────────────────

// Orah nests this as Infraction → Warning. Filtering across this app matches
// on pastoral_category.name, so accept a couple of spellings by default and
// let WARNINGS_CATEGORY_NAMES override if the tenant renames it.
export const DEFAULT_WARNINGS_CATEGORIES = ["Warning", "Warnings"];

export function warningsCategories(): string[] {
  const raw = process.env.WARNINGS_CATEGORY_NAMES;
  if (!raw || !raw.trim()) return DEFAULT_WARNINGS_CATEGORIES;
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : DEFAULT_WARNINGS_CATEGORIES;
}

// Monday 00:00 → Sunday 23:59:59.999 Europe/Zurich. `offset` shifts whole
// weeks: -1 is last week, +1 next week.
export function weekRange(now: Date = new Date(), offset = 0): WeekendRange {
  const local = new TZDate(now, TZ);
  const day = local.getDay(); // 0 Sun … 1 Mon … 6 Sat
  const daysSinceMonday = (day + 6) % 7;

  const start = new TZDate(local, TZ);
  start.setDate(local.getDate() - daysSinceMonday + offset * 7);
  start.setHours(0, 0, 0, 0);

  const end = new TZDate(start, TZ);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// The Monday of a date's week as YYYY-MM-DD in Europe/Zurich. This is the
// stable key used in the conversation sheet and in report tab titles.
export function weekKey(d: Date = new Date()): string {
  const { start } = weekRange(d);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
}

export function isWeekKey(s: string | null | undefined): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Expand a "2026-09-14" key back into its Mon→Sun range. Parsed at midday UTC
// so the Zurich offset can never roll the date onto the neighbouring day.
export function weekKeyToRange(key: string): WeekendRange {
  const parsed = Date.parse(`${key}T12:00:00Z`);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid week key: ${key}`);
  }
  return weekRange(new Date(parsed));
}

// "15–21 September 2026", collapsing the month when the week doesn't span one.
export function formatWeekLabel(range: WeekendRange): string {
  const dayFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, month: "long" });
  const yearFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric" });

  const startDay = dayFmt.format(range.start);
  const endDay = dayFmt.format(range.end);
  const startMonth = monthFmt.format(range.start);
  const endMonth = monthFmt.format(range.end);
  const year = yearFmt.format(range.end);

  return startMonth === endMonth
    ? `${startDay}–${endDay} ${endMonth} ${year}`
    : `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}
