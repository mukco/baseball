from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import schedule, players, stats

app = FastAPI(title="Baseball Stats API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schedule.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/")
async def health():
    return {"status": "ok", "service": "baseball-stats-api"}
