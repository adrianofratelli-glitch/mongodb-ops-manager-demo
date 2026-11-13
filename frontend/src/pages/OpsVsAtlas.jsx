import Card from '@leafygreen-ui/card'
import { Body, Description } from '@leafygreen-ui/typography'
import { spacing } from '@leafygreen-ui/tokens'
import { PageHeader } from '../components/ui'
import COMPARE from '../lib/ops_vs_atlas.json'
import PRODUCT from '../api/product_status.json'

// Comparativo estático e honesto: o que o cliente on-prem ganha ou perde contra o Atlas.
// Sem preço e sem dado de cliente; cada linha cita a doc oficial (src/lib/ops_vs_atlas.json).
const shortUrl = (url) => url.replace(/^https:\/\/www\.mongodb\.com\/docs\//, '').replace(/^https:\/\/www\.mongodb\.com\//, '').replace(/\/$/, '')

export default function OpsVsAtlas() {
  return (
    <div>
      <PageHeader title="Ops Manager × Atlas" subtitle={`O que o cliente on-prem ganha e perde · Ops Manager ${PRODUCT.ops_manager_version} · doc lida em ${COMPARE.checked_on}`} />
      <Description style={{ marginBottom: spacing[400], maxWidth: 820 }}>
        Comparação de capacidades, não de preço. O Ops Manager faz parte do MongoDB Enterprise Advanced e roda onde o cliente
        quiser; o Atlas é o serviço gerenciado. Nada nesta página é medido: cada linha aponta a página oficial de onde saiu.
      </Description>
      <div className="ops-compare" role="table" aria-label="Comparativo Ops Manager e Atlas">
        <div className="ops-compare__row ops-compare__head" role="row">
          <span role="columnheader">Tema</span>
          <span role="columnheader">Ops Manager 9.0 (on-prem)</span>
          <span role="columnheader">Atlas</span>
          <span role="columnheader">Leitura</span>
        </div>
        {COMPARE.rows.map((r) => (
          <Card key={r.topic} className="ops-compare__row" role="row">
            <Body weight="medium" role="rowheader">{r.topic}</Body>
            <Body role="cell"><span className="ops-compare__label">Ops Manager 9.0</span>{r.ops_manager}</Body>
            <Body role="cell"><span className="ops-compare__label">Atlas</span>{r.atlas}</Body>
            <div role="cell">
              <Body><span className="ops-compare__label">Leitura</span>{r.verdict}</Body>
              <Description className="ops-compare__sources">
                {r.sources.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer">{shortUrl(u)}</a>)}
              </Description>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
