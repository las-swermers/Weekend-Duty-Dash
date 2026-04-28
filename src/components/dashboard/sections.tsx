"use client";

import type { ReactNode } from "react";

import type {
  HCStudent,
  MockTrip,
  NoPaStudent,
  TravelRequest,
} from "@/lib/mock";

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
      sub="Residents observed Friday — confirm with nurse before lights-out."
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
                  {s.name && (
                    <>
                      <span>{s.name}</span>
                      <span className="sep" />
                    </>
                  )}
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

export function TravelSection({ data }: { data: TravelRequest[] }) {
  const approved = data.filter((d) => d.status === "approved").length;
  const pending = data.filter((d) => d.status === "pending").length;
  const visible = data.slice(0, 6);

  return (
    <SectionShell
      id="sec-travel"
      num="03"
      title="Travel"
      titleEm="Requests"
      sub={`${approved} approved · ${pending} awaiting decision.`}
      meta={`${data.length} TOTAL`}
    >
      {data.length === 0 ? (
        <EmptyState message="No travel requests in this window." />
      ) : (
        <>
          <div role="list">
            {visible.map((t) => (
              <div className="row" key={t.id}>
                <div className="row__initials">{t.initials}</div>
                <div className="row__main">
                  <div className="row__line">
                    {t.destination}
                    <span style={{ color: "var(--ink-3)" }}>
                      {" "}
                      · {t.chaperone}
                    </span>
                  </div>
                  <div className="row__sub">
                    <span>{t.dorm}</span>
                    <span className="sep" />
                    <span>
                      {t.depart} → {t.return}
                    </span>
                  </div>
                </div>
                <div className="row__meta">
                  <span className={`tag tag--${t.status}`}>{t.status}</span>
                </div>
              </div>
            ))}
          </div>
          {data.length > visible.length && (
            <div
              style={{
                marginTop: 14,
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--ink-4)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              + {data.length - visible.length} more
            </div>
          )}
        </>
      )}
    </SectionShell>
  );
}

export function TripsSection({ data }: { data: MockTrip[] }) {
  const total = data.reduce((s, t) => s + t.count, 0);
  return (
    <SectionShell
      id="sec-trips"
      num="04"
      title="Scheduled"
      titleEm="Trips"
      sub={`${total} student-spots across ${data.length} activities.`}
      meta={`${data.length} OUTINGS`}
    >
      {data.length === 0 ? (
        <EmptyState message="No trips scheduled." />
      ) : (
        <div role="list">
          {data.map((t) => (
            <div className="trip-row" key={t.id}>
              <div>
                <h3 className="trip-row__title">{t.title}</h3>
                <div className="trip-row__sub">
                  Lead · {t.lead} · {t.depart} → {t.return}
                </div>
              </div>
              <div className="trip-row__count">
                {t.count}
                <small>signed up</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionShell>
  );
}
