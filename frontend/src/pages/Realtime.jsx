import { useEffect, useState, useRef } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import { Select, Option } from '@leafygreen-ui/select'
import { Subtitle, Body, Description } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { palette } from '@leafygreen-ui/palette'
import { useDarkMode } from '@leafygreen-ui/leafygreen-provider'
import { PageHeader, StatCard, Grid, DataTable, Loading } from '../components/ui'
import { API, errMsg } from '../api/client'

function Bar({ pct }) {
  const { darkMode } = useDarkMode()
  return (
    <span style={{ width: 100, height: 6, borderRadius: 3, background: darkMode ? palette.gray.dark1 : palette.gray.light2, display: 'inline-block', overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: palette.green.base }} />
    </span>
  )
}

export default function Realtime({ toast }) {
  const [clusters, setClusters] = useState([])
  const [cid, setCid] = useState(null)
  const [rt, setRt] = useState(null)
  const [paused, setPaused] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [offline, setOffline] = useState(false)
  const loadClusters = () => API.clusters()
    .then((cs) => { setOffline(false); setClusters(cs); setCid((cur) => (cs.some((c) => c.id === cur) ? cur : cs[0]?.id)); setLoaded(true) })
    .catch(() => { setOffline(true); setLoaded(true) })
  const inFlight = useRef(false)
  const hasData = useRef(false)

  useEffect(() => { loadClusters() }, [])

  useEffect(() => {
    if (!cid) return
    setRt(null)
    hasData.current = false
    let vivo = true
    const tick = () => {
      // aba oculta ou request anterior em voo: pula a rodada
      if (inFlight.current || document.visibilityState === 'hidden') return
      inFlight.current = true
      API.realtime(cid)
        .then((d) => { if (vivo) { hasData.current = true; setRt(d) } })
        .catch(() => { setPaused(true); if (vivo && !hasData.current) setOffline(true) }) // cluster removido ou backend fora: para de martelar
        .finally(() => { inFlight.current = false })
    }
    tick()
    const id = setInterval(() => { if (!paused) tick() }, 1000)
    return () => { vivo = false; clearInterval(id) }
  }, [cid, paused])

  const kill = async (opid) => {
    try {
      await API.killOp(cid, opid)
      toast('Operação encerrada', `db.killOp(${opid}) executado.`, 'warning')
      setRt((cur) => (cur ? { ...cur, in_progress: cur.in_progress.filter((o) => o.opid !== opid) } : cur))
    } catch (e) { toast('Erro', errMsg(e), 'warning') }
  }


  if (offline) {
    return (
      <div role="alert">
        <PageHeader title="Real-Time" subtitle="Backend indisponível" />
        <Card>
          <Subtitle style={{ fontSize: 14 }}>Não foi possível falar com a API local da demo</Subtitle>
          <Description style={{ marginTop: spacing[200] }}>
            Verifique se o backend está rodando em 127.0.0.1:8077 (<code>./start.sh</code>). Se o processo foi reiniciado, o estado volta ao inicial.
          </Description>
          <Button style={{ marginTop: spacing[300] }} onClick={() => { setOffline(false); setPaused(false); loadClusters() }}>Tentar novamente</Button>
        </Card>
      </div>
    )
  }

  if (loaded && clusters.length === 0) {
    return (
      <div>
        <PageHeader title="Real-Time Performance Panel" subtitle="Nenhum deployment monitorado" />
        <Card>
          <Subtitle style={{ fontSize: 14 }}>Sem clusters neste projeto</Subtitle>
          <Body style={{ marginTop: spacing[200], color: palette.gray.base }}>
            Provisione um deployment em <b>All Clusters</b> para o painel voltar a receber operações.
          </Body>
        </Card>
      </div>
    )
  }

  if (!rt) return <Loading />

  const maxHot = Math.max(1, ...rt.hottest.map((h) => h.ops))
  const ipCols = [
    { header: 'OpId', render: (r) => <code>{r.opid}</code> },
    { header: 'Operation', render: (r) => <Badge variant={r.op === 'query' ? 'blue' : r.op === 'insert' ? 'green' : 'lightgray'}>{r.op}</Badge> },
    { header: 'Namespace', render: (r) => <code style={{ fontSize: 12 }}>{r.ns}</code> },
    { header: 'Client', render: (r) => <span style={{ fontSize: 12, color: palette.gray.base }}>{r.client || '—'}</span> },
    { header: 'Running', render: (r) => <span style={{ color: r.secs > 2 ? palette.yellow.dark2 : undefined }}>{r.secs}s</span> },
    { header: 'Actions', render: (r) => <Button size="xsmall" variant="dangerOutline" onClick={() => kill(r.opid)}>Kill</Button> },
  ]
  const hotCols = [
    { header: 'Namespace', render: (r) => <code>{r.ns}</code> },
    { header: 'Ops/s', render: (r) => <b>{r.ops}</b> },
    { header: 'Activity', render: (r) => <Bar pct={Math.round((r.ops / maxHot) * 100)} /> },
  ]

  return (
    <div>
      <PageHeader title="Real-Time Performance Panel" subtitle={`${rt.cluster} · atualiza a cada segundo${paused ? ' (pausado)' : ''}`}
        actions={[
          <Select key="c" aria-label="Cluster" value={cid} onChange={setCid} allowDeselect={false} size="small">
            {clusters.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>,
          <Button key="p" onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '⏸ Pause'}</Button>,
        ]} />
      <Grid cols={4} style={{ marginBottom: spacing[600] }}>
        <StatCard label="Operations / sec" value={rt.ops_per_sec.toLocaleString()} />
        <StatCard label="Active Connections" value={rt.connections} sub="of 1,000 max" />
        <StatCard label="Network In/Out" value={`${rt.net_in} / ${rt.net_out}`} sub="MB/s" />
        <StatCard label="Documents / sec" value={`${rt.docs_per_sec}k`} sub="read + written" />
      </Grid>
      <Grid cols={2} gap={spacing[400]}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: spacing[400], borderBottom: `1px solid ${palette.gray.light2}` }}><Subtitle>⚡ Operations In Progress</Subtitle></div>
          <DataTable columns={ipCols} rows={rt.in_progress} />
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: spacing[400], borderBottom: `1px solid ${palette.gray.light2}` }}><Subtitle>🔥 Hottest Collections (live)</Subtitle></div>
          <DataTable columns={hotCols} rows={rt.hottest} />
        </Card>
      </Grid>
    </div>
  )
}
