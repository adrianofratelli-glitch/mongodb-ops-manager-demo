from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def reset_state():
    assert client.post("/api/reset").status_code == 200


def valid_cluster(name: str = "chaos-rs") -> dict:
    return {
        "name": name,
        "type": "Replica Set",
        "version": "7.0.5",
        "members": 3,
        "port": "27017",
    }


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("type", "Definitely Not MongoDB"),
        ("version", "<script>alert(1)</script>"),
        ("port", "27017.attacker.invalid"),
        ("members", 13),
    ],
)
def test_cluster_rejects_invalid_configuration(field: str, value):
    payload = valid_cluster()
    payload[field] = value
    response = client.post("/api/clusters", json=payload)
    assert response.status_code == 422, response.text


def test_security_models_reject_unbounded_or_invalid_values():
    assert client.post("/api/users", json={"name": "x" * 300}).status_code == 422
    assert client.post("/api/roles", json={"name": "x" * 300}).status_code == 422
    assert client.post(
        "/api/security/ip", json={"ip": "999.999.999.999", "comment": "invalid"}
    ).status_code == 422


def test_cluster_node_limit_is_enforced():
    created = client.post("/api/clusters", json=valid_cluster()).json()
    cluster_id = created["id"]
    for index in range(9):
        response = client.post(
            f"/api/clusters/{cluster_id}/nodes",
            json={"host": f"node-{index}.internal:27017", "role": "SECONDARY"},
        )
        assert response.status_code == 200
    response = client.post(
        f"/api/clusters/{cluster_id}/nodes",
        json={"host": "node-over-limit.internal:27017", "role": "SECONDARY"},
    )
    assert response.status_code == 409, response.text


def test_concurrent_duplicate_cluster_is_created_once():
    workers = 32
    payload = valid_cluster("race-rs")
    with ThreadPoolExecutor(max_workers=workers) as pool:
        responses = list(pool.map(lambda _: client.post("/api/clusters", json=payload), range(workers)))

    statuses = [response.status_code for response in responses]
    assert statuses.count(200) == 1, statuses
    assert statuses.count(409) == workers - 1, statuses
    assert len([cluster for cluster in main.STATE["clusters"] if cluster["id"] == "race-rs"]) == 1
