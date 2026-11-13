"""Fidelidade ao produto atual (Ops Manager 9.0) e rótulo "simulado" em cada tela.

Conferido na doc oficial em `product_status.json["checked_on"]`; fontes em
docs/status-de-produto.md. Nada aqui toca rede nem banco.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
FRONT = BACKEND.parent / "frontend" / "src"
sys.path.insert(0, str(BACKEND))

import main  # noqa: E402

client = TestClient(main.app)
PRODUCT = json.loads((FRONT / "api" / "product_status.json").read_text(encoding="utf-8"))
NOTES = json.loads((FRONT / "lib" / "product_notes.json").read_text(encoding="utf-8"))
COMPARE = json.loads((FRONT / "lib" / "ops_vs_atlas.json").read_text(encoding="utf-8"))
# Páginas que descrevem o Atlas: docs/atlas/... e as opções de deployment do Search no Atlas.
ATLAS_DOC = re.compile(r"mongodb\.com/docs/(atlas/|search/deployment/|vector-search/deployment/)")
SECTION_IDS = re.findall(r"\{ id: '([^']+)'", (FRONT / "lib" / "sections.js").read_text(encoding="utf-8"))


@pytest.fixture(autouse=True)
def reset_state():
    assert client.post("/api/reset").status_code == 200


def _new(name, version):
    return client.post("/api/clusters", json={"name": name, "type": "Replica Set", "version": version, "members": 3})


def test_meta_expoe_versao_agente_e_matriz_da_fonte_unica():
    meta = client.get("/api/meta").json()
    assert meta["ops_manager_version"] == PRODUCT["ops_manager_version"] == "9.0.1"
    assert meta["agent_latest"] == PRODUCT["agent_latest"] == "109.0.1.9309-1"
    assert meta["support_matrix"] == PRODUCT["support_matrix"]
    assert meta["checked_on"] == PRODUCT["checked_on"]
    assert meta["simulated"] is True


@pytest.mark.parametrize("version", ["4.4.29", "5.0.30"])
def test_serie_eol_no_om9_e_recusada(version):
    r = _new("legado", version)
    assert r.status_code == 422
    assert "EOL no Ops Manager 9.0.1" in r.json()["detail"]
    assert not any(c["name"] == "legado" for c in client.get("/api/clusters").json())


def test_serie_deprecated_cria_com_aviso_sem_sujar_o_estado():
    r = _new("legado-60", "6.0.20")
    assert r.status_code == 200
    assert "Deprecated no Ops Manager 9.0.1" in r.json()["warning"]
    stored = next(c for c in client.get("/api/clusters").json() if c["name"] == "legado-60")
    assert "warning" not in stored


@pytest.mark.parametrize("version", ["7.0.5", "8.0.12", "9.0.7"])
def test_series_suportadas_criam_sem_aviso(version):
    r = _new(f"ok-{version.replace('.', '-')}", version)
    assert r.status_code == 200
    assert "warning" not in r.json()


def test_seed_sem_datas_anteriores_ao_om9():
    seed = json.loads((FRONT / "api" / "seed.json").read_text(encoding="utf-8"))
    raw = json.dumps(seed, ensure_ascii=False)
    assert not re.search(r"\b202[0-4]-\d{2}-\d{2}", raw)
    # Histórico coerente: nada de upgrade de 6.0 (EOL em 31/07/2025) feito em 2026.
    assert "6.0.11 → 6.0.12" not in raw
    created = sorted(s["created"] for s in seed["snapshots"])
    assert created[-1].startswith("2026-11")
    assert {a["version"] for a in seed["agents"]} == {PRODUCT["agent_seed"]}


def test_toda_secao_tem_nota_de_simulado_real_e_atlas_com_fonte():
    assert SECTION_IDS, "sections.js mudou de formato"
    assert "ops-vs-atlas" in SECTION_IDS
    for sid in SECTION_IDS:
        note = NOTES["notes"].get(sid)
        assert note, f"seção sem nota de produto: {sid}"
        for field in ("simulated", "real", "atlas"):
            assert len(note[field]) > 20, (sid, field)
        assert note["sources"] and all(u.startswith("https://www.mongodb.com/") for u in note["sources"]), sid
        # O lado Atlas precisa de fonte do Atlas, não só de páginas do Ops Manager.
        assert any(ATLAS_DOC.search(u) for u in note["sources"]), f"nota sem fonte do Atlas: {sid}"
        if "api" in note:
            assert re.match(r"^(GET|PUT|POST|PATCH) /api/public/v1\.0/groups/\{PROJECT-ID\}/", note["api"]), sid
    assert set(NOTES["notes"]) == set(SECTION_IDS), "nota órfã ou faltando"


def test_comparativo_cobre_os_temas_pedidos_sem_preco():
    topics = " ".join(r["topic"] for r in COMPARE["rows"]).lower()
    for must in ("upgrade", "backup", "performance advisor", "search", "automação"):
        assert must in topics, must
    raw = json.dumps(COMPARE, ensure_ascii=False)
    assert not re.search(r"(R\$|US\$|\$\s?\d|USD|por hora|/mês)", raw), "comparativo não fala de preço"
    for r in COMPARE["rows"]:
        assert r["ops_manager"] and r["atlas"] and r["verdict"], r["topic"]
        assert r["sources"] and all(u.startswith("https://www.mongodb.com/") for u in r["sources"]), r["topic"]
        assert any(ATLAS_DOC.search(u) for u in r["sources"]), f"linha sem fonte do Atlas: {r['topic']}"
    k8s = next(r for r in COMPARE["rows"] if r["topic"] == "Kubernetes")
    assert "Atlas Kubernetes Operator" in k8s["atlas"]
    alerts = next(r for r in COMPARE["rows"] if "alertas" in r["topic"].lower())
    assert any("/docs/atlas/configure-alerts" in u for u in alerts["sources"])
    search = next(r for r in COMPARE["rows"] if "Search" in r["topic"])
    assert "mongot" in search["ops_manager"] and "MCK" in search["ops_manager"]


def test_checked_on_igual_nos_tres_arquivos():
    assert PRODUCT["checked_on"] == NOTES["checked_on"] == COMPARE["checked_on"]


def test_imagem_docker_leva_os_json_que_o_backend_le():
    # O backend lê estes arquivos em runtime; a imagem copia só os listados no Dockerfile.
    dockerfile = (BACKEND.parent / "Dockerfile").read_text(encoding="utf-8")
    for name in ("seed.json", "lab_scenarios.json", "product_status.json"):
        assert f"frontend/src/api/{name}" in dockerfile, name
