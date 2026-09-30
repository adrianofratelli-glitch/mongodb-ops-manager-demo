"""
MongoDB Ops Manager — Demo Backend (FastAPI)
Estado em memória, sem banco real. Serve os dados para o frontend React/LeafyGreen.
Rode com:  uvicorn main:app --reload --host 127.0.0.1 --port 8077
"""
import random
import re
import time
from ipaddress import ip_network
from threading import RLock
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from typing import Literal, Optional

import data

app = FastAPI(title="MongoDB Ops Manager — Demo API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5377", "http://localhost:5377"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Estado global em memória ─────────────────────────────────
STATE = data.seed()
STATE_LOCK = RLock()
AGENT_LATEST = "12.0.28"


@app.get("/health/live")
def health_live():
    return {"ok": True, "service": "ops-manager-demo"}


def find_cluster(cid: str):
    return next((c for c in STATE["clusters"] if c["id"] == cid), None)


# ── Modelos de request ───────────────────────────────────────
class NewCluster(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    type: Literal["Replica Set", "Sharded Cluster", "Standalone"]
    version: str = Field(default="7.0.5", pattern=r"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$")
    members: int = Field(default=3, ge=1, le=12)
    port: int = Field(default=27017, ge=1, le=65535)


class NewNode(BaseModel):
    host: Optional[str] = Field(default=None, min_length=3, max_length=255)
    role: Literal["PRIMARY", "SECONDARY", "Primary", "Secondary"] = "Secondary"

    @field_validator("host")
    @classmethod
    def valid_host(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,239}:\d{1,5}", value):
            raise ValueError("host deve usar o formato hostname:porta")
        port = int(value.rsplit(":", 1)[1])
        if not 1 <= port <= 65535:
            raise ValueError("porta fora da faixa válida")
        return value


class EditCluster(BaseModel):
    version: Optional[str] = Field(default=None, max_length=32, pattern=r"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$")
    oplog: Optional[str] = Field(default=None, max_length=32)
    cache: Optional[str] = Field(default=None, max_length=32)
    log_level: Optional[str] = Field(default=None, max_length=16)


class UpgradeReq(BaseModel):
    target_version: str = Field(max_length=32, pattern=r"^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$")


class NewUser(BaseModel):
    name: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._@-]+$")
    auth: Literal["SCRAM-SHA-1", "SCRAM-SHA-256", "LDAP", "X.509"] = "SCRAM-SHA-256"
    role: str = Field(default="read@analytics", min_length=3, max_length=128)


class NewRole(BaseModel):
    name: str = Field(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9._-]+$")
    priv: str = Field(default="find", min_length=1, max_length=128)
    inherits: str = Field(default="(none)", max_length=128)


class NewAlertConfig(BaseModel):
    cond: str = Field(min_length=1, max_length=160)
    thresh: str = Field(min_length=1, max_length=64)
    target: str = Field(min_length=1, max_length=128)
    notify: str = Field(default="Email", min_length=1, max_length=64)


class NewRestore(BaseModel):
    cluster: str = Field(min_length=1, max_length=64)
    point: str = Field(min_length=1, max_length=32)
    target: str = Field(default="same", max_length=64)


class NewIP(BaseModel):
    ip: str = Field(min_length=3, max_length=64)
    comment: str = Field(default="", max_length=240)

    @field_validator("ip")
    @classmethod
    def valid_network(cls, value: str) -> str:
        try:
            ip_network(value, strict=False)
        except ValueError as error:
            raise ValueError("IP ou CIDR inválido") from error
        return value


# ════════════════════════════════════════════════════════════
# META / DASHBOARD
# ════════════════════════════════════════════════════════════
@app.get("/api/meta")
def get_meta():
    return {"org": STATE["org"], "project": STATE["project"]}


@app.get("/api/dashboard")
def get_dashboard():
    clusters = STATE["clusters"]
    total = len(clusters)
    healthy = sum(1 for c in clusters if c["status"] == "healthy")
    warn = sum(1 for c in clusters if c["status"] in ("warning", "critical"))
    hosts = sum(len(c["nodes"]) for c in clusters)
    return {
        "total_clusters": total,
        "healthy": healthy,
        "warning": warn,
        "hosts": hosts,
        "open_alerts": len(STATE["alerts_open"]),
        "top_alert": _top_alert(),
        "snapshots": len(STATE["snapshots"]) + STATE["snapshot_base"],
        "clusters": clusters,
        "activity": STATE["activity"][:3],
    }



# ── Coerência entre cluster, agents e alertas ────────────────
RESYNC_SECONDS = 25


def _agent_type(role):
    return "Automation + Monitoring" if role in ("mongos", "Config Server", "Standalone") else "Automation + Monitoring + Backup"


def _register_agents(cluster):
    """Todo nó provisionado ganha um agent — como no Ops Manager real."""
    for n in cluster["nodes"]:
        host = n["host"].split(":")[0]
        if any(a["host"] == host for a in STATE["agents"]):
            continue
        STATE["agents"].append({
            "host": host, "status": "Running", "version": STATE.get("agent_version", "12.0.27"),
            "type": _agent_type(n["role"]), "ping": "just now", "cluster": cluster["name"],
        })


def _drop_agents(cluster):
    hosts = {n["host"].split(":")[0] for n in cluster["nodes"]}
    STATE["agents"] = [a for a in STATE["agents"] if a["host"] not in hosts]


def _close_alerts_for(cluster_name):
    """Alerta de cluster que não existe mais vira ruído na demo: fecha junto."""
    keep, closed = [], 0
    for a in STATE["alerts_open"]:
        if a["target"].split(" / ")[0] == cluster_name:
            closed += 1
        else:
            keep.append(a)
    STATE["alerts_open"] = keep
    STATE["alerts_closed_count"] += closed
    return closed


def _expire_resyncs():
    """Resync é temporário: passado o prazo, o nó volta a green sozinho."""
    now = time.time()
    with STATE_LOCK:
        for c in STATE["clusters"]:
            for n in c["nodes"]:
                until = n.get("resync_until")
                if until and now >= until:
                    n.pop("resync_until", None)
                    n["status"] = "green"
                    n["state"] = None
                    n["lag"] = "0.0s" if n["role"] == "SECONDARY" else "—"


def _top_alert():
    """O alerta que o banner deve mostrar: o mais severo ainda não reconhecido."""
    ordem = {"crit": 0, "warn": 1, "info": 2}
    abertos = [a for a in STATE["alerts_open"] if not a.get("acked")]
    if not abertos:
        return None
    a = sorted(abertos, key=lambda x: ordem.get(x["sev"], 9))[0]
    return {"id": a["id"], "sev": a["sev"], "title": a["title"], "target": a["target"], "detail": a["detail"]}


# ════════════════════════════════════════════════════════════
# CLUSTERS / DEPLOYMENTS
# ════════════════════════════════════════════════════════════
@app.get("/api/clusters")
def list_clusters():
    _expire_resyncs()
    return STATE["clusters"]


@app.post("/api/clusters")
def create_cluster(req: NewCluster):
    name = req.name.strip()
    if not name:
        raise HTTPException(422, "Nome do cluster é obrigatório.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", name):
        raise HTTPException(422, "Nome inválido: use letras, números, ponto, hífen ou underscore (até 64).")
    req.name = name
    with STATE_LOCK:
        if find_cluster(req.name):
            raise HTTPException(409, f'Cluster "{req.name}" já existe.')
        type_key = {"Replica Set": "rs", "Sharded Cluster": "sharded", "Standalone": "standalone"}[req.type]
        members = 1 if type_key == "standalone" else req.members
        nodes = []
        for i in range(members):
            role = "Standalone" if type_key == "standalone" else ("PRIMARY" if i == 0 else "SECONDARY")
            nodes.append({
                "host": f"{req.name}-node-0{i+1}.mongodb-brazil.internal:{req.port}",
                "role": role, "version": req.version, "status": "green",
                "uptime": "just now", "conn": 0, "disk": 5, "lag": "—" if i == 0 else "0.0s",
            })
        cluster = {"id": req.name, "type": type_key, "name": req.name, "version": req.version, "status": "healthy", "nodes": nodes}
        STATE["clusters"].append(cluster)
        _register_agents(cluster)
        _log_activity("admin@mongodb-brazil.com", "CREATE", req.name, f"Provisioned {req.type} with {members} node(s)")
    return cluster


@app.delete("/api/clusters/{cid}")
def delete_cluster(cid: str):
    with STATE_LOCK:
        c = find_cluster(cid)
        if not c:
            raise HTTPException(404, "Cluster não encontrado")
        STATE["clusters"].remove(c)
        _drop_agents(c)
        closed = _close_alerts_for(c["name"])
        _log_activity("admin@mongodb-brazil.com", "TERMINATE", cid, "Cluster terminated")
        if closed:
            _log_activity("System", "ALERT CLOSE", cid, f"{closed} alerta(s) fechado(s) junto com o cluster")
    return {"ok": True, "agents_removed": True, "alerts_closed": closed}


@app.put("/api/clusters/{cid}")
def edit_cluster(cid: str, req: EditCluster):
    with STATE_LOCK:
        c = find_cluster(cid)
        if not c:
            raise HTTPException(404, "Cluster não encontrado")
        if req.version:
            c["version"] = req.version
            for n in c["nodes"]:
                n["version"] = req.version
        _log_activity("admin@mongodb-brazil.com", "EDIT", cid, "Config applied via Automation")
    return c


@app.post("/api/clusters/{cid}/nodes")
def add_node(cid: str, req: NewNode):
    with STATE_LOCK:
        c = find_cluster(cid)
        if not c:
            raise HTTPException(404, "Cluster não encontrado")
        if len(c["nodes"]) >= 12:
            raise HTTPException(409, "O deployment já atingiu o limite de 12 nós da demo.")
        host = req.host or f"{c['name']}-node-0{len(c['nodes'])+1}.mongodb-brazil.internal:27017"
        if any(node["host"] == host for node in c["nodes"]):
            raise HTTPException(409, "Host já pertence ao deployment.")
        c["nodes"].append({"host": host, "role": "SECONDARY", "version": c["version"], "status": "green", "uptime": "just now", "conn": 0, "disk": 3, "lag": "0.0s"})
        _register_agents(c)
        _log_activity("admin@mongodb-brazil.com", "ADD NODE", c["name"], f"Nó {host} adicionado ao replica set")
    return c


@app.post("/api/clusters/{cid}/stepdown")
def step_down(cid: str, node_idx: int = 0):
    with STATE_LOCK:
        c = find_cluster(cid)
        if not c:
            raise HTTPException(404, "Cluster não encontrado")
        if not 0 <= node_idx < len(c["nodes"]):
            raise HTTPException(404, "Nó não encontrado")
        old = next((n for n in c["nodes"] if n["role"] == "PRIMARY"), None)
        new = next((n for i, n in enumerate(c["nodes"]) if i != node_idx and n["role"] == "SECONDARY"), None)
        if not old or not new:
            raise HTTPException(409, "Step down exige um PRIMARY e ao menos um SECONDARY elegível.")
        old["role"] = "SECONDARY"
        new["role"] = "PRIMARY"
        old["lag"] = "0.0s"
        new["lag"] = "—"
        _log_activity("admin@mongodb-brazil.com", "STEP DOWN", c["name"], f"Novo PRIMARY: {new['host']}")
    return {"new_primary": new["host"], "cluster": c}


@app.post("/api/clusters/{cid}/resync")
def resync_node(cid: str, node_idx: int = 0):
    """Initial sync: o nó sai do quórum de leitura por alguns segundos e volta sozinho."""
    with STATE_LOCK:
        c = find_cluster(cid)
        if not c:
            raise HTTPException(404, "Cluster não encontrado")
        if not 0 <= node_idx < len(c["nodes"]):
            raise HTTPException(404, "Nó não encontrado")
        n = c["nodes"][node_idx]
        if n["role"] == "PRIMARY":
            raise HTTPException(409, "Faça step down antes de ressincronizar o PRIMARY.")
        n["status"] = "yellow"
        n["state"] = "STARTUP2"
        n["lag"] = "sync"
        n["resync_until"] = time.time() + RESYNC_SECONDS
        _log_activity("admin@mongodb-brazil.com", "RESYNC", c["name"], f"Initial sync iniciado em {n['host']}")
    return {"ok": True, "seconds": RESYNC_SECONDS, "cluster": c}


@app.post("/api/clusters/{cid}/upgrade")
def upgrade_cluster(cid: str, req: UpgradeReq):
    with STATE_LOCK:
        c = find_cluster(cid)
        if not c:
            raise HTTPException(404, "Cluster não encontrado")
        c["version"] = req.target_version
        for n in c["nodes"]:
            n["version"] = req.target_version
        _log_activity("System", "UPGRADE", cid, f"Rolling upgrade to {req.target_version}")
    return c


# ════════════════════════════════════════════════════════════
# AUTOMATION / AGENTS
# ════════════════════════════════════════════════════════════
@app.get("/api/automation")
def get_automation():
    return {
        "agents_active": len(STATE["agents"]),
        "pending": STATE["pending_changes"],
        "history": STATE["automation_history"],
    }


@app.post("/api/automation/pending/{pid}/apply")
def apply_pending(pid: str):
    with STATE_LOCK:
        pc = next((p for p in STATE["pending_changes"] if p["id"] == pid), None)
        if not pc:
            raise HTTPException(404, "Mudança não encontrada")
        STATE["pending_changes"].remove(pc)
        STATE["automation_history"].insert(0, {
            "time": "agora", "cluster": pc["cluster"], "change": pc["desc"],
            "status": "success", "duration": f"{random.randint(2,9)}m {random.randint(0,59)}s", "by": "admin",
        })
    return {"ok": True, "pending": STATE["pending_changes"]}


@app.delete("/api/automation/pending/{pid}")
def discard_pending(pid: str):
    with STATE_LOCK:
        pc = next((p for p in STATE["pending_changes"] if p["id"] == pid), None)
        if not pc:
            raise HTTPException(404, "Mudança não encontrada")
        STATE["pending_changes"].remove(pc)
    return {"ok": True, "pending": STATE["pending_changes"]}


@app.get("/api/agents")
def get_agents():
    versions = {a["version"] for a in STATE["agents"]}
    current = sorted(versions)[0] if versions else STATE.get("agent_version", "12.0.27")
    running = sum(1 for a in STATE["agents"] if a["status"] == "Running")
    return {"agents": STATE["agents"], "version": current, "latest": AGENT_LATEST, "running": running}


@app.get("/api/agents/{host}/logs")
def get_agent_logs(host: str):
    a = next((x for x in STATE["agents"] if x["host"] == host), None)
    if not a:
        raise HTTPException(404, "Agent não encontrado")
    now = datetime.now()
    linhas = [
        (0, "INFO", f"Agent {a['version']} iniciado em {a['host']}"),
        (3, "INFO", f"Registrado no grupo do projeto {STATE['project']} (cluster {a['cluster']})"),
        (9, "INFO", "Plano de automação recebido: nenhuma mudança pendente"),
        (14, "INFO", f"Ping de monitoramento enviado ({a['ping']})"),
        (26, "INFO", "Coleta de métricas: 42 métricas publicadas"),
        (41, "WARN", "Latência do ping acima de 250ms — reavaliando na próxima janela"),
        (58, "INFO", "Backup daemon: oplog slice aplicado"),
    ]
    return {
        "host": a["host"], "cluster": a["cluster"], "version": a["version"],
        "lines": [
            {"ts": (now - timedelta(seconds=off)).strftime("%H:%M:%S"), "level": lvl, "msg": msg}
            for off, lvl, msg in linhas
        ],
    }


@app.post("/api/agents/upgrade")
def upgrade_agents():
    with STATE_LOCK:
        for a in STATE["agents"]:
            a["version"] = AGENT_LATEST
        STATE["agent_version"] = AGENT_LATEST
        _log_activity("admin@mongodb-brazil.com", "AGENT UPGRADE", "Automation", f"{len(STATE['agents'])} agent(s) em {AGENT_LATEST}")
    return {"ok": True, "version": AGENT_LATEST}


# ════════════════════════════════════════════════════════════
# MONITORING / PERFORMANCE / REAL-TIME (gerados dinamicamente)
# ════════════════════════════════════════════════════════════
WINDOW = 60  # pontos do gráfico = janela de 1 minuto a 1 ponto/segundo

# Random walk com reversão à média por cluster: as séries continuam de onde
# pararam, então o gráfico "anda" em vez de sortear tudo de novo a cada refresh.
_WALKS: dict = {}


def _walk(store, key, base, noise, mn=0.0, mx=None, nd=1):
    v = store.get(key, base)
    v += (base - v) * 0.12 + (random.random() - 0.5) * noise
    v = max(mn, v)
    if mx is not None:
        v = min(mx, v)
    store[key] = v
    return round(v, nd)


def _short(node):
    return node["host"].split(":")[0].split(".")[0]


def _lag_base(node):
    """Nó em resync ou degradado atrasa mais — o gráfico conta a mesma história da tabela."""
    if node.get("resync_until"):
        return 3.0
    if node.get("status") == "yellow":
        return 1.2
    try:
        return max(0.1, float(str(node.get("lag", "0.2s")).rstrip("s")))
    except ValueError:
        return 0.3


def _point(c):
    """Uma amostra instantânea de todas as métricas do cluster.

    As bases saem do estado do próprio cluster: um nó amarelo ou com disco
    cheio aparece com CPU e I/O mais altos, e um nó em resync dispara o lag.
    Assim as ações da demo (step down, resync, add node) mudam o gráfico.
    """
    _expire_resyncs()
    store = _WALKS.setdefault(c["id"], {})
    cpu = []
    for i, node in enumerate(c["nodes"]):
        base = store.setdefault(f"cpub{i}", 30 + random.random() * 20)
        if node.get("status") == "yellow":
            base += 22          # nó degradado trabalha mais
        if node.get("resync_until"):
            base += 30          # initial sync satura CPU e disco
        if node.get("disk", 0) >= 85:
            base += 8
        cpu.append({"label": _short(node), "value": _walk(store, f"cpu{i}", min(98, base), 12, 0, 100)})
    lag = [
        {"label": _short(s), "value": _walk(store, f"lag{i}", _lag_base(s), 0.4, 0, 8, 2)}
        for i, s in enumerate(n for n in c["nodes"] if "SECONDARY" in n["role"])
    ]
    # carga proporcional ao tamanho e à saúde do deployment
    conns = sum(n.get("conn", 0) for n in c["nodes"]) or 40
    peso = len(c["nodes"])
    resync = any(n.get("resync_until") for n in c["nodes"])
    return {
        "t": int(time.time() * 1000),
        "cpu": cpu,
        "lag": lag,
        "memory": {"resident": _walk(store, "memr", 4 + 2.6 * peso, 1.5, 0, 32), "virtual": _walk(store, "memv", 8 + 5 * peso, 2, 0, 32)},
        "ops": {
            "query": _walk(store, "opq", conns * 3.5, 200),
            "insert": _walk(store, "opi", conns * 1.1, 80),
            "update": _walk(store, "opu", conns * 0.4, 40),
            "delete": _walk(store, "opd", conns * 0.06, 8),
        },
        "connections": {"current": _walk(store, "conc", conns, max(10, conns * 0.12)), "available": _walk(store, "cona", 1000 - conns, 20)},
        "iops": {"read": _walk(store, "ior", 620 + (900 if resync else 0), 120), "write": _walk(store, "iow", 310 + (600 if resync else 0), 80)},
        "network": {"in": _walk(store, "neti", 12, 3), "out": _walk(store, "neto", 8, 2)},
        "cache": {"used": _walk(store, "cacu", 3.2, 0.3, 0, 4), "dirty": _walk(store, "cacd", 0.4, 0.15, 0, 4, 2)},
    }


def _flatten(points):
    """Converte a lista de amostras nas séries que o gráfico consome."""
    first = points[-1]
    col = lambda f: [f(p) for p in points]
    return {
        "t": col(lambda p: p["t"]),
        "cpu": [{"label": s["label"], "data": col(lambda p, i=i: p["cpu"][i]["value"])} for i, s in enumerate(first["cpu"])],
        "lag": [{"label": s["label"], "data": col(lambda p, i=i: p["lag"][i]["value"])} for i, s in enumerate(first["lag"])],
        "memory": {k: col(lambda p, k=k: p["memory"][k]) for k in ("resident", "virtual")},
        "ops": {k: col(lambda p, k=k: p["ops"][k]) for k in ("query", "insert", "update", "delete")},
        "connections": {k: col(lambda p, k=k: p["connections"][k]) for k in ("current", "available")},
        "iops": {k: col(lambda p, k=k: p["iops"][k]) for k in ("read", "write")},
        "network": {k: col(lambda p, k=k: p["network"][k]) for k in ("in", "out")},
        "cache": {k: col(lambda p, k=k: p["cache"][k]) for k in ("used", "dirty")},
    }


@app.get("/api/metrics/{cid}")
def get_metrics(cid: str):
    """Histórico inicial: WINDOW amostras terminando agora."""
    c = find_cluster(cid)
    if not c:
        raise HTTPException(404, "Cluster não encontrado")
    _WALKS.pop(cid, None)
    now = int(time.time() * 1000)
    points = []
    for k in range(WINDOW):
        p = _point(c)
        p["t"] = now - (WINDOW - 1 - k) * 1000
        points.append(p)
    return {"cluster": c["name"], "node_count": len(c["nodes"]), "window": WINDOW, **_flatten(points)}


@app.get("/api/metrics/{cid}/tick")
def get_metrics_tick(cid: str):
    """Próxima amostra — o frontend empurra no fim da janela e descarta a mais antiga."""
    c = find_cluster(cid)
    if not c:
        raise HTTPException(404, "Cluster não encontrado")
    return _point(c)


# Operações vivas por cluster: precisam persistir entre polls para o Kill valer.
_RT_OPS: dict = {}
_RT_NS = ["app_db.orders", "app_db.sessions", "analytics.events", "app_db.products", "app_db.users"]
_RT_KINDS = ["query", "insert", "update", "getmore", "command", "aggregate"]


def _rt_new_op():
    return {
        "opid": random.randint(10000, 99999),
        "op": random.choice(_RT_KINDS),
        "ns": random.choice(_RT_NS),
        "secs": round(random.random() * 0.4, 2),
        "client": f"10.0.{random.randint(1, 4)}.{random.randint(10, 200)}:{random.randint(40000, 60000)}",
    }


@app.get("/api/realtime/{cid}")
def get_realtime(cid: str):
    c = find_cluster(cid)
    if not c:
        raise HTTPException(404, "Cluster não encontrado")
    ops = _RT_OPS.setdefault(cid, [_rt_new_op() for _ in range(3)])
    # operações avançam, terminam e novas entram — como no painel real
    for o in ops:
        o["secs"] = round(o["secs"] + 0.3 + random.random() * 0.7, 2)
    ops = [o for o in ops if o["secs"] < 4]
    while len(ops) < random.randint(2, 5):
        ops.append(_rt_new_op())
    _RT_OPS[cid] = ops

    store = _WALKS.setdefault(cid, {})
    hottest = sorted(
        ({"ns": ns, "ops": int(_walk(store, f"hot:{ns}", 120 + 90 * i, 90, 10))} for i, ns in enumerate(reversed(_RT_NS))),
        key=lambda x: -x["ops"],
    )
    conns = sum(n.get("conn", 0) for n in c["nodes"]) or 1
    return {
        "cluster": c["name"],
        "ops_per_sec": int(_walk(store, "rtops", 1800, 300, 100)),
        "connections": int(_walk(store, "rtconn", conns, max(10, conns * 0.1), 0)),
        "net_in": _walk(store, "neti", 12, 3),
        "net_out": _walk(store, "neto", 8, 2),
        "docs_per_sec": _walk(store, "rtdocs", 25, 6, 0),
        "in_progress": ops,
        "hottest": hottest,
    }


@app.post("/api/realtime/{cid}/kill/{opid}")
def kill_op(cid: str, opid: int):
    with STATE_LOCK:
        ops = _RT_OPS.get(cid, [])
        alvo = next((o for o in ops if o["opid"] == opid), None)
        if not alvo:
            raise HTTPException(404, "Operação já terminou ou não existe.")
        _RT_OPS[cid] = [o for o in ops if o["opid"] != opid]
        _log_activity("admin@mongodb-brazil.com", "KILL OP", cid, f"db.killOp({opid}) em {alvo['ns']}")
    return {"ok": True, "killed": alvo}


# Última leitura do Performance Advisor, para calcular a variação "vs scan anterior"
# em vez de exibir um percentual fixo desconectado dos números mostrados.
_PERF_LAST_AVG_MS = {"value": None}


@app.get("/api/perf-advisor")
def get_perf_advisor():
    """Números sintéticos, recalculados a cada chamada (inclui o "Re-scan" do
    frontend) dentro de uma faixa plausível — para não parecer um botão morto,
    mas sem fingir que uma varredura real aconteceu."""
    slow_count = random.randint(110, 145)
    avg_query_ms = round(random.uniform(6.5, 10.5), 1)
    collections_scanned = random.randint(38, 48)
    previous = _PERF_LAST_AVG_MS["value"]
    delta_pct = round((avg_query_ms - previous) / previous * 100, 1) if previous else 0.0
    _PERF_LAST_AVG_MS["value"] = avg_query_ms
    return {
        "index_suggestions": STATE["perf_index_suggestions"],
        "slow_queries": STATE["perf_slow_queries"],
        "slow_count": slow_count,
        "avg_query_ms": avg_query_ms,
        "avg_query_delta_pct": delta_pct,
        "collections_scanned": collections_scanned,
        "simulated": True,
    }


@app.post("/api/perf-advisor/index/{idx}")
def create_index(idx: int):
    with STATE_LOCK:
        if 0 <= idx < len(STATE["perf_index_suggestions"]):
            removed = STATE["perf_index_suggestions"].pop(idx)
            return {"ok": True, "created": removed, "remaining": STATE["perf_index_suggestions"]}
        raise HTTPException(404, "Sugestão não encontrada")


# ════════════════════════════════════════════════════════════
# BACKUP / RESTORE
# ════════════════════════════════════════════════════════════
@app.get("/api/backup")
def get_backup():
    protected = sum(1 for c in STATE["clusters"] if c["type"] != "standalone")
    return {
        "protected": protected,
        "total_snapshots": len(STATE["snapshots"]) + STATE["snapshot_base"],
        "snapshots": STATE["snapshots"],
    }


@app.post("/api/backup/snapshot")
def take_snapshot(cluster: str):
    with STATE_LOCK:
        if not any(c["name"] == cluster for c in STATE["clusters"]):
            raise HTTPException(404, f'Cluster "{cluster}" não encontrado.')
        last_num = int(STATE["snapshots"][0]["id"].split("-")[1]) if STATE["snapshots"] else 142
        snap = {"id": f"snap-{str(last_num+1).zfill(5)}", "cluster": cluster, "type": "Manual", "created": "agora", "size": "42 GB", "expires": "2024-02-15", "status": "ready"}
        STATE["snapshots"].insert(0, snap)
    return snap


@app.delete("/api/backup/snapshot/{sid}")
def delete_snapshot(sid: str):
    with STATE_LOCK:
        s = next((x for x in STATE["snapshots"] if x["id"] == sid), None)
        if not s:
            raise HTTPException(404, "Snapshot não encontrado")
        STATE["snapshots"].remove(s)
    return {"ok": True}


# ── Restore jobs: mesmo padrão do resync de nó (queued → running → completed
# ao longo de alguns segundos, evoluindo sozinho sem intervenção do cliente) ──
RESTORE_RUNNING_SECONDS = 3
RESTORE_TOTAL_SECONDS = 9


def _update_restore_jobs():
    now = time.time()
    with STATE_LOCK:
        for j in STATE["restore_jobs"]:
            running_at = j.get("_running_at")
            done_at = j.get("_done_at")
            if j["status"] == "queued" and running_at and now >= running_at:
                j["status"] = "running"
            if j["status"] in ("queued", "running") and done_at and now >= done_at:
                j["status"] = "completed"


def _public_job(j):
    return {k: v for k, v in j.items() if not k.startswith("_")}


@app.get("/api/restore")
def get_restore_jobs():
    _update_restore_jobs()
    return [_public_job(j) for j in STATE["restore_jobs"]]


@app.post("/api/restore")
def start_restore(req: NewRestore):
    with STATE_LOCK:
        c = find_cluster(req.cluster)
        if not c:
            raise HTTPException(404, f'Cluster "{req.cluster}" não encontrado.')
        last_num = int(STATE["restore_jobs"][0]["id"].split("-")[1]) if STATE["restore_jobs"] else 142
        now = time.time()
        job = {
            "id": f"rst-{str(last_num+1).zfill(5)}",
            "cluster": req.cluster,
            "type": "PIT",
            "point": req.point,
            "target": req.target,
            "status": "queued",
            "started": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "_running_at": now + RESTORE_RUNNING_SECONDS,
            "_done_at": now + RESTORE_TOTAL_SECONDS,
        }
        STATE["restore_jobs"].insert(0, job)
        _log_activity("admin@mongodb-brazil.com", "RESTORE", req.cluster, f"Point-in-time restore iniciado ({req.point} → {req.target})")
    return {"ok": True, "seconds": RESTORE_TOTAL_SECONDS, "job": _public_job(job)}


# ════════════════════════════════════════════════════════════
# ALERTS
# ════════════════════════════════════════════════════════════
ACK_MINUTES = 60


def _expire_acks():
    """Acknowledge silencia o alerta por uma hora; depois ele volta a gritar."""
    now = time.time()
    with STATE_LOCK:
        for a in STATE["alerts_open"]:
            if a.get("acked_until") and now >= a["acked_until"]:
                a.pop("acked_until", None)
                a["acked"] = False


@app.get("/api/alerts")
def get_alerts():
    _expire_acks()
    return {
        "open": STATE["alerts_open"],
        "closed_count": STATE["alerts_closed_count"],
        "configs": STATE["alert_configs"],
    }


@app.post("/api/alerts/{aid}/acknowledge")
def acknowledge_alert(aid: int):
    with STATE_LOCK:
        a = next((x for x in STATE["alerts_open"] if x["id"] == aid), None)
        if not a:
            raise HTTPException(404, "Alerta não encontrado")
        if a.get("acked"):
            raise HTTPException(409, "Alerta já reconhecido.")
        a["acked"] = True
        a["acked_until"] = time.time() + ACK_MINUTES * 60
        a["acked_by"] = "admin@mongodb-brazil.com"
        _log_activity("admin@mongodb-brazil.com", "ALERT ACK", a["target"], f"{a['title']} silenciado por {ACK_MINUTES}min")
    return {"ok": True, "alert": a, "minutes": ACK_MINUTES}


@app.post("/api/alerts/{aid}/resolve")
def resolve_alert(aid: int):
    with STATE_LOCK:
        a = next((x for x in STATE["alerts_open"] if x["id"] == aid), None)
        if not a:
            raise HTTPException(404, "Alerta não encontrado")
        STATE["alerts_open"].remove(a)
        STATE["alerts_closed_count"] += 1
        _log_activity("admin@mongodb-brazil.com", "ALERT RESOLVE", a["target"], a["title"])
    return {"ok": True, "open": STATE["alerts_open"], "closed_count": STATE["alerts_closed_count"]}


@app.post("/api/alerts/configs")
def add_alert_config(req: NewAlertConfig):
    with STATE_LOCK:
        cfg = {"cond": req.cond, "target": req.target, "thresh": req.thresh, "notify": req.notify, "on": True}
        STATE["alert_configs"].insert(0, cfg)
    return cfg


@app.delete("/api/alerts/configs/{idx}")
def delete_alert_config(idx: int):
    with STATE_LOCK:
        if 0 <= idx < len(STATE["alert_configs"]):
            STATE["alert_configs"].pop(idx)
            return {"ok": True}
        raise HTTPException(404, "Config não encontrada")


# ════════════════════════════════════════════════════════════
# SECURITY
# ════════════════════════════════════════════════════════════
@app.get("/api/users")
def get_users():
    return STATE["users"]


@app.post("/api/users")
def add_user(req: NewUser):
    with STATE_LOCK:
        name = req.name.strip()
        if not name:
            raise HTTPException(422, "Username é obrigatório.")
        if any(x["name"] == name for x in STATE["users"]):
            raise HTTPException(409, f'Usuário "{name}" já existe.')
        req.name = name
        u = {"name": req.name, "auth": req.auth, "roles": [req.role], "db": req.role.split("@")[-1] if "@" in req.role else "admin", "created": "just now", "status": "active"}
        STATE["users"].insert(0, u)
        _log_activity("admin@mongodb-brazil.com", "USER CREATE", "Security", f"New user: {req.name}")
    return u


@app.delete("/api/users/{name}")
def delete_user(name: str):
    with STATE_LOCK:
        u = next((x for x in STATE["users"] if x["name"] == name), None)
        if not u:
            raise HTTPException(404, "Usuário não encontrado")
        STATE["users"].remove(u)
    return {"ok": True}


@app.get("/api/roles")
def get_roles():
    return STATE["roles"]


@app.post("/api/roles")
def add_role(req: NewRole):
    with STATE_LOCK:
        r = {"name": req.name, "priv": req.priv, "inherits": req.inherits, "users": 0}
        STATE["roles"].insert(0, r)
    return r


@app.delete("/api/roles/{idx}")
def delete_role(idx: int):
    with STATE_LOCK:
        if 0 <= idx < len(STATE["roles"]):
            STATE["roles"].pop(idx)
            return {"ok": True}
        raise HTTPException(404, "Role não encontrada")


@app.get("/api/security/ip")
def get_ips():
    return STATE["ip_access_list"]


@app.post("/api/security/ip")
def add_ip(req: NewIP):
    with STATE_LOCK:
        entry = {"ip": req.ip, "comment": req.comment or "—", "added": "just now"}
        STATE["ip_access_list"].append(entry)
    return entry


@app.delete("/api/security/ip/{idx}")
def delete_ip(idx: int):
    with STATE_LOCK:
        if 0 <= idx < len(STATE["ip_access_list"]):
            STATE["ip_access_list"].pop(idx)
            return {"ok": True}
        raise HTTPException(404, "IP não encontrado")


@app.get("/api/audit")
def get_audit():
    return STATE["audit_events"]


# ════════════════════════════════════════════════════════════
# ACTIVITY / RESET
# ════════════════════════════════════════════════════════════
@app.get("/api/activity")
def get_activity():
    return STATE["activity"]


def _log_activity(user, action, resource, details):
    STATE["activity"].insert(0, {"time": "agora", "user": user, "action": action, "resource": resource, "details": details})


@app.post("/api/reset")
def reset_demo():
    global STATE
    with STATE_LOCK:
        STATE = data.seed()
        _WALKS.clear()
        _RT_OPS.clear()
    return {"ok": True}


@app.get("/")
def root():
    return {"service": "MongoDB Ops Manager — Demo API", "docs": "/docs", "status": "ok"}
