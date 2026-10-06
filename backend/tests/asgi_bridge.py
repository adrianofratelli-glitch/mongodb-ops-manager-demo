"""Ponte de teste stdin/stdout → FastAPI TestClient (sem abrir porta).

Usada por frontend/tests/e2e_ui.mjs no modo `bridge`: o Playwright intercepta
/api/* e repassa cada requisição para cá, que a executa em processo contra
`main.app`. Uma linha JSON por requisição/resposta.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)
for line in sys.stdin:
    req = json.loads(line)
    r = client.request(req["method"], req["url"], content=(req.get("body") or None),
                       headers={"content-type": "application/json"} if req.get("body") else None)
    sys.stdout.write(json.dumps({"id": req["id"], "status": r.status_code, "body": r.text}) + "\n")
    sys.stdout.flush()
