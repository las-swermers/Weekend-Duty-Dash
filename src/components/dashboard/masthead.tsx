"use client";

import Link from "next/link";

import { Icon, LASCrest } from "@/components/dashboard/icon";
import { signOutAction } from "@/lib/auth-actions";

interface Props {
  weekendLabel: string;
  aoc: string;
  userName: string | null;
  refreshing: boolean;
  lastUpdated: string;
  onRefresh: () => void;
}

export function Masthead({
  weekendLabel,
  aoc,
  userName,
  refreshing,
  lastUpdated,
  onRefresh,
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
        {userName ? (
          <span className="masthead__welcome">Welcome {userName}</span>
        ) : null}
        <Link href="/analytics" className="btn btn--ghost btn--sm">
          <Icon name="folder" size={14} />
          Analytics
        </Link>
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
        <form action={signOutAction}>
          <button type="submit" className="btn btn--ghost btn--sm">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
