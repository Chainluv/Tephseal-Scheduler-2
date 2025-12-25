// app.js — Tephseal Scheduler (clean manager editor: common dropdown + Custom button)
// Manager: /edit.html (editable, Save/Share)
// Viewer:  / (read-only)
// Default week: current week (Monday of today) unless ?week=YYYY-MM-DD
//
// Vercel env vars (Production):
//   ADMIN_PASS, GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO

const MODE = window.__MODE__ || "view";

// ---------- date helpers ----------
const pad = (n) => (n < 10 ? "0" : "") + n;
function fromISO(iso) { const [y,m,d]=iso.split("-").map(Number); return new Date(y, m-1, d); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function startOfWeekLocal(d){
  const dt=new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow=(dt.getDay()+6)%7; // Mon=0..Sun=6
  dt.setDate(dt.getDate()-dow); dt.setHours(0,0,0,0); return dt;
}
function normalizeWeekISO(iso){ return toISO(startOfWeekLocal(fromISO(iso))); }
function isISODate(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s||""); }
function fmtDay(weekISO, off){
  const b=fromISO(weekISO);
  const dt=new Date(b.getFullYear(), b.getMonth(), b.getDate()+off);
  return dt.toLocaleDateString(undefined,{month:"short", day:"numeric"});
}
function currentWeekISO(){ return toISO(startOfWeekLocal(new Date())); }

// ---------- constants ----------
const days = [
  { key:"mon", label:"Mon", off:0 },
  { key:"tue", label:"Tue", off:1 },
  { key:"wed", label:"Wed", off:2 },
  { key:"thu", label:"Thu", off:3 },
  { key:"fri", label:"Fri", off:4 },
  { key:"sat", label:"Sat", off:5 },
  { key:"sun", label:"Sun", off:6 },
];
const ALL_KEY = "all";
const safeName = (s)=> (s||"").replace(/\s\d{4,6}$/,"");

// ---------- shift helpers ----------
const STEP = 0.5;      // 30 min
const EARLIEST = 8;    // 8AM
const LATEST = 20;     // 8PM

function timeLabelFromFloat(h){
  const m = Math.round(h*60);
  const H = (m/60)|0;
  const mm = m%60;
  const ap = H<12 ? "AM" : "PM";
  const hh = H%12 || 12;
  return `${hh}${mm?":30":""}${ap}`;
}
function parseHours(label){
  if(!label || label==="Off") return 0;
  const [a,b]=label.split("–");
  const P=t=>{
    const m=t.match(/^(\d{1,2})(?::(30))?(AM|PM)$/);
    if(!m) return 0;
    let h=+m[1], half=m[2]?0.5:0, ap=m[3];
    if(ap==="AM" && h===12) h=0;
    if(ap==="PM" && h!==12) h+=12;
    return h+half;
  };
  let len=P(b)-P(a); if(len<0) len+=24; return len;
}
function buildTimeList(startInclusive, endInclusive){
  const out=[];
  for(let t=startInclusive; t<=endInclusive; t+=STEP) out.push(t);
  return out;
}
const START_TIMES = buildTimeList(EARLIEST, LATEST-STEP);
function endTimesForStart(start){ return buildTimeList(start+STEP, LATEST); }
function shiftLabel(start,end){ return `${timeLabelFromFloat(start)}–${timeLabelFromFloat(end)}`; }

// Commonly used shifts (shown in the compact dropdown)
// ✅ Added 4PM–8PM
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

// ---------- data loading (carry forward) ----------
async function fetchWeekJSON(weekISO){
  const res = await fetch(`./data/${weekISO}.json`, { cache:"no-store" });
  if(!res.ok) throw new Error("missing");
  return await res.json();
}
async function loadWeekData(weekISO, prevDataForFallback){
  try{
    return await fetchWeekJSON(weekISO);
  }catch{
    if(prevDataForFallback) return { ...prevDataForFallback, weekStart: weekISO };
    return {
      dealer:"Murdock Hyundai Murray (890090)",
      weekStart:weekISO,
      employees:[
        { id:"e1", name:"Kody O Edwards 49416" },
        { id:"e2", name:"Derrick W. Gore 48873" },
        { id:"e3", name:"Brandon Moye 45138" },
        { id:"e4", name:"Steven B Ridenour 49788" },
      ],
      schedule:{},
    };
  }
}

// ---------- Compact editor: Common dropdown + Custom modal ----------
function ShiftCompactEditor({ value, onChange }){
  const [open, setOpen] = React.useState(false);

  const initial = React.useMemo(()=>{
    if(value && value !== "Off" && value.includes("–")){
      const [a,b] = value.split("–");
      const toFloat = (t)=>{
        const m=t.match(/^(\d{1,2})(?::(30))?(AM|PM)$/);
        if(!m) return 14;
        let h=+m[1], half=m[2]?0.5:0, ap=m[3];
        if(ap==="AM" && h===12) h=0;
        if(ap==="PM" && h!==12) h+=12;
        return h+half;
      };
      return { start: toFloat(a), end: toFloat(b) };
    }
    return { start: 14, end: 20 }; // 2PM–8PM
  }, [value]);

  const [start, setStart] = React.useState(initial.start);
  const [end, setEnd] = React.useState(initial.end);

  React.useEffect(()=>{
    const validEnds = endTimesForStart(start);
    if(!validEnds.includes(end)) setEnd(validEnds[0]);
  }, [start]);

  const current = value || "Off";
  const isCommon = COMMON_SHIFTS.includes(current);

  return (
    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
      <select
        value={isCommon ? current : "Off"}
        onChange={(e)=> onChange(e.target.value)}
        style={{
          padding:"8px 10px",
          borderRadius:14,
          border:"1px solid rgba(226,232,240,.95)",
          background:"rgba(255,255,255,.85)",
          fontWeight:900,
          maxWidth:160,
          width:"100%",
        }}
      >
        {COMMON_SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>

      <button
        type="button"
        onClick={()=> setOpen(true)}
        style={{
          padding:"8px 10px",
          borderRadius:14,
          border:"1px solid rgba(226,232,240,.95)",
          background:"linear-gradient(135deg,#4f46e5,#06b6d4)",
          color:"#fff",
          fontWeight:900,
          cursor:"pointer",
          whiteSpace:"nowrap"
        }}
      >
        Custom…
      </button>

      {!isCommon && current !== "Off" && (
        <div style={{fontSize:12,color:"#475569",fontWeight:900}}>
          Current: {current}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position:"fixed",
            inset:0,
            background:"rgba(2,6,23,.55)",
            display:"grid",
            placeItems:"center",
            padding:16,
            zIndex:9999,
          }}
          onClick={()=> setOpen(false)}
        >
          <div
            style={{
              width:"min(520px, 94vw)",
              background:"#fff",
              borderRadius:18,
              border:"1px solid #e5e7eb",
              boxShadow:"0 20px 60px rgba(0,0,0,.25)",
              padding:16,
            }}
            onClick={(e)=> e.stopPropagation()}
          >
            <div style={{fontWeight:950,fontSize:16,marginBottom:10}}>Custom Shift</div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <div style={{fontSize:12,color:"#64748b",fontWeight:900,marginBottom:6}}>Start</div>
                <select
                  value={start}
                  onChange={(e)=> setStart(Number(e.target.value))}
                  style={{width:"100%",padding:"10px 12px",borderRadius:14,border:"1px solid #e5e7eb",fontWeight:900}}
                >
                  {START_TIMES.map(t => <option key={t} value={t}>{timeLabelFromFloat(t)}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:12,color:"#64748b",fontWeight:900,marginBottom:6}}>End</div>
                <select
                  value={end}
                  onChange={(e)=> setEnd(Number(e.target.value))}
                  style={{width:"100%",padding:"10px 12px",borderRadius:14,border:"1px solid #e5e7eb",fontWeight:900}}
                >
                  {endTimesForStart(start).map(t => <option key={t} value={t}>{timeLabelFromFloat(t)}</option>)}
                </select>
              </div>
            </div>

            <div style={{marginTop:12,fontSize:13,color:"#334155",fontWeight:900}}>
              Preview: {shiftLabel(start,end)}
            </div>

            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:14}}>
              <button
                type="button"
                onClick={()=> setOpen(false)}
                style={{padding:"10px 12px",borderRadius:14,border:"1px solid #e5e7eb",background:"#fff",fontWeight:900,cursor:"pointer"}}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={()=>{
                  onChange(shiftLabel(start,end));
                  setOpen(false);
                }}
                style={{padding:"10px 12px",borderRadius:14,border:0,background:"#4f46e5",color:"#fff",fontWeight:950,cursor:"pointer"}}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- App ----------
function App(){
  const qp = new URL(location.href).searchParams.get("week");
  const initialWeekISO = normalizeWeekISO(isISODate(qp) ? qp : currentWeekISO());

  const [weekISO, setWeekISO] = React.useState(initialWeekISO);
  const [data, setData] = React.useState(null);
  const latestDataRef = React.useRef(null);
  React.useEffect(()=>{ latestDataRef.current = data; }, [data]);

  const [serverPass, setServerPass] = React.useState(null);
  const [isAuthed, setIsAuthed] = React.useState(MODE==="view");
  const [pwd, setPwd] = React.useState("");
  const [active, setActive] = React.useState(ALL_KEY);
  const [saving, setSaving] = React.useState(false);

  // prevent horizontal break when zooming
  React.useEffect(()=>{
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflowX;
    const prevBody = body.style.overflowX;
    html.style.overflowX = "hidden";
    body.style.overflowX = "hidden";
    return ()=>{
      html.style.overflowX = prevHtml;
      body.style.overflowX = prevBody;
    };
  }, []);

  React.useEffect(()=>{
    (async ()=>{
      const d = await loadWeekData(weekISO, latestDataRef.current);
      setData(d);
      const url = new URL(location.href);
      url.searchParams.set("week", weekISO);
      history.replaceState(null, "", url.toString());
    })();
  }, [weekISO]);

  React.useEffect(()=>{
    if(MODE==="edit"){
      fetch("/api/admin-pass").then(r=>r.json())
        .then(({pass})=> setServerPass(pass || "admin123"))
        .catch(()=> setServerPass("admin123"));
    }
  }, []);

  const canEdit = MODE==="edit" && isAuthed;

  if(MODE==="edit" && !isAuthed){
    return (
      <div style={{display:"grid",placeItems:"center",height:"100vh",background:"linear-gradient(#f8fbff,#eef2ff)"}}>
        <div style={{border:"1px solid #e5e7eb",borderRadius:18,padding:24,width:340,background:"#fff",boxShadow:"0 10px 30px rgba(2,6,23,.08)"}}>
          <div style={{fontWeight:950,marginBottom:8}}>Manager Access</div>
          <input
            type="password"
            placeholder="Enter password"
            value={pwd}
            onChange={e=>setPwd(e.target.value)}
            style={{padding:"10px 12px",border:"1px solid #e5e7eb",borderRadius:14,width:"100%",fontWeight:800}}
          />
          <button
            style={{marginTop:12,width:"100%",padding:"10px 12px",borderRadius:14,border:0,background:"#4f46e5",color:"#fff",fontWeight:950,cursor:"pointer"}}
            onClick={()=>setIsAuthed(!!serverPass && pwd===serverPass)}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if(!data) return <div style={{padding:16}}>Loading…</div>;

  const { dealer, employees=[], schedule={} } = data;
  const weekDate = fromISO(weekISO);

  const totalsByEmp = Object.fromEntries(
    employees.map(e=> [e.id, days.reduce((s,d)=> s + parseHours(schedule[e.id]?.[d.key]), 0)])
  );
  const weekTotal = Object.values(totalsByEmp).reduce((a,b)=>a+b,0);

  const setShift = (empId, dayKey, val)=>{
    setData(p=> ({...p, schedule:{...p.schedule, [empId]:{...(p.schedule[empId]||{}), [dayKey]:val}}}));
  };
  const setEmployeeName = (empId, newName)=>{
    setData(p=> ({...p, employees: p.employees.map(e=> e.id===empId? {...e, name:newName} : e)}));
  };

  // ✅ Add Employee (manager only)
  const addEmployee = ()=>{
    setData(p=>{
      const used = new Set((p.employees||[]).map(e=>e.id));
      let n = (p.employees||[]).length + 1;
      let id = `e${n}`;
      while(used.has(id)){ n++; id = `e${n}`; }
      const newEmp = { id, name: "New Employee" };
      return { ...p, employees: [...(p.employees||[]), newEmp] };
    });
  };

  const navWeek = (delta)=>{
    const d = fromISO(weekISO);
    d.setDate(d.getDate() + delta*7);
    setWeekISO(normalizeWeekISO(toISO(d)));
  };

  async function saveCurrent(targetWeek){
    setSaving(true);
    try{
      const effective = targetWeek || weekISO;
      const payload = { weekISO: effective, data: { ...data, weekStart: effective } };
      const res = await fetch("/api/save", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)
      });
      if(!res.ok){
        const t = await res.text();
        throw new Error(t || "Save failed");
      }
      return true;
    }catch(e){
      alert(
        "Error saving: " + e.message +
        "\n\nIf you see 'Missing repo env', set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO in Vercel → Project → Settings → Environment Variables (Production)."
      );
      return false;
    }finally{ setSaving(false); }
  }

  async function shareLinkForWeek(effectiveISO){
    const ok = await saveCurrent(effectiveISO);
    if(!ok) return;
    const url = `${location.origin}/?week=${effectiveISO || weekISO}`;
    try{
      if(navigator.share){ await navigator.share({title:"Tephseal Schedule", url}); return; }
    }catch{}
    try{
      if(navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(url);
        alert("Link copied:\n" + url);
        return;
      }
    }catch{}
    window.open(url,"_blank");
  }

  // ---------- UI ----------
  const TopBar = (
    <div style={{background:"rgba(255,255,255,.85)",backdropFilter:"blur(10px)",borderBottom:"1px solid rgba(226,232,240,.9)"}}>
      <div style={{maxWidth:960,margin:"0 auto",padding:14}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start",maxWidth:"100%"}}>
          <div style={{width:44,height:44,borderRadius:16,background:"linear-gradient(135deg,#4f46e5,#06b6d4)",display:"grid",placeItems:"center",color:"#fff",fontWeight:950}}>
            S
          </div>

          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,color:"#64748b",textTransform:"uppercase",letterSpacing:1}}>Dealer</div>
            <div style={{fontWeight:950,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dealer}</div>
            <div style={{fontSize:12,color:"#64748b"}}>
              Week of {weekDate.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}
            </div>
          </div>

          <div style={{display:"flex",gap:8,flexWrap:"nowrap",overflowX:"auto",WebkitOverflowScrolling:"touch",maxWidth:"56vw",paddingBottom:2}}>
            <button className="btn" onClick={()=>navWeek(-1)}>◀ Prev</button>
            <button className="btn" onClick={()=>navWeek(+1)}>Next ▶</button>
            {canEdit && (
              <>
                <button className="btn" onClick={()=>saveCurrent()} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button className="btn" onClick={()=>shareLinkForWeek(weekISO)}>Share Link</button>
                <button className="btn" onClick={addEmployee}>+ Add Employee</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const Tabs = (
    <div style={{maxWidth:960,margin:"0 auto",padding:"12px 14px"}}>
      <div style={{display:"flex",gap:10,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:4}}>
        <div
          onClick={()=>setActive(ALL_KEY)}
          style={{
            minWidth:76,
            cursor:"pointer",
            borderRadius:18,
            padding:"10px 12px",
            fontWeight:950,
            border:"1px solid rgba(148,163,184,.35)",
            background: active===ALL_KEY ? "linear-gradient(135deg,#4f46e5,#06b6d4)" : "rgba(255,255,255,.7)",
            color: active===ALL_KEY ? "#fff" : "#0f172a",
          }}
        >
          <div>All</div><div style={{opacity:.85,fontSize:10}}>Week</div>
        </div>

        {days.map(d=>(
          <div
            key={d.key}
            onClick={()=>setActive(d.key)}
            style={{
              minWidth:86,
              cursor:"pointer",
              borderRadius:18,
              padding:"10px 12px",
              fontWeight:950,
              border:"1px solid rgba(148,163,184,.35)",
              background: active===d.key ? "linear-gradient(135deg,#4f46e5,#06b6d4)" : "rgba(255,255,255,.7)",
              color: active===d.key ? "#fff" : "#0f172a",
            }}
          >
            <div>{d.label}</div>
            <div style={{opacity:.85,fontSize:10}}>{fmtDay(weekISO,d.off)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  const containerStyle = {maxWidth:960,margin:"0 auto",padding:"0 14px",overflowX:"hidden"};
  const cardStyle = {background:"rgba(255,255,255,.9)",border:"1px solid rgba(226,232,240,.9)",borderRadius:22,boxShadow:"0 10px 30px rgba(2,6,23,.08)"};
  const headStyle = {padding:14,fontWeight:950,borderBottom:"1px solid rgba(226,232,240,.9)",background:"linear-gradient(135deg,#4f46e5,#06b6d4)",color:"#fff",borderTopLeftRadius:22,borderTopRightRadius:22};

  return (
    <div style={{maxWidth:"100vw",minHeight:"100vh",background:"linear-gradient(#f8fbff,#eef2ff)"}}>
      <style>{`
        * { box-sizing: border-box; }
        .btn{
          border:1px solid rgba(148,163,184,.35);
          background:rgba(255,255,255,.8);
          padding:8px 10px;
          border-radius:14px;
          font-weight:950;
          cursor:pointer;
          white-space:nowrap;
        }
        table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        th, td { border-bottom:1px solid rgba(226,232,240,.9); padding:10px; vertical-align: top; overflow:hidden; }
        th { text-align:left; font-size:13px; color:#0f172a; background:rgba(248,250,252,.8); position: sticky; top: 0; }
        .empInput { width:100%; max-width: 220px; }
        @media (max-width: 520px){
          .empInput { max-width: 160px; }
        }
      `}</style>

      {TopBar}
      {Tabs}

      <div style={containerStyle}>
        {active===ALL_KEY ? (
          <div style={{...cardStyle, marginTop:14}}>
            <div style={headStyle}>Full Week</div>

            <div style={{overflowX:"auto",maxWidth:"100%"}}>
              <table style={{minWidth:760}}>
                <thead>
                  <tr>
                    <th style={{width:170}}>Employee</th>
                    {days.map(d=>(
                      <th key={d.key} style={{width:170}}>
                        {d.label} <span style={{color:"#94a3b8",fontSize:12}}>{fmtDay(weekISO,d.off)}</span>
                      </th>
                    ))}
                    <th style={{textAlign:"right",width:70}}>Total</th>
                  </tr>
                </thead>

                <tbody>
                  {employees.map((e,idx)=>(
                    <tr key={e.id} style={{background: idx%2 ? "rgba(248,250,252,.8)" : "rgba(255,255,255,.7)"}}>
                      <td style={{fontWeight:900}}>
                        {canEdit ? (
                          <input
                            className="empInput"
                            value={e.name}
                            onChange={ev=>setEmployeeName(e.id, ev.target.value)}
                            style={{padding:"10px 12px",border:"1px solid rgba(226,232,240,.9)",borderRadius:14,fontWeight:900}}
                          />
                        ) : safeName(e.name)}
                      </td>

                      {days.map(d=>(
                        <td key={d.key}>
                          {canEdit ? (
                            <ShiftCompactEditor
                              value={schedule[e.id]?.[d.key] || "Off"}
                              onChange={(val)=> setShift(e.id, d.key, val)}
                            />
                          ) : (
                            <div style={{fontWeight:950}}>{schedule[e.id]?.[d.key] || "Off"}</div>
                          )}
                        </td>
                      ))}

                      <td style={{textAlign:"right",fontWeight:950,fontSize:16}}>{totalsByEmp[e.id]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div style={{display:"grid",gap:12,marginTop:14}}>
            {employees.map(e=>(
              <div key={e.id} style={cardStyle}>
                <div style={headStyle}>
                  {canEdit ? (
                    <input
                      value={e.name}
                      onChange={ev=>setEmployeeName(e.id, ev.target.value)}
                      style={{width:"100%",padding:"10px 12px",border:"1px solid rgba(226,232,240,.9)",borderRadius:14,fontWeight:950}}
                    />
                  ) : safeName(e.name)}
                </div>

                <div style={{display:"flex",justifyContent:"space-between",gap:12,padding:14}}>
                  <div style={{flex:1}}>
                    <div style={{color:"#64748b",fontSize:13,fontWeight:900}}>Shift</div>
                    {canEdit ? (
                      <ShiftCompactEditor
                        value={schedule[e.id]?.[active] || "Off"}
                        onChange={(val)=> setShift(e.id, active, val)}
                      />
                    ) : (
                      <div style={{fontSize:18,fontWeight:950}}>{schedule[e.id]?.[active] || "Off"}</div>
                    )}
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:"#64748b",fontSize:12,fontWeight:900}}>Paid Hours</div>
                    <div style={{fontSize:22,fontWeight:950}}>{parseHours(schedule[e.id]?.[active])}</div>
                  </div>
                </div>
              </div>
            ))}

            <div style={{textAlign:"right",color:"#475569",fontSize:14,fontWeight:900,paddingBottom:10}}>
              Day total:{" "}
              <span style={{fontWeight:950}}>
                {employees.reduce((acc,e)=> acc + parseHours(schedule[e.id]?.[active]), 0)}
              </span>
            </div>
          </div>
        )}

        <div style={{...cardStyle, margin:"14px 0 44px"}}>
          <div style={{padding:14,fontWeight:950}}>Weekly Totals</div>
          <div style={{padding:"0 14px 14px"}}>
            {employees.map(e=>(
              <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:12,border:"1px solid rgba(224,231,255,.9)",borderRadius:16,marginBottom:10,background:"rgba(255,255,255,.7)"}}>
                <div style={{marginRight:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:900}}>{safeName(e.name)}</div>
                <div style={{fontWeight:950}}>{totalsByEmp[e.id]}</div>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:12,borderRadius:16,background:"rgba(224,231,255,.9)",fontWeight:950}}>
              <div>Week Total</div><div>{weekTotal}</div>
            </div>
          </div>
        </div>

        <div style={{height:20}} />
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
