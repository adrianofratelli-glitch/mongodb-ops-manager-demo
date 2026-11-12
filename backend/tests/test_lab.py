"""Laboratório real do Performance Advisor — partes que não precisam de rede."""
from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import lab  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)


def test_desligado_sem_uri_e_resto_da_demo_segue():
    body = client.get("/api/lab").json()
    assert body["enabled"] is False
    assert "MONGODB_URI" in body["reason"]
    assert [s["id"] for s in body["scenarios"]] == ["ix-1", "ix-2", "ix-3", "ix-4"]
    assert client.get("/api/perf-advisor").json()["simulated"] is True


def test_banco_fora_do_prefixo_desliga(monkeypatch):
    monkeypatch.setenv("MONGODB_URI", "mongodb://127.0.0.1:1/")
    for bad in ("finscope", "admin", "opsmgr-lab", "x_opsmgr_lab_test"):
        monkeypatch.setenv("OPSMGR_LAB_DB", bad)
        cfg = lab.config()
        assert cfg["enabled"] is False, bad
        assert "prefixo opsmgr_lab" in cfg["reason"]
    monkeypatch.setenv("OPSMGR_LAB_DB", "opsmgr_lab_test")
    assert lab.config()["enabled"] is True


def test_falha_de_infra_vira_estado_sem_vazar_uri(monkeypatch):
    secret_uri = "mongodb+srv://user:s3cr3t@cluster.example.net/"
    monkeypatch.setenv("MONGODB_URI", secret_uri)
    monkeypatch.setenv("OPSMGR_LAB_DB", "opsmgr_lab_test")

    def boom():
        raise TimeoutError("server selection")

    monkeypatch.setattr(lab, "_require", boom)
    body = client.get("/api/lab").json()
    assert body["enabled"] is False
    assert "inacessível" in body["reason"]
    assert "s3cr3t" not in str(body) and "example.net" not in str(body)


def test_erro_inesperado_nas_rotas_vira_502_sem_detalhe_cru(monkeypatch):
    def boom(*_):
        raise RuntimeError("mongodb+srv://user:s3cr3t@host")

    monkeypatch.setattr(lab, "seed", boom)
    response = client.post("/api/lab/seed")
    assert response.status_code == 502
    assert "s3cr3t" not in response.text


def test_leitor_de_plano_cobre_classico_e_sbe():
    classic = {"stage": "LIMIT", "inputStage": {"stage": "FETCH", "inputStage": {"stage": "IXSCAN", "indexName": "a_1"}}}
    sbe = {"queryPlan": {"stage": "SORT", "inputStage": {"stage": "COLLSCAN"}}, "slotBasedPlan": {}}
    for plan, stages, idx in ((classic, ["LIMIT", "FETCH", "IXSCAN"], ["a_1"]), (sbe, ["SORT", "COLLSCAN"], [])):
        got_stages, got_idx = [], []
        lab._walk_plan(plan, got_stages, got_idx)
        assert got_stages == stages and got_idx == idx


def test_mql_e_nomes_de_indice():
    s = lab.SCENARIOS["ix-1"]
    assert lab.mql(s) == 'db.orders.find({"customerId":"C0042"}).sort({"createdAt":-1}).limit(20).explain("executionStats")'
    assert lab.index_name(s) == "opsmgr_lab_ix_1"
    assert all(lab.index_name(x).startswith(lab.INDEX_PREFIX) for x in lab.SCENARIOS.values())


def test_seed_deterministico_e_do_tamanho_do_seed_simulado():
    import random

    a = lab._docs("orders", random.Random(42))
    b = lab._docs("orders", random.Random(42))
    assert a == b and len(a) == 12_400
    # O "Docs Examined" do COLLSCAN no seed simulado é o tamanho da coleção do laboratório.
    slow = {q["ns"]: q for q in main.data.seed()["perf_slow_queries"]}
    assert slow["app_db.orders"]["examined"] == "12,400"
    assert slow["app_db.sessions"]["examined"] == "8,900"
