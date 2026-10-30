import { TZDate } from "@date-fns/tz";
const dayFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Zurich",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const localDay = (date: Date) => dayFormatter.format(date);
export function analyticsRange(start: string, end: string, now = new Date()) {
  const parse = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
      throw new Error("Choose valid start and end dates.");
    const [year, month, day] = s.split("-").map(Number);
    const d = new TZDate(year, month - 1, day, "Europe/Zurich");
    if (!Number.isFinite(+d) || localDay(d) !== s)
      throw new Error("Choose valid dates.");
    return d;
  };
  const lo = parse(start),
    hi = parse(end);
  hi.setDate(hi.getDate() + 1);
  if (+lo >= +hi || +hi - +lo > 121 * 86400_000 || end > localDay(now))
    throw new Error("Choose up to 120 days ending today or earlier.");
  const cutoff = new Date(Math.min(+hi - 1, +now));
  return {
    start: new Date(+lo).toISOString(),
    end: cutoff.toISOString(),
    isLive: end === localDay(now),
  };
}
