// app.js — fixed: single `days`, proper JSX styles, correct week math.
// Manager (/edit.html) shows dropdowns + name edit + Share/Download.
// Viewer (/) is read-only.

const MODE = window.__MODE__ || "view";
const DEFAULT_WEEK_ISO = "2025-10-13"; // Monday

// ---------- date helpers (local, no timezone shift) ----------
const pad = (n) => (n < 10 ? "0" : "") + n;
function fromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfWeekLocal(d) {
  // Monday as start
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (dt.getDay() + 6) % 7; // 0 Mon .. 6 Sun
  dt.setDate(dt.getDate() - dow);
  dt.setHours(0, 0, 0, 0);
  return dt;
}
function fmtDay(baseISO, off) {
  const b = fromISO(baseISO);
  const dt = new Date(b.getFullYear(), b.getMonth(), b.getDate() + off);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function isISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || "");
}

// ---------- constants ----------
const days = [
  { key: "mon", label: "Mon", off: 0 },
  { key: "tue", label: "Tue", off: 1 },
  { key: "wed", label: "Wed", off: 2 },
  { key: "thu", label: "Thu", off: 3 },
  { key: "fri", label: "Fri", off: 4 },
  { key: "sat", label: "Sat", off: 5 },
  { key: "sun", label: "Sun", off: 6 },
];
const ALL_KEY = "all";

// ---------- shifts ----------
function parseHours(label) {
  if (!label || label === "Off") return 0;
  const [a, b] = label.split("–");
  const P = (t) => {
    const m = t.match(/^(\d{1,2})(?::(30))?(AM|PM)$/);
    let h = +m[1];
    const half = m[2] ? 0.5 : 0;
    const ap = m[3];
    if (ap === "AM" && h === 12) h = 0;
    if (ap === "PM" && h !== 12) h += 12;
    return h + half;
  };
  let len = P(b) - P(a);
  if (len < 0) len += 24;
  return len;
}
function generateShiftOptions() {
  const opts = ["Off"];
  const step = 0.5;
  const toLabel = (h) => {
    const m = Math.round(h * 60);
    const H = (m / 60) | 0;
    const mm = m % 60;
    const ap = H < 12 ? "AM" : "PM";
    const hh = H % 12 || 12;
    return `${hh}${mm ? ":30" : ""}${ap}`;
  };
  for (let s = 8; s <= 14; s += step) {
    for (let L = 6; L <= 12; L += step) {
      const e = s + L;
      if (e > 20) continue; // no later than 8PM
      if (L === 12 && !(Math.abs(s - 8) < 1e-6 && Math.abs(e - 20) < 1e-6))
        continue; // only 8AM–8PM may be 12h
      const label = `${toLabel(s)}–${toLabel(e)}`;
      if (!opts.includes(label)) opts.push(label);
    }
  }
  return opts;
}
const SHIFT_OPTIONS = generateShiftOptions();

// ---------- data ----------
async function loadWeekData(weekISO) {
  try {
    const r = await fetch(`./data/${weekISO}.json`, { cache: "no-store" });
    if (!r.ok) throw new Error("missing");
    return await r.json();
  } catch {
    return {
      dealer: "Murdock Hyundai Murray (890090)",
      weekStart: weekISO,
      employees: [
        { id: "e1", name: "Kody O Edwards 49416" },
        { id: "e2", name: "Derrick W. Gore 48873" },
        { id: "e3", name: "Brandon Moye 45138" },
        { id: "e4", name: "Steven B Ridenour 49788" },
      ],
      schedule: {
        e1: {
          mon: "Off",
          tue: "Off",
          wed: "1PM–8PM",
          thu: "11AM–7PM",
          fri: "Off",
          sat: "10AM–4PM",
          sun: "Off",
        },
        e2: {
          mon: "8AM–8PM",
          tue: "8AM–4PM",
          wed: "8AM–4PM",
          thu: "8AM–4PM",
          fri: "8AM–4PM",
          sat: "8AM–4PM",
          sun: "Off",
        },
        e3: {
          mon: "Off",
          tue: "1PM–8PM",
          wed: "Off",
          thu: "1PM–8PM",
          fri: "1PM–8PM",
          sat: "1PM–8PM",
          sun: "Off",
        },
        e4: {
          mon: "10AM–5PM",
          tue: "11AM–7PM",
          wed: "11AM–7PM",
          thu: "Off",
          fri: "11AM–7PM",
          sat: "1PM–8PM",
          sun: "Off",
        },
      },
    };
  }
}

const safeName = (s) => (s || "").replace(/\s\d{4,6}$/, "");

// ---------- week from URL + nav ----------
function useQueryWeek() {
  const url = new URL(location.href);
  const param = url.searchParams.get("week");
  let baseISO = isISODate(param) ? param : DEFAULT_WEEK_ISO;

  // normalize to local Monday
  const mon = startOfWeekLocal(fromISO(baseISO));
  const weekISO = toISO(mon);

  const go = (delta) => {
    const d = startOfWeekLocal(fromISO(weekISO));
    d.setDate(d.getDate() + delta * 7); // -1 back, +1 forward
    url.searchParams.set("week", toISO(d));
    location.href = url.toString();
  };
  return [weekISO, go];
}

// ---------- App ----------
function App() {
  const [weekISO, navWeek] = useQueryWeek();
  const [data, setData] = React.useState(null);
  const [active, setActive] = React.useState(ALL_KEY);

  const [serverPass, setServerPass] = React.useState(null);
  const [isAuthed, setIsAuthed] = React.useState(MODE === "view");
  const [pwd, setPwd] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    loadWeekData(weekISO).then(setData);
  }, [weekISO]);

  React.useEffect(() => {
    if (MODE === "edit") {
      fetch("/api/admin-pass")
        .then((r) => r.json())
        .then(({ pass }) => setServerPass(pass || "admin123"))
        .catch(() => setServerPass("admin123"));
    }
  }, []);

  const canEdit = MODE === "edit" && isAuthed;

  if (MODE === "edit" && !isAuthed) {
    return (
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: "100vh",
        }}
      >
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 24,
            width: 340,
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Manager Access</div>
          <input
            type="password"
            placeholder="Enter password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              width: "100%",
            }}
          />
          <button
            style={{
              marginTop: 12,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: 0,
              background: "#4f46e5",
              color: "#fff",
              fontWeight: 600,
            }}
            onClick={() => setIsAuthed(!!serverPass && pwd === serverPass)}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <div className="container">Loading…</div>;

  const { dealer, employees, schedule } = data;
  const weekDate = fromISO(weekISO);

  const totalsByEmp = Object.fromEntries(
    employees.map((e) => [
      e.id,
      days.reduce((s, d) => s + parseHours(schedule[e.id]?.[d.key]), 0),
    ])
  );
  const weekTotal = Object.values(totalsByEmp).reduce((a, b) => a + b, 0);

  const setShift = (empId, dayKey, val) => {
    setData((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [empId]: { ...(prev.schedule[empId] || {}), [dayKey]: val },
      },
    }));
  };
  const setEmployeeName = (empId, newName) => {
    setData((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.id === empId ? { ...e, name: newName } : e
      ),
    }));
  };

  async function saveCurrent(targetWeekISO) {
    setSaving(true);
    try {
      const payload = {
        weekISO: targetWeekISO || weekISO,
        data: { ...data, weekStart: targetWeekISO || weekISO },
      };
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Save failed");
      }
      alert("Saved!");
      if (targetWeekISO && targetWeekISO !== weekISO) {
        location.href = `?week=${targetWeekISO}`;
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  function duplicateToNextWeek(copyShifts) {
    const d = startOfWeekLocal(fromISO(weekISO));
    d.setDate(d.getDate() + 7);
    const nextISO = toISO(d);

    const nextData = { ...data, weekStart: nextISO, schedule: {} };
    for (const e of employees) {
      nextData.schedule[e.id] = {};
      for (const day of days) {
        nextData.schedule[e.id][day.key] = copyShifts
          ? schedule[e.id]?.[day.key] || "Off"
          : "Off";
      }
    }
    setData(nextData);
    saveCurrent(nextISO);
  }

  async function shareLinkForWeek(iso) {
    const url = `${location.origin}/?week=${iso}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Tephseal Schedule", url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert("Link copied:\n" + url);
      } else {
        prompt("Copy this link:", url);
      }
    } catch {}
  }

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${weekISO}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- UI ----------
  const TopBar = (
    <div className="top">
      <div className="container">
        <div className="bar">
          <div className="logo">S</div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 12,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: 1,
              }}
            >
              Dealer
            </div>
            <div style={{ fontWeight: 700 }}>{dealer}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              Week of{" "}
              {weekDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
          <div className="weeknav">
            <button className="btn" onClick={() => navWeek(-1)}>
              ◀ Prev
            </button>
            <button className="btn" onClick={() => navWeek(+1)}>
              Next ▶
            </button>
            {canEdit && (
              <>
                <button
                  className="btn"
                  onClick={() => saveCurrent()}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn" onClick={() => duplicateToNextWeek(false)}>
                  Save as Next Week
                </button>
                <button className="btn" onClick={() => duplicateToNextWeek(true)}>
                  Save Next (Copy Shifts)
                </button>
                <button className="btn" onClick={() => shareLinkForWeek(weekISO)}>
                  Share link
                </button>
                <button className="btn" onClick={downloadJSON}>
                  Download JSON
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const Tabs = (
    <div className="container">
      <div className="tabs">
        <div
          className={`tab ${active === ALL_KEY ? "active" : ""}`}
          onClick={() => setActive(ALL_KEY)}
        >
          <div>All</div>
          <div style={{ opacity: 0.8, fontSize: 10 }}>Week</div>
        </div>
        {days.map((d) => (
          <div
            key={d.key}
            className={`tab ${active === d.key ? "active" : ""}`}
            onClick={() => setActive(d.key)}
          >
            <div>{d.label}</div>
            <div style={{ opacity: 0.8, fontSize: 10 }}>
              {fmtDay(weekISO, d.off)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div>
      {TopBar}
      {Tabs}

      <div className="container">
        {active === ALL_KEY ? (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="head">Full Week</div>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th className="sticky-left">Employee</th>
                    {days.map((d) => (
                      <th key={d.key}>
                        {d.label}{" "}
                        <span style={{ color: "#94a3b8", fontSize: 12 }}>
                          {fmtDay(weekISO, d.off)}
                        </span>
                      </th>
                    ))}
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, idx) => (
                    <tr
                      key={e.id}
                      style={{ background: idx % 2 ? "#f8fafc" : "#fff" }}
                    >
                      <td
                        className="sticky-left"
                        style={{
                          padding: 12,
                          borderTop: "1px solid #f1f5f9",
                          fontWeight: 600,
                        }}
                      >
                        {canEdit ? (
                          <input
                            value={e.name}
                            onChange={(ev) => setEmployeeName(e.id, ev.target.value)}
                            style={{
                              width: "100%",
                              padding: "6px 8px",
                              border: "1px solid #e5e7eb",
                              borderRadius: 8,
                            }}
                          />
                        ) : (
                          safeName(e.name)
                        )}
                      </td>
                      {days.map((d) => (
                        <td key={d.key}>
                          {canEdit ? (
                            <select
                              value={schedule[e.id]?.[d.key] || "Off"}
                              onChange={(ev) => setShift(e.id, d.key, ev.target.value)}
                              style={{
                                padding: "6px 8px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 8,
                              }}
                            >
                              {SHIFT_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ fontWeight: 600 }}>
                              {schedule[e.id]?.[d.key] || "Off"}
                            </span>
                          )}
                        </td>
                      ))}
                      <td style={{ textAlign: "right", fontWeight: 800 }}>
                        {totalsByEmp[e.id]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
            {employees.map((e) => (
              <div key={e.id} className="card">
                <div className="head">
                  {canEdit ? (
                    <input
                      value={e.name}
                      onChange={(ev) => setEmployeeName(e.id, ev.target.value)}
                      style={{
                        width: "100%",
                        padding: "6px 8px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                      }}
                    />
                  ) : (
                    safeName(e.name)
                  )}
                </div>
                <div className="row">
                  <div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>Shift</div>
                    {canEdit ? (
                      <select
                        value={schedule[e.id]?.[active] || "Off"}
                        onChange={(ev) => setShift(e.id, active, ev.target.value)}
                        style={{
                          padding: "6px 8px",
                          border: "1px solid #e5e7eb",
                          borderRadius: 8,
                        }}
                      >
                        {SHIFT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ fontSize: 18, fontWeight: 700 }}>
                        {schedule[e.id]?.[active] || "Off"}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#64748b", fontSize: 12 }}>Paid Hours</div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>
                      {parseHours(schedule[e.id]?.[active])}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                textAlign: "right",
                color: "#475569",
                fontSize: 14,
                paddingBottom: 24,
              }}
            >
              Day total:{" "}
              <span style={{ fontWeight: 700 }}>
                {employees.reduce(
                  (acc, e) => acc + parseHours(schedule[e.id]?.[active]),
                  0
                )}
              </span>
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 16, margin: "16px 0 48px" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Weekly Totals</div>
          {employees.map((e) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: 12,
                border: "1px solid #eef2ff",
                borderRadius: 12,
                marginBottom: 8,
                background: "#fff",
              }}
            >
              <div
                style={{
                  marginRight: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {safeName(e.name)}
              </div>
              <div style={{ fontWeight: 800 }}>{totalsByEmp[e.id]}</div>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: 12,
              borderRadius: 12,
              background: "#eef2ff",
              fontWeight: 800,
            }}
          >
            <div>Week Total</div>
            <div>{weekTotal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
