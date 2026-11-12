"""
Laboratório real do Performance Advisor (opcional).

O resto da demo é simulado em memória. Este módulo é a exceção deliberada: quando
`MONGODB_URI` está definido, ele popula um banco de laboratório com dados fictícios
determinísticos e executa de verdade, no MongoDB, as consultas que o Performance
Advisor da demo aponta como lentas: `explain("executionStats")` antes e depois de
`createIndex`, com o MQL exato devolvido para a UI.

Guardas:
- Sem `MONGODB_URI`, o laboratório fica desligado (`enabled: false`) e nada quebra.
- Banco padrão `opsmgr_lab_test`; o nome precisa ser `opsmgr_lab` ou
  `opsmgr_lab_<sufixo>` (outro nome desliga o laboratório). Qualquer escrita
  (seed, índice, reset) num banco que não termine em `_test` é recusada sem
  `ALLOW_DEMO_DB_WRITE=1`.
- Só toca as coleções do laboratório e só remove índices com o prefixo `opsmgr_lab_`.
- A connection string nunca sai do processo: a API devolve só banco e versão do servidor.

Decisão registrada em docs/adr/0001-laboratorio-real-performance-advisor.md.
"""
from __future__ import annotations

import json
import os
import random
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS_PATH = ROOT / "frontend" / "src" / "api" / "lab_scenarios.json"
_SPEC = json.loads(SCENARIOS_PATH.read_text(encoding="utf-8"))
SCENARIOS = {s["id"]: s for s in _SPEC["scenarios"]}
REFERENCE = datetime(2026, 11, 1, tzinfo=timezone.utc)

DB_PREFIX = "opsmgr_lab"
DEFAULT_DB = "opsmgr_lab_test"
# Nome com âncora: `opsmgr_lab` ou `opsmgr_lab_<sufixo>` (recusa `opsmgr_labprod`).
DB_NAME_RE = re.compile(r"^opsmgr_lab(_[a-z0-9]+)?$")
INDEX_PREFIX = "opsmgr_lab_"
SEED_VERSION = 1
# Tamanhos iguais aos "Docs Examined" do seed simulado: o COLLSCAN medido no
# laboratório confere com o número que a tabela de slow queries mostra.
SIZES = {"orders": 12_400, "sessions": 8_900, "events": 45_000, "products": 6_200}
# Índices que já existiam no "cluster" do seed (coluna Index Used).
BASELINE_INDEXES = {"events": [("timestamp", 1)], "products": [("category", 1)]}
EVENT_TYPES = ["page_view", "click", "search", "add_to_cart", "checkout", "login", "logout",
               "signup", "share", "review", "refund", "wishlist"]
CATEGORIES = ["electronics", "books", "home", "toys", "sports", "beauty", "garden", "music",
              "fashion", "grocery"]

LAB_LOCK = Lock()
_CLIENT = {"uri": None, "client": None}


def _load_dotenv() -> None:
    """Lê `<repo>/.env` (se existir) sem sobrescrever o ambiente do processo."""
    path = ROOT / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


_load_dotenv()


class LabError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def config() -> dict:
    uri = os.environ.get("MONGODB_URI", "").strip()
    db = os.environ.get("OPSMGR_LAB_DB", DEFAULT_DB).strip() or DEFAULT_DB
    if not uri:
        return {"enabled": False, "db": db, "reason": "MONGODB_URI não definido: o laboratório real fica desligado e o resto da demo segue simulado."}
    if not DB_NAME_RE.fullmatch(db):
        return {"enabled": False, "db": db, "reason": f'OPSMGR_LAB_DB="{db[:64]}" recusado: use {DB_PREFIX} ou {DB_PREFIX}_<sufixo> (minúsculas e dígitos).'}
    return {"enabled": True, "db": db, "uri": uri, "reason": None}


def _require(write: bool = False) -> tuple:
    cfg = config()
    if not cfg["enabled"]:
        raise LabError(503, f"Laboratório desligado: {cfg['reason']}")
    if write and not cfg["db"].endswith("_test") and os.environ.get("ALLOW_DEMO_DB_WRITE") != "1":
        raise LabError(403, f'Escrita recusada no banco "{cfg["db"]}": só bancos *_test, ou defina ALLOW_DEMO_DB_WRITE=1.')
    from pymongo import MongoClient  # import tardio: a demo simulada não precisa do driver

    if _CLIENT["uri"] != cfg["uri"]:
        if _CLIENT["client"] is not None:
            _CLIENT["client"].close()
        _CLIENT["client"] = MongoClient(cfg["uri"], serverSelectionTimeoutMS=8000, appname="opsmgr-demo-lab")
        _CLIENT["uri"] = cfg["uri"]
    return _CLIENT["client"], _CLIENT["client"][cfg["db"]], cfg


def _scenario(sid: str) -> dict:
    s = SCENARIOS.get(sid)
    if not s:
        raise LabError(404, f"Cenário {sid[:32]} não existe no laboratório.")
    return s


def index_name(s: dict) -> str:
    return INDEX_PREFIX + s["id"].replace("-", "_")


def explain_command(s: dict) -> dict:
    """O comando que vai para o servidor (`db.command`), com datas já convertidas."""
    from bson import json_util

    find = {"find": s["collection"], "filter": json_util.loads(json.dumps(s["filter"]))}
    if s.get("sort"):
        find["sort"] = dict(s["sort"])
    if s.get("limit"):
        find["limit"] = s["limit"]
    return {"explain": find, "verbosity": "executionStats"}


def create_index_command(s: dict) -> dict:
    return {"createIndexes": s["collection"], "indexes": [{"key": dict(s["index"]), "name": index_name(s)}]}


def shell(value) -> str:
    """Sintaxe do mongosh para o comando executado (datas viram ISODate).
    Mesma serialização de `shell()` no mock (paridade do texto exibido)."""
    if isinstance(value, dict):
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{shell(v)}" for k, v in value.items()) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(shell(v) for v in value) + "]"
    if isinstance(value, datetime):
        return f'ISODate("{value.strftime("%Y-%m-%dT%H:%M:%SZ")}")'
    return json.dumps(value, ensure_ascii=False)


def mql(s: dict) -> str:
    return f"db.runCommand({shell(explain_command(s))})"


def create_index_mql(s: dict) -> str:
    return f"db.runCommand({shell(create_index_command(s))})"


def public_scenarios() -> list:
    return [{
        "id": s["id"], "collection": s["collection"], "slow_ns": s["slow_ns"], "index": s["index"],
        "index_name": index_name(s), "why": s["why"], "mql": mql(s), "create_index_mql": create_index_mql(s),
    } for s in _SPEC["scenarios"]]


def status() -> dict:
    cfg = config()
    base = {"enabled": cfg["enabled"], "db": cfg["db"], "reason": cfg["reason"], "scenarios": public_scenarios()}
    if not cfg["enabled"]:
        return base
    try:
        client, db, _ = _require()
        meta = db.lab_meta.find_one({"_id": "seed"}) or {}
        existing = {}
        for s in _SPEC["scenarios"]:
            names = {ix["name"] for ix in db[s["collection"]].list_indexes()} if meta else set()
            existing[s["id"]] = index_name(s) in names
        return {**base, "server_version": client.server_info().get("version"),
                "seeded": meta.get("version") == SEED_VERSION, "counts": meta.get("counts", {}),
                "lab_indexes": existing}
    except LabError:
        raise
    except Exception as error:  # noqa: BLE001 — falha de infra vira estado, não 500
        return {**base, "enabled": False, "reason": f"MongoDB inacessível ({type(error).__name__}); a demo simulada continua."}


# ── Geração determinística dos dados fictícios ──────────────
def _docs(collection: str, rnd: random.Random) -> list:
    n = SIZES[collection]
    out = []
    if collection == "orders":
        for i in range(n):
            out.append({"orderId": f"O{i:06d}", "customerId": f"C{rnd.randrange(620):04d}",
                        "status": rnd.choice(["pending", "paid", "shipped", "delivered", "cancelled"]),
                        "total": round(rnd.uniform(10, 900), 2),
                        "createdAt": REFERENCE - timedelta(minutes=rnd.randrange(180 * 24 * 60))})
    elif collection == "sessions":
        for i in range(n):
            out.append({"sessionId": f"S{i:06d}", "userId": f"U{rnd.randrange(890):04d}",
                        "device": rnd.choice(["web", "ios", "android"]),
                        "expiresAt": REFERENCE + timedelta(minutes=rnd.randrange(-30 * 24 * 60, 30 * 24 * 60))})
    elif collection == "events":
        for i in range(n):
            out.append({"eventType": rnd.choice(EVENT_TYPES), "userId": f"U{rnd.randrange(890):04d}",
                        "timestamp": REFERENCE - timedelta(seconds=rnd.randrange(30 * 24 * 3600))})
    elif collection == "products":
        for i in range(n):
            out.append({"sku": f"P{i:05d}", "category": rnd.choice(CATEGORIES),
                        "price": round(rnd.uniform(5, 2000), 2), "stock": rnd.randrange(500)})
    return out


def _acquire():
    if not LAB_LOCK.acquire(blocking=False):
        raise LabError(409, "O laboratório está ocupado com outra operação; tente de novo em instantes.")


def seed(force: bool = False) -> dict:
    """Recria as quatro coleções fictícias. Idempotente: sem `force`, não refaz um seed válido."""
    client, db, cfg = _require(write=True)
    _acquire()
    try:
        meta = db.lab_meta.find_one({"_id": "seed"})
        if meta and meta.get("version") == SEED_VERSION and not force:
            return {"ok": True, "skipped": True, "counts": meta["counts"], "seconds": 0}
        # Invalida antes do drop: um seed interrompido não deixa o lab "pronto" pela metade.
        db.lab_meta.delete_one({"_id": "seed"})
        started = time.time()
        rnd = random.Random(42)
        counts = {}
        for name in SIZES:
            db.drop_collection(name)
            docs = _docs(name, rnd)
            for k in range(0, len(docs), 5000):
                db[name].insert_many(docs[k:k + 5000], ordered=False)
            for keys in BASELINE_INDEXES.get(name, []):
                db[name].create_index([keys])
            counts[name] = db[name].estimated_document_count()
        db.lab_meta.replace_one({"_id": "seed"}, {"_id": "seed", "version": SEED_VERSION, "counts": counts,
                                                  "at": datetime.now(timezone.utc)}, upsert=True)
        return {"ok": True, "skipped": False, "counts": counts, "seconds": round(time.time() - started, 1)}
    finally:
        LAB_LOCK.release()


def _walk_plan(node, stages: list, indexes: list):
    if not isinstance(node, dict):
        return
    if node.get("stage"):
        stages.append(node["stage"])
    if node.get("indexName"):
        indexes.append(node["indexName"])
    for key in ("queryPlan", "inputStage"):
        _walk_plan(node.get(key), stages, indexes)
    for child in node.get("inputStages", []) or []:
        _walk_plan(child, stages, indexes)


def _explain(db, s: dict) -> dict:
    out = db.command(explain_command(s))
    stages, indexes = [], []
    _walk_plan(out.get("queryPlanner", {}).get("winningPlan", {}), stages, indexes)
    ex = out.get("executionStats", {})
    return {
        "stages": stages,
        "plan": " → ".join(reversed(stages)),
        "collscan": "COLLSCAN" in stages,
        "in_memory_sort": "SORT" in stages,
        "index_used": indexes[0] if indexes else None,
        "docs_examined": ex.get("totalDocsExamined"),
        "keys_examined": ex.get("totalKeysExamined"),
        "returned": ex.get("nReturned"),
        "ms": ex.get("executionTimeMillis"),
    }


def _require_seed(db):
    meta = db.lab_meta.find_one({"_id": "seed"})
    if not meta or meta.get("version") != SEED_VERSION:
        raise LabError(409, "Laboratório ainda sem dados: rode \"Popular laboratório\" antes.")


def explain(sid: str) -> dict:
    s = _scenario(sid)
    _, db, cfg = _require()
    _acquire()  # não mede no meio de um seed, createIndex ou reset
    try:
        _require_seed(db)
        return {"scenario": sid, "db": cfg["db"], "mql": mql(s), "result": _explain(db, s)}
    finally:
        LAB_LOCK.release()


def create_index(sid: str) -> dict:
    s = _scenario(sid)
    _, db, cfg = _require(write=True)
    _acquire()
    try:
        _require_seed(db)
        coll = db[s["collection"]]
        if index_name(s) in {ix["name"] for ix in coll.list_indexes()}:
            raise LabError(409, f"O índice {index_name(s)} já existe no laboratório; use \"Desfazer índices\" para medir de novo.")
        before = _explain(db, s)
        started = time.time()
        db.command(create_index_command(s))
        build_ms = round((time.time() - started) * 1000)
        after = _explain(db, s)
        return {"scenario": sid, "db": cfg["db"], "mql": mql(s), "create_index_mql": create_index_mql(s),
                "build_ms": build_ms, "before": before, "after": after}
    finally:
        LAB_LOCK.release()


def reset_indexes() -> dict:
    """Remove só os índices criados pelo laboratório (prefixo opsmgr_lab_)."""
    _, db, _ = _require(write=True)
    _acquire()
    try:
        dropped = []
        existing = set(db.list_collection_names())
        for name in SIZES:
            if name not in existing:
                continue
            for ix in db[name].list_indexes():
                if ix["name"].startswith(INDEX_PREFIX):
                    db[name].drop_index(ix["name"])
                    dropped.append(f"{name}.{ix['name']}")
        return {"ok": True, "dropped": dropped}
    finally:
        LAB_LOCK.release()
