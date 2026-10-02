import { useEffect, useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/race";

const COLORS = {
  VER: "#60a5fa",
  NOR: "#fb923c",
  LEC: "#f87171",
  HAM: "#a78bfa",
};

const chartOptions = (yTitle) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { labels: { color: "#cbd5e1" } },
  },
  scales: {
    x: {
      title: { display: true, text: "Lap", color: "#94a3b8" },
      ticks: { color: "#94a3b8" },
      grid: { color: "#253047" },
    },
    y: {
      title: { display: true, text: yTitle, color: "#94a3b8" },
      ticks: { color: "#94a3b8" },
      grid: { color: "#253047" },
    },
  },
});

export default function App() {
  const [race, setRace] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [driverA, setDriverA] = useState("VER");
  const [driverB, setDriverB] = useState("NOR");

  useEffect(() => {
    let socket;
    let retry;
    let stopped = false;

    function connect() {
      if (stopped) return;

      socket = new WebSocket(WS);

      socket.onopen = () => setConnected(true);

      socket.onmessage = (event) => {
        setRace(JSON.parse(event.data));
      };

      socket.onerror = () => socket.close();

      socket.onclose = () => {
        if (stopped) return;
        setConnected(false);
        retry = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  async function control(action) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(`${API}/api/${action}`, {
        method: "POST",
      });

      if (!response.ok) throw new Error("Race control failed.");
      setRace(await response.json());
    } catch {
      setError("Could not contact the backend. Check that it is running.");
    } finally {
      setBusy(false);
    }
  }

  const drivers = race?.drivers || [];
  const history = race?.history || [];
  const labels = Array.from({ length: race?.lap || 0 }, (_, i) => i + 1);

  const lapData = {
    labels,
    datasets: drivers.map((driver) => ({
      label: driver.code,
      data: history
        .filter((entry) => entry.driver === driver.code)
        .map((entry) => (entry.pit_stop ? null : entry.lap_time)),
      borderColor: COLORS[driver.code],
      backgroundColor: COLORS[driver.code],
      pointRadius: 2,
      tension: 0.2,
    })),
  };

  const comparison = labels.map((lap) => {
    const a = history.find(
      (entry) => entry.driver === driverA && entry.lap === lap
    );
    const b = history.find(
      (entry) => entry.driver === driverB && entry.lap === lap
    );

    if (
  !a ||
  !b ||
  a.pit_stop ||
  b.pit_stop ||
  a.lap_time === null ||
  b.lap_time === null
) return null;
    return Number((a.lap_time - b.lap_time).toFixed(3));
  });

  const comparisonData = {
    labels,
    datasets: [{
      label: `${driverA} minus ${driverB}`,
      data: comparison,
      borderColor: "#34d399",
      backgroundColor: "#34d399",
      pointRadius: 2,
    }],
  };

  // Fuel correction removes the simulator's known fuel effect.
  const tyreLaps = history.filter(
  (entry) =>
    entry.driver === driverA &&
    !entry.pit_stop &&
    entry.lap_time !== null &&
    entry.tyre_age !== null &&
    entry.stint !== null
);

const stintNumbers = [...new Set(tyreLaps.map((entry) => entry.stint))];

const compoundColors = {
  SOFT: "#f87171",
  MEDIUM: "#facc15",
  HARD: "#e2e8f0",
  INTERMEDIATE: "#4ade80",
  WET: "#60a5fa",
};

const tyreData = {
  datasets: stintNumbers.map((stint) => {
    const laps = tyreLaps
      .filter((entry) => entry.stint === stint)
      .sort((a, b) => a.tyre_age - b.tyre_age);

    const compound = laps[0].compound;
    const color = compoundColors[compound] || "#a78bfa";

    return {
      label: `${compound} · Stint ${stint}`,
      data: laps.map((entry) => ({
        x: entry.tyre_age,
        y: entry.lap_time,
      })),
      borderColor: color,
      backgroundColor: color,
      pointRadius: 3,
    };
  }),
};

  const tyreOptions = chartOptions("Lap time (s)");
  tyreOptions.scales.x = {
    ...tyreOptions.scales.x,
    type: "linear",
    title: { display: true, text: "Tyre age (laps)", color: "#94a3b8" },
    ticks: { color: "#94a3b8", precision: 0 },
  };

  const leaderboard = [...drivers].sort(
  (a, b) =>
    b.completed_laps - a.completed_laps ||
    a.total_time - b.total_time
);

  const leaderTime = leaderboard[0]?.total_time || 0;
  const finished =
  race &&
  race.total_laps > 0 &&
  race.lap >= race.total_laps;

  const unavailable =
  !connected || busy || !race || race.loading || Boolean(race.error);

  return (
    <main className="dashboard">
      <header>
        <div>
          <p className="eyebrow">RACE ANALYTICS / SIMULATED DATA</p>
          <h1>Formula 1 Dashboard</h1>
          <p className="subtitle">
            {race?.event || "FastF1 race replay"}
          </p>
        </div>
        <span className={`status ${connected ? "online" : ""}`}>
          {connected ? "Stream connected" : "Connecting…"}
        </span>
      </header>

      <section className="toolbar">
        <div>
          <strong>Lap {race?.lap || 0} / {race?.total_laps || 30}</strong>
          <span className="race-state">
            {finished ? "Finished" : race?.running ? "Running" : "Paused"}
          </span>
        </div>
        <div className="buttons">
          <button
            disabled={unavailable || finished || race?.running}
            onClick={() => control("start")}
          >
            Start
          </button>
          <button
            className="secondary"
            disabled={unavailable || !race?.running}
            onClick={() => control("pause")}
          >
            Pause
          </button>
          <button
            className="secondary"
            disabled={unavailable}
            onClick={() => control("reset")}
          >
            Reset
          </button>
        </div>
      </section>

      {error && <p role="alert" className="error">{error}</p>}
      {!race && (
        <p className="subtitle">
          Waiting for the Python backend at {API}.
        </p>
      )}

      {race?.loading && (
        <p className="subtitle">
            Downloading {race.event} from FastF1. The first download may take
            a few minutes; subsequent loads use the local cache.
        </p>
      )}

      {race?.error && (
        <p role="alert" className="error">{race.error}</p>
    )}

      <section className="panel">
        <h2>Lap times</h2>
        <p className="subtitle">Pit laps are excluded from the chart.</p>
        <div className="chart">
          <Line data={lapData} options={chartOptions("Lap time (s)")} />
        </div>
      </section>

      <section className="panel">
        <div className="comparison-header">
          <h2>Compare drivers</h2>
          <div className="selectors">
            <label>
              Driver A
              <select value={driverA} onChange={(e) => setDriverA(e.target.value)}>
                {Object.keys(COLORS).map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
            <label>
              Driver B
              <select value={driverB} onChange={(e) => setDriverB(e.target.value)}>
                {Object.keys(COLORS).map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="subtitle">
          Negative values mean {driverA} completed the lap faster than {driverB}.
        </p>
        <div className="chart">
          <Line data={comparisonData} options={chartOptions("Difference (s)")} />
        </div>
      </section>

      <section className="panel">
        <h2>Tyre performance · {driverA}</h2>
        <p className="subtitle">
          Actual lap times by tyre age and stint. Fuel, traffic and track
          conditions also affect pace; this is not an isolated tyre-wear estimate.
        </p>
        <div className="chart">
          <Line data={tyreData} options={tyreOptions} />
        </div>
      </section>

      <section className="panel">
        <h2>Leaderboard</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Position</th>
                <th>Driver</th>
                <th>Last lap</th>
                <th>Gap</th>
                <th>Tyres</th>
                <th>Tyre age</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((driver, index) => (
                <tr key={driver.code}>
                  <td>{index + 1}</td>
                  <td>
                    <span style={{ color: COLORS[driver.code] }}>
                      {driver.code}
                    </span>
                    <span className="driver-name">{driver.name}</span>
                  </td>
                  <td>
                    {driver.last_lap === null
                      ? "—"
                      : `${driver.last_lap.toFixed(3)}s`}
                  </td>
                  <td>
                    {race.lap === 0
                        ? "—"
                        : index === 0
                            ? "Leader"
                            : driver.completed_laps < leaderboard[0].completed_laps
                                ? `${leaderboard[0].completed_laps - driver.completed_laps} lap(s)`
                                : `+${(driver.total_time - leaderTime).toFixed(3)}s`}
                  </td>
                  <td>{driver.compound}</td>
                  <td>{driver.tyre_age} laps</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer>
         Historical data via FastF1 • One race lap per second • Selected drivers
      </footer>
    </main>
  );
}
