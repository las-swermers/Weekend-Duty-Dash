"use client";

import { severityFor } from "@/lib/utils";

export interface AlertCounts {
  hc: number;
  noPa: number;
  travel: number;
  trips: number;
}

interface Props {
  counts: AlertCounts;
  onJump: (id: string) => void;
}

const ITEMS: Array<{
  key: keyof AlertCounts;
  short: string;
  label: string;
  sectionId: string;
}> = [
  {
    key: "hc",
    short: "Health Center",
    label: "in Health Center this Friday",
    sectionId: "sec-hc",
  },
  {
    key: "travel",
    short: "Travel",
    label: "open & approved travel requests",
    sectionId: "sec-travel",
  },
  {
    key: "noPa",
    short: "No P.A.",
    label: "students flagged no physical activity",
    sectionId: "sec-nopa",
  },
  {
    key: "trips",
    short: "Trips",
    label: "scheduled activity trips this weekend",
    sectionId: "sec-trips",
  },
];

export function AlertSummary({ counts, onJump }: Props) {
  return (
    <div className="alerts" role="list">
      {ITEMS.map((it) => {
        const count = counts[it.key];
        const sev = severityFor(count);
        return (
          <button
            key={it.key}
            type="button"
            className={`alert alert--${sev}`}
            onClick={() => onJump(it.sectionId)}
          >
            <div className="alert__head">
              <span className="alert__pip" />
              <span>{it.short}</span>
            </div>
            <div className="alert__count">
              {String(count).padStart(2, "0")}
            </div>
            <div className="alert__label">{it.label}</div>
          </button>
        );
      })}
    </div>
  );
}
