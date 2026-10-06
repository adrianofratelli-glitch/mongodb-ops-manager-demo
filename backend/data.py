"""
Estado-semente do MongoDB Ops Manager (demo).

A fonte única do seed é `frontend/src/api/seed.json`: o backend FastAPI e o
modo mock do GitHub Pages (`frontend/src/api/mock.js`) leem o mesmo arquivo,
então os dois modos partem exatamente do mesmo estado. O estado vive só em
memória e volta a este seed com `POST /api/reset` ou ao reiniciar o processo.
"""
import copy
import json
from pathlib import Path

SEED_PATH = Path(__file__).resolve().parents[1] / "frontend" / "src" / "api" / "seed.json"

with SEED_PATH.open(encoding="utf-8") as fh:
    _SEED = json.load(fh)


def seed():
    """Retorna uma cópia fresca do estado inicial (usado no reset)."""
    return copy.deepcopy(_SEED)
