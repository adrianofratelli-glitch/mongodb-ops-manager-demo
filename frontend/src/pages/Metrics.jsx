import { useEffect, useState, useRef, useCallback } from 'react'
import Card from '@leafygreen-ui/card'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { Select, Option } from '@leafygreen-ui/select'
import { Subtitle, Description } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { palette } from '@leafygreen-ui/palette'
import { PageHeader, Grid, Loading } from '../components/ui'
import LineChart from '../components/LineChart'
import { API } from '../api/client'

const TICK_MS = 1000

function ChartCard({ title, hint, children }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: spacing[200] }}>
        <Subtitle style={{ fontSize: 14 }}>{title}</Subtitle>
        {hint && <Description style={{ marginLeft: 'auto' }}>{hint}</Description>}
      </div>
      {children}
    </Card>
  )
}

// Empurra o valor novo no fim da série e descarta o mais antigo — janela fixa.
const push = (arr, v, win) => (arr.length >= win ? [...arr.slice(arr.length - win + 1), v] : [...arr, v])

function append(m, pt) {
  const win = m.window || 60
  const p = (arr, v) => push(arr, v, win)
  const grp = (obj, src) => Object.fromEntries(Object.keys(obj).map((k) => [k, p(obj[k], src[k])]))
  return {
    ...m,
    t: p(m.t, pt.t),
    cpu: m.cpu.map((s, i) => ({ ...s, data: p(s.data, pt.cpu[i]?.value ?? 0) })),
    lag: m.lag.map((s, i) => ({ ...s, data: p(s.data, pt.lag[i]?.value ?? 0) })),
    memory: grp(m.memory, pt.memory),
    ops: grp(m.ops, pt.ops),
    connections: grp(m.connections, pt.connections),
    iops: grp(m.iops, pt.iops),
    network: grp(m.network, pt.network),
    cache: grp(m.cache, pt.cache),
  }
}

export default function Metrics() {
  const [clusters, setClusters] = useState([])
  const [cid, setCid] = useState(null)
  const [m, setM] = useState(null)
  const [live, setLive] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    API.clusters().then((cs) => { setClusters(cs); setCid(cs[0]?.id); setLoaded(true) }).catch(() => setLoaded(true))
  }, [])

  // Troca de cluster (ou refresh manual) recarrega a janela inteira.
  const reload = useCallback(() => {
    if (!cid) return
    setM(null)
    API.metrics(cid).then(setM).catch(() => {})
  }, [cid])
  useEffect(() => { reload() }, [reload])

  // Evolução: uma amostra por segundo, empurrada no fim da janela de 1 minuto.
  useEffect(() => {
    if (!cid || !live) return
    const id = setInterval(() => {
      if (inFlight.current || document.visibilityState === 'hidden') return
      inFlight.current = true
      API.metricsTick(cid)
        .then((pt) => setM((cur) => (cur && cur.cluster ? append(cur, pt) : cur)))
        .catch(() => setLive(false)) // cluster removido ou backend fora: para de martelar
        .finally(() => { inFlight.current = false })
    }, TICK_MS)
    return () => clearInterval(id)
  }, [cid, live])

  if (loaded && clusters.length === 0) {
    return (
      <div>
        <PageHeader title="Metrics" subtitle="Nenhum deployment monitorado" />
        <Card>
          <Subtitle style={{ fontSize: 14 }}>Sem clusters neste projeto</Subtitle>
          <Description style={{ marginTop: spacing[200] }}>
            Crie um deployment em <b>All Clusters → New Deployment</b> (ou use <b>Project Settings → Reset Demo</b>) para voltar a coletar métricas.
          </Description>
        </Card>
      </div>
    )
  }

  if (!m) return <Loading />

  const win = m.window || 60
  return (
    <div>
      <PageHeader title="Metrics" subtitle={`Janela móvel de ${win}s · ${m.cluster} (${m.node_count} node${m.node_count > 1 ? 's' : ''})`}
        actions={[
          <Select key="c" aria-label="Cluster" value={cid} onChange={setCid} allowDeselect={false} size="small">
            {clusters.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>,
          <Button key="l" onClick={() => setLive((v) => !v)}>{live ? '⏸ Pausar' : '▶ Retomar'}</Button>,
          <Button key="r" leftGlyph={<Icon glyph="Refresh" />} onClick={reload}>Refresh</Button>,
        ]} />
      <Grid cols={2} gap={spacing[400]}>
        <ChartCard title="CPU Utilization (%)" hint="per node">
          <LineChart times={m.t} yMax={100} series={m.cpu.map((s, i) => ({ label: s.label, data: s.data, fill: i === 0 }))} />
        </ChartCard>
        <ChartCard title="Memory Usage (GB)" hint="resident · virtual">
          <LineChart times={m.t} yMax={32} series={[{ label: 'Resident', data: m.memory.resident, fill: true }, { label: 'Virtual', data: m.memory.virtual }]} />
        </ChartCard>
        <ChartCard title="Operations / sec">
          <LineChart times={m.t} series={[{ label: 'query', data: m.ops.query }, { label: 'insert', data: m.ops.insert }, { label: 'update', data: m.ops.update }, { label: 'delete', data: m.ops.delete }]} />
        </ChartCard>
        <ChartCard title="Connections" hint="current · available">
          <LineChart times={m.t} series={[{ label: 'current', data: m.connections.current, fill: true }, { label: 'available', data: m.connections.available }]} />
        </ChartCard>
        <ChartCard title="Disk IOPS" hint="read · write">
          <LineChart times={m.t} series={[{ label: 'read', data: m.iops.read, fill: true }, { label: 'write', data: m.iops.write }]} />
        </ChartCard>
        <ChartCard title="Network I/O (MB/s)" hint="in · out">
          <LineChart times={m.t} series={[{ label: 'in', data: m.network.in, fill: true }, { label: 'out', data: m.network.out }]} />
        </ChartCard>
        <ChartCard title="Replication Lag (sec)" hint="secondaries">
          <LineChart times={m.t} series={m.lag.length ? m.lag.map((s, i) => ({ label: s.label, data: s.data, fill: i === 0 })) : [{ label: 'single node', data: m.t.map(() => 0), color: palette.gray.base }]} />
        </ChartCard>
        <ChartCard title="WiredTiger Cache (GB)" hint="used · dirty">
          <LineChart times={m.t} yMax={4} series={[{ label: 'used', data: m.cache.used, fill: true }, { label: 'dirty', data: m.cache.dirty }]} />
        </ChartCard>
      </Grid>
    </div>
  )
}
