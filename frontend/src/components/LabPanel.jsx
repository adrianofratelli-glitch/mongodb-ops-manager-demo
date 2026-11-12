import { useEffect, useState } from 'react'
import Card from '@leafygreen-ui/card'
import Badge from '@leafygreen-ui/badge'
import Button from '@leafygreen-ui/button'
import Banner from '@leafygreen-ui/banner'
import ConfirmationModal from '@leafygreen-ui/confirmation-modal'
import { Subtitle, Body, Description } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { palette } from '@leafygreen-ui/palette'
import { DataTable } from './ui'
import { API, errMsg } from '../api/client'

// Laboratório real do Performance Advisor (backend/lab.py). Diferente do resto da
// tela, estes números vêm de explain("executionStats") executado num MongoDB de
// verdade, sobre coleções fictícias geradas pelo próprio backend.
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('pt-BR'))

function PlanCell({ r }) {
  if (!r) return <span>—</span>
  const variant = r.collscan ? 'red' : r.in_memory_sort ? 'yellow' : 'green'
  return <Badge variant={variant}>{r.plan || '—'}</Badge>
}

function Comparison({ result }) {
  const { before, after } = result
  const rows = [
    { m: 'Plano vencedor', b: <PlanCell r={before} />, a: <PlanCell r={after} /> },
    { m: 'Índice usado', b: <code>{before?.index_used || 'nenhum'}</code>, a: <code>{after?.index_used || 'nenhum'}</code> },
    { m: 'Docs examinados', b: fmt(before?.docs_examined), a: <b style={{ color: palette.green.base }}>{fmt(after?.docs_examined)}</b> },
    { m: 'Chaves examinadas', b: fmt(before?.keys_examined), a: fmt(after?.keys_examined) },
    { m: 'Docs devolvidos', b: fmt(before?.returned), a: fmt(after?.returned) },
    { m: 'Tempo no servidor', b: `${fmt(before?.ms)} ms`, a: `${fmt(after?.ms)} ms` },
  ]
  const cols = [
    { header: 'Métrica (executionStats)', key: 'm' },
    { header: after ? 'Antes do índice' : 'Agora', render: (r) => r.b },
    ...(after ? [{ header: 'Depois do índice', render: (r) => r.a }] : []),
  ]
  const ratio = after && before?.docs_examined && after.docs_examined ? Math.round(before.docs_examined / after.docs_examined) : null
  return (
    <div style={{ minWidth: 0 }}>
      <Subtitle style={{ fontSize: 14, marginBottom: spacing[200] }}>{result.id} · {result.db}.{result.collection}</Subtitle>
      {ratio && <Body style={{ marginBottom: spacing[200] }}>Docs examinados caíram <b>{ratio}×</b> ({fmt(before.docs_examined)} → {fmt(after.docs_examined)}); índice criado em {fmt(result.build_ms)} ms.</Body>}
      <DataTable columns={cols} rows={rows} />
      <details style={{ marginTop: spacing[200] }} open>
        <summary style={{ cursor: 'pointer', fontSize: 12 }}>⌘ MQL executado no MongoDB real ({result.db})</summary>
        <pre style={{ margin: '8px 0 0', padding: 10, overflowX: 'auto', borderRadius: 8, background: '#03111a', fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {[result.create_index_mql, result.mql].filter(Boolean).join('\n')}
        </pre>
      </details>
    </div>
  )
}

export default function LabPanel({ toast }) {
  const [lab, setLab] = useState(null)
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const reload = () => API.lab().then(setLab).catch((e) => setLab({ enabled: false, reason: errMsg(e), scenarios: [] }))
  useEffect(() => { reload() }, [])

  const act = async (key, fn, ok) => {
    setBusy(key)
    try { const r = await fn(); ok?.(r); await reload() }
    catch (e) { toast('Laboratório', errMsg(e), 'warning') }
    finally { setBusy(null) }
  }

  const header = (
    <div style={{ padding: spacing[400], borderBottom: '1px solid #fdfff5', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Subtitle>🔬 Prova no MongoDB real</Subtitle>
      <Badge variant={lab?.enabled ? 'green' : 'lightgray'}>{lab?.enabled ? `MongoDB ${lab.server_version || ''} · ${lab.db}` : 'laboratório desligado'}</Badge>
    </div>
  )
  if (!lab) return <Card style={{ padding: 0, marginBottom: spacing[600] }}>{header}<div style={{ padding: spacing[400] }}><Description>Verificando o laboratório…</Description></div></Card>

  const cols = [
    { header: 'Sugestão', render: (r) => <span><code>{r.id}</code><br /><code style={{ fontSize: 11 }}>{r.collection}</code></span> },
    { header: 'Índice sugerido', render: (r) => <code style={{ color: palette.green.dark1 }}>{JSON.stringify(r.index)}</code> },
    { header: 'Por quê', render: (r) => <span style={{ fontSize: 12 }}>{r.why}</span> },
    { header: 'Ações', render: (r) => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="xsmall" disabled={!lab.enabled || !lab.seeded || !!busy}
          onClick={() => act(`explain-${r.id}`, () => API.labExplain(r.id), (x) => setResult({ ...x, before: x.result, after: null, id: r.id, collection: r.collection }))}>
          {busy === `explain-${r.id}` ? 'Rodando…' : 'Explain'}
        </Button>
        <Button size="xsmall" variant="primary" disabled={!lab.enabled || !lab.seeded || !!busy || lab.lab_indexes?.[r.id]}
          onClick={() => act(`index-${r.id}`, () => API.labCreateIndex(r.id), (x) => { setResult({ ...x, id: r.id, collection: r.collection }); toast('Índice real criado', `${r.collection}: ${fmt(x.before.docs_examined)} → ${fmt(x.after.docs_examined)} docs examinados`, 'success') })}>
          {busy === `index-${r.id}` ? 'Criando…' : lab.lab_indexes?.[r.id] ? 'Índice criado' : 'Criar índice real'}
        </Button>
      </div>
    ) },
  ]

  return (
    <Card style={{ padding: 0, overflow: 'hidden', marginBottom: spacing[600] }}>
      {header}
      <div style={{ padding: spacing[400], display: 'flex', flexDirection: 'column', gap: spacing[300], minWidth: 0 }}>
        <Description>
          Os números acima são ilustrativos. Aqui não: o backend executa as mesmas formas de query num MongoDB de verdade,
          sobre coleções fictícias, e mostra o <code>explain("executionStats")</code> antes e depois do <code>createIndex</code>.
        </Description>
        {!lab.enabled && <Banner variant="info">{lab.reason} Para ligar: defina <code>MONGODB_URI</code> no ambiente ou no <code>.env</code> da PoV (banco padrão <code>opsmgr_lab</code>).</Banner>}
        {lab.enabled && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" variant={lab.seeded ? 'default' : 'primary'} disabled={!!busy}
              onClick={() => act('seed', () => API.labSeed(), (x) => toast('Laboratório', x.skipped ? 'Dados já estavam prontos.' : `Coleções recriadas em ${x.seconds}s`, 'success'))}>
              {busy === 'seed' ? 'Populando… (até ~30 s)' : lab.seeded ? 'Dados prontos' : 'Popular laboratório'}
            </Button>
            <Button size="small" variant="dangerOutline" disabled={!lab.seeded || !!busy || !Object.values(lab.lab_indexes || {}).some(Boolean)} onClick={() => setConfirmReset(true)}>
              Desfazer índices do lab
            </Button>
            {lab.seeded && <Description>{Object.entries(lab.counts || {}).map(([k, v]) => `${k}: ${fmt(v)}`).join(' · ')}</Description>}
          </div>
        )}
        <DataTable columns={cols} rows={lab.scenarios || []} />
        {result && <Comparison result={result} />}
      </div>
      <ConfirmationModal open={confirmReset} title="Desfazer índices do laboratório?" buttonText="Desfazer" variant="danger"
        onConfirm={() => { setConfirmReset(false); act('reset', () => API.labReset(), (x) => { setResult(null); toast('Laboratório', `${x.dropped.length} índice(s) removido(s); as queries voltam ao plano original.`, 'success') }) }}
        onCancel={() => setConfirmReset(false)}>
        Remove apenas os índices criados pelo laboratório (prefixo <code>opsmgr_lab_</code>) no banco {lab.db}. Os dados fictícios ficam.
      </ConfirmationModal>
    </Card>
  )
}
