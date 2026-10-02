# Formula 1 Data Dashboard

An interactive React dashboard that replays real Formula 1 lap and tyre data using a Python backend and FastF1.

The default replay is the **2024 Bahrain Grand Prix**, comparing Max Verstappen, Lando Norris, Charles Leclerc and Lewis Hamilton.

> This project uses historical race data. It is not a live race feed. The replay reveals one race lap per second rather than reproducing the original session timeline.

## Features

- Lap-time charts for four selected drivers.
- Driver-to-driver lap-time comparisons.
- Tyre performance charts grouped by compound and stint.
- A selected-driver leaderboard with last lap, gap and tyre information.
- Start, pause and reset controls.
- WebSocket updates with automatic frontend reconnection.
- Local FastF1 caching to speed up subsequent data loads.

Pit-entry and pit-exit laps are excluded from pace charts. Missing lap times appear as gaps.

## Technology

| Layer | Tools |
| --- | --- |
| Frontend | React, Vite |
| Charts | Chart.js, react-chartjs-2 |
| Backend | Python, FastAPI, Uvicorn |
| Data | FastF1, pandas |
| Updates | WebSocket |

## How it works

1. The backend downloads the selected historical session through FastF1.
2. It prepares lap times, tyre compounds, tyre ages, stints and completion times.
3. Clicking Start reveals the next lap number every second.
4. The backend sends the current replay state over a WebSocket every half-second.
5. React updates the charts and driver table.

FastF1 data is cached in `backend/cache/`. The first download can take several minutes and requires an internet connection.

## Project structure

```text
f1-dashboard/
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── charts/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── styles/global.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── simulation/
│   │   ├── analytics/
│   │   ├── ml/
│   │   ├── __init__.py
│   │   └── main.py
│   ├── tests/
│   ├── .env.example
│   ├── Dockerfile
│   └── requirements.txt
├── data/sample/
├── docs/
├── .gitignore
└── README.md
```

The current implementation lives primarily in `backend/app/main.py` and `frontend/src/App.jsx`. Several scaffold files and folders are placeholders for future separation of components, analytics and deployment configuration. The Dockerfile is not implemented yet.

## Prerequisites

- Python 3.11 or newer.
- Node.js 22.12 or newer, with npm.
- An internet connection for the first race download.

The commands below use Windows PowerShell. Run them from the project root, `f1-dashboard`.

## Install dependencies

```powershell
python -m venv backend/.venv
& ./backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt

Push-Location frontend
npm install
Pop-Location
```

Using the virtual environment's Python directly means you do not need to activate it.

## Run locally

Open two terminals at the project root.

### Terminal 1: backend

```powershell
& ./backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --reload
```

### Terminal 2: frontend

```powershell
cd frontend
npm run dev -- --port 5173 --strictPort
```

Open [http://localhost:5173](http://localhost:5173). Wait for the race download to finish, then click **Start**.

The backend is available at [http://localhost:8000](http://localhost:8000), and its API documentation is at [http://localhost:8000/docs](http://localhost:8000/docs).

## Frontend configuration

The frontend defaults to a local backend. To override the URLs, create `frontend/.env` from `frontend/.env.example`:

```text
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/race
```

Restart Vite after changing these values. Variables prefixed with `VITE_` are exposed to the browser; do not put secrets in them.

The current backend allows frontend requests from `http://localhost:5173` and `http://127.0.0.1:5173`. Its allowed origins are configured directly in `backend/app/main.py`; the backend `.env.example` is not currently read by the application.

## Choose another race

Edit these constants in `backend/app/main.py`:

```python
YEAR = 2024
EVENT = "Bahrain"
SESSION = "R"
```

Use a completed race with available FastF1 data. Restart the backend after changing the session.

Driver selection is defined by `SELECTED_DRIVERS` in the backend. If you change the drivers, also update `COLORS` and the default comparison selections in `frontend/src/App.jsx`.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/race` | Retrieve the current replay state |
| POST | `/api/start` | Start or resume playback |
| POST | `/api/pause` | Pause playback |
| POST | `/api/reset` | Return playback to lap zero |
| WebSocket | `/ws/race` | Receive replay state updates |

Start requests return HTTP 503 while race data is loading or if loading has failed. Reset uses the already-loaded race data and does not download it again.

## Interpreting the charts

- **Lap times:** actual completed-lap durations; pit-entry and pit-exit laps are hidden.
- **Driver comparison:** driver A's lap time minus driver B's for the same lap number. A negative value means driver A was faster.
- **Tyre performance:** actual lap time against tyre age, with a separate line for each stint. Fuel load, traffic, weather and track conditions also affect lap times, so this chart does not isolate tyre degradation.
- **Leaderboard:** a comparison of the selected drivers at the replay's lap number, using completion times. It is not an official real-time race classification.

## Current limitations

- Historical lap replay only; no live race connection.
- Speed, throttle, braking and car-position telemetry are not loaded.
- One shared replay state per backend process; controls affect every connected viewer.
- No prediction model, authentication, persistent replay state or cloud deployment yet.
- The dependency list includes machine-learning and testing tools for future development; they are not implemented features.

## Troubleshooting

**The dashboard stays on Connecting:** check that the backend is running on port 8000 and that the WebSocket URL is correct.

**The race is still downloading:** allow time for the first load. Check the backend terminal for progress or errors.

**Race loading fails:** check your internet connection and backend logs, then restart the backend. Session availability and upstream services can affect data loading.

**Port 5173 is occupied:** stop the application using that port. If you choose another frontend port, update the backend's allowed origins accordingly.

## Production build

```powershell
cd frontend
npm run build
```

The frontend output is written to `frontend/dist/`. Cloud hosting still requires backend deployment, production origins and HTTPS/WSS configuration. Use one backend worker with the current in-memory replay design; multiple workers would have independent race states.

## Data source and attribution

Historical session data is accessed using [FastF1](https://github.com/theOehrly/Fast-F1). This is an independent educational project and is not affiliated with Formula 1, the FIA or any racing team. Formula 1 names and marks belong to their respective owners.

Access to data through FastF1 does not itself grant redistribution or commercial-use rights. Review the relevant terms before publishing datasets or commercializing the application.
