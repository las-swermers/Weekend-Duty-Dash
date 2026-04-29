"use client";

import type { ReactNode } from "react";

import type { HCStudent, NoPaStudent } from "@/lib/mock";

interface ShellProps {
  num: string;
  title: string;
  titleEm: string;
  sub?: string;
  meta: string;
  id: string;
  children: ReactNode;
}

export function SectionShell({
  num,
  title,
  titleEm,
  sub,
  meta,
  id,
  children,
}: ShellProps) {
  return (
    <section className="section" id={id}>
      <div className="section__head">
        <div className="section__num">№ {num}</div>
        <h2 className="section__title">
          {title} <em>{titleEm}</em>
        </h2>
        <div className="section__meta">{meta}</div>
        {sub && <div className="section__sub">{sub}</div>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="section__empty">{message}</div>;
}

export function HCSection({ data }: { data: HCStudent[] }) {
  return (
    <SectionShell
      id="sec-hc"
      num="01"
      title="Health"
      titleEm="Center"
      sub="Residents observed Friday."
      meta={`${data.length} STUDENTS`}
    >
      {data.length === 0 ? (
        <EmptyState message="No students in HC right now." />
      ) : (
        <div role="list">
          {data.map((s) => (
            <div className="row" key={s.id} role="listitem">
              <div className="row__initials">{s.initials}</div>
              <div className="row__main">
                <div className="row__line">{s.name ?? s.reason}</div>
                <div className="row__sub">
                  <span>{s.dorm}</span>
                  <span className="sep" />
                  <span>since {s.since}</span>
                  {s.name && s.reason && s.reason !== "Currently signed in" && (
                    <>
                      <span className="sep" />
                      <span>{s.reason}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="row__meta">
                {s.status === "overnight" ? (
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
        <div role="list">
          {data.map((s) => (
            <div className="row" key={s.id}>
              <div className="row__initials">{s.initials}</div>
              <div className="row__main">
                <div className="row__line">{s.restriction}</div>
                <div className="row__sub">
                  <span>{s.dorm}</span>
                  <span className="sep" />
                  <span>until {s.until}</span>
                </div>
              </div>
              <div className="row__meta">—</div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}

