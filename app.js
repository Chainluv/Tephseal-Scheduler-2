// app.js — Tephseal Scheduler (no-build React)
// Fixes:
// - Prev/Next doesn't reload page (keeps you logged in)
// - Weeks without JSON copy the previous week's schedule automatically
// - Share auto-saves, then copies/opens the read-only viewer link
// - Default week = Monday 2025-10-13
//
// IMPORTANT: In Vercel set env vars (Production):
//   ADMIN_PASS, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO

const MODE = window.__MODE__ || "view";
const DEFAULT_WEEK_ISO = "2025-10-13"; // Monday

// ---------- date helpers (local, no TZ shift) ----------
const pad = (n) => (n < 10 ? "0" : "") + n;
function fromISO(iso) { const [y,m,d] = iso.split("-").map(Number); return new Date(y, m-1, d); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function startOfWeekLocal(d) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (dt.getDay()+6)%7; // Mon=0..Sun=6
  dt.setDate(dt.getDate()-dow);
  dt.setHours(0,0,0,0);
  return dt;
}
function normalizeWeekISO(iso) { return toISO(startOfWeekLocal(fromISO(iso))); }
function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s||""); }
function fmtDay(weekISO, off){
  const b = fromISO(weekISO);
  const dt = new Date(b.getFullYear(), b.getMonth(), b.getDate()+off);
  return dt.toLocaleDateString(undefined,{month:"short", day:"numeric"});
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
function parseHours(label){
  if(!label || label==="Off") return 0;
  const [a,b] = label.split("–");
  const P = t=>{
    const m=t.match(/^(\d{1,2})(?::(30))?(AM|PM)$/);
    let h=+m[1], half=m[2]?0.5:0, ap=m[3];
    if(ap==="AM" && h===12) h=0;
    if(ap==="PM" && h!==12) h+=12;
    return h+half;
  };
  let len = P(b)-P(a); if(len<0) len+=24; return len;
}
function generateShiftOptions(){
  const opts=["Off"], step=0.5;
  const toLabel=h=>{
    const m=Math.round(h*60), H=(m/60)|0, mm=m%60, ap=H<12?"AM":"PM", hh=H%12||12;
    return `${hh}${mm?":30":""}${ap}`;
  };
  for(let s=8;s<=14;s+=step){
    for(let L=6;L<=12;L+=step){
      const e=s+L; if(e>20) continue;
      if(L===12 && !(Math.abs(s-8)<1e-6 && Math.abs(e-20)<1e-6)) continue; // only 8–8
      const label=`${toLabel(s)}–${toLabel(e)}`;
      if(!opts.includes(label)) opts.push(label);
    }
  }
  return opts;
}
const SHIFT_OPTIONS = generateShiftOptions();
const safeName = (s) => (s||"").replace(/\s\d{4,6}$/,"");

// ---------- data load with carry-forward ----------
async function fetchWeekJSON(weekISO){
  const res = await fetch(`./data/${weekISO}.json`, { cache:"no-store" });
  if(!res.ok) throw new Error("missing");
  return await res.json();
}
async function loadWeekData(weekISO, prevDataForFallback){
  try{
    return await fetchWeekJSON(weekISO);
  }catch{
    if(prevDataForFallback){
      // carry forward employees + schedule, update weekStart
      return {
        ...prevDataForFallback,
        weekStart: weekISO,
        // schedule copied as-is; edit as needed then Save
      };
    }
    // seed if nothing to copy from
    return {
      dealer: "Murdock Hyundai Murray (890090)",
      weekStart: weekISO,
      employees: [
        { id: "e1", name: "Kody O Edwards 49416" },
        { id: "e2", name: "Derrick W. Gore 48873" },
        { id: "e3", name: "Brandon Moye 45138" },
        { id: "e4", name: "Steven B Ridenour 49788" },
      ],
      schedule: {},
    };
  }
}

// ---------- App ----------
function App(){
  // initial week from URL or default; normalize to Monday
  const qp = new URL(location.href).searchParams.get("week");
  const initialWeekISO = normalizeWeekISO(isISODate(qp) ? qp : DEFAULT_WEEK_ISO);

  const [weekISO, setWeekISO] = React.useState(initialWeekISO);
  const [data, setData] = React.useState(null);
  const latestDataRef = React.useRef(null); // for carry-forward
  React.useEffect(()=>{ latestDataRef.current = data; }, [data]);

  // auth
  const [serverPass, setServerPass] = React.useState(null);
  const [isAuthed, setIsAuthed] = React.useState(MODE==="view");
  const [pwd, setPwd] = React.useState("");
  const [active, setActive] = React.useState(ALL_KEY);
  const [saving, setSaving] = React.useState(false);

  // load when week changes (no page reload)
  React.useEffect(()=>{
    (async ()=>{
      const d = await loadWeekData(weekISO, latestDataRef.current);
      setData(d);
      // keep URL in sync without reload
      const url = new URL(location.href);
      url.searchParams.set("week", weekISO);
      history.replaceState(null, "", url.toString());
    })();
  }, [weekISO]);

  // fetch password once
  React.useEffect(()=>{
    if(MODE==="edit"){
      fetch("/api/admin-pass").then(r=>r.json())
        .then(({pass})=> setServerPass(pass || "admin123"))
        .catch(()=> setServerPass("admin123"));
    }
  }, []);

  const canEdit = MODE==="edit" && isAuthed;

  // ---- auth gate ----
  if(MODE==="edit" && !isAuthed){
    return (
      <div style={{display:"grid",placeItems:"center",height:"100vh"}}>
        <div style={{border:"1px solid #e5e7eb",borderRadius:16,padding:24,width:340,background:"#fff"}}>
          <div style={{fontWeight:700,marginBottom:8}}>Manager Access</div>
          <input type="password" placeholder="Enter password" value={pwd}
                 onChange={e=>setPwd(e.target.value)}
                 style={{padding:"8px 10px",border:"1px solid #e5e7eb",borderRadius:10,width:"100%"}}/>
          <button style={{marginTop:12,width:"100%",padding:"10px 12px",borderRadius:12,border:0,background:"#4f46e5",color:"#fff",fontWeight:600}}
                  onClick={()=>setIsAuthed(!!serverPass && pwd===serverPass)}>
            Login
          </button>
        </div>
      </div>
    );
  }

  // ---- computed ----
  if(!data) return <div className="container">Loading…</div>;
  const { dealer, employees = [], schedule = {} } = data;
  const weekDate = fromISO(weekISO);

  const totalsByEmp = Object.fromEntries(
    employees.map(e => [e.id, days.reduce((s,d)=> s + parseHours(schedule[e.id]?.[d.key]), 0)])
  );
  const weekTotal = Object.values(totalsByEmp).reduce((a,b)=>a+b,0);

  // ---- updates ----
  const setShift = (empId, dayKey, val)=>{
    setData(p=> ({...p, schedule:{...p.schedule, [empId]:{...(p.schedule[empId]||{}), [dayKey]: val}}}));
  };
  const setEmployeeName = (empId, newName)=>{
    setData(p=> ({...p, employees: p.employees.map(e=> e.id===empId? {...e, name:newName} : e)}));
  };

  // ---- navigation without reload ----
  const navWeek = (delta)=>{
    const d = fromISO(weekISO);
    d.setDate(d.getDate() + delta*7);
    setWeekISO(normalizeWeekISO(toISO(d)));
    // no reload; state stays, auth stays
  };

  // ---- save & share ----
  async function saveCurrent(targetWeek){
    setSaving(true);
    try{
      const effective = targetWeek || weekISO;
      const payload = { weekISO: effective, data: { ...data, weekStart: effective } };
      const res = await fetch("/api/save", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload)
      });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t || "Save failed");
      }
      return true;
    }catch(e){
      alert("Error saving: " + e.message + "\n\nIf you see 'Missing repo env', set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO in Vercel → Settings → Environment Variables (Production).");
      return false;
    }finally{
      setSaving(false);
    }
  }

  async function shareLinkForWeek(effectiveISO){
    // 1) Save first so employees see the latest data
    const ok = await saveCurrent(effectiveISO);
    if(!ok) return;

    // 2) Build read-only viewer URL
    const url = `${location.origin}/?week=${effectiveISO || weekISO}`;

    // 3) Share / copy / open
    try{
      if(navigator.share){
        await navigator.share({ title:"Tephseal Schedule", url });
        return;
      }
    }catch{} // fall through
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(url);
        alert("Link copied:\n" + url);
        return;
      }
    }catch{} // fall through
    window.open(url, "_blank");
  }

  function downloadJSON(){
    const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download=`${weekISO}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- UI ----------
  const TopBar = (
    <div className="top">
      <div className="container">
        <div className="bar">
          <div className="logo">S</div>
          <div style={{flex:1}}>
            <div style={{fontSize:12,color:"#64748b"}}>Dealer</div>
            <div style={{fontWeight:700}}>{dealer}</div>
            <div style={{fontSize:12,color:"#64748b"}}>
              Week of {weekDate.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}
            </div>
          </div>
          <div className="weeknav">
            <button className="btn" onClick={()=>navWeek(-1)}>◀ Prev</button>
            <button className="btn" onClick={()=>navWeek(+1)}>Next ▶</button>
            {canEdit && (
              <>
                <button className="btn" onClick={()=>saveCurrent()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button className="btn" onClick={()=>shareLinkForWeek(weekISO)}>Share Link</button>
                <button className="btn" onClick={downloadJSON}>Download JSON</button>
                <button className="btn" onClick={()=>window.open(`/?week=${weekISO}`,"_blank")}>Open Viewer</button>
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
        <div className={`tab ${active===ALL_KEY?'active':''}`} onClick={()=>setActive(ALL_KEY)}>
          <div>All</div><div style={{opacity:.8,fontSize:10}}>Week</div>
        </div>
        {days.map(d=>(
          <div key={d.key} className={`tab ${active===d.key?'active':''}`} onClick={()=>setActive(d.key)}>
            <div>{d.label}</div>
            <div style={{opacity:.8,fontSize:10}}>{fmtDay(weekISO, d.off)}</div>
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
        {active===ALL_KEY ? (
          <div className="card" style={{marginTop:16}}>
            <div className="head">Full Week</div>
            <div style={{overflowX:"auto"}}>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    {days.map(d=>(
                      <th key={d.key}>
                        {d.label} <span style={{color:"#94a3b8",fontSize:12}}>{fmtDay(weekISO,d.off)}</span>
                      </th>
                    ))}
                    <th style={{textAlign:"right"}}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e,idx)=>(
                    <tr key={e.id} style={{background: idx%2 ? "#f8fafc" : "#fff"}}>
                      <td style={{fontWeight:600}}>
                        {canEdit ? (
                          <input
                            value={e.name}
                            onChange={ev=>setEmployeeName(e.id, ev.target.value)}
                            style={{width:"100%",padding:"6px 8px",border:"1px solid #e5e7eb",borderRadius:8}}
                          />
                        ) : (
                          safeName(e.name)
                        )}
                      </td>
                      {days.map(d=>(
                        <td key={d.key}>
                          {canEdit ? (
                            <select
                              value={schedule[e.id]?.[d.key] || "Off"}
                              onChange={ev=>setShift(e.id, d.key, ev.target.value)}
                              style={{padding:"6px 8px",border:"1px solid #e5e7eb",borderRadius:8}}
                            >
                              {SHIFT_OPTIONS.map(opt=> <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                          ) : (
                            <span style={{fontWeight:600}}>{schedule[e.id]?.[d.key] || "Off"}</span>
                          )}
                        </td>
                      ))}
                      <td style={{textAlign:"right",fontWeight:800}}>{totalsByEmp[e.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{display:"grid",gap:12,marginTop:16}}>
            {employees.map(e=>(
              <div key={e.id} className="card">
                <div className="head">
                  {canEdit ? (
                    <input
                      value={e.name}
                      onChange={ev=>setEmployeeName(e.id, ev.target.value)}
                      style={{width:"100%",padding:"6px 8px",border:"1px solid #e5e7eb",borderRadius:8}}
                    />
                  ) : (
                    safeName(e.name)
                  )}
                </div>
                <div className="row">
                  <div>
                    <div style={{color:"#64748b",fontSize:13}}>Shift</div>
                    {canEdit ? (
                      <select
                        value={schedule[e.id]?.[active] || "Off"}
                        onChange={ev=>setShift(e.id, active, ev.target.value)}
                        style={{padding:"6px 8px",border:"1px solid #e5e7eb",borderRadius:8}}
                      >
                        {SHIFT_OPTIONS.map(opt=> <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : (
                      <div style={{fontSize:18,fontWeight:700}}>{schedule[e.id]?.[active] || "Off"}</div>
                    )}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:"#64748b",fontSize:12}}>Paid Hours</div>
                    <div style={{fontSize:20,fontWeight:800}}>{parseHours(schedule[e.id]?.[active])}</div>
                  </div>
                </div>
              </div>
            ))}
            <div style={{textAlign:"right",color:"#475569",fontSize:14,paddingBottom:24}}>
              Day total: <span style={{fontWeight:700}}>
                {employees.reduce((acc,e)=> acc + parseHours(schedule[e.id]?.[active]), 0)}
              </span>
            </div>
          </div>
        )}

        <div className="card" style={{padding:16,margin:"16px 0 48px"}}>
          <div style={{fontWeight:700,marginBottom:8}}>Weekly Totals</div>
          {employees.map(e=>(
            <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:12,border:"1px solid #eef2ff",borderRadius:12,marginBottom:8,background:"#fff"}}>
              <div style={{marginRight:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{safeName(e.name)}</div>
              <div style={{fontWeight:800}}>{totalsByEmp[e.id]}</div>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",padding:12,borderRadius:12,background:"#eef2ff",fontWeight:800}}>
            <div>Week Total</div><div>{weekTotal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
