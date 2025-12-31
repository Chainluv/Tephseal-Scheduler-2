const { useEffect, useMemo, useRef, useState } = React;

/** ---------- Time helpers (30 min steps, 8:00–20:00) ---------- */
function minutesToLabel(m) {
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const mm = min === 0 ? "" : `:${String(min).padStart(2, "0")}`;
  return `${h12}${mm}${ampm}`;
}

function labelFromRange(startM, endM) {
  return `${minutesToLabel(startM)}–${minutesToLabel(endM)}`;
}

function clampToMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // Sun=0
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function ymd(d) {
  const dt = new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function prettyWeekLabel(monday) {
  const d = new Date(monday);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function hoursFromShiftLabel(label) {
  if (!label || label === "Off") return 0;
  const parts = label.split("–");
  if (parts.length !== 2) return 0;

  const parse = (s) => {
    // e.g. "8AM", "11:30AM"
    const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?(AM|PM)$/i);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = m[3].toUpperCase();
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + mins;
  };

  const a = parse(parts[0]);
  const b = parse(parts[1]);
  if (a == null || b == null) return 0;
  const diff = b - a;
  return diff > 0 ? diff / 60 : 0;
}

/** ---------- Shift options ---------- */
const COMMON_SHIFTS = [
  "Off",
  "8AM–5PM",
  "8AM–6PM",
  "8AM–7PM",
  "8AM–8PM",
  "11AM–7PM",
  "11AM–8PM",
  "12PM–7PM",
  "12PM–8PM",
  "4PM–8PM",
];

// Special value used only for triggering the custom modal
const CUSTOM_TRIGGER = "__CUSTOM__";

/** ---------- Main App ---------- */
function App() {
  const params = new URLSearchParams(window.location.search);

  const storeKey = (params.get("store") || "default").trim();
  const isManager = params.get("manager") === "1";

  // Employee view should be locked to the week in the link (if provided)
  const weekParam = params.get("week"); // YYYY-MM-DD optional
  const initialWeek = useMemo(() => {
    if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      return clampToMonday(new Date(weekParam + "T00:00:00"));
    }
    return clampToMonday(new Date());
  }, []);

  const [weekStart, setWeekStart] = useState(initialWeek);

  // Store + schedule data are stored per-store per-week in localStorage (simple + reliable)
  const storageKey = useMemo(() => `tephseal:${storeKey}:${ymd(weekStart)}`, [storeKey, weekStart]);

  const [storeName, setStoreName] = useState("Murdock Hyundai");
  const [employees, setEmployees] = useState([
    { id: 1, name: "Tyler", shifts: {} },
    { id: 2, name: "Derrick", shifts: {} },
    { id: 3, name: "Jonathan", shifts: {} },
  ]);

  // Custom shift modal
  const [customOpen, setCustomOpen] = useState(false);
  const [customFor, setCustomFor] = useState(null); // { empId, dayKey }
  const [customStart, setCustomStart] = useState(8 * 60);
  const [customEnd, setCustomEnd] = useState(17 * 60);

  // Remember prior select values to avoid "Custom already selected" issue
  const lastSelectValueRef = useRef({}); // key: `${empId}|${dayKey}`

  // Load saved week data
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.storeName) setStoreName(parsed.storeName);
        if (Array.isArray(parsed.employees)) setEmployees(parsed.employees);
      } catch (e) {
        // ignore
      }
    } else {
      // If no saved schedule for this week, keep employees but reset shifts to Off
      setEmployees((prev) =>
        prev.map((e) => ({
          ...e,
          shifts: {},
        }))
      );
    }
  }, [storageKey]);

  // Days for this week (Mon-Sun)
  const days = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDays(weekStart, i);
      const dayKey = ymd(d);
      return {
        date: d,
        dayKey,
        dow: d.toLocaleDateString("en-US", { weekday: "short" }),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      };
    });
  }, [weekStart]);

  function save() {
    const payload = {
      storeName,
      employees,
      weekStart: ymd(weekStart),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    toast("Saved ✅");
  }

  function shareReadOnly() {
    // Save first, then give a read-only link for THIS week
    save();
    const link = `${window.location.origin}${window.location.pathname}?store=${encodeURIComponent(
      storeKey
    )}&week=${encodeURIComponent(ymd(weekStart))}`;
    copyToClipboard(link);
    toast("Share link copied 📎");
  }

  function goPrevWeek() {
    const prev = addDays(weekStart, -7);
    setWeekStart(clampToMonday(prev));
  }

  function goNextWeek() {
    const next = addDays(weekStart, 7);
    setWeekStart(clampToMonday(next));
  }

  function updateEmployeeName(empId, name) {
    setEmployees((prev) => prev.map((e) => (e.id === empId ? { ...e, name } : e)));
  }

  function deleteEmployee(empId) {
    if (!confirm("Delete this employee row?")) return;
    setEmployees((prev) => prev.filter((e) => e.id !== empId));
    toast("Employee removed 🗑️");
  }

  function addEmployee() {
    const id = Date.now();
    setEmployees((prev) => [...prev, { id, name: "", shifts: {} }]);
    toast("New employee row added ➕");
  }

  function openCustom(empId, dayKey) {
    // Default custom to a sensible range
    setCustomStart(8 * 60);
    setCustomEnd(17 * 60);
    setCustomFor({ empId, dayKey });
    setCustomOpen(true);
  }

  function applyCustom() {
    if (!customFor) return;
    const { empId, dayKey } = customFor;

    if (customEnd <= customStart) {
      toast("End time must be after start time.");
      return;
    }
    if (customStart < 8 * 60 || customEnd > 20 * 60) {
      toast("Shift must stay between 8AM and 8PM.");
      return;
    }

    const label = labelFromRange(customStart, customEnd);

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === empId ? { ...e, shifts: { ...e.shifts, [dayKey]: label } } : e
      )
    );

    // Update last select value
    lastSelectValueRef.current[`${empId}|${dayKey}`] = label;

    setCustomOpen(false);
    setCustomFor(null);
    toast("Custom shift set ✅");
  }

  function setShift(empId, dayKey, value) {
    // Custom trigger always opens modal, even if "Custom…" was already selected before
    if (value === CUSTOM_TRIGGER) {
      openCustom(empId, dayKey);
      return;
    }

    setEmployees((prev) =>
      prev.map((e) =>
        e.id === empId ? { ...e, shifts: { ...e.shifts, [dayKey]: value } } : e
      )
    );
    lastSelectValueRef.current[`${empId}|${dayKey}`] = value;
  }

  // Week totals
  const weeklyTotals = useMemo(() => {
    const totals = employees.map((e) => {
      let hours = 0;
      for (const d of days) hours += hoursFromShiftLabel(e.shifts[d.dayKey] || "Off");
      return { id: e.id, name: e.name || "—", hours: Math.round(hours * 10) / 10 };
    });
    const weekTotal = totals.reduce((a, t) => a + t.hours, 0);
    return { totals, weekTotal: Math.round(weekTotal * 10) / 10 };
  }, [employees, days]);

  // Employee view rules: no prev/next, and if week= is provided we lock it
  const lockedWeek = !!weekParam && !isManager;

  return (
    <div className="page">
      <div className="shell">

        {/* TOP CARD */}
        <div className="topCard">
          <div className="topRow">
            <div className="avatar">S</div>

            <div className="topInfo">
              <div className="topLabel">SCHEDULE</div>

              {isManager ? (
                <input
                  className="storeInput"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  aria-label="Store name"
                />
              ) : (
                <div className="storeTitle">{storeName}</div>
              )}

              <div className="weekLine">Week of Monday, {prettyWeekLabel(weekStart)}</div>
            </div>
          </div>

          {/* Buttons area: wraps nicely, never overlaps */}
          {isManager && (
            <div className="btnBar">
              <button className="pill ghost" onClick={goPrevWeek} disabled={lockedWeek}>
                ◀ Prev
              </button>
              <button className="pill ghost" onClick={goNextWeek} disabled={lockedWeek}>
                Next ▶
              </button>
              <button className="pill primary" onClick={save}>
                Save
              </button>
              <button className="pill ghost" onClick={shareReadOnly}>
                Share Link
              </button>
            </div>
          )}
        </div>

        {/* DAY TABS */}
        <div className="tabsCard">
          <div className="tabsStrip">
            <div className="tab active">
              <div className="tabTop">All</div>
              <div className="tabBottom">Week</div>
            </div>
            {days.slice(0, 2).map((d) => (
              <div className="tab" key={d.dayKey}>
                <div className="tabTop">{d.dow}</div>
                <div className="tabBottom">{d.label}</div>
              </div>
            ))}
            {/* keep it simple in header; full week table below */}
          </div>
        </div>

        {/* FULL WEEK CARD */}
        <div className="card">
          <div className="cardHeader">
            <div className="cardTitle">Full Week</div>
          </div>

          <div className="tableWrap">
            <div className="tableHead">
              <div className="th employeeTh">Employee</div>
              {days.map((d) => (
                <div className="th dayTh" key={d.dayKey}>
                  {d.dow} <span className="muted">{d.label}</span>
                </div>
              ))}
              <div className="th totalTh">Total</div>
              {isManager && <div className="th actionTh"></div>}
            </div>

            {employees.map((emp) => {
              const total = weeklyTotals.totals.find((t) => t.id === emp.id)?.hours ?? 0;

              return (
                <div className="tableRow" key={emp.id}>
                  <div className="td employeeTd">
                    <input
                      className="nameInput"
                      value={emp.name}
                      onChange={(e) => updateEmployeeName(emp.id, e.target.value)}
                      disabled={!isManager}
                      placeholder={isManager ? "Name" : ""}
                    />
                  </div>

                  {days.map((d) => {
                    const current = emp.shifts[d.dayKey] || "Off";
                    const selectKey = `${emp.id}|${d.dayKey}`;
                    const last = lastSelectValueRef.current[selectKey] || current;

                    return (
                      <div className="td dayTd" key={d.dayKey}>
                        {isManager ? (
                          <select
                            className="shiftSelect"
                            value={current === "Custom…" ? last : current}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === CUSTOM_TRIGGER) {
                                // Immediately reset visual selection back to last known shift
                                // (so you can click Custom… again even if previously "custom")
                                e.target.value = last;
                                openCustom(emp.id, d.dayKey);
                                return;
                              }
                              setShift(emp.id, d.dayKey, val);
                            }}
                          >
                            {COMMON_SHIFTS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                            <option value={CUSTOM_TRIGGER}>Custom…</option>
                          </select>
                        ) : (
                          <div className={`chip ${current === "Off" ? "chipOff" : ""}`}>
                            {current}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div className="td totalTd">{total}</div>

                  {isManager && (
                    <div className="td actionTd">
                      <button className="trashBtn" onClick={() => deleteEmployee(emp.id)} title="Delete">
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Always-visible plus row */}
            {isManager && (
              <div className="addRow" onClick={addEmployee} role="button" tabIndex={0}>
                <div className="addInner">
                  <span className="plus">＋</span>
                  <span className="addText">Add employee</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* WEEKLY TOTALS */}
        <div className="card totalsCard">
          <div className="totalsHeader">Weekly Totals</div>
          {weeklyTotals.totals.map((t) => (
            <div className="totalsRow" key={t.id}>
              <div className="totalsName">{t.name}</div>
              <div className="totalsHours">{t.hours}</div>
            </div>
          ))}
          <div className="weekTotal">
            <div>Week Total</div>
            <div className="weekTotalNum">{weeklyTotals.weekTotal}</div>
          </div>
        </div>

        {/* CUSTOM SHIFT MODAL */}
        {customOpen && (
          <div className="modalOverlay" onClick={() => setCustomOpen(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modalTitle">Custom Shift</div>
              <div className="modalSub">Choose start & end (30 min steps, 8AM–8PM)</div>

              <div className="modalGrid">
                <div>
                  <div className="fieldLabel">Start</div>
                  <select
                    className="modalSelect"
                    value={customStart}
                    onChange={(e) => setCustomStart(parseInt(e.target.value, 10))}
                  >
                    {timeOptions(8 * 60, 19 * 60).map((m) => (
                      <option key={m} value={m}>
                        {minutesToLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="fieldLabel">End</div>
                  <select
                    className="modalSelect"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(parseInt(e.target.value, 10))}
                  >
                    {timeOptions(8 * 60 + 30, 20 * 60).map((m) => (
                      <option key={m} value={m}>
                        {minutesToLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="modalActions">
                <button className="pill ghost" onClick={() => setCustomOpen(false)}>
                  Cancel
                </button>
                <button className="pill primary" onClick={applyCustom}>
                  Apply
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      <Toaster />
      <style>{CSS}</style>
    </div>
  );
}

/** 30-minute options generator */
function timeOptions(minM, maxM) {
  const out = [];
  for (let m = minM; m <= maxM; m += 30) out.push(m);
  return out;
}

/** Clipboard + toast */
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return Promise.resolve();
}

let _toast = null;
function toast(msg) {
  if (_toast) _toast(msg);
}

function Toaster() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    _toast = (m) => {
      setMsg(m);
      setTimeout(() => setMsg(null), 2200);
    };
    return () => (_toast = null);
  }, []);
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

/** ---------- Styling (UTA-ish cards / gradients / mobile-safe header) ---------- */
const CSS = `
  :root{
    --bg:#eaf2fb;
    --card:#ffffff;
    --ink:#0f172a;
    --muted:#64748b;
    --stroke:rgba(15,23,42,.08);
    --shadow:0 16px 40px rgba(15,23,42,.10);
    --grad:linear-gradient(135deg,#5b8cff,#2dd4bf);
    --grad2:linear-gradient(135deg,#4f46e5,#06b6d4);
    --pill:999px;
  }

  *{box-sizing:border-box}
  body{
    margin:0;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial;
    background: radial-gradient(1200px 800px at 50% -200px, rgba(91,140,255,.25), transparent 60%),
                radial-gradient(900px 600px at 90% 0px, rgba(45,212,191,.22), transparent 55%),
                var(--bg);
    color:var(--ink);
  }

  .page{min-height:100vh; padding:14px;}
  .shell{max-width:1100px; margin:0 auto; }

  /* Top card */
  .topCard{
    background:rgba(255,255,255,.72);
    border:1px solid var(--stroke);
    backdrop-filter: blur(10px);
    border-radius:22px;
    padding:14px;
    box-shadow: var(--shadow);
  }
  .topRow{
    display:flex;
    gap:12px;
    align-items:center;
  }
  .avatar{
    width:64px; height:64px; border-radius:22px;
    background: var(--grad);
    display:flex; align-items:center; justify-content:center;
    color:white; font-weight:800; font-size:22px;
    flex: 0 0 auto;
  }
  .topInfo{min-width:0; flex:1;}
  .topLabel{
    letter-spacing:.18em;
    font-size:12px;
    color:rgba(15,23,42,.55);
    font-weight:800;
  }
  .storeTitle{
    font-size:30px;
    font-weight:900;
    line-height:1.05;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .storeInput{
    width:100%;
    font-size:28px;
    font-weight:900;
    border:none;
    outline:none;
    background:transparent;
    padding:0;
    white-space:nowrap;
    overflow:hidden;
    text-overflow:ellipsis;
  }
  .weekLine{
    margin-top:6px;
    color:var(--muted);
    font-weight:700;
  }

  /* Buttons: always visible, wraps on mobile */
  .btnBar{
    margin-top:12px;
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    justify-content:flex-start;
  }
  .pill{
    border-radius: var(--pill);
    padding:10px 14px;
    font-weight:800;
    border:1px solid var(--stroke);
    background:#fff;
    color:#2563eb;
    box-shadow: 0 10px 22px rgba(15,23,42,.06);
  }
  .pill.primary{
    background: var(--grad);
    color:white;
    border:none;
  }
  .pill.ghost{
    background: rgba(255,255,255,.80);
  }
  .pill:active{transform: translateY(1px);}

  /* Tabs card */
  .tabsCard{
    margin-top:12px;
    border-radius:22px;
    padding:12px;
    background: rgba(255,255,255,.72);
    border:1px solid var(--stroke);
    backdrop-filter: blur(10px);
    box-shadow: var(--shadow);
  }
  .tabsStrip{
    display:flex;
    gap:10px;
    overflow:auto;
    padding-bottom:2px;
  }
  .tab{
    min-width:140px;
    border-radius:20px;
    padding:14px 14px;
    background: rgba(79,70,229,.12);
    border:1px solid rgba(79,70,229,.18);
    color: rgba(15,23,42,.75);
    flex:0 0 auto;
  }
  .tab.active{
    background: var(--grad2);
    color:white;
    border:none;
  }
  .tabTop{font-weight:900; font-size:22px; line-height:1.0;}
  .tabBottom{font-weight:800; opacity:.9; margin-top:4px;}

  /* Cards */
  .card{
    margin-top:14px;
    background: rgba(255,255,255,.74);
    border:1px solid var(--stroke);
    backdrop-filter: blur(10px);
    border-radius:22px;
    box-shadow: var(--shadow);
    overflow:hidden;
  }
  .cardHeader{
    background: var(--grad2);
    padding:14px 16px;
    color:white;
  }
  .cardTitle{
    font-size:28px;
    font-weight:900;
  }

  .tableWrap{ padding: 10px 10px 12px; overflow:auto; }
  .tableHead, .tableRow{
    display:grid;
    grid-template-columns: 240px repeat(7, minmax(120px, 1fr)) 80px 60px;
    gap:10px;
    align-items:center;
  }
  .tableHead{
    padding:10px 8px;
    color:rgba(15,23,42,.65);
    font-weight:900;
  }
  .th{ font-size:16px; }
  .muted{ color:rgba(15,23,42,.40); font-weight:900; }
  .tableRow{
    padding:10px 8px;
    border-top:1px solid rgba(15,23,42,.06);
  }

  .nameInput{
    width:100%;
    padding:12px 14px;
    border-radius:18px;
    border:1px solid rgba(15,23,42,.10);
    font-size:20px;
    font-weight:900;
    background: rgba(255,255,255,.85);
    outline:none;
  }

  .shiftSelect{
    width:100%;
    padding:10px 12px;
    border-radius: 999px;
    border:1px solid rgba(15,23,42,.10);
    font-weight:900;
    color:#2563eb;
    background: rgba(255,255,255,.90);
  }

  .chip{
    display:inline-flex;
    align-items:center;
    justify-content:center;
    width:100%;
    padding:10px 12px;
    border-radius:999px;
    border:1px solid rgba(15,23,42,.10);
    font-weight:900;
    color:#2563eb;
    background: rgba(255,255,255,.90);
  }
  .chipOff{ color: rgba(15,23,42,.55); }

  .totalTd{
    font-weight:900;
    text-align:center;
    font-size:18px;
  }

  .trashBtn{
    border:none;
    background: rgba(255,255,255,.85);
    border:1px solid rgba(15,23,42,.08);
    border-radius: 14px;
    padding:10px 10px;
    box-shadow: 0 10px 22px rgba(15,23,42,.06);
  }

  .addRow{
    margin-top:10px;
    border-top:1px solid rgba(15,23,42,.06);
    padding:14px 10px;
  }
  .addInner{
    display:flex;
    align-items:center;
    justify-content:flex-start;
    gap:10px;
    background: rgba(241,245,249,.9);
    border:1px dashed rgba(15,23,42,.18);
    border-radius:18px;
    padding:14px 16px;
    width:100%;
  }
  .plus{
    width:34px; height:34px;
    border-radius:12px;
    background: var(--grad);
    color:white;
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight:900;
    flex:0 0 auto;
  }
  .addText{
    font-weight:900;
    font-size:18px;
    white-space:nowrap;
  }

  /* Totals card */
  .totalsCard{ padding: 14px; }
  .totalsHeader{
    font-size:22px;
    font-weight:900;
    margin-bottom:8px;
  }
  .totalsRow{
    display:flex;
    align-items:center;
    justify-content:space-between;
    padding:12px 12px;
    border-radius:18px;
    background: rgba(255,255,255,.80);
    border:1px solid rgba(15,23,42,.06);
    margin-bottom:10px;
  }
  .totalsName{ font-weight:900; font-size:18px; }
  .totalsHours{ font-weight:900; font-size:20px; }

  .weekTotal{
    display:flex;
    justify-content:space-between;
    align-items:center;
    background: rgba(79,70,229,.10);
    border:1px solid rgba(79,70,229,.15);
    border-radius:18px;
    padding:14px 14px;
    font-weight:900;
    margin-top:6px;
  }
  .weekTotalNum{ font-size:22px; }

  /* Modal */
  .modalOverlay{
    position:fixed;
    inset:0;
    background: rgba(15,23,42,.35);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:16px;
    z-index:9999;
  }
  .modal{
    width:min(520px, 96vw);
    background: rgba(255,255,255,.92);
    border:1px solid rgba(15,23,42,.08);
    border-radius:22px;
    box-shadow: var(--shadow);
    padding:16px;
    backdrop-filter: blur(10px);
  }
  .modalTitle{ font-size:22px; font-weight:900; }
  .modalSub{ color:var(--muted); font-weight:700; margin-top:4px; }
  .modalGrid{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:12px;
    margin-top:14px;
  }
  .fieldLabel{ font-weight:900; color:rgba(15,23,42,.70); margin-bottom:6px; }
  .modalSelect{
    width:100%;
    padding:12px 12px;
    border-radius:16px;
    border:1px solid rgba(15,23,42,.10);
    font-weight:900;
    background:#fff;
  }
  .modalActions{
    margin-top:14px;
    display:flex;
    justify-content:flex-end;
    gap:10px;
    flex-wrap:wrap;
  }

  /* Toast */
  .toast{
    position:fixed;
    left:50%;
    bottom:22px;
    transform:translateX(-50%);
    background: rgba(15,23,42,.90);
    color:white;
    padding:12px 16px;
    border-radius:999px;
    font-weight:800;
    box-shadow: 0 16px 40px rgba(15,23,42,.22);
    z-index: 99999;
    max-width: 92vw;
    text-align:center;
  }

  /* Mobile tuning */
  @media (max-width: 720px){
    .storeTitle{ font-size:26px; }
    .storeInput{ font-size:24px; }
    .tableHead, .tableRow{
      grid-template-columns: 200px repeat(7, minmax(120px, 1fr)) 70px 52px;
    }
    .nameInput{ font-size:18px; }
  }

  @media (max-width: 420px){
    .avatar{ width:58px; height:58px; border-radius:20px; }
    .storeTitle{ font-size:24px; }
    .storeInput{ font-size:22px; }
  }
`;

// Mount
ReactDOM.render(<App />, document.getElementById("root"));
