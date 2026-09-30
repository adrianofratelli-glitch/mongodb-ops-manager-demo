"""CORS regression using only liveness, with no startup side effects."""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import main


class CorsTests(unittest.TestCase):
    def test_only_local_frontend_passes_preflight(self):
        client = TestClient(main.app)
        for origin, expected in [("http://localhost:5377", 200),
                                 ("http://127.0.0.1:5377", 200),
                                 ("https://untrusted.example", 400)]:
            response = client.options("/health/live", headers={
                "Origin": origin, "Access-Control-Request-Method": "GET"})
            self.assertEqual(response.status_code, expected)
            self.assertEqual(response.headers.get("access-control-allow-origin"),
                             origin if expected == 200 else None)
