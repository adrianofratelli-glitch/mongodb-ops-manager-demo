"""Isola a suíte offline do MongoDB real.

O laboratório (`backend/lab.py`) liga sozinho quando `MONGODB_URI` está no
ambiente ou no `.env` da PoV. Os testes offline sempre rodam com ele desligado,
para não depender de rede nem escrever em lugar nenhum. Só os testes marcados
`live` (test_lab_live.py) enxergam a URI, e mesmo assim num banco `*_test`.
"""
import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "live: toca um MongoDB real (exige OPSMGR_LIVE=1)")


@pytest.fixture(autouse=True)
def _lab_offline(request, monkeypatch):
    if request.node.get_closest_marker("live") is None:
        monkeypatch.setenv("MONGODB_URI", "")
    yield
