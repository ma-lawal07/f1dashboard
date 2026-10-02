import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import fastf1
import pandas as pd
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


# Change these values to replay another completed race.
YEAR = 2024
EVENT = "Bahrain"
SESSION = "R"

SELECTED_DRIVERS = {
    "VER": "Max Verstappen",
    "NOR": "Lando Norris",
    "LEC": "Charles Leclerc",
    "HAM": "Lewis Hamilton",
}

CACHE_DIR = Path(__file__).resolve().parents[1] / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(CACHE_DIR))

logger = logging.getLogger("uvicorn.error")

records = []
driver_templates = []

state = {
    "source": "FastF1",
    "event": f"{YEAR} {EVENT} Grand Prix",
    "loading": True,
    "error": None,
    "running": False,
    "lap": 0,
    "total_laps": 0,
    "history": [],
    "drivers": [],
}


def optional_number(value):
    """Convert missing pandas values to JSON-safe nulls."""
    if pd.isna(value):
        return None
    return float(value)


def optional_int(value):
    if pd.isna(value):
        return None
    return int(value)


def load_race():
    """Download and prepare data in a background thread."""
    session = fastf1.get_session(YEAR, EVENT, SESSION)

    # This dashboard uses lap-level data.
    # Speed, throttle and brake traces can be added later.
    session.load(
        laps=True,
        telemetry=False,
        weather=False,
        messages=False,
    )

    laps = session.laps
    selected = laps[
        laps["Driver"].isin(SELECTED_DRIVERS)
    ].copy()

    if selected.empty:
        raise RuntimeError("No lap data found for the selected drivers.")

    race_start = laps["LapStartTime"].min()

    if pd.isna(race_start):
        raise RuntimeError("The session has no usable race start time.")

    prepared = []

    for _, row in selected.iterrows():
        if pd.isna(row["LapNumber"]) or pd.isna(row["Time"]):
            continue

        lap_time = (
            None
            if pd.isna(row["LapTime"])
            else round(row["LapTime"].total_seconds(), 3)
        )

        prepared.append({
            "driver": str(row["Driver"]),
            "lap": int(row["LapNumber"]),
            "lap_time": lap_time,
            "compound": (
                "UNKNOWN"
                if pd.isna(row["Compound"])
                else str(row["Compound"])
            ),
            "tyre_age": optional_number(row["TyreLife"]),
            "stint": optional_int(row["Stint"]),
            # Exclude both pit entry and pit exit laps from pace charts.
            "pit_stop": bool(
                pd.notna(row["PitInTime"])
                or pd.notna(row["PitOutTime"])
            ),
            "total_time": round(
                (row["Time"] - race_start).total_seconds(), 3
            ),
        })

    if not prepared:
        raise RuntimeError("No usable completed laps were found.")

    prepared.sort(key=lambda item: (item["lap"], item["total_time"]))

    available = {item["driver"] for item in prepared}
    templates = []

    for code, name in SELECTED_DRIVERS.items():
        if code not in available:
            continue

        first = next(item for item in prepared if item["driver"] == code)

        templates.append({
            "code": code,
            "name": name,
            "compound": first["compound"],
            "tyre_age": 0,
            "stint": first["stint"],
            "total_time": 0.0,
            "last_lap": None,
            "completed_laps": 0,
        })

    return prepared, templates


def reset_replay():
    state.update({
        "running": False,
        "lap": 0,
        "history": [],
        "drivers": [dict(driver) for driver in driver_templates],
    })


async def prepare_race():
    global records, driver_templates

    try:
        records, driver_templates = await asyncio.to_thread(load_race)

        state["total_laps"] = max(item["lap"] for item in records)
        reset_replay()
        state["loading"] = False

    except Exception:
        logger.exception("FastF1 race loading failed")
        state["loading"] = False
        state["error"] = (
            "Could not load the race from FastF1. "
            "Check your internet connection and backend terminal, "
            "then restart the backend."
        )


def advance_lap():
    state["lap"] += 1

    lap_records = [
        item for item in records
        if item["lap"] == state["lap"]
    ]

    drivers_by_code = {
        driver["code"]: driver
        for driver in state["drivers"]
    }

    for record in lap_records:
        state["history"].append(dict(record))

        driver = drivers_by_code[record["driver"]]
        driver.update({
            "last_lap": record["lap_time"],
            "compound": record["compound"],
            "tyre_age": record["tyre_age"],
            "stint": record["stint"],
            "total_time": record["total_time"],
            "completed_laps": record["lap"],
        })

    if state["lap"] >= state["total_laps"]:
        state["running"] = False


async def replay_loop():
    while True:
        await asyncio.sleep(1)

        if (
            state["running"]
            and not state["loading"]
            and state["lap"] < state["total_laps"]
        ):
            advance_lap()


@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = [
        asyncio.create_task(prepare_race()),
        asyncio.create_task(replay_loop()),
    ]

    yield

    for task in tasks:
        task.cancel()

    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="FastF1 Race Replay", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    # Any local port, so the dashboard works even when Vite isn't on 5173.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/api/race")
async def get_race():
    return state


@app.post("/api/start")
async def start():
    if state["loading"]:
        raise HTTPException(503, "Race data is still loading.")

    if state["error"]:
        raise HTTPException(503, state["error"])

    if state["lap"] < state["total_laps"]:
        state["running"] = True

    return state


@app.post("/api/pause")
async def pause():
    state["running"] = False
    return state


@app.post("/api/reset")
async def reset():
    reset_replay()
    return state


@app.websocket("/ws/race")
async def race_stream(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            await websocket.send_json(state)
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass