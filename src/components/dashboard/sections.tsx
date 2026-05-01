"use client";

import { useState, type ReactNode } from "react";

import type { HCStudent, NoPaStudent } from "@/lib/mock";

interface ShellProps {
  num: string;
  title: string;
  titleEm: string;
  sub?: string;
  meta: string;
  id: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

export function SectionShell({
  num,
  title,
  titleEm,
  sub,
  meta,
  id,
  collapsible = false,
  defaultCollapsed = false,
  children,
}: ShellProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const bodyId = `${id}-body`;
  return (
    <section className="section" id={id}>
      <div className="section__head">
        <div className="section__num">№ {num}</div>
        <h2 className="section__title">
          {title} <em>{titleEm}</em>
        </h2>
        <div className="section__meta">
          {meta}
          {collapsible && (
            <button
              type="button"
              className="section__collapse"
              onClick={() => setCollapsed((v) => !v)}
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              aria-label={collapsed ? "Expand section" : "Collapse section"}
            >
              {collapsed ? "▸" : "▾"}
            </button>
          )}
        </div>
        {sub && <div className="section__sub">{sub}</div>}
      </div>
      {!collapsed && <div id={bodyId}>{children}</div>}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="section__empty">{message}</div>;
}

export function HCSection({ data }: { data: HCStudent[] }) {
  return (
    <SectionShell
      id="sec-hc"
      num="01"
      title="Health"
      titleEm="Center"
      sub="Friday HC snapshot — total time per student."
      meta={`${data.length} STUDENTS`}
    >
      {data.length === 0 ? (
        <EmptyState message="No HC visits recorded on Friday." />
      ) : (
        <div role="list">
          {data.map((s) => (
            <div className="row" key={s.id} role="listitem">
              <div className="row__initials">{s.initials}</div>
              <div className="row__main">
                <div className="row__line">{s.name ?? s.reason}</div>
                <div className="row__sub">
                  <span>{s.dorm}</span>
                  {s.location && (
                    <>
                      <span className="sep" />
                      <span>{s.location}</span>
                    </>
                  )}
                  <span className="sep" />
                  <span>for {s.since}</span>
                </div>
              </div>
              <div className="row__meta">
                {s.status === "rested" ? (
                  <span className="tag tag--rested">Rested Friday</span>
                ) : s.status === "overnight" ? (
                  <span className="tag tag--overnight">Overnight</span>
                ) : (
                  <span className="tag tag--in">In</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function NoPaCard({ s }: { s: NoPaStudent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="row" key={s.id}>
      <div className="row__initials">{s.initials}</div>
      <div className="row__main">
        <div className="row__line">{s.name ?? "—"}</div>
        <div className="row__sub">
          <span>{s.dorm}</span>
          <span className="sep" />
          <span>until {s.until}</span>
        </div>
        {expanded && s.restriction && (
          <div className="row__note row__note--open">{s.restriction}</div>
        )}
      </div>
      <div className="row__meta">
        <button
          type="button"
          className="row__toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Hide restriction note" : "Show restriction note"
          }
        >
          {expanded ? "−" : "+"}
        </button>
      </div>
    </div>
  );
}

export function NoPaSection({ data }: { data: NoPaStudent[] }) {
  return (
    <SectionShell
      id="sec-nopa"
      num="02"
      title="No"
      titleEm="Phys. Activity"
      sub="Medical restrictions in effect across the weekend window."
      meta={`${data.length} FLAGS`}
    >
      {data.length === 0 ? (
        <EmptyState message="No active no-PA flags." />
      ) : (
        <div
          role="list"
          className={data.length > 4 ? "row-grid--two" : undefined}
        >
          {data.map((s) => (
            <NoPaCard key={s.id} s={s} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}
