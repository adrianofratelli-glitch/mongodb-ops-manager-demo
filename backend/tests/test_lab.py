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


LAB = {"X-Lab-Action": "1"}


def test_banco_padrao_e_test_e_nome_com_ancora(monkeypatch):
    monkeypatch.setenv("MONGODB_URI", "mongodb://127.0.0.1:1/")
    monkeypatch.delenv("OPSMGR_LAB_DB", raising=False)
    assert lab.config()["db"] == "opsmgr_lab_test"
    for bad in ("finscope", "admin", "opsmgr-lab", "x_opsmgr_lab_test", "opsmgr_labprod", "opsmgr_lab_", "opsmgr_lab_Test"):
        monkeypatch.setenv("OPSMGR_LAB_DB", bad)
        cfg = lab.config()
        assert cfg["enabled"] is False, bad
        assert "recusado" in cfg["reason"]
    for good in ("opsmgr_lab", "opsmgr_lab_test", "opsmgr_lab_demo"):
        monkeypatch.setenv("OPSMGR_LAB_DB", good)
        assert lab.config()["enabled"] is True, good


def test_escrita_fora_de_test_exige_allow_demo_db_write(monkeypatch):
    """Recusa antes de abrir conexão: seed, índice e reset num banco sem _test."""
    monkeypatch.setenv("MONGODB_URI", "mongodb://127.0.0.1:1/")
    monkeypatch.setenv("OPSMGR_LAB_DB", "opsmgr_lab_demo")
    monkeypatch.delenv("ALLOW_DEMO_DB_WRITE", raising=False)
    for url in ("/api/lab/seed", "/api/lab/index/ix-1", "/api/lab/reset"):
        response = client.post(url, headers=LAB)
        assert response.status_code == 403, url
        assert "ALLOW_DEMO_DB_WRITE" in response.json()["detail"]
    monkeypatch.setenv("ALLOW_DEMO_DB_WRITE", "1")
    try:
        lab._require(write=True)
    except lab.LabError as error:  # pragma: no cover - não deve recusar com a flag
        raise AssertionError(error.detail)
    except Exception:
        pass  # a guarda passou; falhar ao conectar em 127.0.0.1:1 é esperado


def test_posts_do_lab_exigem_header_custom():
    for url in ("/api/lab/seed", "/api/lab/index/ix-1", "/api/lab/reset"):
        response = client.post(url)
        assert response.status_code == 403, url
        assert "X-Lab-Action" in response.json()["detail"]
        assert client.post(url, headers={"X-Lab-Action": "0"}).status_code == 403
        assert client.post(url, headers=LAB).status_code == 503  # passou o header; lab desligado


def test_preflight_de_outra_origem_nao_libera_o_header():
    response = client.options("/api/lab/seed", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-lab-action"})
    assert "access-control-allow-origin" not in {k.lower() for k in response.headers}


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
    response = client.post("/api/lab/seed", headers=LAB)
    assert response.status_code == 502
    assert "s3cr3t" not in response.text


def test_leitor_de_plano_cobre_classico_e_sbe():
    classic = {"stage": "LIMIT", "inputStage": {"stage": "FETCH", "inputStage": {"stage": "IXSCAN", "indexName": "a_1"}}}
    sbe = {"queryPlan": {"stage": "SORT", "inputStage": {"stage": "COLLSCAN"}}, "slotBasedPlan": {}}
    for plan, stages, idx in ((classic, ["LIMIT", "FETCH", "IXSCAN"], ["a_1"]), (sbe, ["SORT", "COLLSCAN"], [])):
        got_stages, got_idx = [], []
        lab._walk_plan(plan, got_stages, got_idx)
        assert got_stages == stages and got_idx == idx


def test_mql_exibida_e_o_comando_executado():
    s = lab.SCENARIOS["ix-1"]
    assert lab.mql(s) == ('db.runCommand({"explain":{"find":"orders","filter":{"customerId":"C0042"},'
                          '"sort":{"createdAt":-1},"limit":20},"verbosity":"executionStats"})')
    assert lab.mql(s) == f"db.runCommand({lab.shell(lab.explain_command(s))})"
    cmd = lab.explain_command(lab.SCENARIOS["ix-2"])
    from datetime import datetime
    assert isinstance(cmd["explain"]["filter"]["expiresAt"]["$gt"], datetime)  # roda com data, exibe ISODate
    assert 'ISODate("2026-11-01T00:00:00Z")' in lab.mql(lab.SCENARIOS["ix-2"])
    assert lab.create_index_mql(s) == f"db.runCommand({lab.shell(lab.create_index_command(s))})"
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
