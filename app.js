/* global React, ReactDOM */

const { useEffect, useMemo, useRef, useState } = React;

/** =========================
 * Helpers
 * ========================= */

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

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
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

/** =========================
 * Share snapshot encode/decode
 * ========================= */

function safeB64Encode(str) {
  // UTF-8 safe
  const utf8 = encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(utf8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeB64Decode(b64url) {
  const b64 = (b64url || "").replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (b64.length % 4)) % 4;
  const padded = b64 + "=".repeat(padLen);
  const bin = atob(padded);
  const percent = Array.prototype.map
    .call(bin, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
    .join("");
  return decodeURIComponent(percent);
}

function buildSnapshot(schedule, storeId, weekISO) {
  // Minimal payload, keeps link shorter
  return {
    v: 1,
    storeId,
    weekISO,
    storeName: schedule?.meta?.storeName || "Schedule",
    employees: (schedule?.employees || []).map((e) => ({
      name: e.name || "",
      shifts: Array.isArray(e.shifts) ? e.shifts.slice(0, 7) : ["Off","Off","Off","Off","Off","Off","Off"],
    })),
  };
}

/** =========================
 * Shift options
 * ========================= */

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
 * Storage (manager device)
 * ========================= */

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
  const raw = localStorage.getItem(storageKey(storeId, weekMondayISO));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveScheduleLocal(storeId, weekMondayISO, scheduleObj) {
  localStorage.setItem(storageKey(storeId, weekMondayISO), JSON.stringify(scheduleObj));
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
 * Hours (for totals)
 * ========================= */

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
  const h24 = hh + (pm ? 12 : 0);
  return h24 * 60 + clamp(mm, 0, 59);
}

function shiftToMinutesRange(shiftLabel) {
  if (!shiftLabel || normalizeShiftLabel(shiftLabel) === normalizeShiftLabel("Off")) return null;
  const parts = shiftLabel.replace("-", "–").split("–");
  if (parts.length !== 2) return null;

  const a = parseTimeLabel(parts[0].trim());
  const b = parseTimeLabel(parts[1].trim());
  if (a == null || b == null) return null;
  return { startMin: a, endMin: b };
}

function shiftHours(shiftLabel) {
  const r = shiftToMinutesRange(shiftLabel);
  if (!r) return 0;
  let { startMin, endMin } = r;
  startMin = clamp(startMin, 480, 1200); // 8AM
  endMin = clamp(endMin, 480, 1200);     // 8PM
  return Math.max(0, endMin - startMin) / 60;
}

/** =========================
 * App
 * ========================= */

function App() {
  const url = useMemo(() => new URL(window.location.href), []);
  const storeId = (url.searchParams.get("store") || "murdock-murray").trim();
  const weekParam = url.searchParams.get("week");
  const dataParam = url.searchParams.get("data"); // snapshot for employees

  // If data= exists, FORCE viewer mode (read-only), even if someone adds manager=1
  const isSnapshotView = Boolean(dataParam);
  const isManager = !isSnapshotView && url.searchParams.get("manager") === "1";

  // If a week is provided, show that week; otherwise current week.
  const initialMonday = useMemo(() => {
    const base = weekParam
      ? startOfWeekMonday(parseISODate(weekParam))
      : startOfWeekMonday(new Date());
    return base;
  }, [weekParam]);

  const [monday, setMonday] = useState(initialMonday);
  const weekISO = useMemo(() => toISODate(monday), [monday]);

  const [schedule, setSchedule] = useState(() => {
    // If viewing a snapshot, decode it and use it (read-only)
    if (dataParam) {
      try {
        const decoded = safeB64Decode(dataParam);
        const snap = JSON.parse(decoded);
        return {
          meta: {
            storeId: snap.storeId || storeId,
            storeName: snap.storeName || "Schedule",
            weekMondayISO: snap.weekISO || weekISO,
            updatedAt: Date.now(),
          },
          employees: (snap.employees || []).map((e) => ({
            id: cryptoId(),
            name: e.name || "",
            shifts: Array.isArray(e.shifts) ? e.shifts.slice(0, 7) : makeOffWeek(),
          })),
        };
      } catch {
        // If decoding fails, fall back to empty week (still viewer)
        return defaultSchedule(storeId, weekISO);
      }
    }

    // Manager/device-local schedule
    const existing = loadScheduleLocal(storeId, weekISO);
    return existing || defaultSchedule(storeId, weekISO);
  });

  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const [customModal, setCustomModal] = useState(null); // { empId, dayIndex }
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    if (isSnapshotView) return; // snapshot view shouldn't load/overwrite local storage

    const existing = loadScheduleLocal(storeId, weekISO);
    if (existing) {
      setSchedule(existing);
    } else {
      // only managers auto-copy forward
      const prevISO = toISODate(addWeeks(monday, -1));
      const prev = loadScheduleLocal(storeId, prevISO);
      if (prev && isManager) {
        const copied = copyScheduleToNewWeek(prev, storeId, weekISO);
        setSchedule(copied);
        saveScheduleLocal(storeId, weekISO, copied);
      } else {
        setSchedule(defaultSchedule(storeId, weekISO));
      }
    }
  }, [storeId, weekISO, isManager, isSnapshotView]);

  useEffect(() => {
    setSchedule((prev) => ({
      ...prev,
      meta: { ...(prev.meta || {}), storeId, weekMondayISO: weekISO },
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
    if (!isManager) return;
    const next = { ...schedule, meta: { ...(schedule.meta || {}), updatedAt: Date.now() } };
    setSchedule(next);
    saveScheduleLocal(storeId, weekISO, next);
    showToast("Saved ✅");
  }

  async function shareReadOnlyLink() {
    // Build a snapshot viewer URL (read-only), pinned to this week,
    // and embeds the schedule so employees see the same data.
    const snap = buildSnapshot(schedule, storeId, weekISO);
    const encoded = safeB64Encode(JSON.stringify(snap));

    const link =
      `${window.location.origin}${window.location.pathname}` +
      `?store=${encodeURIComponent(storeId)}` +
      `&week=${encodeURIComponent(weekISO)}` +
      `&data=${encodeURIComponent(encoded)}`;

    try {
      await navigator.clipboard.writeText(link);
      showToast("View-only link copied ✅");
    } catch {
      window.prompt("Copy this view-only link:", link);
    }
  }

  function updateEmployeeName(empId, name) {
    if (!isManager) return;
    setSchedule((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === empId ? { ...e, name } : e)),
    }));
  }

  function deleteEmployee(empId) {
    if (!isManager) return;
    setSchedule((prev) => ({
      ...prev,
      employees: prev.employees.filter((e) => e.id !== empId),
    }));
    showToast("Employee deleted");
  }

  function addEmployee(name) {
    if (!isManager) return;
    const nm = (name || "").trim();
    if (!nm) return;
    setSchedule((prev) => ({
      ...prev,
      employees: [...prev.employees, { id: cryptoId(), name: nm, shifts: makeOffWeek() }],
    }));
    showToast("Employee added ✅");
  }

  function setShift(empId, dayIndex, value) {
    if (!isManager) return;

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
    if (!isManager) return;
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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);

  const weeklyTotals = useMemo(() => {
    return schedule.employees.map((e) => {
      const total = e.shifts.reduce((sum, s) => sum + shiftHours(s), 0);
      return { id: e.id, total: Math.round(total * 2) / 2 };
    });
  }, [schedule.employees]);

  const weekTotal = useMemo(() => weeklyTotals.reduce((s, x) => s + x.total, 0), [weeklyTotals]);

  const storeName = schedule.meta?.storeName || "Murdock Hyundai";

  // Links for display/debug
  const viewerBase = `${window.location.origin}${window.location.pathname}?store=${encodeURIComponent(storeId)}&week=${encodeURIComponent(weekISO)}`;
  const managerLink = `${window.location.origin}${window.location.pathname}?store=${encodeURIComponent(storeId)}&manager=1`;

  /** Styles */
  const styles = useMemo(() => {
    const compact = isManager; // make header smaller for manager only
    return {
      page: {
        minHeight: "100vh",
        background: "linear-gradient(180deg,#f4fbff 0%, #eef4ff 40%, #f7fbff 100%)",
        padding: compact ? "12px" : "16px",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        color: "#0b1220",
      },
      shell: { maxWidth: 980, margin: "0 auto" },

      topCard: {
        background: "rgba(255,255,255,.88)",
        border: "1px solid rgba(16,24,40,.08)",
        borderRadius: 20,
        padding: compact ? 10 : 14,
        boxShadow: "0 12px 30px rgba(16,24,40,.08)",
        backdropFilter: "blur(10px)",
      },
      topRow: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
      },
      brandRow: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        minWidth: 220,
        flex: "1 1 280px",
      },
      logo: {
        width: compact ? 44 : 52,
        height: compact ? 44 : 52,
        borderRadius: 18,
        background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontWeight: 900,
        fontSize: compact ? 18 : 20,
        flex: "0 0 auto",
      },
      titleBlock: { minWidth: 0 },
      label: {
        fontSize: compact ? 11 : 12,
        letterSpacing: 1.3,
        opacity: 0.6,
        fontWeight: 800,
        textTransform: "uppercase",
        marginBottom: 2,
      },
      storeTitle: {
        fontSize: compact ? 18 : 20,
        fontWeight: 900,
        lineHeight: 1.15,
        maxWidth: 420,
        whiteSpace: "normal",
      },
      storeInput: {
        width: "min(380px, 100%)",
        maxWidth: 380,
        fontSize: compact ? 16 : 20,
        fontWeight: 950,
        border: "1px solid rgba(0,0,0,.10)",
        borderRadius: 16,
        padding: compact ? "8px 10px" : "10px 12px",
        outline: "none",
      },
      subTitle: { fontSize: compact ? 12 : 13, opacity: 0.7, fontWeight: 700, marginTop: 2 },

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
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 999,
        fontWeight: 800,
        color: "#1c4ed8",
        boxShadow: "0 8px 18px rgba(16,24,40,.06)",
        cursor: "pointer",
        display: "inline-flex",
        gap: 6,
        alignItems: "center",
        fontSize: compact ? 13 : 14,
      },
      btnPrimary: {
        background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
        color: "white",
        border: "none",
      },

      tabsWrap: {
        marginTop: compact ? 10 : 12,
        background: "linear-gradient(135deg,#4f7cff,#6a5cff)",
        borderRadius: 18,
        padding: compact ? 6 : 8,
        overflowX: "auto",
      },
      tabsRow: { display: "flex", gap: 8, minWidth: 520 },
      chip: (active) => ({
        border: "none",
        borderRadius: 16,
        padding: compact ? "8px 10px" : "10px 12px",
        fontWeight: 900,
        background: active ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.18)",
        color: active ? "#0b1220" : "rgba(255,255,255,.92)",
        minWidth: 86,
        cursor: "pointer",
        textAlign: "left",
      }),
      chipTop: { fontSize: compact ? 13 : 14, fontWeight: 900 },
      chipSub: { fontSize: compact ? 11 : 12, opacity: 0.85, fontWeight: 800 },

      sectionCard: {
        marginTop: compact ? 10 : 14,
        background: "rgba(255,255,255,.92)",
        border: "1px solid rgba(16,24,40,.08)",
        borderRadius: 22,
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(16,24,40,.08)",
      },
      sectionHeader: {
        padding: compact ? "12px 14px" : "14px 16px",
        color: "white",
        fontWeight: 950,
        fontSize: compact ? 18 : 20,
        background: "linear-gradient(135deg,#4f7cff,#32d2aa)",
      },

      tableWrap: { padding: compact ? 10 : 12, overflowX: "auto" },
      table: { width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 640 },
      th: { textAlign: "left", fontSize: 13, opacity: 0.7, fontWeight: 900, padding: "0 10px 6px 10px" },
      trRow: { background: "rgba(250,252,255,.9)", border: "1px solid rgba(0,0,0,.06)" },
      td: { padding: compact ? 8 : 10, verticalAlign: "middle" },

      nameInput: {
        width: 180,
        maxWidth: "180px",
        padding: compact ? "10px 12px" : "12px 14px",
        borderRadius: 18,
        border: "1px solid rgba(0,0,0,.10)",
        fontWeight: 900,
        fontSize: 16,
        outline: "none",
        background: "white",
      },
      select: {
        width: 150,
        padding: compact ? "8px 10px" : "10px 12px",
        borderRadius: 999,
        border: "1px solid rgba(0,0,0,.10)",
        fontWeight: 900,
        color: "#1c4ed8",
        background: "white",
        outline: "none",
      },
      pill: {
        display: "inline-block",
        padding: compact ? "8px 12px" : "10px 14px",
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

      addBarWrap: { padding: compact ? 10 : 12, paddingTop: 0 },
      addBarInner: { width: "min(560px, 100%)", margin: "0 auto" },
      addBar: {
        width: "100%",
        padding: compact ? "10px 12px" : "12px 14px",
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
        marginTop: compact ? 10 : 14,
        background: "rgba(255,255,255,.92)",
        border: "1px solid rgba(16,24,40,.08)",
        borderRadius: 22,
        overflow: "hidden",
        boxShadow: "0 18px 40px rgba(16,24,40,.08)",
      },
      totalsHeader: {
        padding: compact ? "12px 14px" : "14px 16px",
        fontWeight: 950,
        fontSize: compact ? 16 : 18,
        color: "#0b1220",
        background: "rgba(79,124,255,.10)",
      },
      totalsItem: {
        padding: compact ? "10px 14px" : "12px 16px",
        display: "flex",
        justifyContent: "space-between",
        fontWeight: 900,
        borderTop: "1px solid rgba(16,24,40,.06)",
      },
      weekTotal: {
        padding: compact ? "12px 14px" : "14px 16px",
        display: "flex",
        justifyContent: "space-between",
        fontWeight: 950,
        fontSize: compact ? 16 : 18,
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
    };
  }, [isManager]);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {/* Header */}
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
                    style={styles.storeInput}
                  />
                ) : (
                  <div style={styles.storeTitle}>{storeName}</div>
                )}

                <div style={styles.subTitle}>{formatWeekLabel(monday)}</div>
              </div>
            </div>

            <div style={styles.controls}>
              {isManager ? (
                <>
                  <button style={styles.btn} onClick={onPrevWeek}>◀ Prev</button>
                  <button style={styles.btn} onClick={onNextWeek}>Next ▶</button>
                  <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={saveNow}>Save</button>
                  <button style={styles.btn} onClick={shareReadOnlyLink}>Share (View Only)</button>
                </>
              ) : null}
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

        {/* Schedule */}
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

        {/* Totals */}
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
            <select
              style={styles.modalSelect}
              value={startMin}
              onChange={(e) => setStartMin(Number(e.target.value))}
            >
              {options.map((m) => (
                <option key={m} value={m}>
                  {minutesToLabel(m)}
                </option>
              ))}
            </select>

            <select
              style={styles.modalSelect}
              value={endMin}
              onChange={(e) => setEndMin(Number(e.target.value))}
            >
              {options
                .filter((m) => m > startMin)
                .map((m) => (
                  <option key={m} value={m}>
                    {minutesToLabel(m)}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ marginTop: 12, fontWeight: 950, fontSize: 16 }}>
            Preview:{" "}
            <span style={{ color: "#1c4ed8" }}>
              {shiftLabelFromMinutes(startMin, endMin)}
            </span>
          </div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.btn} onClick={onClose} type="button">
            Cancel
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnPrimary }}
            onClick={() => onApply(startMin, endMin)}
            type="button"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/** React 17 mount */
ReactDOM.render(<App />, document.getElementById("root"));
