// ──────────────────────────────────────────────────────────────
// MODO MOCK — replica o backend FastAPI 100% no cliente.
// Usado no build estático (GitHub Pages) onde não há backend Python.
// Mesma interface do RealAPI (axios) — todos os métodos retornam Promise.
// ──────────────────────────────────────────────────────────────

const seed = () => JSON.parse(JSON.stringify(SEED))

const SEED = {
  org: 'MongoDB Brazil',
  project: 'Production',
  clusters: [
    { id: 'rs-prod-01', type: 'rs', name: 'rs-prod-01', version: '7.0.5', status: 'warning', nodes: [
      { host: 'mongo-node-01.mongodb-brazil.internal:27017', role: 'PRIMARY', version: '7.0.5', status: 'green', uptime: '14d 6h', conn: 342, disk: 62, lag: '—' },
      { host: 'mongo-node-02.mongodb-brazil.internal:27017', role: 'SECONDARY', version: '7.0.5', status: 'yellow', uptime: '14d 6h', conn: 201, disk: 91, lag: '0.8s' },
      { host: 'mongo-node-03.mongodb-brazil.internal:27017', role: 'SECONDARY', version: '7.0.5', status: 'green', uptime: '14d 6h', conn: 198, disk: 58, lag: '0.2s' },
    ]},
    { id: 'sharded-analytics', type: 'sharded', name: 'sharded-analytics', version: '7.0.5', status: 'healthy', nodes: [
      { host: 'mongos-01.mongodb-brazil.internal:27017', role: 'mongos', version: '7.0.5', status: 'green', uptime: '30d', conn: 520, disk: 0, lag: '—' },
      { host: 'shard-01-n1.mongodb-brazil.internal:27018', role: 'Shard PRIMARY', version: '7.0.5', status: 'green', uptime: '30d', conn: 180, disk: 45, lag: '—' },
      { host: 'shard-02-n1.mongodb-brazil.internal:27018', role: 'Shard PRIMARY', version: '7.0.5', status: 'green', uptime: '30d', conn: 165, disk: 51, lag: '—' },
      { host: 'configsvr-01.mongodb-brazil.internal:27019', role: 'Config Server', version: '7.0.5', status: 'green', uptime: '30d', conn: 12, disk: 18, lag: '—' },
    ]},
    { id: 'rs-staging', type: 'rs', name: 'rs-staging', version: '6.0.12', status: 'healthy', nodes: [
      { host: 'stg-mongo-01.mongodb-brazil.internal:27017', role: 'PRIMARY', version: '6.0.12', status: 'green', uptime: '5d', conn: 42, disk: 22, lag: '—' },
      { host: 'stg-mongo-02.mongodb-brazil.internal:27017', role: 'SECONDARY', version: '6.0.12', status: 'green', uptime: '5d', conn: 38, disk: 21, lag: '0.1s' },
    ]},
    { id: 'mongo-dev-01', type: 'standalone', name: 'mongo-dev-01', version: '7.0.5', status: 'healthy', nodes: [
      { host: 'dev-mongo.mongodb-brazil.internal:27017', role: 'Standalone', version: '7.0.5', status: 'green', uptime: '2d', conn: 8, disk: 12, lag: '—' },
    ]},
  ],
  snapshots: [
    { id: 'snap-00142', cluster: 'rs-prod-01', type: 'Automated', created: '2024-01-15 08:00', size: '42 GB', expires: '2024-02-14', status: 'ready' },
    { id: 'snap-00141', cluster: 'rs-prod-01', type: 'Automated', created: '2024-01-15 02:00', size: '41 GB', expires: '2024-02-14', status: 'ready' },
    { id: 'snap-00140', cluster: 'rs-prod-01', type: 'Automated', created: '2024-01-14 20:00', size: '40 GB', expires: '2024-02-13', status: 'ready' },
    { id: 'snap-00139', cluster: 'rs-prod-01', type: 'Manual', created: '2024-01-14 14:00', size: '40 GB', expires: '2024-02-13', status: 'ready' },
    { id: 'snap-00138', cluster: 'sharded-analytics', type: 'Automated', created: '2024-01-15 06:00', size: '218 GB', expires: '2024-01-29', status: 'ready' },
    { id: 'snap-00137', cluster: 'sharded-analytics', type: 'Automated', created: '2024-01-14 18:00', size: '215 GB', expires: '2024-01-28', status: 'ready' },
    { id: 'snap-00136', cluster: 'rs-staging', type: 'Automated', created: '2024-01-15 09:00', size: '18 GB', expires: '2024-01-22', status: 'ready' },
    { id: 'snap-00135', cluster: 'rs-staging', type: 'Automated', created: '2024-01-14 21:00', size: '17 GB', expires: '2024-01-21', status: 'ready' },
  ],
  snapshot_base: 100,
  restore_jobs: [
    { id: 'rst-00142', cluster: 'rs-prod-01', type: 'PIT', point: '2024-01-14T09:00', target: 'Restore to rs-staging', status: 'completed', started: '2024-01-14 09:12' },
    { id: 'rst-00141', cluster: 'sharded-analytics', type: 'Snapshot', point: '2024-01-13T18:00', target: 'Automated', status: 'completed', started: '2024-01-13 18:45' },
  ],
  users: [
    { name: 'admin', auth: 'SCRAM-SHA-256', roles: ['root@admin'], db: 'admin', created: '2023-06-01', status: 'active' },
    { name: 'app_service', auth: 'SCRAM-SHA-256', roles: ['readWrite@app_db'], db: 'app_db', created: '2023-08-12', status: 'active' },
    { name: 'analytics_ro', auth: 'SCRAM-SHA-256', roles: ['read@analytics'], db: 'analytics', created: '2023-09-03', status: 'active' },
    { name: 'backup_user', auth: 'SCRAM-SHA-256', roles: ['backup@admin'], db: 'admin', created: '2023-06-15', status: 'active' },
    { name: 'monitor_svc', auth: 'x.509', roles: ['clusterMonitor@admin'], db: '$external', created: '2023-07-20', status: 'active' },
    { name: 'legacy_app', auth: 'SCRAM-SHA-1', roles: ['readWrite@legacy'], db: 'legacy', created: '2022-12-01', status: 'disabled' },
  ],
  roles: [
    { name: 'analyticsReadOnly', priv: 'find, listCollections, collStats', inherits: 'read', users: 3 },
    { name: 'appWriter', priv: 'find, insert, update, remove', inherits: 'readWrite', users: 5 },
    { name: 'indexManager', priv: 'createIndex, dropIndex, listIndexes', inherits: '(none)', users: 1 },
  ],
  alerts_open: [
    { id: 1, sev: 'crit', title: 'Disk utilization above 90%', target: 'rs-prod-01 / mongo-node-02', detail: 'Current: 91% · Threshold: 90%', time: '2 min ago' },
    { id: 2, sev: 'warn', title: 'Replication lag above threshold', target: 'rs-prod-01 / mongo-node-02', detail: 'Current: 0.8s · Threshold: 0.5s', time: '18 min ago' },
    { id: 3, sev: 'warn', title: 'High connection count', target: 'sharded-analytics / mongos-01', detail: 'Current: 520 · Threshold: 500', time: '1h ago' },
  ],
  alerts_closed_count: 28,
  alert_configs: [
    { cond: 'Host is down', target: 'All clusters', thresh: '—', notify: 'Email, PagerDuty', on: true },
    { cond: 'Disk space % used is above', target: 'All clusters', thresh: '90%', notify: 'Email, Slack', on: true },
    { cond: 'CPU utilization is above', target: 'rs-prod-01', thresh: '85%', notify: 'Email', on: true },
    { cond: 'Connections is above', target: 'All clusters', thresh: '500', notify: 'Slack', on: true },
    { cond: 'Replication lag is above', target: 'rs-prod-01', thresh: '0.5s', notify: 'Email, PagerDuty', on: true },
    { cond: 'Page faults is above', target: 'All clusters', thresh: '100/s', notify: 'Email', on: false },
  ],
  pending_changes: [
    { id: 'pc-1', cluster: 'rs-prod-01', type: 'Version Upgrade', desc: '7.0.5 → 7.0.6 (rolling upgrade)', by: 'admin@mongodb-brazil.com', time: '30 min ago' },
    { id: 'pc-2', cluster: 'sharded-analytics', type: 'Config Change', desc: 'WiredTiger cache 4GB → 8GB', by: 'john.doe@mongodb-brazil.com', time: '1h ago' },
  ],
  automation_history: [
    { time: '2024-01-15 10:42', cluster: 'rs-prod-01', change: 'Oplog size 5GB → 10GB', status: 'success', duration: '4m 12s', by: 'admin' },
    { time: '2024-01-14 22:10', cluster: 'rs-staging', change: 'Version upgrade 6.0.11 → 6.0.12', status: 'success', duration: '12m 30s', by: 'System' },
    { time: '2024-01-14 14:00', cluster: 'sharded-analytics', change: 'Added shard shard-02', status: 'success', duration: '8m 05s', by: 'john.doe' },
    { time: '2024-01-13 09:00', cluster: 'rs-prod-01', change: 'TLS certificate rotation', status: 'success', duration: '6m 18s', by: 'admin' },
    { time: '2024-01-12 16:30', cluster: 'rs-prod-01', change: 'Add hidden secondary node', status: 'failed', duration: '2m 01s', by: 'admin' },
  ],
  agents: [
    { host: 'mongo-node-01.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '5s ago', cluster: 'rs-prod-01' },
    { host: 'mongo-node-02.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '5s ago', cluster: 'rs-prod-01' },
    { host: 'mongo-node-03.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '7s ago', cluster: 'rs-prod-01' },
    { host: 'mongos-01.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring', ping: '4s ago', cluster: 'sharded-analytics' },
    { host: 'shard-01-n1.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '6s ago', cluster: 'sharded-analytics' },
    { host: 'shard-02-n1.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '5s ago', cluster: 'sharded-analytics' },
    { host: 'configsvr-01.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring', ping: '5s ago', cluster: 'sharded-analytics' },
    { host: 'stg-mongo-01.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '9s ago', cluster: 'rs-staging' },
    { host: 'stg-mongo-02.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring + Backup', ping: '9s ago', cluster: 'rs-staging' },
    { host: 'dev-mongo.mongodb-brazil.internal', status: 'Running', version: '12.0.27', type: 'Automation + Monitoring', ping: '12s ago', cluster: 'mongo-dev-01' },
  ],
  perf_index_suggestions: [
    { impact: 'high', ns: 'app_db.orders', idx: '{ customerId: 1, createdAt: -1 }', queries: 42, improvement: '~95% faster (12,400 → 8 docs)' },
    { impact: 'high', ns: 'app_db.sessions', idx: '{ userId: 1, expiresAt: 1 }', queries: 38, improvement: '~88% faster (COLLSCAN → IXSCAN)' },
    { impact: 'med', ns: 'analytics.events', idx: '{ eventType: 1, timestamp: -1 }', queries: 21, improvement: '~70% faster' },
    { impact: 'med', ns: 'app_db.products', idx: '{ category: 1, price: 1 }', queries: 15, improvement: '~60% faster (sort in memory removed)' },
  ],
  perf_slow_queries: [
    { ns: 'app_db.orders', shape: '{ customerId: ?, status: ? }', time: '412ms', count: 1240, examined: '12,400', idx: 'COLLSCAN' },
    { ns: 'app_db.sessions', shape: '{ userId: ? }', time: '287ms', count: 980, examined: '8,900', idx: 'COLLSCAN' },
    { ns: 'analytics.events', shape: '{ eventType: ?, timestamp: {$gt:?} }', time: '196ms', count: 540, examined: '45,000', idx: 'timestamp_1' },
    { ns: 'app_db.products', shape: '{ category: ? } sort { price: 1 }', time: '154ms', count: 310, examined: '6,200', idx: 'category_1' },
    { ns: 'app_db.users', shape: '{ email: ? }', time: '98ms', count: 2100, examined: '1', idx: 'email_1 ✓' },
  ],
  ip_access_list: [
    { ip: '10.0.0.0/16', comment: 'Internal VPC', added: 'Jan 01' },
    { ip: '203.0.113.42/32', comment: 'Office VPN gateway', added: 'Jan 05' },
    { ip: '198.51.100.0/24', comment: 'Monitoring subnet', added: 'Jan 10' },
  ],
  audit_events: [
    { ts: '2024-01-15 10:42:18', user: 'admin@mongodb-brazil.com', action: 'createUser', res: 'app_db.app_service', ip: '10.0.1.42', result: 'success' },
    { ts: '2024-01-15 10:38:02', user: 'app_service', action: 'authenticate', res: 'app_db', ip: '10.0.2.15', result: 'success' },
    { ts: '2024-01-15 10:35:51', user: 'unknown', action: 'authenticate', res: 'admin', ip: '203.0.113.99', result: 'fail' },
    { ts: '2024-01-15 10:30:14', user: 'admin@mongodb-brazil.com', action: 'dropCollection', res: 'staging.temp_data', ip: '10.0.1.42', result: 'success' },
    { ts: '2024-01-15 10:22:40', user: 'analytics_ro', action: 'authCheck', res: 'analytics.events (find)', ip: '10.0.2.88', result: 'success' },
    { ts: '2024-01-15 10:18:33', user: 'analytics_ro', action: 'authCheck', res: 'app_db.users (find)', ip: '10.0.2.88', result: 'fail' },
    { ts: '2024-01-15 10:05:11', user: 'backup_user', action: 'authenticate', res: 'admin', ip: '10.0.1.10', result: 'success' },
    { ts: '2024-01-15 09:58:02', user: 'admin@mongodb-brazil.com', action: 'updateRole', res: 'admin.appWriter', ip: '10.0.1.42', result: 'success' },
  ],
  activity: [
    { time: '2024-01-15 10:42', user: 'admin@mongodb-brazil.com', action: 'EDIT', resource: 'rs-prod-01', details: 'Changed oplog size to 10GB' },
    { time: '2024-01-15 09:15', user: 'System', action: 'SNAPSHOT', resource: 'rs-prod-01', details: 'Automated snapshot completed (42GB)' },
    { time: '2024-01-15 08:30', user: 'System', action: 'ALERT RESOLVED', resource: 'rs-prod-01', details: 'High connections alert auto-resolved' },
    { time: '2024-01-15 07:00', user: 'john.doe@mongodb-brazil.com', action: 'CREATE', resource: 'sharded-analytics', details: 'Added shard: shard-03' },
    { time: '2024-01-14 22:10', user: 'System', action: 'UPGRADE', resource: 'rs-staging', details: 'MongoDB upgraded 6.0.11 → 6.0.12' },
    { time: '2024-01-14 18:00', user: 'admin@mongodb-brazil.com', action: 'USER CREATE', resource: 'Security', details: 'New user: app_readonly created' },
    { time: '2024-01-14 14:20', user: 'admin@mongodb-brazil.com', action: 'BACKUP CONFIG', resource: 'rs-prod-01', details: 'Retention policy updated to 30 days' },
  ],
}

let STATE = seed()
const ok = (v) => Promise.resolve(v)
// Mesmo formato de erro do axios, para as páginas lerem error.response.data.detail
const fail = (detail) => Promise.reject(Object.assign(new Error(detail), { response: { data: { detail } } }))
const findCluster = (id) => STATE.clusters.find((c) => c.id === id)
const logActivity = (user, action, resource, details) => STATE.activity.unshift({ time: 'agora', user, action, resource, details })

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

// Operações vivas por cluster: persistem entre polls para o Kill valer.
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
  meta: () => ok({ org: STATE.org, project: STATE.project }),

  dashboard: () => ok({
    total_clusters: STATE.clusters.length,
    healthy: STATE.clusters.filter((c) => c.status === 'healthy').length,
    warning: STATE.clusters.filter((c) => c.status === 'warning' || c.status === 'critical').length,
    hosts: STATE.clusters.reduce((a, c) => a + c.nodes.length, 0),
    open_alerts: STATE.alerts_open.length,
    top_alert: topAlert(),
    snapshots: STATE.snapshots.length + STATE.snapshot_base,
    clusters: STATE.clusters,
    activity: STATE.activity.slice(0, 3),
  }),

  clusters: () => { expireResyncs(); return ok(STATE.clusters) },
  createCluster: (b) => {
    const nome = (b.name || '').trim()
    if (!nome) return fail('Nome do cluster é obrigatório.')
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(nome)) return fail('Nome inválido: use letras, números, ponto, hífen ou underscore (até 64).')
    if (b.members !== undefined && !(b.members >= 1 && b.members <= 12)) return fail('Número de nós deve estar entre 1 e 12.')
    b = { ...b, name: nome }
    if (findCluster(b.name)) return Promise.reject({ response: { data: { detail: `Cluster "${b.name}" já existe.` } } })
    const typeKey = { 'Replica Set': 'rs', 'Sharded Cluster': 'sharded', Standalone: 'standalone' }[b.type] || 'rs'
    const members = typeKey === 'standalone' ? 1 : (b.members || 3)
    const nodes = Array.from({ length: members }, (_, i) => ({
      host: `${b.name}-node-0${i + 1}.mongodb-brazil.internal:${b.port || '27017'}`,
      role: typeKey === 'standalone' ? 'Standalone' : (i === 0 ? 'PRIMARY' : 'SECONDARY'),
      version: b.version || '7.0.5', status: 'green', uptime: 'just now', conn: 0, disk: 5, lag: i === 0 ? '—' : '0.0s',
    }))
    const cluster = { id: b.name, type: typeKey, name: b.name, version: b.version || '7.0.5', status: 'healthy', nodes }
    STATE.clusters.push(cluster)
    registerAgents(cluster)
    logActivity('admin@mongodb-brazil.com', 'CREATE', b.name, `Provisioned ${b.type} with ${members} node(s)`)
    return ok(cluster)
  },
  deleteCluster: (id) => {
    const c = findCluster(id)
    if (!c) return fail('Cluster não encontrado')
    STATE.clusters.splice(STATE.clusters.indexOf(c), 1)
    dropAgents(c)
    const fechados = closeAlertsFor(c.name)
    logActivity('admin@mongodb-brazil.com', 'TERMINATE', id, 'Cluster terminated')
    if (fechados) logActivity('System', 'ALERT CLOSE', id, `${fechados} alerta(s) fechado(s) junto com o cluster`)
    return ok({ ok: true, agents_removed: true, alerts_closed: fechados })
  },
  editCluster: (id, b) => { const c = findCluster(id); if (c && b.version) { c.version = b.version; c.nodes.forEach((n) => (n.version = b.version)) } return ok(c) },
  addNode: (id, b) => { const c = findCluster(id); const host = b.host || `${c.name}-node-0${c.nodes.length + 1}.mongodb-brazil.internal:27017`; c.nodes.push({ host, role: 'SECONDARY', version: c.version, status: 'green', uptime: 'just now', conn: 0, disk: 3, lag: '0.0s' }); registerAgents(c); logActivity('admin@mongodb-brazil.com', 'ADD NODE', c.name, `Nó ${host} adicionado ao replica set`); return ok(c) },
  stepDown: (id, idx) => {
    const c = findCluster(id)
    if (!c || idx < 0 || idx >= c.nodes.length) return fail('Nó não encontrado')
    const oldP = c.nodes.find((n) => n.role === 'PRIMARY')
    const newP = c.nodes.find((n, i) => i !== idx && n.role === 'SECONDARY')
    if (!oldP || !newP) return fail('Step down exige um PRIMARY e ao menos um SECONDARY elegível.')
    oldP.role = 'SECONDARY'; newP.role = 'PRIMARY'
    oldP.lag = '0.0s'; newP.lag = '—'
    logActivity('admin@mongodb-brazil.com', 'STEP DOWN', c.name, `Novo PRIMARY: ${newP.host}`)
    return ok({ new_primary: newP.host, cluster: c })
  },
  resyncNode: (id, idx) => {
    const c = findCluster(id)
    if (!c || idx < 0 || idx >= c.nodes.length) return fail('Nó não encontrado')
    const n = c.nodes[idx]
    if (n.role === 'PRIMARY') return fail('Faça step down antes de ressincronizar o PRIMARY.')
    n.status = 'yellow'; n.state = 'STARTUP2'; n.lag = 'sync'
    n.resync_until = Date.now() + RESYNC_SECONDS * 1000
    logActivity('admin@mongodb-brazil.com', 'RESYNC', c.name, `Initial sync iniciado em ${n.host}`)
    return ok({ ok: true, seconds: RESYNC_SECONDS, cluster: c })
  },
  upgradeCluster: (id, b) => { const c = findCluster(id); c.version = b.target_version; c.nodes.forEach((n) => (n.version = b.target_version)); logActivity('System', 'UPGRADE', id, `Rolling upgrade to ${b.target_version}`); return ok(c) },

  automation: () => ok({ agents_active: STATE.agents.length, pending: STATE.pending_changes, history: STATE.automation_history }),
  applyPending: (pid) => {
    const pc = STATE.pending_changes.find((p) => p.id === pid)
    if (pc) {
      STATE.pending_changes.splice(STATE.pending_changes.indexOf(pc), 1)
      STATE.automation_history.unshift({ time: 'agora', cluster: pc.cluster, change: pc.desc, status: 'success', duration: `${rand(2, 9)}m ${rand(0, 59)}s`, by: 'admin' })
    }
    return ok({ ok: true, pending: STATE.pending_changes })
  },
  discardPending: (pid) => { const pc = STATE.pending_changes.find((p) => p.id === pid); if (pc) STATE.pending_changes.splice(STATE.pending_changes.indexOf(pc), 1); return ok({ ok: true, pending: STATE.pending_changes }) },
  agents: () => {
    const versoes = [...new Set(STATE.agents.map((a) => a.version))].sort()
    return ok({ agents: STATE.agents, version: versoes[0] || STATE.agent_version || '12.0.27', latest: AGENT_LATEST, running: STATE.agents.filter((a) => a.status === 'Running').length })
  },
  agentLogs: (host) => {
    const a = STATE.agents.find((x) => x.host === host)
    if (!a) return fail('Agent não encontrado')
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
    return ok({ host: a.host, cluster: a.cluster, version: a.version,
      lines: linhas.map(([off, level, msg]) => ({ ts: new Date(agora - off * 1000).toTimeString().slice(0, 8), level, msg })) })
  },
  upgradeAgents: () => {
    STATE.agents.forEach((a) => (a.version = AGENT_LATEST))
    STATE.agent_version = AGENT_LATEST
    logActivity('admin@mongodb-brazil.com', 'AGENT UPGRADE', 'Automation', `${STATE.agents.length} agent(s) em ${AGENT_LATEST}`)
    return ok({ ok: true, version: AGENT_LATEST })
  },

  metrics: (id) => {
    const c = findCluster(id)
    if (!c) return Promise.reject(new Error('Cluster não encontrado'))
    delete WALKS[id]
    const now = Date.now()
    const points = Array.from({ length: WINDOW }, (_, k) => ({ ...point(c), t: now - (WINDOW - 1 - k) * 1000 }))
    return ok({ cluster: c.name, node_count: c.nodes.length, window: WINDOW, ...flatten(points) })
  },
  metricsTick: (id) => {
    const c = findCluster(id)
    if (!c) return Promise.reject(new Error('Cluster não encontrado'))
    return ok(point(c))
  },
  realtime: (id) => {
    const c = findCluster(id)
    if (!c) return fail('Cluster não encontrado')
    const ops = (RT_OPS[id] = RT_OPS[id] || Array.from({ length: 3 }, rtNewOp))
    ops.forEach((o) => { o.secs = Math.round((o.secs + 0.3 + Math.random() * 0.7) * 100) / 100 })
    let vivos = ops.filter((o) => o.secs < 4)
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
  killOp: (id, opid) => {
    const ops = RT_OPS[id] || []
    const alvo = ops.find((o) => o.opid === opid)
    if (!alvo) return fail('Operação já terminou ou não existe.')
    RT_OPS[id] = ops.filter((o) => o.opid !== opid)
    logActivity('admin@mongodb-brazil.com', 'KILL OP', id, `db.killOp(${opid}) em ${alvo.ns}`)
    return ok({ ok: true, killed: alvo })
  },

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
  createIndex: (idx) => { const removed = STATE.perf_index_suggestions.splice(idx, 1)[0]; return ok({ ok: true, created: removed, remaining: STATE.perf_index_suggestions }) },

  backup: () => ok({ protected: STATE.clusters.filter((c) => c.type !== 'standalone').length, total_snapshots: STATE.snapshots.length + STATE.snapshot_base, snapshots: STATE.snapshots }),
  takeSnapshot: (cluster) => { if (!STATE.clusters.some((c) => c.name === cluster)) return fail(`Cluster "${cluster}" não encontrado.`); const lastNum = STATE.snapshots.length ? parseInt(STATE.snapshots[0].id.split('-')[1]) : 142; const snap = { id: `snap-${String(lastNum + 1).padStart(5, '0')}`, cluster, type: 'Manual', created: 'agora', size: '42 GB', expires: '2024-02-15', status: 'ready' }; STATE.snapshots.unshift(snap); return ok(snap) },
  deleteSnapshot: (sid) => { const s = STATE.snapshots.find((x) => x.id === sid); if (s) STATE.snapshots.splice(STATE.snapshots.indexOf(s), 1); return ok({ ok: true }) },

  restoreJobs: () => { updateRestoreJobs(); return ok(STATE.restore_jobs.map(publicJob)) },
  startRestore: (b) => {
    if (!STATE.clusters.some((x) => x.name === b.cluster)) return fail(`Cluster "${b.cluster}" não encontrado.`)
    const lastNum = STATE.restore_jobs.length ? parseInt(STATE.restore_jobs[0].id.split('-')[1]) : 142
    const now = Date.now()
    const job = {
      id: `rst-${String(lastNum + 1).padStart(5, '0')}`, cluster: b.cluster, type: 'PIT',
      point: b.point, target: b.target || 'same', status: 'queued',
      started: new Date().toISOString().slice(0, 16).replace('T', ' '),
      _runningAt: now + RESTORE_RUNNING_SECONDS * 1000, _doneAt: now + RESTORE_TOTAL_SECONDS * 1000,
    }
    STATE.restore_jobs.unshift(job)
    logActivity('admin@mongodb-brazil.com', 'RESTORE', b.cluster, `Point-in-time restore iniciado (${b.point} → ${b.target || 'same'})`)
    return ok({ ok: true, seconds: RESTORE_TOTAL_SECONDS, job: publicJob(job) })
  },

  alerts: () => { expireAcks(); return ok({ open: STATE.alerts_open, closed_count: STATE.alerts_closed_count, configs: STATE.alert_configs }) },
  acknowledgeAlert: (aid) => {
    const a = STATE.alerts_open.find((x) => x.id === aid)
    if (!a) return fail('Alerta não encontrado')
    if (a.acked) return fail('Alerta já reconhecido.')
    a.acked = true; a.acked_until = Date.now() + ACK_MINUTES * 60000; a.acked_by = 'admin@mongodb-brazil.com'
    logActivity('admin@mongodb-brazil.com', 'ALERT ACK', a.target, `${a.title} silenciado por ${ACK_MINUTES}min`)
    return ok({ ok: true, alert: a, minutes: ACK_MINUTES })
  },
  resolveAlert: (aid) => { const a = STATE.alerts_open.find((x) => x.id === aid); if (!a) return fail('Alerta não encontrado'); logActivity('admin@mongodb-brazil.com', 'ALERT RESOLVE', a.target, a.title); if (a) { STATE.alerts_open.splice(STATE.alerts_open.indexOf(a), 1); STATE.alerts_closed_count++ } return ok({ ok: true, open: STATE.alerts_open, closed_count: STATE.alerts_closed_count }) },
  addAlertConfig: (b) => { const cfg = { cond: b.cond, target: b.target, thresh: b.thresh, notify: b.notify || 'Email', on: true }; STATE.alert_configs.unshift(cfg); return ok(cfg) },
  deleteAlertConfig: (idx) => { STATE.alert_configs.splice(idx, 1); return ok({ ok: true }) },

  users: () => ok(STATE.users),
  addUser: (b) => { const nome = (b.name || '').trim(); if (!nome) return fail('Username é obrigatório.'); if (STATE.users.some((x) => x.name === nome)) return fail(`Usuário "${nome}" já existe.`); b = { ...b, name: nome }; const u = { name: b.name, auth: b.auth, roles: [b.role], db: b.role.includes('@') ? b.role.split('@')[1] : 'admin', created: 'just now', status: 'active' }; STATE.users.unshift(u); logActivity('admin@mongodb-brazil.com', 'USER CREATE', 'Security', `New user: ${b.name}`); return ok(u) },
  deleteUser: (name) => { const u = STATE.users.find((x) => x.name === name); if (u) STATE.users.splice(STATE.users.indexOf(u), 1); return ok({ ok: true }) },
  roles: () => ok(STATE.roles),
  addRole: (b) => { const r = { name: b.name, priv: b.priv || 'find', inherits: b.inherits || '(none)', users: 0 }; STATE.roles.unshift(r); return ok(r) },
  deleteRole: (idx) => { STATE.roles.splice(idx, 1); return ok({ ok: true }) },
  ips: () => ok(STATE.ip_access_list),
  addIp: (b) => { const e = { ip: b.ip, comment: b.comment || '—', added: 'just now' }; STATE.ip_access_list.push(e); return ok(e) },
  deleteIp: (idx) => { STATE.ip_access_list.splice(idx, 1); return ok({ ok: true }) },
  audit: () => ok(STATE.audit_events),

  activity: () => ok(STATE.activity),
  reset: () => { STATE = seed(); return ok({ ok: true }) },
}
