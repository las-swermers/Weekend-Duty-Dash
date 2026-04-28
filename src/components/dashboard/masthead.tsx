"use client";

import { Icon, LASCrest } from "@/components/dashboard/icon";

interface Props {
  weekendLabel: string;
  aoc: string;
  refreshing: boolean;
  lastUpdated: string;
  onRefresh: () => void;
  onEmail: () => void;
}

export function Masthead({
  weekendLabel,
  aoc,
  refreshing,
  lastUpdated,
  onRefresh,
  onEmail,
}: Props) {
  return (
    <header className="masthead">
      <div>
        <div className="masthead__crest">
          <LASCrest size={16} />
          Leysin American School · Weekend Duty
        </div>
        <h1 className="masthead__title">
          Weekend <em>Duty</em> Dashboard
        </h1>
        <div className="masthead__sub">
          <span className="masthead__date">{weekendLabel}</span>
          <span className="dot" />
          <span>Administrator on Call · {aoc}</span>
          <span className="dot" />
          <span className="masthead__updated">updated {lastUpdated}</span>
        </div>
      </div>
      <div className="masthead__actions">
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onRefresh}
          title="Refresh"
        >
          <Icon
            name="refresh"
            size={14}
            className={refreshing ? "refresh-spinning" : undefined}
          />
          Refresh
        </button>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={onEmail}
        >
          <Icon name="send" size={14} />
          Email duty team
        </button>
      </div>
    </header>
  );
}
