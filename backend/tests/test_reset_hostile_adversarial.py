"""Reset, restart do processo, inputs hostis e concorrência (abas paralelas)."""
from __future__ import annotations

import copy
import importlib
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import data  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset_state():
    assert client.post("/api/reset").status_code == 200


def _runtime():
    return copy.deepcopy({
        "state": main.STATE, "walks": main._WALKS, "rt": main._RT_OPS,
        "perf": main._PERF_LAST_AVG_MS["value"],
    })


def _exercise_everything():
    calls = [
        ("post", "/api/clusters", {"name": "tmp-rs", "type": "Replica Set", "members": 3}),
        ("post", "/api/clusters/tmp-rs/nodes", {}),
        ("post", "/api/clusters/rs-prod-01/resync?node_idx=1", None),
        ("post", "/api/clusters/rs-staging/upgrade", {"target_version": "6.0.13"}),
        ("post", "/api/clusters/rs-prod-01/stepdown?node_idx=0", None),
        ("post", "/api/automation/pending/pc-2/apply", None),
        ("delete", "/api/clusters/sharded-analytics", None),
        ("delete", "/api/automation/pending/pc-1", None),
        ("post", "/api/agents/upgrade", None),
        ("post", "/api/backup/snapshot?cluster=rs-staging", None),
        ("post", "/api/restore", {"cluster": "rs-prod-01", "point": "2024-01-15T05:00"}),
        ("post", "/api/alerts/1/acknowledge", None),
        ("post", "/api/alerts/2/resolve", None),
        ("post", "/api/alerts/configs", {"cond": "Oplog window is below", "thresh": "24h", "target": "rs-prod-01"}),
        ("post", "/api/users", {"name": "chaos_user"}),
        ("delete", "/api/roles/appWriter", None),
        ("post", "/api/security/ip", {"ip": "192.0.2.0/24"}),
        ("post", "/api/perf-advisor/index/ix-1", None),
    ]
    for method, url, body in calls:
        response = getattr(client, method)(url, json=body) if body is not None else getattr(client, method)(url)
        assert response.status_code == 200, f"{url}: {response.text}"
    for url in ("/api/metrics/rs-prod-01", "/api/metrics/rs-prod-01/tick", "/api/realtime/rs-prod-01", "/api/perf-advisor"):
        assert client.get(url).status_code == 200


def test_reset_restores_exact_initial_state_after_many_actions():
    initial = _runtime()
    assert initial == {"state": data.seed(), "walks": {}, "rt": {}, "perf": None}
    _exercise_everything()
    assert _runtime() != initial
    assert client.post("/api/reset").json() == {"ok": True}
    assert _runtime() == initial


def test_reset_is_idempotent_and_reachable_through_every_read():
    _exercise_everything()
    client.post("/api/reset")
    first = {u: client.get(u).json() for u in ("/api/clusters", "/api/backup", "/api/restore", "/api/automation", "/api/alerts", "/api/roles", "/api/security/ip", "/api/users", "/api/activity", "/api/agents")}
    client.post("/api/reset")
    second = {u: client.get(u).json() for u in first}
    assert first == second


def test_process_restart_starts_from_seed():
    """Restart do processo perde tudo que foi feito e volta ao seed, igual ao reset."""
    _exercise_everything()
    importlib.reload(data)
    fresh = importlib.reload(main)
    try:
        assert fresh.STATE == data.seed()
        assert fresh._WALKS == {} and fresh._RT_OPS == {}
    finally:
        # TestClient global continua apontando para o app recarregado
        globals()["client"] = TestClient(fresh.app)


@pytest.mark.parametrize("name", [
    "", " ", "a" * 65, "rs prod", "rs​prod", "‮rsprod", "rs-🔥", "../etc", "$where", "-leading-dash",
])
def test_hostile_cluster_names_are_rejected(name):
    response = client.post("/api/clusters", json={"name": name, "type": "Replica Set"})
    assert response.status_code == 422, response.text
    assert all(c["name"] != name for c in client.get("/api/clusters").json())


@pytest.mark.parametrize("payload", [
    {"name": {"$gt": ""}, "type": "Replica Set"},
    {"name": ["rs"], "type": "Replica Set"},
    {"name": "rs", "type": {"$ne": None}},
    {"name": "rs", "type": "Replica Set", "members": "3; drop"},
    {"name": "rs", "type": "Replica Set", "version": "7.0.5\n"},
])
def test_operator_and_type_confusion_payloads_are_rejected(payload):
    assert client.post("/api/clusters", json=payload).status_code == 422


def test_malformed_and_oversized_bodies_are_rejected_without_state_change():
    before = copy.deepcopy(main.STATE)
    assert client.post("/api/clusters", content=b"{not json", headers={"content-type": "application/json"}).status_code == 422
    huge = "x" * (1024 * 1024)
    assert client.post("/api/clusters", json={"name": huge, "type": "Replica Set"}).status_code == 422
    assert client.post("/api/restore", json={"cluster": "rs-prod-01", "point": huge}).status_code == 422
    assert client.post("/api/security/ip", json={"ip": "10.0.0.0/8", "comment": huge}).status_code == 422
    assert client.post("/api/alerts/configs", json={"cond": huge, "thresh": "1", "target": "x"}).status_code == 422
    assert client.post("/api/restore", json={"cluster": "rs-prod-01", "snapshot_id": {"$gt": ""}}).status_code == 422
    assert main.STATE == before


def test_path_traversal_and_unknown_keys_are_404():
    assert client.get("/api/agents/..%2F..%2Fetc%2Fpasswd/logs").status_code == 404
    assert client.delete("/api/security/ip?ip=..%2F..%2F").status_code == 404
    long_name = "a" * 10000
    response = client.post(f"/api/backup/snapshot?cluster={long_name}")
    assert response.status_code == 404
    assert len(response.json()["detail"]) < 200


def test_restore_point_in_the_future_is_rejected():
    response = client.post("/api/restore", json={"cluster": "rs-prod-01", "point": "2999-01-01T00:00"})
    assert response.status_code == 422
    assert "fora da janela" in response.json()["detail"]


def _parallel(fn, workers=32):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return [r.status_code for r in pool.map(lambda _: fn(), range(workers))]


def test_two_tabs_upgrading_the_same_cluster_start_one_rolling_upgrade():
    statuses = _parallel(lambda: client.post("/api/clusters/rs-prod-01/upgrade", json={"target_version": "7.0.6"}))
    assert statuses.count(200) == 1 and statuses.count(409) == 31, statuses
    activity = [a for a in client.get("/api/activity").json() if a["action"] == "UPGRADE"]
    assert len([a for a in activity if "iniciado" in a["details"]]) == 1


def test_parallel_restores_of_same_cluster_create_one_job():
    before = len(client.get("/api/restore").json())
    statuses = _parallel(lambda: client.post("/api/restore", json={"cluster": "rs-prod-01", "point": "2024-01-15T05:00"}))
    assert statuses.count(200) == 1, statuses
    assert len(client.get("/api/restore").json()) == before + 1


def test_parallel_apply_of_same_pending_change_applies_once():
    statuses = _parallel(lambda: client.post("/api/automation/pending/pc-2/apply"))
    assert statuses.count(200) == 1 and statuses.count(404) == 31, statuses
    history = client.get("/api/automation").json()["history"]
    assert sum(1 for h in history if h["change"] == "WiredTiger cache 4GB → 8GB") == 1


def test_parallel_snapshots_get_unique_ids():
    statuses = _parallel(lambda: client.post("/api/backup/snapshot?cluster=rs-prod-01"), workers=16)
    assert statuses.count(200) == 16
    ids = [s["id"] for s in client.get("/api/backup").json()["snapshots"]]
    assert len(ids) == len(set(ids))


def test_reset_racing_with_writes_never_500s():
    def chaos(i):
        if i % 4 == 0:
            return client.post("/api/reset").status_code
        if i % 4 == 1:
            return client.post("/api/clusters", json={"name": f"race-{i}", "type": "Replica Set"}).status_code
        if i % 4 == 2:
            return client.post("/api/backup/snapshot?cluster=rs-prod-01").status_code
        return client.get("/api/clusters").status_code
    with ThreadPoolExecutor(max_workers=16) as pool:
        statuses = list(pool.map(chaos, range(64)))
    assert all(s in (200, 404, 409) for s in statuses), statuses
