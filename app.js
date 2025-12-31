const { useState, useEffect } = React;

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
  "Custom…"
];

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function formatDate(d) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function App() {
  const params = new URLSearchParams(window.location.search);
  const storeKey = params.get("store") || "default";
  const isManager = params.get("manager") === "1";

  const todayMonday = getMonday(new Date());
  const [weekStart, setWeekStart] = useState(todayMonday);
  const [storeName, setStoreName] = useState("Murdock Hyundai");
  const [employees, setEmployees] = useState([
    { id: 1, name: "Tyler", shifts: {} },
    { id: 2, name: "Derrick", shifts: {} },
    { id: 3, name: "Jonathan", shifts: {} }
  ]);

  useEffect(() => {
    const saved = localStorage.getItem(`schedule-${storeKey}`);
    if (saved) {
      const parsed = JSON.parse(saved);
      setStoreName(parsed.storeName);
      setEmployees(parsed.employees);
      setWeekStart(new Date(parsed.weekStart));
    }
  }, []);

  function saveSchedule() {
    localStorage.setItem(
      `schedule-${storeKey}`,
      JSON.stringify({ storeName, employees, weekStart })
    );
    alert("Saved");
  }

  function shareLink() {
    saveSchedule();
    const link = `${window.location.origin}?store=${storeKey}&week=${weekStart
      .toISOString()
      .slice(0, 10)}`;
    navigator.clipboard.writeText(link);
    alert("Share link copied");
  }

  function updateShift(empId, day, value) {
    if (value === "Custom…") {
      const custom = prompt("Enter custom shift (e.g. 2PM–8PM)");
      if (!custom) return;
      value = custom;
    }
    setEmployees((prev) =>
      prev.map((e) =>
        e.id === empId
          ? { ...e, shifts: { ...e.shifts, [day]: value } }
          : e
      )
    );
  }

  function addEmployee() {
    setEmployees((prev) => [
      ...prev,
      { id: Date.now(), name: "", shifts: {} }
    ]);
  }

  function deleteEmployee(id) {
    if (!confirm("Delete employee?")) return;
    setEmployees((prev) => prev.filter((e) => e.id !== id));
  }

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="app">
      {/* HEADER */}
      <div className="header">
        <div className="header-top">
          <div className="store">
            {isManager ? (
              <input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
            ) : (
              <h2>{storeName}</h2>
            )}
            <div className="week">
              Week of {weekStart.toLocaleDateString()}
            </div>
          </div>

          {isManager && (
            <button className="primary" onClick={saveSchedule}>
              Save
            </button>
          )}
        </div>

        {isManager && (
          <div className="actions-scroll">
            <button
              onClick={() =>
                setWeekStart(
                  new Date(weekStart.setDate(weekStart.getDate() - 7))
                )
              }
            >
              ◀ Prev
            </button>
            <button
              onClick={() =>
                setWeekStart(
                  new Date(weekStart.setDate(weekStart.getDate() + 7))
                )
              }
            >
              Next ▶
            </button>
            <button onClick={shareLink}>Share Link</button>
          </div>
        )}
      </div>

      {/* SCHEDULE */}
      <div className="card">
        <h3>Full Week</h3>
        {employees.map((emp) => (
          <div className="row" key={emp.id}>
            <input
              className="name"
              value={emp.name}
              onChange={(e) =>
                setEmployees((prev) =>
                  prev.map((p) =>
                    p.id === emp.id ? { ...p, name: e.target.value } : p
                  )
                )
              }
              disabled={!isManager}
            />

            {days.map((d) => (
              <select
                key={d}
                value={emp.shifts[d] || "Off"}
                disabled={!isManager}
                onChange={(e) =>
                  updateShift(emp.id, d.toDateString(), e.target.value)
                }
              >
                {COMMON_SHIFTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ))}

            {isManager && (
              <button className="trash" onClick={() => deleteEmployee(emp.id)}>
                🗑
              </button>
            )}
          </div>
        ))}

        {isManager && (
          <div className="add-row" onClick={addEmployee}>
            ＋ Add employee
          </div>
        )}
      </div>

      <style>{`
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont;
          background: #eef5fb;
        }
        .app {
          padding: 16px;
        }
        .header {
          background: white;
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .header-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .store input {
          font-size: 20px;
          font-weight: 700;
          border: none;
          outline: none;
        }
        .primary {
          background: linear-gradient(135deg,#5b8cff,#2dd4bf);
          color: white;
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
        }
        .actions-scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          margin-top: 12px;
        }
        .actions-scroll button {
          white-space: nowrap;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid #ddd;
          background: white;
        }
        .card {
          background: white;
          border-radius: 16px;
          padding: 16px;
        }
        .row {
          display: flex;
          gap: 6px;
          align-items: center;
          margin-bottom: 8px;
        }
        .name {
          width: 120px;
        }
        select {
          flex: 1;
          padding: 6px;
        }
        .trash {
          border: none;
          background: none;
          font-size: 18px;
        }
        .add-row {
          margin-top: 12px;
          text-align: center;
          padding: 12px;
          border-radius: 12px;
          background: #f1f5f9;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
