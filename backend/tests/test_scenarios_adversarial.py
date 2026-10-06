"""Roda os cenários compartilhados (scenarios_adversarial.json) contra o FastAPI.

O mesmo arquivo é executado contra o mock do GitHub Pages por
`frontend/tests/mock_parity.mjs`, então os dois modos ficam presos ao mesmo
contrato: mesmas recusas, mesmos status e o mesmo trecho de mensagem.
"""
from __future__ import annotations

import json
import sys
import time as real_time
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402

SCENARIOS = json.loads((Path(__file__).with_name("scenarios_adversarial.json")).read_text(encoding="utf-8"))["scenarios"]
client = TestClient(main.app)

CALLS = {
    "createCluster": lambda b: ("post", "/api/clusters", b),
    "deleteCluster": lambda cid: ("delete", f"/api/clusters/{cid}", None),
    "addNode": lambda cid, b: ("post", f"/api/clusters/{cid}/nodes", b),
    "stepDown": lambda cid, i: ("post", f"/api/clusters/{cid}/stepdown?node_idx={i}", None),
    "resyncNode": lambda cid, i: ("post", f"/api/clusters/{cid}/resync?node_idx={i}", None),
    "upgradeCluster": lambda cid, b: ("post", f"/api/clusters/{cid}/upgrade", b),
    "applyPending": lambda pid: ("post", f"/api/automation/pending/{pid}/apply", None),
    "discardPending": lambda pid: ("delete", f"/api/automation/pending/{pid}", None),
    "upgradeAgents": lambda: ("post", "/api/agents/upgrade", None),
    "createIndex": lambda sid: ("post", f"/api/perf-advisor/index/{sid}", None),
    "takeSnapshot": lambda name: ("post", f"/api/backup/snapshot?cluster={quote(name)}", None),
    "deleteSnapshot": lambda sid: ("delete", f"/api/backup/snapshot/{sid}", None),
    "startRestore": lambda b: ("post", "/api/restore", b),
    "acknowledgeAlert": lambda aid: ("post", f"/api/alerts/{aid}/acknowledge", None),
    "resolveAlert": lambda aid: ("post", f"/api/alerts/{aid}/resolve", None),
    "addAlertConfig": lambda b: ("post", "/api/alerts/configs", b),
    "deleteAlertConfig": lambda cid: ("delete", f"/api/alerts/configs/{cid}", None),
    "addRole": lambda b: ("post", "/api/roles", b),
    "deleteRole": lambda name: ("delete", f"/api/roles/{quote(name)}", None),
    "addIp": lambda b: ("post", "/api/security/ip", b),
    "deleteIp": lambda ip: ("delete", f"/api/security/ip?ip={quote(ip, safe='')}", None),
}
GETS = {
    "clusters": "/api/clusters", "automation": "/api/automation", "backup": "/api/backup",
    "restoreJobs": "/api/restore", "perfAdvisor": "/api/perf-advisor", "roles": "/api/roles",
    "alerts": "/api/alerts", "ips": "/api/security/ip",
}


def resolve(value, path):
    for part in path.split("."):
        if value is None:
            return None
        if isinstance(value, list):
            idx = int(part)
            value = value[idx] if idx < len(value) else None
        else:
            value = value.get(part)
    return value


@pytest.fixture
def clock(monkeypatch):
    offset = {"s": 0.0}
    monkeypatch.setattr(main, "time", SimpleNamespace(time=lambda: real_time.time() + offset["s"]))
    yield offset


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["name"] for s in SCENARIOS])
def test_scenario(scenario, clock):
    assert client.post("/api/reset").status_code == 200
    for n, step in enumerate(scenario["steps"]):
        where = f"passo {n}: {step}"
        if "advance" in step:
            clock["s"] += step["advance"]
            continue
        if "get" in step:
            data = client.get(GETS[step["get"]]).json()
            if "find" in step:
                (key, val), = step["find"].items()
                data = next((x for x in data if x.get(key) == val), None)
            got = resolve(data, step["path"])
            if "equals" in step:
                assert got == step["equals"], where
            if "contains" in step:
                assert step["contains"] in str(got), where
            if "length" in step:
                assert len(got) == step["length"], where
            continue
        method, url, body = CALLS[step["call"]](*step["args"])
        response = getattr(client, method)(url, json=body) if body is not None else getattr(client, method)(url)
        expect = step["expect"]
        if expect == "ok":
            assert response.status_code == 200, f"{where} → {response.status_code} {response.text}"
        else:
            assert response.status_code == expect["status"], f"{where} → {response.status_code} {response.text}"
            if "contains" in expect:
                assert expect["contains"] in str(response.json().get("detail")), f"{where} → {response.text}"
