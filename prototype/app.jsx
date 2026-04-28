// Main App component for Weekend Duty Dashboard

const { useState, useMemo, useRef, useEffect } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "balanced"
}/*EDITMODE-END*/;

// Severity classification
function severity(n) {
  if (n === 0) return "low";
  if (n <= 2) return "mid";
  return "high";
}

// ─────────── Header ───────────

function LASCrest({ size = 18 }) {
  // Simplified red life-ring crest mark
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#a42547" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" strokeWidth="1.4" />
      <rect x="11.2" y="2.5" width="1.6" height="19" fill="#fff" />
      <rect x="2.5" y="11.2" width="19" height="1.6" fill="#fff" />
      <circle cx="12" cy="12" r="2.4" fill="#a42547" />
    </svg>
  );
}

function Masthead({ onRefresh, onEmail, refreshing, lastUpdated }) {
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
          <span className="masthead__date">FRI 01 — SUN 03 · MAY MMXXVI</span>
          <span className="dot" />
          <span>Administrator on Call · S. Whitfield</span>
          <span className="dot" />
          <span style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.06em", color: "var(--ink-4)" }}>
            updated {lastUpdated}
          </span>
        </div>
      </div>
      <div className="masthead__actions">
        <button className="btn btn--ghost btn--sm" onClick={onRefresh} title="Refresh">
          <Icon name="refresh" size={14} className={refreshing ? "refresh-spinning" : ""} />
          Refresh
        </button>
        <button className="btn btn--primary btn--sm" onClick={onEmail}>
          <Icon name="send" size={14} />
          Email duty team
        </button>
      </div>
    </header>
  );
}

// ─────────── Alert summary ───────────

function AlertSummary({ counts, onJump }) {
  const items = [
    { key: "hc", label: "in Health Center this Friday", count: counts.hc, sectionId: "sec-hc" },
    { key: "travel", label: "open & approved travel requests", count: counts.travel, sectionId: "sec-travel" },
    { key: "noPa", label: "students flagged no physical activity", count: counts.noPa, sectionId: "sec-nopa" },
    { key: "trips", label: "scheduled activity trips this weekend", count: counts.trips, sectionId: "sec-trips" },
  ];
  return (
    <div className="alerts" role="list">
      {items.map((it) => {
        const sev = severity(it.count);
        return (
          <button key={it.key} className={`alert alert--${sev}`} onClick={() => onJump(it.sectionId)}>
            <div className="alert__head">
              <span className="alert__pip" />
              <span>{it.key === "hc" ? "Health Center" : it.key === "travel" ? "Travel" : it.key === "noPa" ? "No P.A." : "Trips"}</span>
            </div>
            <div className="alert__count">{String(it.count).padStart(2, "0")}</div>
            <div className="alert__label">{it.label}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─────────── Sections ───────────

function SectionShell({ num, title, titleEm, sub, meta, id, children }) {
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

function HCSection({ data }) {
  return (
    <SectionShell
      id="sec-hc"
      num="01"
      title="Health"
      titleEm="Center"
      sub="Residents observed Friday — confirm with nurse before lights-out."
      meta={`${data.length} STUDENTS`}
    >
      <div role="list">
        {data.map((s) => (
          <div className="row" key={s.id} role="listitem">
            <div className="row__initials">{s.initials}</div>
            <div className="row__main">
              <div className="row__line">{s.reason}</div>
              <div className="row__sub">
                <span>{s.dorm}</span>
                <span className="sep" />
                <span>since {s.since}</span>
              </div>
            </div>
            <div className="row__meta">
              {s.status === "overnight" ? <span className="tag tag--overnight">Overnight</span> : <span className="tag tag--in">In</span>}
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function NoPaSection({ data }) {
  return (
    <SectionShell
      id="sec-nopa"
      num="02"
      title="No"
      titleEm="Phys. Activity"
      sub="Medical restrictions in effect across the weekend window."
      meta={`${data.length} FLAGS`}
    >
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
    </SectionShell>
  );
}

function TravelSection({ data }) {
  const approved = data.filter((d) => d.status === "approved").length;
  const pending = data.filter((d) => d.status === "pending").length;
  return (
    <SectionShell
      id="sec-travel"
      num="03"
      title="Travel"
      titleEm="Requests"
      sub={`${approved} approved · ${pending} awaiting decision.`}
      meta={`${data.length} TOTAL`}
    >
      <div role="list">
        {data.slice(0, 6).map((t) => (
          <div className="row" key={t.id}>
            <div className="row__initials">{t.initials}</div>
            <div className="row__main">
              <div className="row__line">{t.destination} <span style={{ color: "var(--ink-3)" }}>· {t.chaperone}</span></div>
              <div className="row__sub">
                <span>{t.dorm}</span>
                <span className="sep" />
                <span>{t.depart} → {t.return}</span>
              </div>
            </div>
            <div className="row__meta">
              <span className={`tag tag--${t.status}`}>{t.status}</span>
            </div>
          </div>
        ))}
      </div>
      {data.length > 6 && (
        <div style={{ marginTop: 14, fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
          + {data.length - 6} more
        </div>
      )}
    </SectionShell>
  );
}

function TripsSection({ data }) {
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
      <div role="list">
        {data.map((t) => (
          <div className="trip-row" key={t.id}>
            <div>
              <h3 className="trip-row__title">{t.title}</h3>
              <div className="trip-row__sub">
                Lead · {t.lead}  ·  {t.depart} → {t.return}
              </div>
            </div>
            <div className="trip-row__count">
              {t.count}
              <small>signed up</small>
            </div>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ─────────── Launchpad ───────────

function Launchpad({ resources, onAdd }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const r of resources) {
      if (!g[r.category]) g[r.category] = [];
      g[r.category].push(r);
    }
    return g;
  }, [resources]);

  const order = window.MOCK.CATEGORIES;

  return (
    <section className="launchpad" id="launchpad">
      <div className="launchpad__head">
        <h2>The <em>launchpad</em></h2>
        <p className="launchpad__lede">
          Living references and rosters. Bookmark anything that gets opened more than twice on a duty weekend.
        </p>
      </div>

      {order.map((cat) => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <div className="cat-block" key={cat}>
            <div className="cat-block__head">
              <div className="cat-block__title">{cat}</div>
              <div className="cat-block__count">{String(items.length).padStart(2, "0")} ITEMS</div>
            </div>
            <div className="cat-grid">
              {items.map((r) => (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="tile">
                  <div className="tile__icon"><Icon name={r.icon} size={22} /></div>
                  <div className="tile__name">{r.name}</div>
                  <div className="tile__ext"><Icon name="external" size={13} /></div>
                </a>
              ))}
              <button className="tile tile--add" onClick={() => onAdd(cat)}>
                <Icon name="plus" size={18} />
                <div className="tile__name">Add</div>
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ─────────── Add resource dialog ───────────

function AddResourceDialog({ open, onClose, onSave, defaultCategory }) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("link");
  const [category, setCategory] = useState(defaultCategory || "Reference");

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setIcon("link");
      setCategory(defaultCategory || "Reference");
    }
  }, [open, defaultCategory]);

  if (!open) return null;

  const valid = name.trim() && url.trim();

  const handleSave = (e) => {
    e.preventDefault();
    if (!valid) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    onSave({ id, name: name.trim(), url: url.trim() || "#", icon, category, addedBy: "you" });
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
        <button type="button" className="dialog__close" onClick={onClose}>
          <Icon name="x" size={16} />
        </button>
        <div className="dialog__eyebrow">Launchpad · New entry</div>
        <h2 className="dialog__title">Add a <em>resource</em></h2>
        <div className="dialog__sub">Pin a sheet, doc, or link that the duty team will need this weekend.</div>

        <div className="field">
          <label htmlFor="r-name">Name</label>
          <input
            id="r-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Saturday catch-up roster"
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="r-url">URL</label>
          <input
            id="r-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/…"
          />
        </div>

        <div className="field--row">
          <div className="field">
            <label htmlFor="r-cat">Category</label>
            <select id="r-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {window.MOCK.CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Selected icon</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--rule)", background: "var(--paper-2)", height: 42 }}>
              <Icon name={icon} size={18} />
              <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-3)" }}>{icon}</span>
            </div>
          </div>
        </div>

        <div className="field">
          <label>Icon</label>
          <div className="icon-grid">
            {window.MOCK.ICON_OPTIONS.map((i) => (
              <button
                type="button"
                key={i}
                className={i === icon ? "is-on" : ""}
                onClick={() => setIcon(i)}
                title={i}
              >
                <Icon name={i} size={16} />
              </button>
            ))}
          </div>
        </div>

        <div className="dialog__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary btn--sm" disabled={!valid} style={{ opacity: valid ? 1 : 0.4 }}>
            <Icon name="plus" size={13} /> Add to launchpad
          </button>
        </div>
      </form>
    </div>
  );
}

// ─────────── Toast ───────────

function Toast({ message }) {
  if (!message) return null;
  return (
    <div className="toast">
      <span className="toast__pip" />
      {message}
    </div>
  );
}

// ─────────── App ───────────

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const [resources, setResources] = useState(window.MOCK.INITIAL_RESOURCES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogCategory, setDialogCategory] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("just now");

  // ticking last-updated label
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      const mins = Math.floor((Date.now() - startedAt) / 60000);
      if (mins === 0) setLastUpdated("just now");
      else setLastUpdated(`${mins}m ago`);
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const handleAdd = (category) => {
    setDialogCategory(category);
    setDialogOpen(true);
  };

  const handleSave = (resource) => {
    setResources((r) => [...r, resource]);
    setDialogOpen(false);
    showToast(`Added “${resource.name}” to ${resource.category}`);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setLastUpdated("just now");
      showToast("Dashboard refreshed");
    }, 700);
  };

  const handleEmail = () => {
    showToast("Snapshot drafted — opens email composer");
  };

  const handleJump = (id) => {
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 24, behavior: "smooth" });
    }
  };

  const counts = {
    hc: window.MOCK.HC_STUDENTS.length,
    noPa: window.MOCK.NO_PA_STUDENTS.length,
    travel: window.MOCK.TRAVEL_REQUESTS.filter(t => t.status === "approved" || t.status === "pending").length,
    trips: window.MOCK.SCHEDULED_TRIPS.length,
  };

  return (
    <div className="app" data-density={tweaks.density} data-screen-label="Weekend Duty Dashboard">
      <Masthead
        onRefresh={handleRefresh}
        onEmail={handleEmail}
        refreshing={refreshing}
        lastUpdated={lastUpdated}
      />

      <AlertSummary counts={counts} onJump={handleJump} />

      <div className="sections">
        <HCSection data={window.MOCK.HC_STUDENTS} />
        <NoPaSection data={window.MOCK.NO_PA_STUDENTS} />
        <TravelSection data={window.MOCK.TRAVEL_REQUESTS} />
        <TripsSection data={window.MOCK.SCHEDULED_TRIPS} />
      </div>

      <Launchpad resources={resources} onAdd={handleAdd} />

      <footer className="colophon">
        <div>LAS · 1854 Leysin · Internal tool</div>
        <div className="colophon__center">“A thoughtful weekend is a quiet one.”</div>
        <div>v0.1 · Read-only · {new Date().getFullYear()}</div>
      </footer>

      <AddResourceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        defaultCategory={dialogCategory}
      />

      <Toast message={toast} />

      <TweaksPanel title="Tweaks">
        <TweakSection title="Density">
          <TweakRadio
            value={tweaks.density}
            onChange={(v) => setTweak("density", v)}
            options={[
              { value: "spacious", label: "Spacious" },
              { value: "balanced", label: "Balanced" },
              { value: "dense", label: "Dense" },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
