"""Laboratório contra um MongoDB real (banco opsmgr_lab_test).

Roda só com OPSMGR_LIVE=1 e MONGODB_URI no ambiente:
    OPSMGR_LIVE=1 MONGODB_URI=... backend/.venv/bin/pytest -q backend/tests/test_lab_live.py
Escreve apenas em `opsmgr_lab_test` e remove os índices que criou.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

LAB = {"X-Lab-Action": "1"}

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(os.environ.get("OPSMGR_LIVE") != "1" or not os.environ.get("MONGODB_URI"),
                       reason="teste live: exige OPSMGR_LIVE=1 e MONGODB_URI"),
]


@pytest.fixture(scope="module")
def client():
    with pytest.MonkeyPatch.context() as mp:  # restaura OPSMGR_LAB_DB ao fim do módulo
        mp.setenv("OPSMGR_LAB_DB", "opsmgr_lab_test")
        import lab
        import main

        assert lab.config()["db"].endswith("_test")
        c = TestClient(main.app)
        assert c.post("/api/lab/seed?force=true", headers=LAB).status_code == 200
        c.post("/api/lab/reset", headers=LAB)
        yield c
        c.post("/api/lab/reset", headers=LAB)


def test_status_ligado(client):
    body = client.get("/api/lab").json()
    assert body["enabled"] and body["seeded"] and body["db"] == "opsmgr_lab_test"
    assert body["counts"] == {"orders": 12400, "sessions": 8900, "events": 45000, "products": 6200}
    assert "MONGODB_URI" not in str(body) and "@" not in str(body)


@pytest.mark.parametrize("sid", ["ix-1", "ix-2", "ix-3", "ix-4"])
def test_indice_real_reduz_docs_examinados(client, sid):
    before = client.get(f"/api/lab/explain/{sid}").json()["result"]
    assert before["collscan"] or before["in_memory_sort"] or before["index_used"] == "timestamp_1"
    r = client.post(f"/api/lab/index/{sid}", headers=LAB)
    assert r.status_code == 200, r.text
    out = r.json()
    after = out["after"]
    assert after["index_used"] == f"opsmgr_lab_{sid.replace('-', '_')}"
    assert not after["collscan"] and not after["in_memory_sort"]
    assert after["returned"] == out["before"]["returned"]
    assert out["create_index_mql"].startswith('db.runCommand({"createIndexes":')
    assert out["before"]["docs_examined"] >= 10 * after["docs_examined"]
    again = client.post(f"/api/lab/index/{sid}", headers=LAB)
    assert again.status_code == 409


def test_reset_remove_so_indices_do_lab(client):
    dropped = client.post("/api/lab/reset", headers=LAB).json()["dropped"]
    assert all(".opsmgr_lab_" in d for d in dropped)
    assert client.get("/api/lab/explain/ix-1").json()["result"]["collscan"] is True
    assert client.get("/api/lab/explain/ix-3").json()["result"]["index_used"] == "timestamp_1"
