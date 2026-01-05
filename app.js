/* global React, ReactDOM */

const { useEffect, useMemo, useRef, useState } = React;

/* =========================
   Utilities
========================= */

const pad2 = (n) => String(n).padStart(2, "0");
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const parseISODate = (s) => {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
};

const startOfWeekMonday = (date) => {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const addWeeks = (d,n) => addDays(d, n*7);

const formatWeekLabel = (monday) =>
  `Week of ${monday.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}`;

const formatDayChip = (d) => ({
  dow: d.toLocaleDateString(undefined,{weekday:"short"}),
  mon: d.toLocaleDateString(undefined,{month:"short"}),
  day: d.getDate()
});

const cryptoId = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const makeOffWeek = () => Array(7).fill("Off");

/* =========================
   Snapshot encode/decode
========================= */

const b64e = (s) =>
  btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const b64d = (s) =>
  decodeURIComponent(escape(atob(s.replace(/-/g,"+").replace(/_/g,"/"))));

const buildSnapshot = (schedule, storeId, weekISO) => ({
  v:1,
  storeId,
  weekISO,
  storeName: schedule.meta.storeName,
  employees: schedule.employees.map(e=>({name:e.name,shifts:e.shifts}))
});

/* =========================
   Storage
========================= */

const storageKey = (store,week) => `tephseal:${store}:${week}`;

const loadLocal = (store,week) => {
  try { return JSON.parse(localStorage.getItem(storageKey(store,week))); }
  catch { return null; }
};

const saveLocal = (store,week,data) =>
  localStorage.setItem(storageKey(store,week), JSON.stringify(data));

const defaultSchedule = (store,week) => ({
  meta:{storeId:store,storeName:"Murdock Hyundai",weekMondayISO:week},
  employees:[
    {id:cryptoId(),name:"Tyler",shifts:makeOffWeek()},
    {id:cryptoId(),name:"Derrick",shifts:makeOffWeek()},
    {id:cryptoId(),name:"Jonathan",shifts:makeOffWeek()}
  ]
});

/* =========================
   App
========================= */

function App() {
  const url = new URL(window.location.href);
  const storeId = url.searchParams.get("store") || "murdock-murray";
  const weekParam = url.searchParams.get("week");
  const isManager = url.searchParams.get("manager") === "1";

  const hashData = window.location.hash.slice(1);
  const isSnapshot = Boolean(hashData);

  const monday = useMemo(
    () => startOfWeekMonday(weekParam ? parseISODate(weekParam) : new Date()),
    [weekParam]
  );

  const weekISO = toISODate(monday);

  const [activeTab, setActiveTab] = useState("all");
  const [animateKey, setAnimateKey] = useState(0);

  const [schedule, setSchedule] = useState(() => {
    if (hashData) {
      try {
        const snap = JSON.parse(b64d(hashData));
        return {
          meta:{storeId:snap.storeId,storeName:snap.storeName,weekMondayISO:snap.weekISO},
          employees:snap.employees.map(e=>({id:cryptoId(),...e}))
        };
      } catch {}
    }
    return loadLocal(storeId,weekISO) || defaultSchedule(storeId,weekISO);
  });

  /* =========================
     View-only single-day logic
  ========================= */

  const isSingleDayView = !isManager && activeTab !== "all";
  const singleDayIndex = isSingleDayView ? Number(activeTab) : null;

  const days = useMemo(() =>
    Array.from({length:7},(_,i)=>addDays(monday,i)), [monday]
  );

  /* =========================
     Subtle animation trigger
  ========================= */

  useEffect(() => {
    if (!isManager) {
      setAnimateKey((k) => k + 1);
    }
  }, [activeTab, isManager]);

  /* =========================
     Actions
  ========================= */

  const saveNow = () => {
    if (!isManager) return;
    saveLocal(storeId,weekISO,schedule);
  };

  const shareView = async () => {
    const snap = buildSnapshot(schedule,storeId,weekISO);
    const link =
      `${location.origin}${location.pathname}?store=${storeId}&week=${weekISO}#${b64e(JSON.stringify(snap))}`;
    await navigator.clipboard.writeText(link);
    alert("View-only link copied");
  };

  /* =========================
     Render
  ========================= */

  return (
    <div className="app">

      {/* Inline animation styles (scoped + safe) */}
      <style>{`
        .schedule-animate {
          animation: fadeSlideIn 160ms ease-out;
        }
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>

      {/* HEADER */}
      <header>
        <h1>{schedule.meta.storeName}</h1>
        <p>{formatWeekLabel(monday)}</p>

        {isManager && (
          <div className="controls">
            <button onClick={()=>location.href=`?store=${storeId}&manager=1&week=${toISODate(addWeeks(monday,-1))}`}>Prev</button>
            <button onClick={()=>location.href=`?store=${storeId}&manager=1&week=${toISODate(addWeeks(monday,1))}`}>Next</button>
            <button onClick={saveNow}>Save</button>
            <button onClick={shareView}>Share</button>
          </div>
        )}
      </header>

      {/* DAY TABS */}
      <nav className="tabs">
        <button onClick={()=>setActiveTab("all")}>All</button>
        {days.map((d,i)=>{
          const c = formatDayChip(d);
          return (
            <button key={i} onClick={()=>setActiveTab(String(i))}>
              {c.dow} {c.mon} {c.day}
            </button>
          );
        })}
      </nav>

      {/* TABLE */}
      <div key={animateKey} className={!isManager ? "schedule-animate" : ""}>
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              {days
                .filter((_,i)=>!isSingleDayView || i===singleDayIndex)
                .map((_,i)=>{
                  const idx = isSingleDayView ? singleDayIndex : i;
                  const c = formatDayChip(days[idx]);
                  return <th key={idx}>{c.dow} {c.mon} {c.day}</th>;
                })}
            </tr>
          </thead>

          <tbody>
            {schedule.employees.map(emp=>(
              <tr key={emp.id}>
                <td>{emp.name}</td>

                {days
                  .filter((_,i)=>!isSingleDayView || i===singleDayIndex)
                  .map((_,i)=>{
                    const idx = isSingleDayView ? singleDayIndex : i;
                    return <td key={idx}>{emp.shifts[idx]}</td>;
                  })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
