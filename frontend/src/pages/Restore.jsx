import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Banner from '@leafygreen-ui/banner'
import TextInput from '@leafygreen-ui/text-input'
import { Select, Option } from '@leafygreen-ui/select'
import { Subtitle, Body } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { palette } from '@leafygreen-ui/palette'
import { useDarkMode } from '@leafygreen-ui/leafygreen-provider'
import { PageHeader, Grid, DataTable, Loading } from '../components/ui'
import { API, errMsg } from '../api/client'

const STATUS_BADGE = { queued: ['lightgray', '⏳ Queued'], running: ['yellow', '● Running'], completed: ['green', '✓ Completed'] }

function nowLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

export default function Restore({ toast }) {
  const { darkMode } = useDarkMode()
  const [loadError, setLoadError] = useState(false)
  const [clusters, setClusters] = useState(null)
  const [jobs, setJobs] = useState(null)
  const [cluster, setCluster] = useState('')
  const [point, setPoint] = useState(nowLocal())
  const [target, setTarget] = useState('same')
  const [busy, setBusy] = useState(false)

  const reloadJobs = () => API.restoreJobs().then(setJobs).catch(() => setLoadError(true))
  const reload = () => {
    API.clusters().then((cs) => { setClusters(cs); if (cs.length) setCluster((c) => c || cs[0].name) }).catch(() => setLoadError(true))
    reloadJobs()
  }
  useEffect(() => { reload() }, [])

  // Enquanto um job estiver queued/running, a tabela se atualiza sozinha —
  // mesmo padrão do resync de nó em Deployments.jsx.
  const emAndamento = Array.isArray(jobs) && jobs.some((j) => j.status !== 'completed')
  useEffect(() => {
    if (!emAndamento) return
    const id = setInterval(reloadJobs, 2000)
    return () => clearInterval(id)
  }, [emAndamento])

  const start = async () => {
    if (!cluster) { toast('Validação', 'Selecione um cluster de origem.', 'warning'); return }
    setBusy(true)
    try {
      await API.startRestore({ cluster, point, target })
      toast('Restore iniciado', `Point-in-time recovery de ${cluster} em andamento…`, 'success')
      reloadJobs()
    } catch (e) { toast('Erro', errMsg(e), 'warning') }
    finally { setBusy(false) }
  }

  const cols = [
    { header: 'Job ID', render: (r) => <code>{r.id}</code> },
    { header: 'Cluster', key: 'cluster' },
    { header: 'Type', render: (r) => <Badge variant={r.type === 'PIT' ? 'blue' : 'lightgray'}>{r.type}</Badge> },
    { header: 'Restore Point', key: 'point' },
    { header: 'Target', key: 'target' },
    { header: 'Status', render: (r) => { const [v, l] = STATUS_BADGE[r.status] || STATUS_BADGE.queued; return <Badge variant={v}>{l}</Badge> } },
    { header: 'Started', key: 'started' },
  ]

  if (loadError) return <div role="alert">Backend indisponível. <Button onClick={() => { setLoadError(false); reload() }}>Tentar novamente</Button></div>
  if (!clusters || !jobs) return <Loading />

  return (
    <div>
      <PageHeader title="Restore" subtitle="Point-in-time & snapshot restore" />
      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: spacing[600] }}>
        <div style={{ padding: spacing[400], borderBottom: `1px solid #fdfff5` }}><Subtitle>Restore Jobs</Subtitle></div>
        <DataTable columns={cols} rows={jobs} />
      </Card>
      <Card>
        <Subtitle style={{ marginBottom: spacing[400] }}>🕐 Point-in-Time Recovery</Subtitle>
        <Grid cols={2} gap={spacing[500]}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing[300] }}>
            <Select label="Source Cluster" value={cluster} onChange={setCluster} allowDeselect={false}>
              {clusters.map((c) => <Option key={c.id} value={c.name}>{c.name}</Option>)}
            </Select>
            <TextInput label="Restore Point (UTC)" type="datetime-local" value={point} onChange={(e) => setPoint(e.target.value)} />
            <Select label="Restore Target" value={target} onChange={setTarget} allowDeselect={false}>
              <Option value="same">Restore to same cluster</Option>
              {clusters.filter((c) => c.name !== cluster).map((c) => <Option key={c.id} value={c.name}>Restore to {c.name}</Option>)}
              <Option value="download">Download as tar.gz</Option>
            </Select>
            <Banner variant="info">Oplog coverage: <b>Jan 13 00:00 → Jan 15 10:42 UTC</b>. Qualquer ponto nessa janela é recuperável. Job de restore roda em memória (queued → running → completed) para fins de demonstração.</Banner>
            <Button variant="primary" disabled={busy} onClick={start}>{busy ? 'Iniciando…' : 'Start Point-in-Time Restore'}</Button>
          </div>
          <div>
            <Body style={{ marginBottom: 10, fontWeight: 600 }}>Oplog Coverage Timeline</Body>
            <div style={{ background: darkMode ? palette.gray.dark3 : palette.gray.light3, borderRadius: 6, padding: 16, height: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: palette.gray.base, marginBottom: 6 }}>
                <span>Jan 13</span><span>Jan 14</span><span>Jan 15 (now)</span>
              </div>
              <div style={{ height: 20, background: `linear-gradient(90deg, ${palette.green.base}, ${palette.green.dark1})`, borderRadius: 4 }} />
              <Body style={{ fontSize: 12, color: palette.gray.base, marginTop: 14 }}><b>4 snapshots</b> disponíveis · último 2h atrás · 42 GB</Body>
            </div>
          </div>
        </Grid>
      </Card>
    </div>
  )
}
