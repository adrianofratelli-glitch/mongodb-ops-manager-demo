"""Regressão: corrida entre restore em andamento e mudanças de ciclo de vida.

Achado P2 da revisão de 2026-10-08: DELETE do cluster de destino no meio do
restore respondia 200 e o job terminava `completed` para um destino que não
existia mais. Agora o DELETE é recusado (409) enquanto o cluster é origem ou
destino de um restore ativo e, como defesa, o job que perde origem/destino por
qualquer outro caminho termina `failed` com motivo, nunca `completed`.
"""
from __future__ import annotations

import sys
import time as real_time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture
def clock(monkeypatch):
    offset = {"s": 0.0}
    monkeypatch.setattr(main, "time", SimpleNamespace(time=lambda: real_time.time() + offset["s"]))
    assert client.post("/api/reset").status_code == 200
    yield offset
    client.post("/api/reset")


def _start_into_new_destination(name="race-rs"):
    assert client.post("/api/clusters", json={"name": name, "type": "Replica Set"}).status_code == 200
    r = client.post("/api/restore", json={"cluster": "rs-prod-01", "target": name, "snapshot_id": "snap-00142"})
    assert r.status_code == 200, r.text
    return r.json()["job"]["id"]


def _job(jid):
    return next(j for j in client.get("/api/restore").json() if j["id"] == jid)


def _cluster_names():
    return {c["name"] for c in client.get("/api/clusters").json()}


def test_delete_destination_mid_restore_is_refused_and_job_completes_on_existing_cluster(clock):
    jid = _start_into_new_destination()
    r = client.delete("/api/clusters/race-rs")
    assert r.status_code == 409
    assert "destino do restore" in r.json()["detail"]
    clock["s"] += main.RESTORE_TOTAL_SECONDS + 1
    job = _job(jid)
    assert job["status"] == "completed"
    assert "race-rs" in _cluster_names()
    assert client.delete("/api/clusters/race-rs").status_code == 200


def test_delete_source_mid_restore_is_refused(clock):
    jid = _start_into_new_destination()
    r = client.delete("/api/clusters/rs-prod-01")
    assert r.status_code == 409 and "origem do restore" in r.json()["detail"]
    assert _job(jid)["status"] in ("queued", "running")


def test_job_that_loses_its_destination_ends_failed_not_completed(clock):
    """Defesa em profundidade: se o destino sumir por um caminho que não passe
    pelo DELETE (ex.: estado corrompido), o job falha com motivo."""
    jid = _start_into_new_destination()
    with main.STATE_LOCK:
        main.STATE["clusters"] = [c for c in main.STATE["clusters"] if c["name"] != "race-rs"]
    clock["s"] += main.RESTORE_TOTAL_SECONDS + 1
    job = _job(jid)
    assert job["status"] == "failed"
    assert "race-rs" in job["error"]
    assert client.get("/api/activity").json()[0]["action"] == "RESTORE FAILED"


def test_parallel_deletes_during_restore_never_succeed(clock):
    _start_into_new_destination()
    with ThreadPoolExecutor(max_workers=16) as ex:
        codes = list(ex.map(lambda _: client.delete("/api/clusters/race-rs").status_code, range(16)))
    assert codes == [409] * 16
    assert "race-rs" in _cluster_names()


def test_reset_during_restore_drops_the_job(clock):
    jid = _start_into_new_destination()
    assert client.post("/api/reset").status_code == 200
    clock["s"] += main.RESTORE_TOTAL_SECONDS + 1
    assert all(j["id"] != jid for j in client.get("/api/restore").json())
