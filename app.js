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

const storageKey = (store,week) => `schedule:${store}:${week}`;
const STORE_NAME_KEY = "schedule:storeName";

const loadLocal = (store,week) => {
  try { return JSON.parse(localStorage.getItem(storageKey(store,week))); }
  catch { return null; }
};

const saveLocal = (store,week,data) =>
  localStorage.setItem(storageKey(store,week), JSON.stringify(data));

const defaultSchedule = (store,week,storeName) => ({
  meta:{storeId:store,storeName,weekMondayISO:week},
  employees:[
    {id:cryptoId(),name:"Employee 1",shifts:makeOffWeek()},
    {id:cryptoId(),name:"Employee 2",shifts:makeOffWeek()},
    {id:cryptoId(),name:"Employee 3",shifts:makeOffWeek()}
  ]
});

/* =========================
   App
========================= */

function App() {
  const url = new URL(window.location.href);
  const storeId = url.searchParams.get("store") || "default";
  const weekParam = url.searchParams.get("week");
  const isManager = url.searchParams.get("manager") === "1";

  const hashData = window.location.hash.slice(1);

  const monday = useMemo(
    () => startOfWeekMonday(weekParam ? parseISODate(weekParam) : new Date()),
    [weekParam]
  );

  const weekISO = toISODate(monday);

  const [storeName, setStoreName] = useState(
    () => localStorage.getItem(STORE_NAME_KEY) || ""
  );

  const [showStorePrompt, setShowStorePrompt] = useState(!storeName);
  const [activeTab, setActiveTab] = useState("all");

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

    const existing = loadLocal(storeId,weekISO);
    return existing || defaultSchedule(storeId,weekISO,storeName || "My Schedule");
  });

  useEffect(() => {
    if (storeName) {
      localStorage.setItem(STORE_NAME_KEY, storeName);
      setSchedule((prev)=>({
        ...prev,
        meta:{...prev.meta, storeName}
      }));
    }
  }, [storeName]);

  /* =========================
     Render
  ========================= */

  return (
    <div className="app">

      {/* STORE NAME PROMPT (one-time) */}
      {showStorePrompt && (
        <div style={{
          position:"fixed",
          inset:0,
          background:"rgba(0,0,0,.4)",
          display:"flex",
          alignItems:"center",
          justifyContent:"center",
          zIndex:9999
        }}>
          <div style={{
            background:"white",
            borderRadius:16,
            padding:24,
            width:"90%",
            maxWidth:360,
            textAlign:"center"
          }}>
            <h2 style={{marginBottom:8}}>What’s your store name?</h2>
            <p style={{opacity:.7, marginBottom:16}}>
              This will appear on your schedule.
            </p>
            <input
              value={storeName}
              onChange={(e)=>setStoreName(e.target.value)}
              placeholder="Enter store or team name"
              style={{
                width:"100%",
                padding:"12px",
                borderRadius:12,
                border:"1px solid #ccc",
                marginBottom:16,
                fontSize:16
              }}
            />
            <button
              onClick={()=>{
                if (!storeName.trim()) return;
                setShowStorePrompt(false);
              }}
              style={{
                width:"100%",
                padding:"12px",
                borderRadius:12,
                border:"none",
                background:"#4f7cff",
                color:"white",
                fontWeight:700,
                fontSize:16
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header>
        <h1>{schedule.meta.storeName}</h1>
        <p>{formatWeekLabel(monday)}</p>
      </header>

      {/* DAY TABS */}
      <nav className="tabs">
        <button onClick={()=>setActiveTab("all")}>All</button>
        {Array.from({length:7},(_,i)=>{
          const d = addDays(monday,i);
          const c = formatDayChip(d);
          return (
            <button key={i} onClick={()=>setActiveTab(String(i))}>
              {c.dow} {c.mon} {c.day}
            </button>
          );
        })}
      </nav>

      {/* TABLE */}
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            {Array.from({length:7},(_,i)=>{
              const d = addDays(monday,i);
              const c = formatDayChip(d);
              return <th key={i}>{c.dow} {c.mon} {c.day}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {schedule.employees.map(emp=>(
            <tr key={emp.id}>
              <td>{emp.name}</td>
              {emp.shifts.map((s,i)=><td key={i}>{s}</td>)}
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
