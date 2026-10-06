// ──────────────────────────────────────────────────────────────
// MODO MOCK — replica o backend FastAPI 100% no cliente.
// Usado no build estático (GitHub Pages) onde não há backend Python.
// Mesma interface do RealAPI (axios) — todos os métodos retornam Promise.
// O seed é o MESMO arquivo que o backend lê (seed.json) e as regras são
// verificadas pelos mesmos cenários (backend/tests/scenarios_adversarial.json,
// executados aqui por frontend/tests/mock_parity.mjs).
// Tudo é SIMULADO: nada fala com um Ops Manager real.
// ──────────────────────────────────────────────────────────────
import SEED from './seed.json' with { type: 'json' }

const seed = () => JSON.parse(JSON.stringify(SEED))

let STATE = seed()
const ok = (v) => Promise.resolve(v)
// Mesmo formato de erro do axios, para as páginas lerem error.response.data.detail
const fail = (detail, status = 409) => Promise.reject(Object.assign(new Error(detail), { response: { status, data: { detail } } }))
class ApiError extends Error { constructor(detail, status = 409) { super(detail); this.detail = detail; this.status = status } }
// Executa uma mutação; ApiError vira rejeição no formato axios.
const run = (fn) => { try { return ok(fn()) } catch (e) { if (e instanceof ApiError) return fail(e.detail, e.status); throw e } }
const findCluster = (id) => STATE.clusters.find((c) => c.id === id)
const ADMIN = 'admin@mongodb-brazil.com'
const pad = (n) => String(n).padStart(2, '0')
const fmtTs = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
const nowStr = () => fmtTs(new Date(Date.now()))
const logActivity = (user, action, resource, details) => STATE.activity.unshift({ time: nowStr(), user, action, resource, details })
// Aceita "AAAA-MM-DD HH:MM" e "AAAA-MM-DDTHH:MM[:SS]" como UTC; null se inválido.
function parseTs(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(v || ''))
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)))
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null
}

const RELEASE_SERIES = ['4.4', '5.0', '6.0', '7.0', '8.0']
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/
const UPGRADE_SECONDS_PER_NODE = 3
const vtuple = (v) => v.split('-')[0].split('.').map(Number)
const series = (v) => vtuple(v).slice(0, 2).join('.')
const cmpV = (a, b) => { const x = vtuple(a), y = vtuple(b); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i] } return 0 }
function checkKnownVersion(v) {
  if (!VERSION_RE.test(v || '')) throw new ApiError('Versão inválida.', 422)
  if (!RELEASE_SERIES.includes(series(v))) throw new ApiError(`Versão ${v} fora do catálogo da demo (release series ${RELEASE_SERIES.join(', ')}).`, 422)
}
const WINDOW = 60 // janela de 1 minuto a 1 ponto/segundo

// Random walk com reversão à média por cluster — mesma lógica do backend.
const WALKS = {}
function walk(store, key, base, noise, mn = 0, mx = null, nd = 1) {
  let v = store[key] === undefined ? base : store[key]
  v += (base - v) * 0.12 + (Math.random() - 0.5) * noise
  v = Math.max(mn, v)
  if (mx !== null) v = Math.min(mx, v)
  store[key] = v
  const f = Math.pow(10, nd)
  return Math.round(v * f) / f
}
const shortHost = (node) => node.host.split(':')[0].split('.')[0]


const AGENT_LATEST = '12.0.28'
const RESYNC_SECONDS = 25
const ACK_MINUTES = 60
const RESTORE_RUNNING_SECONDS = 3
const RESTORE_TOTAL_SECONDS = 9
let perfLastAvgMs = null

function updateRestoreJobs() {
  const now = Date.now()
  STATE.restore_jobs.forEach((j) => {
    if (j.status === 'queued' && j._runningAt && now >= j._runningAt) j.status = 'running'
    if ((j.status === 'queued' || j.status === 'running') && j._doneAt && now >= j._doneAt) j.status = 'completed'
  })
}
const publicJob = (j) => Object.fromEntries(Object.entries(j).filter(([k]) => !k.startsWith('_')))

// ── Coerência entre cluster, agents e alertas (espelha o backend) ──
const agentType = (role) => (['mongos', 'Config Server', 'Standalone'].includes(role) ? 'Automation + Monitoring' : 'Automation + Monitoring + Backup')
function registerAgents(cluster) {
  cluster.nodes.forEach((n) => {
    const host = n.host.split(':')[0]
    if (STATE.agents.some((a) => a.host === host)) return
    STATE.agents.push({ host, status: 'Running', version: STATE.agent_version || '12.0.27', type: agentType(n.role), ping: 'just now', cluster: cluster.name })
  })
}
function dropAgents(cluster) {
  const hosts = cluster.nodes.map((n) => n.host.split(':')[0])
  STATE.agents = STATE.agents.filter((a) => !hosts.includes(a.host))
}
function closeAlertsFor(name) {
  const antes = STATE.alerts_open.length
  STATE.alerts_open = STATE.alerts_open.filter((a) => a.target.split(' / ')[0] !== name)
  const fechados = antes - STATE.alerts_open.length
  STATE.alerts_closed_count += fechados
  return fechados
}
function expireResyncs() {
  const now = Date.now()
  STATE.clusters.forEach((c) => c.nodes.forEach((n) => {
    if (n.resync_until && now >= n.resync_until) {
      delete n.resync_until
      n.status = 'green'; n.state = null
      n.lag = n.role === 'SECONDARY' ? '0.0s' : '—'
    }
  }))
}

// Rolling upgrade: config servers, secundários, primários, mongos — um por vez.
const UPGRADE_ORDER = { 'Config Server': 0, SECONDARY: 1, 'Shard PRIMARY': 2, PRIMARY: 2, Standalone: 2, mongos: 3 }
function checkUpgrade(c, target) {
  if (c.upgrade) throw new ApiError(`Rolling upgrade para ${c.upgrade.target} já está em andamento em ${c.name}; aguarde concluir.`)
  if (c.nodes.some((n) => n.resync_until)) throw new ApiError(`${c.name} tem um nó em initial sync; aguarde terminar antes do upgrade.`)
  checkKnownVersion(target)
  const d = cmpV(target, c.version)
  if (d === 0) throw new ApiError(`${c.name} já está na versão ${target}.`)
  if (d < 0) throw new ApiError('Downgrade não é suportado nesta demo (no Ops Manager exige featureCompatibilityVersion compatível).')
  const sCur = series(c.version), sNew = series(target)
  if (RELEASE_SERIES.includes(sCur) && RELEASE_SERIES.indexOf(sNew) - RELEASE_SERIES.indexOf(sCur) > 1) {
    throw new ApiError(`Upgrade de ${sCur} para ${sNew} pula uma release series: passe por ${RELEASE_SERIES[RELEASE_SERIES.indexOf(sCur) + 1]} antes.`)
  }
}
function startUpgrade(c, target, by, source) {
  checkUpgrade(c, target)
  const order = c.nodes.map((_, i) => i).sort((a, b) => (UPGRADE_ORDER[c.nodes[a].role] ?? 2) - (UPGRADE_ORDER[c.nodes[b].role] ?? 2))
  c.upgrade = { from: c.version, target, order, done: 0, total: order.length, seconds_per_node: UPGRADE_SECONDS_PER_NODE, by, source, _startedAt: Date.now() }
  c.nodes[order[0]].state = 'UPGRADING'
  logActivity(by, 'UPGRADE', c.name, `Rolling upgrade ${c.version} → ${target} iniciado (${order.length} processo(s), um por vez)`)
  return order.length * UPGRADE_SECONDS_PER_NODE
}
function advanceUpgrades() {
  const now = Date.now()
  STATE.clusters.forEach((c) => {
    const u = c.upgrade
    if (!u) return
    const done = Math.min(u.total, Math.floor((now - u._startedAt) / 1000 / u.seconds_per_node))
    for (let k = u.done; k < done; k++) { const n = c.nodes[u.order[k]]; n.version = u.target; n.state = null }
    u.done = done
    if (done < u.total) { c.nodes[u.order[done]].state = 'UPGRADING'; return }
    c.version = u.target
    delete c.upgrade
    STATE.automation_history.unshift({ time: nowStr(), cluster: c.name, change: `Version upgrade ${u.from} → ${u.target} (rolling)`, status: 'success', duration: `${u.total * u.seconds_per_node}s (simulado)`, by: u.by })
    logActivity('System', 'UPGRADE', c.name, `Rolling upgrade concluído: ${u.from} → ${u.target}`)
  })
}
const advanceAll = () => { expireResyncs(); advanceUpgrades(); updateRestoreJobs() }
const busyReason = (c) => (c.upgrade ? `rolling upgrade para ${c.upgrade.target} em andamento` : null)
const requireCluster = (id) => { const c = findCluster(id); if (!c) throw new ApiError('Cluster não encontrado', 404); return c }

// O alerta que o banner deve mostrar: o mais severo ainda não reconhecido.
function topAlert() {
  const ordem = { crit: 0, warn: 1, info: 2 }
  const abertos = STATE.alerts_open.filter((a) => !a.acked)
  if (!abertos.length) return null
  const a = [...abertos].sort((x, y) => (ordem[x.sev] ?? 9) - (ordem[y.sev] ?? 9))[0]
  return { id: a.id, sev: a.sev, title: a.title, target: a.target, detail: a.detail }
}

function expireAcks() {
  const now = Date.now()
  STATE.alerts_open.forEach((a) => { if (a.acked_until && now >= a.acked_until) { delete a.acked_until; a.acked = false } })
}

// ── Backup / PIT ──
const sizeGb = (s) => { const v = parseFloat(String(s).split(' ')[0]); return Number.isFinite(v) ? v : 0 }
function pitWindows() {
  const w = {}
  STATE.snapshots.forEach((s) => {
    const ts = parseTs(s.created)
    if (!ts) return
    const cur = w[s.cluster] || (w[s.cluster] = { from: ts, to: ts, snapshots: 0, latest_size: s.size })
    cur.snapshots++
    if (ts < cur.from) cur.from = ts
    if (ts >= cur.to) { cur.to = ts; cur.latest_size = s.size }
  })
  return w
}
const publicWindows = () => Object.fromEntries(Object.entries(pitWindows()).map(([k, v]) => [k, { from: fmtTs(v.from), to: fmtTs(v.to), snapshots: v.snapshots, latest_size: v.latest_size }]))
const activeRestore = (name) => STATE.restore_jobs.find((j) => (j.status === 'queued' || j.status === 'running') && (j.cluster === name || j.target_cluster === name))
const nextNum = (arr, fallback) => (arr.length ? Math.max(...arr.map((x) => parseInt(String(x.id).split('-')[1], 10) || 0)) : fallback) + 1
// Normaliza IPv4/CIDR para comparar redes (10.0.0.1/16 == 10.0.0.0/16). IPv6 cai na comparação literal.
function netKey(v) {
  const [ip, bits] = String(v).split('/')
  const parts = ip.split('.')
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || +p > 255)) return null
  const len = bits === undefined ? 32 : (/^\d{1,2}$/.test(bits) ? +bits : NaN)
  if (!(len >= 0 && len <= 32)) return null
  const n = parts.reduce((acc, p) => acc * 256 + +p, 0)
  const block = 2 ** (32 - len)
  return `${n - (n % block)}/${len}`
}
const validNetwork = (v) => netKey(v) !== null || /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(String(v)) && String(v).includes(':')
const sameNetwork = (a, b) => a === b || (netKey(a) !== null && netKey(a) === netKey(b))
const RT_OPS = {}
const RT_NS = ['app_db.orders', 'app_db.sessions', 'analytics.events', 'app_db.products', 'app_db.users']
const RT_KINDS = ['query', 'insert', 'update', 'getmore', 'command', 'aggregate']
const rtNewOp = () => ({
  opid: rand(10000, 99999), op: choice(RT_KINDS), ns: choice(RT_NS),
  secs: Math.round(Math.random() * 0.4 * 100) / 100,
  client: `10.0.${rand(1, 4)}.${rand(10, 200)}:${rand(40000, 60000)}`,
})

function point(c) {
  expireResyncs()
  const store = (WALKS[c.id] = WALKS[c.id] || {})
  const cpu = c.nodes.map((node, i) => {
    if (store[`cpub${i}`] === undefined) store[`cpub${i}`] = 30 + Math.random() * 20
    let base = store[`cpub${i}`]
    if (node.status === 'yellow') base += 22
    if (node.resync_until) base += 30
    if ((node.disk || 0) >= 85) base += 8
    return { label: shortHost(node), value: walk(store, `cpu${i}`, Math.min(98, base), 12, 0, 100) }
  })
  const lagBase = (n) => {
    if (n.resync_until) return 3.0
    if (n.status === 'yellow') return 1.2
    const v = parseFloat(String(n.lag || '0.2s'))
    return Number.isFinite(v) ? Math.max(0.1, v) : 0.3
  }
  const lag = c.nodes.filter((n) => /SECONDARY/i.test(n.role))
    .map((s, i) => ({ label: shortHost(s), value: walk(store, `lag${i}`, lagBase(s), 0.4, 0, 8, 2) }))
  const conns = c.nodes.reduce((t, n) => t + (n.conn || 0), 0) || 40
  const peso = c.nodes.length
  const resync = c.nodes.some((n) => n.resync_until)
  return {
    t: Date.now(),
    cpu,
    lag,
    memory: { resident: walk(store, 'memr', 4 + 2.6 * peso, 1.5, 0, 32), virtual: walk(store, 'memv', 8 + 5 * peso, 2, 0, 32) },
    ops: { query: walk(store, 'opq', conns * 3.5, 200), insert: walk(store, 'opi', conns * 1.1, 80), update: walk(store, 'opu', conns * 0.4, 40), delete: walk(store, 'opd', conns * 0.06, 8) },
    connections: { current: walk(store, 'conc', conns, Math.max(10, conns * 0.12)), available: walk(store, 'cona', 1000 - conns, 20) },
    iops: { read: walk(store, 'ior', 620 + (resync ? 900 : 0), 120), write: walk(store, 'iow', 310 + (resync ? 600 : 0), 80) },
    network: { in: walk(store, 'neti', 12, 3), out: walk(store, 'neto', 8, 2) },
    cache: { used: walk(store, 'cacu', 3.2, 0.3, 0, 4), dirty: walk(store, 'cacd', 0.4, 0.15, 0, 4, 2) },
  }
}

function flatten(points) {
  const last = points[points.length - 1]
  const col = (f) => points.map(f)
  const grp = (key, keys) => Object.fromEntries(keys.map((k) => [k, col((p) => p[key][k])]))
  return {
    t: col((p) => p.t),
    cpu: last.cpu.map((s, i) => ({ label: s.label, data: col((p) => p.cpu[i].value) })),
    lag: last.lag.map((s, i) => ({ label: s.label, data: col((p) => p.lag[i].value) })),
    memory: grp('memory', ['resident', 'virtual']),
    ops: grp('ops', ['query', 'insert', 'update', 'delete']),
    connections: grp('connections', ['current', 'available']),
    iops: grp('iops', ['read', 'write']),
    network: grp('network', ['in', 'out']),
    cache: grp('cache', ['used', 'dirty']),
  }
}
const rand = (a, b) => Math.floor(a + Math.random() * (b - a))
const choice = (arr) => arr[rand(0, arr.length)]


export const MockAPI = {
  meta: () => ok({ org: STATE.org, project: STATE.project, simulated: true }),

  dashboard: () => {
    advanceAll()
    return ok({
      total_clusters: STATE.clusters.length,
      healthy: STATE.clusters.filter((c) => c.status === 'healthy').length,
      warning: STATE.clusters.filter((c) => c.status === 'warning' || c.status === 'critical').length,
      hosts: STATE.clusters.reduce((a, c) => a + c.nodes.length, 0),
      open_alerts: STATE.alerts_open.length,
      top_alert: topAlert(),
      snapshots: STATE.snapshots.length + STATE.snapshot_base,
      clusters: STATE.clusters,
      activity: STATE.activity.slice(0, 3),
    })
  },

  clusters: () => { advanceAll(); return ok(STATE.clusters) },
  createCluster: (b) => run(() => {
    const nome = String(b.name || '').trim()
    if (!nome) throw new ApiError('Nome do cluster é obrigatório.', 422)
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(nome)) throw new ApiError('Nome inválido: use letras, números, ponto, hífen ou underscore (até 64).', 422)
    if (!['Replica Set', 'Sharded Cluster', 'Standalone'].includes(b.type)) throw new ApiError('Tipo de deployment inválido.', 422)
    const members = b.members === undefined ? 3 : Number(b.members)
    if (!(Number.isInteger(members) && members >= 1 && members <= 12)) throw new ApiError('Número de nós deve estar entre 1 e 12.', 422)
    const port = b.port === undefined ? 27017 : Number(b.port)
    if (!(Number.isInteger(port) && port >= 1 && port <= 65535)) throw new ApiError('Porta inválida.', 422)
    const version = b.version || '7.0.5'
    checkKnownVersion(version)
    if (findCluster(nome)) throw new ApiError(`Cluster "${nome}" já existe.`)
    const typeKey = { 'Replica Set': 'rs', 'Sharded Cluster': 'sharded', Standalone: 'standalone' }[b.type]
    const n = typeKey === 'standalone' ? 1 : members
    const nodes = Array.from({ length: n }, (_, i) => ({
      host: `${nome}-node-0${i + 1}.mongodb-brazil.internal:${port}`,
      role: typeKey === 'standalone' ? 'Standalone' : (i === 0 ? 'PRIMARY' : 'SECONDARY'),
      version, status: 'green', uptime: 'just now', conn: 0, disk: 5, lag: i === 0 ? '—' : '0.0s',
    }))
    const cluster = { id: nome, type: typeKey, name: nome, version, status: 'healthy', nodes }
    STATE.clusters.push(cluster)
    registerAgents(cluster)
    logActivity(ADMIN, 'CREATE', nome, `Provisioned ${b.type} with ${n} node(s)`)
    return cluster
  }),
  deleteCluster: (id) => run(() => {
    const c = requireCluster(id)
    STATE.clusters.splice(STATE.clusters.indexOf(c), 1)
    dropAgents(c)
    const fechados = closeAlertsFor(c.name)
    logActivity(ADMIN, 'TERMINATE', id, 'Cluster terminated')
    if (fechados) logActivity('System', 'ALERT CLOSE', id, `${fechados} alerta(s) fechado(s) junto com o cluster`)
    return { ok: true, agents_removed: true, alerts_closed: fechados }
  }),
  editCluster: (id, b) => run(() => {
    advanceAll()
    const c = requireCluster(id)
    if (b.version) startUpgrade(c, b.version, ADMIN, 'edit')
    const changes = Object.fromEntries(['oplog', 'cache', 'log_level'].filter((k) => b[k]).map((k) => [k, b[k]]))
    if (Object.keys(changes).length) {
      c.config = { ...(c.config || {}), ...changes }
      logActivity(ADMIN, 'EDIT', id, 'Config applied via Automation: ' + Object.entries(changes).map(([k, v]) => `${k}=${v}`).join(', '))
    }
    return c
  }),
  addNode: (id, b = {}) => run(() => {
    advanceAll()
    const c = requireCluster(id)
    if (c.type !== 'rs') throw new ApiError('Add Node vale só para replica set (sharded: adicione um shard; standalone: converta em replica set).')
    if (busyReason(c)) throw new ApiError(`Não é possível adicionar nó: ${busyReason(c)}.`)
    if (c.nodes.length >= 12) throw new ApiError('O deployment já atingiu o limite de 12 nós da demo.')
    if (b.host && !/^[A-Za-z0-9][A-Za-z0-9.-]{0,239}:\d{1,5}$/.test(b.host)) throw new ApiError('host deve usar o formato hostname:porta', 422)
    const host = b.host || `${c.name}-node-0${c.nodes.length + 1}.mongodb-brazil.internal:27017`
    if (c.nodes.some((n) => n.host === host)) throw new ApiError('Host já pertence ao deployment.')
    c.nodes.push({ host, role: 'SECONDARY', version: c.version, status: 'green', uptime: 'just now', conn: 0, disk: 3, lag: '0.0s' })
    registerAgents(c)
    logActivity(ADMIN, 'ADD NODE', c.name, `Nó ${host} adicionado ao replica set`)
    return c
  }),
  stepDown: (id, idx) => run(() => {
    advanceAll()
    const c = requireCluster(id)
    if (!(idx >= 0 && idx < c.nodes.length)) throw new ApiError('Nó não encontrado', 404)
    if (busyReason(c)) throw new ApiError(`Step down bloqueado: ${busyReason(c)}.`)
    const oldP = c.nodes.find((n) => n.role === 'PRIMARY')
    const newP = c.nodes.find((n, i) => i !== idx && n.role === 'SECONDARY' && !n.resync_until)
    if (!oldP || !newP) throw new ApiError('Step down exige um PRIMARY e ao menos um SECONDARY elegível.')
    oldP.role = 'SECONDARY'; newP.role = 'PRIMARY'
    oldP.lag = '0.0s'; newP.lag = '—'
    logActivity(ADMIN, 'STEP DOWN', c.name, `Novo PRIMARY: ${newP.host}`)
    return { new_primary: newP.host, cluster: c }
  }),
  resyncNode: (id, idx) => run(() => {
    advanceAll()
    const c = requireCluster(id)
    if (!(idx >= 0 && idx < c.nodes.length)) throw new ApiError('Nó não encontrado', 404)
    if (busyReason(c)) throw new ApiError(`Resync bloqueado: ${busyReason(c)}.`)
    const n = c.nodes[idx]
    if (n.role === 'PRIMARY') throw new ApiError('Faça step down antes de ressincronizar o PRIMARY.')
    if (n.role !== 'SECONDARY') throw new ApiError(`Resync só se aplica a membro SECONDARY de replica set (este nó é ${n.role}).`)
    if (n.resync_until) throw new ApiError('Este nó já está em initial sync.')
    n.status = 'yellow'; n.state = 'STARTUP2'; n.lag = 'sync'
    n.resync_until = Date.now() + RESYNC_SECONDS * 1000
    logActivity(ADMIN, 'RESYNC', c.name, `Initial sync iniciado em ${n.host}`)
    return { ok: true, seconds: RESYNC_SECONDS, cluster: c }
  }),
  upgradeCluster: (id, b) => run(() => {
    advanceAll()
    const c = requireCluster(id)
    if (!VERSION_RE.test(String(b?.target_version || ''))) throw new ApiError('Versão inválida.', 422)
    const seconds = startUpgrade(c, b.target_version, ADMIN, 'deployments')
    return { ok: true, seconds, cluster: c }
  }),

  automation: () => { advanceAll(); return ok({ agents_active: STATE.agents.length, pending: STATE.pending_changes, history: STATE.automation_history }) },
  applyPending: (pid) => run(() => {
    advanceAll()
    const pc = STATE.pending_changes.find((p) => p.id === pid)
    if (!pc) throw new ApiError('Mudança não encontrada', 404)
    const c = findCluster(pc.cluster)
    if (!c) throw new ApiError(`Cluster "${pc.cluster}" não existe mais; descarte a mudança.`)
    let seconds = 0
    if (pc.target_version) {
      seconds = startUpgrade(c, pc.target_version, pc.by || ADMIN, 'automation')
    } else {
      c.config = { ...(c.config || {}), ...(pc.config || {}) }
      STATE.automation_history.unshift({ time: nowStr(), cluster: pc.cluster, change: pc.desc, status: 'success', duration: 'aplicado (simulado)', by: 'admin' })
      logActivity(ADMIN, 'EDIT', pc.cluster, `Automation aplicou: ${pc.desc}`)
    }
    STATE.pending_changes.splice(STATE.pending_changes.indexOf(pc), 1)
    return { ok: true, pending: STATE.pending_changes, rolling: !!seconds, seconds }
  }),
  discardPending: (pid) => run(() => {
    const pc = STATE.pending_changes.find((p) => p.id === pid)
    if (!pc) throw new ApiError('Mudança não encontrada', 404)
    STATE.pending_changes.splice(STATE.pending_changes.indexOf(pc), 1)
    return { ok: true, pending: STATE.pending_changes }
  }),
  agents: () => {
    const versoes = [...new Set(STATE.agents.map((a) => a.version))].sort()
    return ok({ agents: STATE.agents, version: versoes[0] || STATE.agent_version || '12.0.27', latest: AGENT_LATEST, running: STATE.agents.filter((a) => a.status === 'Running').length })
  },
  agentLogs: (host) => {
    const a = STATE.agents.find((x) => x.host === host)
    if (!a) return fail('Agent não encontrado', 404)
    const agora = Date.now()
    const linhas = [
      [0, 'INFO', `Agent ${a.version} iniciado em ${a.host}`],
      [3, 'INFO', `Registrado no grupo do projeto ${STATE.project} (cluster ${a.cluster})`],
      [9, 'INFO', 'Plano de automação recebido: nenhuma mudança pendente'],
      [14, 'INFO', `Ping de monitoramento enviado (${a.ping})`],
      [26, 'INFO', 'Coleta de métricas: 42 métricas publicadas'],
      [41, 'WARN', 'Latência do ping acima de 250ms — reavaliando na próxima janela'],
      [58, 'INFO', 'Backup daemon: oplog slice aplicado'],
    ]
    return ok({ host: a.host, cluster: a.cluster, version: a.version, simulated: true,
      lines: linhas.map(([off, level, msg]) => ({ ts: new Date(agora - off * 1000).toTimeString().slice(0, 8), level, msg })) })
  },
  upgradeAgents: () => run(() => {
    if (STATE.agents.length && STATE.agents.every((a) => a.version === AGENT_LATEST)) throw new ApiError(`Todos os agents já estão em ${AGENT_LATEST}.`)
    STATE.agents.forEach((a) => (a.version = AGENT_LATEST))
    STATE.agent_version = AGENT_LATEST
    logActivity(ADMIN, 'AGENT UPGRADE', 'Automation', `${STATE.agents.length} agent(s) em ${AGENT_LATEST}`)
    return { ok: true, version: AGENT_LATEST }
  }),

  metrics: (id) => {
    const c = findCluster(id)
    if (!c) return fail('Cluster não encontrado', 404)
    delete WALKS[id]
    const now = Date.now()
    const points = Array.from({ length: WINDOW }, (_, k) => ({ ...point(c), t: now - (WINDOW - 1 - k) * 1000 }))
    return ok({ cluster: c.name, node_count: c.nodes.length, window: WINDOW, ...flatten(points) })
  },
  metricsTick: (id) => {
    const c = findCluster(id)
    if (!c) return fail('Cluster não encontrado', 404)
    return ok(point(c))
  },
  realtime: (id) => {
    const c = findCluster(id)
    if (!c) return fail('Cluster não encontrado', 404)
    const ops = (RT_OPS[id] = RT_OPS[id] || Array.from({ length: 3 }, rtNewOp))
    ops.forEach((o) => { o.secs = Math.round((o.secs + 0.3 + Math.random() * 0.7) * 100) / 100 })
    const vivos = ops.filter((o) => o.secs < 4)
    const alvo = rand(2, 5)
    while (vivos.length < alvo) vivos.push(rtNewOp())
    RT_OPS[id] = vivos

    const store = (WALKS[id] = WALKS[id] || {})
    const hottest = [...RT_NS].reverse()
      .map((ns, i) => ({ ns, ops: Math.round(walk(store, `hot:${ns}`, 120 + 90 * i, 90, 10)) }))
      .sort((a, b) => b.ops - a.ops)
    const conns = c.nodes.reduce((t, n) => t + (n.conn || 0), 0) || 1
    return ok({
      cluster: c.name,
      ops_per_sec: Math.round(walk(store, 'rtops', 1800, 300, 100)),
      connections: Math.round(walk(store, 'rtconn', conns, Math.max(10, conns * 0.1), 0)),
      net_in: walk(store, 'neti', 12, 3),
      net_out: walk(store, 'neto', 8, 2),
      docs_per_sec: walk(store, 'rtdocs', 25, 6, 0),
      in_progress: vivos,
      hottest,
    })
  },
  killOp: (id, opid) => run(() => {
    const ops = RT_OPS[id] || []
    const alvo = ops.find((o) => o.opid === opid)
    if (!alvo) throw new ApiError('Operação já terminou ou não existe.', 404)
    RT_OPS[id] = ops.filter((o) => o.opid !== opid)
    logActivity(ADMIN, 'KILL OP', id, `db.killOp(${opid}) em ${alvo.ns}`)
    return { ok: true, killed: alvo }
  }),

  perfAdvisor: () => {
    // Números sintéticos, recalculados a cada chamada (inclui o "Re-scan" do
    // frontend) dentro de uma faixa plausível — espelha o backend FastAPI.
    const slowCount = rand(110, 145)
    const avgQueryMs = Math.round((6.5 + Math.random() * 4) * 10) / 10
    const collectionsScanned = rand(38, 48)
    const previous = perfLastAvgMs
    const deltaPct = previous ? Math.round(((avgQueryMs - previous) / previous) * 1000) / 10 : 0
    perfLastAvgMs = avgQueryMs
    return ok({
      index_suggestions: STATE.perf_index_suggestions, slow_queries: STATE.perf_slow_queries,
      slow_count: slowCount, avg_query_ms: avgQueryMs, avg_query_delta_pct: deltaPct,
      collections_scanned: collectionsScanned, simulated: true,
    })
  },
  createIndex: (sid) => run(() => {
    const s = STATE.perf_index_suggestions.find((x) => x.id === sid)
    if (!s) throw new ApiError('Sugestão não encontrada (o índice pode já ter sido criado).', 404)
    STATE.perf_index_suggestions.splice(STATE.perf_index_suggestions.indexOf(s), 1)
    logActivity(ADMIN, 'CREATE INDEX', s.ns, `Rolling index build ${s.idx}`)
    return { ok: true, created: s, remaining: STATE.perf_index_suggestions }
  }),

  backup: () => ok({
    protected: STATE.clusters.filter((c) => c.type !== 'standalone').length,
    total_snapshots: STATE.snapshots.length + STATE.snapshot_base,
    snapshots: STATE.snapshots,
    storage_gb: Math.round(STATE.snapshots.reduce((t, s) => t + sizeGb(s.size), 0) * 10) / 10,
    pit_windows: publicWindows(),
    simulated: true,
  }),
  takeSnapshot: (cluster) => run(() => {
    const c = STATE.clusters.find((x) => x.name === cluster)
    if (!c) throw new ApiError(`Cluster "${String(cluster).slice(0, 64)}" não encontrado.`, 404)
    if (c.type === 'standalone') throw new ApiError('Backup vale para replica set e sharded cluster: standalone não tem oplog (sem backup contínuo nem PIT). Converta em replica set de um membro.')
    const now = new Date(Date.now())
    const previous = STATE.snapshots.find((s) => s.cluster === cluster)
    const snap = {
      id: `snap-${String(nextNum(STATE.snapshots, 142)).padStart(5, '0')}`, cluster, type: 'Manual',
      created: fmtTs(now), size: previous ? previous.size : '1 GB',
      expires: fmtTs(new Date(now.getTime() + 30 * 86400000)).slice(0, 10), status: 'ready',
    }
    STATE.snapshots.unshift(snap)
    logActivity(ADMIN, 'SNAPSHOT', cluster, `Snapshot manual ${snap.id} concluído`)
    return snap
  }),
  deleteSnapshot: (sid) => run(() => {
    const s = STATE.snapshots.find((x) => x.id === sid)
    if (!s) throw new ApiError('Snapshot não encontrado', 404)
    STATE.snapshots.splice(STATE.snapshots.indexOf(s), 1)
    logActivity(ADMIN, 'SNAPSHOT DELETE', s.cluster, `Snapshot ${sid} removido`)
    return { ok: true }
  }),

  restoreJobs: () => { updateRestoreJobs(); return ok(STATE.restore_jobs.map(publicJob)) },
  startRestore: (b) => run(() => {
    updateRestoreJobs()
    const target = b.target || 'same'
    if (b.point && String(b.point).length > 32) throw new ApiError('Ponto de restore inválido.', 422)
    if (b.snapshot_id !== undefined && b.snapshot_id !== null && !/^snap-\d{1,8}$/.test(String(b.snapshot_id))) throw new ApiError('snapshot_id inválido.', 422)
    const c = findCluster(b.cluster)
    if (!c) throw new ApiError(`Cluster "${b.cluster}" não encontrado.`, 404)
    if (c.type === 'standalone') throw new ApiError('Standalone não tem oplog nem backup contínuo; não há snapshot para restaurar.')
    const window = pitWindows()[c.name]
    if (!window) throw new ApiError(`${c.name} não tem nenhum snapshot: faça um backup antes de restaurar.`)
    let targetCluster = null
    if (target !== 'same' && target !== 'download') {
      targetCluster = findCluster(target)
      if (!targetCluster) throw new ApiError(`Cluster de destino "${target}" não encontrado.`, 404)
      if (targetCluster.id === c.id) targetCluster = null
      else if (targetCluster.type !== c.type) throw new ApiError('O destino precisa ter a mesma topologia da origem (replica set → replica set, sharded → sharded).')
    }
    const busy = activeRestore(c.name) || (targetCluster && activeRestore(targetCluster.name))
    if (busy) throw new ApiError(`Já existe um restore em andamento (${busy.id}); aguarde concluir.`)
    let kind, point
    if (b.snapshot_id) {
      const snap = STATE.snapshots.find((s) => s.id === b.snapshot_id)
      if (!snap || snap.cluster !== c.name) throw new ApiError(`Snapshot ${b.snapshot_id} não encontrado para ${c.name}.`, 404)
      kind = 'Snapshot'; point = snap.created
    } else {
      if (!b.point) throw new ApiError('Informe o ponto de restore (ou um snapshot_id).', 422)
      const ts = parseTs(b.point)
      if (!ts) throw new ApiError('Ponto de restore inválido: use AAAA-MM-DDTHH:MM (UTC).', 422)
      if (ts < window.from || ts > window.to) throw new ApiError(`Ponto fora da janela de PIT de ${c.name}: ${fmtTs(window.from)} → ${fmtTs(window.to)} UTC.`, 422)
      kind = 'PIT'; point = fmtTs(ts).replace(' ', 'T')
    }
    const now = Date.now()
    const job = {
      id: `rst-${String(nextNum(STATE.restore_jobs, 142)).padStart(5, '0')}`, cluster: c.name, type: kind,
      point, target, status: 'queued', started: nowStr(),
      _runningAt: now + RESTORE_RUNNING_SECONDS * 1000, _doneAt: now + RESTORE_TOTAL_SECONDS * 1000,
    }
    if (targetCluster) job.target_cluster = targetCluster.name
    STATE.restore_jobs.unshift(job)
    const label = kind === 'PIT' ? 'Point-in-time' : `Snapshot ${b.snapshot_id}`
    logActivity(ADMIN, 'RESTORE', c.name, `${label} restore iniciado (${point} → ${target})`)
    return { ok: true, seconds: RESTORE_TOTAL_SECONDS, job: publicJob(job) }
  }),

  alerts: () => { expireAcks(); return ok({ open: STATE.alerts_open, closed_count: STATE.alerts_closed_count, configs: STATE.alert_configs }) },
  acknowledgeAlert: (aid) => run(() => {
    const a = STATE.alerts_open.find((x) => x.id === aid)
    if (!a) throw new ApiError('Alerta não encontrado', 404)
    if (a.acked) throw new ApiError('Alerta já reconhecido.')
    a.acked = true; a.acked_until = Date.now() + ACK_MINUTES * 60000; a.acked_by = ADMIN
    logActivity(ADMIN, 'ALERT ACK', a.target, `${a.title} silenciado por ${ACK_MINUTES}min`)
    return { ok: true, alert: a, minutes: ACK_MINUTES }
  }),
  resolveAlert: (aid) => run(() => {
    const a = STATE.alerts_open.find((x) => x.id === aid)
    if (!a) throw new ApiError('Alerta não encontrado', 404)
    STATE.alerts_open.splice(STATE.alerts_open.indexOf(a), 1)
    STATE.alerts_closed_count++
    logActivity(ADMIN, 'ALERT RESOLVE', a.target, a.title)
    return { ok: true, open: STATE.alerts_open, closed_count: STATE.alerts_closed_count }
  }),
  addAlertConfig: (b) => run(() => {
    const cond = String(b.cond || '').trim(), target = String(b.target || '').trim(), thresh = String(b.thresh || '').trim()
    const notify = String(b.notify || 'Email').trim()
    if (!cond || !target || !thresh || cond.length > 160 || target.length > 128 || thresh.length > 64 || notify.length > 64) throw new ApiError('Preencha condição, alvo e limite (dentro dos tamanhos máximos).', 422)
    const key = [cond, target, thresh].join('|').toLowerCase()
    if (STATE.alert_configs.some((c) => [c.cond, c.target, c.thresh].join('|').toLowerCase() === key)) throw new ApiError('Já existe uma configuração com a mesma condição, alvo e limite.')
    const cfg = { id: `ac-${nextNum(STATE.alert_configs, 0)}`, cond, target, thresh, notify, on: true }
    STATE.alert_configs.unshift(cfg)
    return cfg
  }),
  deleteAlertConfig: (id) => run(() => {
    const cfg = STATE.alert_configs.find((c) => c.id === id)
    if (!cfg) throw new ApiError('Config não encontrada', 404)
    STATE.alert_configs.splice(STATE.alert_configs.indexOf(cfg), 1)
    return { ok: true }
  }),

  users: () => ok(STATE.users),
  addUser: (b) => run(() => {
    const nome = String(b.name || '').trim()
    if (!nome) throw new ApiError('Username é obrigatório.', 422)
    if (nome.length > 128 || !/^[A-Za-z0-9._@-]+$/.test(nome)) throw new ApiError('Username inválido.', 422)
    if (STATE.users.some((x) => x.name === nome)) throw new ApiError(`Usuário "${nome}" já existe.`)
    const role = b.role || 'read@analytics'
    const u = { name: nome, auth: b.auth || 'SCRAM-SHA-256', roles: [role], db: role.includes('@') ? role.split('@').pop() : 'admin', created: 'just now', status: 'active' }
    STATE.users.unshift(u)
    logActivity(ADMIN, 'USER CREATE', 'Security', `New user: ${nome}`)
    return u
  }),
  deleteUser: (name) => run(() => {
    const u = STATE.users.find((x) => x.name === name)
    if (!u) throw new ApiError('Usuário não encontrado', 404)
    STATE.users.splice(STATE.users.indexOf(u), 1)
    return { ok: true }
  }),
  roles: () => ok(STATE.roles),
  addRole: (b) => run(() => {
    const name = String(b.name || '')
    if (!name || name.length > 128 || !/^[A-Za-z0-9._-]+$/.test(name)) throw new ApiError('Nome de role inválido.', 422)
    if (STATE.roles.some((r) => r.name === name)) throw new ApiError(`Role "${name}" já existe.`)
    const r = { name, priv: b.priv || 'find', inherits: b.inherits || '(none)', users: 0 }
    STATE.roles.unshift(r)
    return r
  }),
  deleteRole: (name) => run(() => {
    const r = STATE.roles.find((x) => x.name === name)
    if (!r) throw new ApiError('Role não encontrada', 404)
    STATE.roles.splice(STATE.roles.indexOf(r), 1)
    return { ok: true }
  }),
  ips: () => ok(STATE.ip_access_list),
  addIp: (b) => run(() => {
    if (!validNetwork(b.ip) || String(b.ip).length > 64) throw new ApiError('IP ou CIDR inválido', 422)
    if (String(b.comment || '').length > 240) throw new ApiError('Comentário longo demais.', 422)
    if (STATE.ip_access_list.some((e) => sameNetwork(e.ip, b.ip))) throw new ApiError(`${b.ip} já está na IP access list.`)
    const e = { ip: b.ip, comment: b.comment || '—', added: 'just now' }
    STATE.ip_access_list.push(e)
    return e
  }),
  deleteIp: (ip) => run(() => {
    const e = STATE.ip_access_list.find((x) => sameNetwork(x.ip, ip))
    if (!e) throw new ApiError('IP não encontrado', 404)
    STATE.ip_access_list.splice(STATE.ip_access_list.indexOf(e), 1)
    return { ok: true }
  }),
  audit: () => ok(STATE.audit_events),

  activity: () => ok(STATE.activity),
  // Reset completo: estado, séries de métricas, operações vivas e último scan.
  reset: () => {
    STATE = seed()
    Object.keys(WALKS).forEach((k) => delete WALKS[k])
    Object.keys(RT_OPS).forEach((k) => delete RT_OPS[k])
    perfLastAvgMs = null
    return ok({ ok: true })
  },
  // Só para testes de paridade (frontend/tests/mock_parity.mjs).
  _debugState: () => ({ state: STATE, walks: WALKS, rt: RT_OPS, perf: perfLastAvgMs }),
  _seed: seed,
}
