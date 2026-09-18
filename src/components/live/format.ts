// Presentation helpers shared by the Live dashboard and its tab components.
// These used to live inside live-client.tsx; they were pulled out so
// warnings-tab.tsx can use them without importing from live-client (which
// imports the tab back, forming a cycle).

export const TZ = "Europe/Zurich";

function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

// Deterministic avatar gradient so the same student always gets the same
// colour across tabs and reloads.
export function photoGradient(seed: string): string {
  const hue = hueFromString(seed);
  return `linear-gradient(160deg, hsl(${hue}, 38%, 32%) 0%, hsl(${(hue + 30) % 360}, 42%, 22%) 100%)`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatCheckIn(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

// YYYY-MM-DD in Europe/Zurich, for grouping records into local days.
export function dayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}
