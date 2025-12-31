/* global React, ReactDOM */

const { useEffect, useMemo, useRef, useState } = React;

/** =========================
 *  Helpers: date + time
 *  ========================= */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeekMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 Sun, 1 Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addWeeks(date, n) {
  return addDays(date, n * 7);
}

function formatWeekLabel(mondayDate) {
  const opts = { weekday: "long", month: "long", day: "numeric" };
  return `Week of ${mondayDate.toLocaleDateString(undefined, opts)}`;
}

function formatDayChip(date) {
  const dow = date.toLocaleDateString(undefined, { weekday: "short" });
  const mon = date.toLocaleDateString(undefined, { month: "short" });
  const day = date.getDate();
  return { dow, mon, day };
}

function minutesToLabel(mins) {
  let h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}${m === 0 ? "" : ":" + pad2(m)}${ampm}`;
}

function shiftLabelFromMinutes(startMin, endMin) {
  return `${minutesToLabel(startMin)}–${minutesToLabel(endMin)}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/** =========================
 *  Shift options
 *  ========================= */

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

function normalizeShiftLabel(s) {
  return (s || "").replace(/\s+/g, "").toUpperCase();
}

function isCustomShiftValue(value) {
  const nv = normalizeShiftLabel(value);
  const isCommon = COMMON_SHIFTS.some((x) => normalizeShiftLabel(x) === nv);
  return !isCommon && nv !== normalizeShiftLabel("Off") && nv !== "";
}

/** =========================
 *  Storage (local for now)
 *  ========================= */

function storageKey(storeId, weekISO) {
  return `tephseal:schedule:${storeId}:${weekISO}`;
}

function cryptoId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function makeOffWeek() {
  return ["Off", "Off", "Off", "Off", "Off", "Off", "Off"];
}

function defaultSchedule(storeId, weekMondayISO) {
  return {
    meta: {
      storeId,
      storeName: "Murdock Hyundai",
      weekMondayISO,
      updatedAt: Date.now(),
    },
    employees: [
      { id: cryptoId(), name: "Tyler", shifts: makeOffWeek() },
      { id: cryptoId(), name: "Derrick", shifts: makeOffWeek() },
      { id: cryptoId(), name: "Jonathan", shifts: makeOffWeek() },
    ],
  };
}

function loadScheduleLocal(storeId, weekMondayISO) {
  const key = storageKey(storeId, weekMondayISO);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveScheduleLocal(storeId, weekMondayISO, scheduleObj) {
  const key = storageKey(storeId, weekMondayISO);
  localStorage.setItem(key, JSON.stringify(scheduleObj));
}

function copyScheduleToNewWeek(scheduleObj, storeId, newWeekISO) {
  const next = JSON.parse(JSON.stringify(scheduleObj));
  next.meta = {
    ...(next.meta || {}),
    storeId,
    weekMondayISO: newWeekISO,
    updatedAt: Date.now(),
  };
  return next;
}

/** =========================
 *  Hours
 *  ========================= */

function shiftToMinutesRange(shiftLabel) {
  if (!shiftLabel || normalizeShiftLabel(shiftLabel) === normalizeShiftLabel("Off")) return null;
  const parts = shiftLabel.replace("-", "–").split("–");
  if (parts.length !== 2) return null;

  const a = parseTimeLabel(parts[0].trim());
  const b = parseTimeLabel(parts[1].trim());
  if (a == null || b == null) return null;
  return { startMin: a, endMin: b };
}

function parseTimeLabel(s) {
  const t = s.toUpperCase().replace(/\s+/g, "");
  const am = t.endsWith("AM");
  const pm = t.endsWith("PM");
  if (!am && !pm) return null;
  const core = t.slice(0, -2);
  const [hhStr, mmStr] = core.split(":");
  let hh = Number(hhStr);
  let mm = mmStr ? Number(mmStr) : 0;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh === 12) hh = 0;
  let h24 = hh + (pm ? 12 : 0);
  const mins = h24 * 60 + clamp(mm, 0, 59);
  return mins;
}

function shiftHours(shiftLabel) {
  const r = shiftToMinutesRange(shiftLabel);
  if (!r) return 0;
  let { startMin, endMin } = r;
  startMin = clamp(startMin, 480, 1200); // 8AM
  endMin = clamp(endMin, 480, 1200);     // 8PM
  const diff = Math.max(0, endMin - startMin);
  return diff / 60;
}

/** =========================
 *  App
 *  ========================= */

function App() {
  const url = useMemo(() => new URL(window.location.href), []);
  const storeId = (url.searchParams.get("store") || "murdock-murray").trim();
  const isManager = url.searchParams.get("manager") === "1";
  const weekParam = url.searchParams.get("week");

  // ✅ Viewer should ONLY see the week sent (week param). If not provided, show current week.
  const initialMonday = useMemo(() => {
    const base = weekParam
      ? startOfWeekMonday(parseISODate(weekParam))
      : startOfWeekMonday(new Date());
    return base;
  }, [weekParam]);

  const [monday, setMonday] = useState(initialMonday);
  const weekISO = useMemo(() => toISODate(monday), [monday]);

  const [schedule, setSchedule] = useState(() => {
    const existing = loadScheduleLocal(storeId, weekISO);
    return existing || defaultSchedule(storeId, weekISO);
  });

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [customModal, setCustomModal] = useState(null); // { empId, dayIndex }

  useEffect(() => {
    const existing = loadScheduleLocal(storeId, weekISO);
    if (existing) {
      setSchedule(existing);
    } else {
      const prevISO = toISODate(addWeeks(monday, -1));
      const prev = loadScheduleLocal(storeId, prevISO);
      if (prev && isManager) {
        // only managers auto-copy forward
        const copied = copyScheduleToNewWeek(prev, storeId, weekISO);
        setSchedule(copied);
        saveScheduleLocal(storeId, weekISO, copied);
      } else {
        setSchedule(defaultSchedule(storeId, weekISO));
      }
    }
  }, [storeId, weekISO]);

  useEffect(() => {
    setSchedule((prev) => ({
      ...prev,
      meta: {
        ...(prev.meta || {}),
        storeId,
        weekMondayISO: weekISO,
      },
    }));
  }, [storeId, weekISO]);

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  function onPrevWeek() {
    setMonday((d) => addWeeks(d, -1));
  }

  function onNextWeek() {
    setMonday((d) => addWeeks(d, +1));
  }

  function saveNow() {
    const next = {
      ...schedule,
      meta: { ...(schedule.meta || {}), updatedAt: Date.now() },
    };
    setSchedule(next);
    saveScheduleLocal(storeId, weekISO, next);
    showToast("Saved ✅");
  }

  async function shareReadOnlyLink() {
    // ✅ Employees get a fixed week link
    const link = `${window.location.origin}${window.location.pathname}?store=${encodeURIComponent(storeId)}&week=${encodeURIComponent(weekISO)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Viewer link copied ✅");
    } catch {
      window.prompt("Copy this viewer link:", link);
    }
  }

  function updateEmployeeName(empId, name) {
    setSchedule((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === empId ? { ...e, name } : e)),
    }));
  }

  function deleteEmployee(empId) {
    setSchedule((prev) => ({
      ...prev,
      employees: prev.employees.filter((e) => e.id !== empId),
    }));
    showToast("Employee deleted");
  }

  function addEmployee(name) {
    const nm = (name || "").trim();
    if (!nm) return;
    setSchedule((prev) => ({
      ...prev,
      employees: [...prev.employees, { id: cryptoId(), name: nm, shifts: makeOffWeek() }],
    }));
    showToast("Employee added ✅");
  }

  function setShift(empId, dayIndex, value) {
    if (value === "__CUSTOM__") {
      setCustomModal({ empId, dayIndex });
      return;
    }
    setSchedule((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => {
        if (e.id !== empId) return e;
        const shifts = [...e.shifts];
        shifts[dayIndex] = value;
        return { ...e, shifts };
      }),
    }));
  }

  function applyCustomShift(empId, dayIndex, startMin, endMin) {
    const label = shiftLabelFromMinutes(startMin, endMin);
    setSchedule((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => {
        if (e.id !== empId) return e;
        const shifts = [...e.shifts];
        shifts[dayIndex] = label;
        return { ...e, shifts };
      }),
    }));
  }

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) arr.push(addDays(monday, i));
    return arr;
  }, [monday]);

  const weeklyTotals = useMemo(() => {
    return schedule.employees.map((e) => {
      const total = e.shifts.reduce((sum, s) => sum + shiftHours(s), 0);
      return { id: e.id, total: Math.round(total * 2) / 2 };
    });
  }, [schedule.employees]);

  const weekTotal = useMemo(() => weeklyTotals.reduce((s, x) => s + x.total, 0), [weeklyTotals]);

  const storeName = schedule.meta?.storeName || "Murdock Hyundai";
  const managerLink = `${window.location.origin}${window.location.pathname}?store=${encodeURIComponent(storeId)}&manager=1`;
  const viewerLink = `${window.location.origin}${window.location.pathname}?store=${encodeURIComponent(storeId)}&week=${encodeURIComponent(weekISO)}`;

  /** Styles */
  const styles = useMemo(() => ({
    page: {
      minHeight: "100vh",
      background: "linear-gradient(180deg,#f4fbff 0%, #eef4ff 40%, #f7fbff 100%)",
      padding: "16px",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      color: "#0b1220",
    },
    shell: { maxWidth: 980, margin: "0 auto" },
    topCard: {
      background: "rgba(255,255,255,.88)",
      border: "1px solid rgba(16,24,40,.08)",
      borderRadius: 20,
      padding: 14,
      boxShadow: "0 12px 30px rgba(16,24,40,.08)",
      backdropFilter: "blur(10px)",
    },
    topRow: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
    },
    brandRow: {
      display: "flex",
      gap: 12,
      alignItems: "center",
      minWidth: 220,
      flex: "1 1 280px",
    },
    logo: {
      width: 52,
      height: 52,
      borderRadius: 18,
      background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "white",
      fontWeight: 900,
      fontSize: 20,
      flex: "0 0 auto",
    },
    titleBlock: { minWidth: 0 },
    label: {
      fontSize: 12,
      letterSpacing: 1.3,
      opacity: 0.6,
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: 2,
    },
    storeTitle: {
      fontSize: 20,
      fontWeight: 900,
      lineHeight: 1.15,
      maxWidth: 420,
      whiteSpace: "normal",
      overflow: "visible",
      textOverflow: "clip",
    },
    subTitle: { fontSize: 13, opacity: 0.7, fontWeight: 700, marginTop: 2 },
    controls: {
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "flex-end",
      alignItems: "center",
      flex: "1 1 280px",
    },
    btn: {
      border: "1px solid rgba(0,0,0,.10)",
      background: "rgba(255,255,255,.92)",
      padding: "10px 12px",
      borderRadius: 999,
      fontWeight: 800,
      color: "#1c4ed8",
      boxShadow: "0 8px 18px rgba(16,24,40,.06)",
      cursor: "pointer",
      display: "inline-flex",
      gap: 6,
      alignItems: "center",
    },
    btnPrimary: {
      background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
      color: "white",
      border: "none",
    },

    tabsWrap: {
      marginTop: 12,
      background: "linear-gradient(135deg,#4f7cff,#6a5cff)",
      borderRadius: 18,
      padding: 8,
      overflowX: "auto",
    },
    tabsRow: { display: "flex", gap: 8, minWidth: 520 },
    chip: (active) => ({
      border: "none",
      borderRadius: 16,
      padding: "10px 12px",
      fontWeight: 900,
      background: active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.18)",
      color: active ? "#0b1220" : "rgba(255,255,255,.92)",
      minWidth: 86,
      cursor: "pointer",
      textAlign: "left",
    }),
    chipTop: { fontSize: 14, fontWeight: 900 },
    chipSub: { fontSize: 12, opacity: 0.85, fontWeight: 800 },

    sectionCard: {
      marginTop: 14,
      background: "rgba(255,255,255,.92)",
      border: "1px solid rgba(16,24,40,.08)",
      borderRadius: 22,
      overflow: "hidden",
      boxShadow: "0 18px 40px rgba(16,24,40,.08)",
    },
    sectionHeader: {
      padding: "14px 16px",
      color: "white",
      fontWeight: 950,
      fontSize: 20,
      background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
    },

    tableWrap: { padding: 12, overflowX: "auto" },
    table: { width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 640 },
    th: { textAlign: "left", fontSize: 13, opacity: 0.7, fontWeight: 900, padding: "0 10px 6px 10px" },
    trRow: { background: "rgba(250,252,255,.9)", border: "1px solid rgba(0,0,0,.06)" },
    td: { padding: 10, verticalAlign: "middle" },

    nameInput: {
      width: 200,
      maxWidth: "200px",
      padding: "12px 14px",
      borderRadius: 18,
      border: "1px solid rgba(0,0,0,.10)",
      fontWeight: 900,
      fontSize: 16,
      outline: "none",
      background: "white",
    },
    select: {
      width: 150,
      padding: "10px 12px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,.10)",
      fontWeight: 900,
      color: "#1c4ed8",
      background: "white",
      outline: "none",
    },
    pill: {
      display: "inline-block",
      padding: "10px 14px",
      borderRadius: 999,
      border: "1px solid rgba(0,0,0,.10)",
      fontWeight: 900,
      color: "#1c4ed8",
      background: "white",
      minWidth: 120,
      textAlign: "center",
    },
    trashBtn: {
      width: 44,
      height: 44,
      borderRadius: 16,
      border: "1px solid rgba(0,0,0,.10)",
      background: "white",
      cursor: "pointer",
      fontSize: 18,
    },

    addBarWrap: { padding: 12, paddingTop: 0 },
    addBarInner: { width: "min(560px, 100%)", margin: "0 auto" },
    addBar: {
      width: "100%",
      padding: "12px 14px",
      borderRadius: 18,
      border: "1px dashed rgba(28,78,216,.35)",
      background: "rgba(79,124,255,.08)",
      color: "#1c4ed8",
      fontWeight: 950,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },

    totalsCard: {
      marginTop: 14,
      background: "rgba(255,255,255,.92)",
      border: "1px solid rgba(16,24,40,.08)",
      borderRadius: 22,
      overflow: "hidden",
      boxShadow: "0 18px 40px rgba(16,24,40,.08)",
    },
    totalsHeader: {
      padding: "14px 16px",
      fontWeight: 950,
      fontSize: 18,
      color: "#0b1220",
      background: "rgba(79,124,255,.10)",
    },
    totalsItem: {
      padding: "12px 16px",
      display: "flex",
      justifyContent: "space-between",
      fontWeight: 900,
      borderTop: "1px solid rgba(16,24,40,.06)",
    },
    weekTotal: {
      padding: "14px 16px",
      display: "flex",
      justifyContent: "space-between",
      fontWeight: 950,
      fontSize: 18,
      borderTop: "1px solid rgba(16,24,40,.06)",
      background: "rgba(50,210,170,.10)",
    },

    toast: {
      position: "fixed",
      left: "50%",
      bottom: 20,
      transform: "translateX(-50%)",
      background: "rgba(14,20,40,.92)",
      color: "white",
      padding: "10px 14px",
      borderRadius: 999,
      fontWeight: 900,
      zIndex: 9999,
      boxShadow: "0 16px 40px rgba(0,0,0,.25)",
    },

    modalOverlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.35)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      zIndex: 9999,
    },
    modal: {
      width: "min(520px, 100%)",
      background: "white",
      borderRadius: 22,
      border: "1px solid rgba(0,0,0,.10)",
      boxShadow: "0 24px 70px rgba(0,0,0,.30)",
      overflow: "hidden",
    },
    modalHeader: {
      padding: "14px 16px",
      fontWeight: 950,
      background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
      color: "white",
    },
    modalBody: { padding: 16 },
    modalRow: { display: "flex", gap: 10, flexWrap: "wrap" },
    modalSelect: {
      flex: "1 1 160px",
      padding: "12px 12px",
      borderRadius: 16,
      border: "1px solid rgba(0,0,0,.10)",
      fontWeight: 900,
      outline: "none",
    },
    modalActions: {
      display: "flex",
      gap: 10,
      justifyContent: "flex-end",
      padding: 16,
      borderTop: "1px solid rgba(0,0,0,.08)",
      background: "rgba(79,124,255,.06)",
    },
  }), []);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {/* Top header */}
        <div style={styles.topCard}>
          <div style={styles.topRow}>
            <div style={styles.brandRow}>
              <div style={styles.logo}>S</div>
              <div style={styles.titleBlock}>
                <div style={styles.label}>Schedule</div>

                {isManager ? (
                  <input
                    value={storeName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSchedule((prev) => ({
                        ...prev,
                        meta: { ...(prev.meta || {}), storeName: v },
                      }));
                    }}
                    placeholder="Store name"
                    style={{
                      width: "min(420px, 100%)",
                      maxWidth: 420,
                      fontSize: 20,
                      fontWeight: 950,
                      border: "1px solid rgba(0,0,0,.10)",
                      borderRadius: 16,
                      padding: "10px 12px",
                      outline: "none",
                    }}
                  />
                ) : (
                  <div style={styles.storeTitle} title={storeName}>
                    {storeName}
                  </div>
                )}

                <div style={styles.subTitle}>{formatWeekLabel(monday)}</div>
              </div>
            </div>

            {/* ✅ employees: NO prev/next buttons */}
            <div style={styles.controls}>
              {isManager ? (
                <>
                  <button style={styles.btn} onClick={onPrevWeek}>◀ Prev</button>
                  <button style={styles.btn} onClick={onNextWeek}>Next ▶</button>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={saveNow}>Save</button>
                  <button style={styles.btn} onClick={shareReadOnlyLink}>Share Link</button>
                </>
              ) : (
                <button
                  style={styles.btn}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(viewerLink);
                      showToast("Viewer link copied ✅");
                    } catch {
                      window.prompt("Copy this link:", viewerLink);
                    }
                  }}
                >
                  Copy Link
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={styles.tabsWrap}>
          <div style={styles.tabsRow}>
            <button style={styles.chip(activeTab === "all")} onClick={() => setActiveTab("all")}>
              <div style={styles.chipTop}>All</div>
              <div style={styles.chipSub}>Week</div>
            </button>
            {days.map((d, i) => {
              const chip = formatDayChip(d);
              const active = activeTab === String(i);
              return (
                <button key={i} style={styles.chip(active)} onClick={() => setActiveTab(String(i))}>
                  <div style={styles.chipTop}>{chip.dow}</div>
                  <div style={styles.chipSub}>{chip.mon} {chip.day}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Full week section */}
        <div style={styles.sectionCard}>
          <div style={styles.sectionHeader}>Full Week</div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Employee</th>
                  {days.map((d, i) => {
                    const chip = formatDayChip(d);
                    return (
                      <th key={i} style={styles.th}>
                        {chip.dow} <span style={{ opacity: 0.6, fontWeight: 800 }}>{chip.mon} {chip.day}</span>
                      </th>
                    );
                  })}
                  <th style={styles.th}>Total</th>
                  {isManager ? <th style={styles.th}></th> : null}
                </tr>
              </thead>

              <tbody>
                {schedule.employees.map((emp) => {
                  const total = weeklyTotals.find((x) => x.id === emp.id)?.total ?? 0;

                  return (
                    <tr key={emp.id} style={styles.trRow}>
                      <td style={styles.td}>
                        {isManager ? (
                          <input
                            style={styles.nameInput}
                            value={emp.name}
                            onChange={(e) => updateEmployeeName(emp.id, e.target.value)}
                            placeholder="Employee name"
                          />
                        ) : (
                          <div style={{ fontWeight: 950, fontSize: 16 }}>{emp.name}</div>
                        )}
                      </td>

                      {days.map((_, dayIndex) => {
                        const value = emp.shifts[dayIndex] || "Off";
                        const isCustom = isCustomShiftValue(value);

                        if (!isManager) {
                          return (
                            <td key={dayIndex} style={styles.td}>
                              <span style={styles.pill}>{value}</span>
                            </td>
                          );
                        }

                        return (
                          <td key={dayIndex} style={styles.td}>
                            <select
                              style={styles.select}
                              value={value}
                              onChange={(e) => setShift(emp.id, dayIndex, e.target.value)}
                              onPointerDown={(e) => {
                                if (isCustom) {
                                  e.preventDefault();
                                  setCustomModal({ empId: emp.id, dayIndex });
                                }
                              }}
                            >
                              {isCustom ? <option value={value}>{value}</option> : null}
                              {COMMON_SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
                              <option value="__CUSTOM__">Custom…</option>
                            </select>
                          </td>
                        );
                      })}

                      <td style={styles.td}>
                        <div style={{ fontWeight: 950, fontSize: 18 }}>{total}</div>
                      </td>

                      {isManager ? (
                        <td style={styles.td}>
                          <button
                            style={styles.trashBtn}
                            onClick={() => {
                              if (confirm(`Delete ${emp.name}?`)) deleteEmployee(emp.id);
                            }}
                            title="Delete employee"
                          >
                            🗑️
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isManager ? (
            <div style={styles.addBarWrap}>
              <div style={styles.addBarInner}>
                <AddEmployeeBar onAdd={addEmployee} styles={styles} />
              </div>
            </div>
          ) : null}
        </div>

        {/* Weekly totals */}
        <div style={styles.totalsCard}>
          <div style={styles.totalsHeader}>Weekly Totals</div>
          {schedule.employees.map((e) => {
            const t = weeklyTotals.find((x) => x.id === e.id)?.total ?? 0;
            return (
              <div key={e.id} style={styles.totalsItem}>
                <div style={{ fontWeight: 900 }}>{e.name}</div>
                <div style={{ fontWeight: 950 }}>{t}</div>
              </div>
            );
          })}
          <div style={styles.weekTotal}>
            <div>Week Total</div>
            <div>{weekTotal}</div>
          </div>
        </div>

        <div style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
          <div><b>Manager link:</b> {managerLink}</div>
          <div><b>Viewer link:</b> {viewerLink}</div>
        </div>
      </div>

      {toast ? <div style={styles.toast}>{toast}</div> : null}

      {customModal ? (
        <CustomShiftModal
          styles={styles}
          onClose={() => setCustomModal(null)}
          onApply={(startMin, endMin) => {
            applyCustomShift(customModal.empId, customModal.dayIndex, startMin, endMin);
            setCustomModal(null);
            showToast("Custom shift applied ✅");
          }}
        />
      ) : null}
    </div>
  );
}

function AddEmployeeBar({ onAdd, styles }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button style={styles.addBar} onClick={() => setOpen(true)} type="button">
        <span style={{ fontSize: 18 }}>➕</span>
        <span style={{ fontWeight: 950 }}>Add employee</span>
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New employee name"
        style={{
          flex: "1 1 220px",
          padding: "12px 14px",
          borderRadius: 16,
          border: "1px solid rgba(0,0,0,.10)",
          fontWeight: 900,
          outline: "none",
        }}
      />
      <button
        style={{ ...styles.btn, ...styles.btnPrimary }}
        onClick={() => {
          onAdd(name);
          setName("");
          setOpen(false);
        }}
        type="button"
      >
        Add
      </button>
      <button
        style={styles.btn}
        onClick={() => {
          setName("");
          setOpen(false);
        }}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}

function CustomShiftModal({ styles, onClose, onApply }) {
  const options = useMemo(() => {
    const arr = [];
    for (let m = 480; m <= 1200; m += 30) arr.push(m);
    return arr;
  }, []);

  const [startMin, setStartMin] = useState(480);
  const [endMin, setEndMin] = useState(1020);

  useEffect(() => {
    if (endMin <= startMin) setEndMin(Math.min(1200, startMin + 30));
  }, [startMin]);

  return (
    <div style={styles.modalOverlay} onMouseDown={onClose}>
      <div style={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>Custom Shift (30-min)</div>
        <div style={styles.modalBody}>
          <div style={{ fontWeight: 900, marginBottom: 10, opacity: 0.85 }}>
            Choose a start and end time (between 8AM and 8PM).
          </div>

          <div style={styles.modalRow}>
            <select style={styles.modalSelect} value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
              {options.map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>

            <select style={styles.modalSelect} value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
              {options.filter((m) => m > startMin).map((m) => <option key={m} value={m}>{minutesToLabel(m)}</option>)}
            </select>
          </div>

          <div style={{ marginTop: 12, fontWeight: 950, fontSize: 16 }}>
            Preview: <span style={{ color: "#1c4ed8" }}>{shiftLabelFromMinutes(startMin, endMin)}</span>
          </div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.btn} onClick={onClose} type="button">Cancel</button>
          <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => onApply(startMin, endMin)} type="button">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
