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
