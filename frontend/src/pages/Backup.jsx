import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Icon from '@leafygreen-ui/icon'
import { Select, Option } from '@leafygreen-ui/select'
import { Subtitle } from '@leafygreen-ui/typography'
import ConfirmationModal from '@leafygreen-ui/confirmation-modal'
import { spacing } from '@leafygreen-ui/tokens'
import { PageHeader, StatCard, Grid, DataTable, Loading } from '../components/ui'
import { API, errMsg } from '../api/client'

export default function Backup({ toast, refreshCounts }) {
  const [loadError, setLoadError] = useState(false)
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('all')
  const [toDelete, setToDelete] = useState(null)
  const reload = () => API.backup().then(setData).then(() => refreshCounts?.()).catch(() => setLoadError(true))
  useEffect(() => { reload() }, [])
  if (loadError) return <div role="alert">Backend indisponível. <Button onClick={() => { setLoadError(false); reload() }}>Tentar novamente</Button></div>
  if (!data) return <Loading />

  const snap = async (cluster) => {
    try { await API.takeSnapshot(cluster); toast('Snapshot criado!', `${cluster}`, 'success'); reload() }
    catch (e) { toast('Erro', errMsg(e), 'warning') }
  }
  const del = async (sid) => {
    try { await API.deleteSnapshot(sid); toast('Snapshot deletado', sid, 'warning'); reload() }
    catch (e) { toast('Erro', errMsg(e), 'warning') }
  }
  const restore = async (r) => {
    try {
      await API.startRestore({ cluster: r.cluster, point: r.created, target: 'same' })
      toast('Restore iniciado', `Point-in-time recovery de ${r.cluster} a partir de ${r.id} — acompanhe em Restore`, 'success')
    } catch (e) { toast('Erro', errMsg(e), 'warning') }
  }

  const filtered = filter === 'all' ? data.snapshots : data.snapshots.filter((s) => s.cluster === filter)
  const clusters = [...new Set(data.snapshots.map((s) => s.cluster))]

  const cols = [
    { header: 'Snapshot ID', render: (r) => <code>{r.id}</code> },
    { header: 'Cluster', key: 'cluster' },
    { header: 'Type', render: (r) => <Badge variant={r.type === 'Manual' ? 'blue' : 'lightgray'}>{r.type}</Badge> },
    { header: 'Created', key: 'created' },
    { header: 'Size', key: 'size' },
    { header: 'Expires', key: 'expires' },
    { header: 'Status', render: () => <Badge variant="green">✓ Ready</Badge> },
    { header: 'Actions', render: (r) => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="xsmall" onClick={() => restore(r)}>Restore</Button>
        <Button size="xsmall" variant="dangerOutline" onClick={() => setToDelete(r)}>Delete</Button>
      </div>
    ) },
  ]

  return (
    <div>
      <PageHeader title="Backup" subtitle="Continuous backup · Point-in-Time Recovery"
        actions={[<Button key="s" variant="primary" leftGlyph={<Icon glyph="Save" />} onClick={() => snap(clusters[0] || 'rs-prod-01')}>Take Snapshot Now</Button>]} />
      <Grid cols={4} style={{ marginBottom: spacing[600] }}>
        <StatCard label="Protected Clusters" value={data.protected} sub={<Badge variant="green">All active</Badge>} />
        <StatCard label="Total Snapshots" value={data.total_snapshots} sub="across all clusters" />
        <StatCard label="Storage Used" value="1.8 TB" sub={<Badge variant="green">Within quota</Badge>} />
        <StatCard label="Oplog Coverage" value="48h" sub={<Badge variant="green">PIT ready</Badge>} />
      </Grid>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: spacing[400], borderBottom: `1px solid #fdfff5`, display: 'flex', alignItems: 'center' }}>
          <Subtitle>Snapshots</Subtitle>
          <div style={{ marginLeft: 'auto', width: 200 }}>
            <Select aria-label="Filter" value={filter} onChange={setFilter} allowDeselect={false} size="small">
              <Option value="all">All Clusters</Option>
              {clusters.map((c) => <Option key={c} value={c}>{c}</Option>)}
            </Select>
          </div>
        </div>
        <DataTable columns={cols} rows={filtered} />
      </Card>

      <ConfirmationModal open={!!toDelete} title={`Delete ${toDelete?.id}?`} buttonText="Delete" variant="danger"
        onConfirm={() => { const r = toDelete; setToDelete(null); del(r.id) }}
        onCancel={() => setToDelete(null)}>
        Este snapshot não poderá ser restaurado depois de removido.
      </ConfirmationModal>
    </div>
  )
}
