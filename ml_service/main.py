import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Any
import duckdb

from trainer import train_model
from data_loader import VALID_TABLES, PITCH_BY_PITCH_TABLE, PITCH_BY_PITCH_COLUMNS

app = FastAPI(title="Statline ML Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrainRequest(BaseModel):
    duckdb_path: str
    table: str
    features: list[str]
    target: str
    task: str = "regression"
    model_type: str = "random_forest"
    hyperparams: dict[str, Any] = Field(default_factory=dict)
    filters: dict[str, Any] = Field(default_factory=dict)
    one_hot_target: bool = False
    target_bins: int = 4
    test_size: float = 0.2


@app.get("/health")
def health():
    return {"status": "ok", "service": "statline-ml"}


@app.get("/columns/{table}")
def columns(table: str, duckdb_path: str = ""):
    if table not in VALID_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {table}")
    if table == PITCH_BY_PITCH_TABLE:
        return {"table": table, "columns": PITCH_BY_PITCH_COLUMNS}
    if not os.path.exists(duckdb_path):
        raise HTTPException(status_code=503, detail="Warehouse not built yet. Refresh the sandbox first.")
    try:
        con = duckdb.connect(duckdb_path, read_only=True)
        result = con.execute(f'DESCRIBE "{table}"').fetchall()
        con.close()
        return {
            "table": table,
            "columns": [
                {"name": row[0], "type": row[1]}
                for row in result
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/train")
def train(req: TrainRequest):
    if req.table not in VALID_TABLES:
        raise HTTPException(status_code=400, detail=f"Unknown table: {req.table}")
    if not req.features:
        raise HTTPException(status_code=400, detail="features must not be empty")
    if req.table != PITCH_BY_PITCH_TABLE and not os.path.exists(req.duckdb_path):
        raise HTTPException(status_code=503, detail="Warehouse not built yet. Refresh the sandbox first.")
    if req.task not in ("regression", "classification"):
        raise HTTPException(status_code=400, detail="task must be 'regression' or 'classification'")

    try:
        result = train_model(req.model_dump())
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
