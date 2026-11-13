import NOTES from '../lib/product_notes.json'

// "O que é simulado aqui" em cada tela: o que esta demo inventa, o que o Ops Manager 9.0
// real faria (com o endpoint da Administration API quando houver) e como fica no Atlas.
// Texto em src/lib/product_notes.json, conferido na doc oficial (docs/status-de-produto.md).
const host = (url) => { try { return new URL(url).pathname.replace(/\/$/, '').split('/').slice(-2).join('/') } catch { return url } }

export default function ProductNote({ section }) {
  const note = NOTES.notes[section]
  if (!note) return null
  return (
    <details className="ops-product-note" data-testid="product-note" data-section={section}>
      <summary>
        <span className="ops-product-note__tag">Simulado</span>
        <span>{note.simulated}</span>
      </summary>
      <dl>
        <dt>No Ops Manager 9.0 real</dt>
        <dd>{note.real}</dd>
        {note.api && (<><dt>Endpoint real (Administration API)</dt><dd><code>{note.api}</code></dd></>)}
        <dt>No Atlas</dt>
        <dd>{note.atlas}</dd>
        <dt>Fonte (lida em {NOTES.checked_on})</dt>
        <dd className="ops-product-note__sources">
          {note.sources.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{host(url)}</a>)}
        </dd>
      </dl>
    </details>
  )
}
