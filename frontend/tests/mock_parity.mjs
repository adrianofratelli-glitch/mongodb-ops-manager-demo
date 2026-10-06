// Paridade do mock (GitHub Pages) com o backend FastAPI.
// Executa os MESMOS cenários de backend/tests/scenarios_adversarial.json contra
// o MockAPI e verifica que o reset do mock volta exatamente ao seed.
// Uso: node frontend/tests/mock_parity.mjs   (sem dependências)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const { scenarios } = JSON.parse(readFileSync(join(here, '../../backend/tests/scenarios_adversarial.json'), 'utf8'))

const realNow = Date.now.bind(Date)
let offset = 0
Date.now = () => realNow() + offset

const { MockAPI } = await import('../src/api/mock.js')

const resolve = (value, path) => path.split('.').reduce((v, part) => (v == null ? null : (Array.isArray(v) ? v[Number(part)] ?? null : v[part] ?? null)), value)
const eq = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

let passed = 0
const failures = []
for (const sc of scenarios) {
  offset = 0
  await MockAPI.reset()
  try {
    for (const [n, step] of sc.steps.entries()) {
      const where = `${sc.name} · passo ${n}: ${JSON.stringify(step)}`
      if ('advance' in step) { offset += step.advance * 1000; continue }
      if ('get' in step) {
        let data = await MockAPI[step.get]()
        if (step.find) { const [[k, v]] = Object.entries(step.find); data = data.find((x) => x[k] === v) ?? null }
        const got = resolve(data, step.path)
        if ('equals' in step && !eq(got, step.equals)) throw new Error(`${where} → obtido ${JSON.stringify(got)}`)
        if ('contains' in step && !String(got).includes(step.contains)) throw new Error(`${where} → obtido ${JSON.stringify(got)}`)
        if ('length' in step && (got?.length ?? -1) !== step.length) throw new Error(`${where} → length ${got?.length}`)
        continue
      }
      let outcome
      try { await MockAPI[step.call](...step.args); outcome = { ok: true } } catch (e) { outcome = { ok: false, status: e?.response?.status, detail: e?.response?.data?.detail ?? e.message } }
      if (step.expect === 'ok') {
        if (!outcome.ok) throw new Error(`${where} → falhou: ${outcome.status} ${outcome.detail}`)
      } else {
        if (outcome.ok) throw new Error(`${where} → deveria falhar com ${step.expect.status}`)
        if (outcome.status !== step.expect.status) throw new Error(`${where} → status ${outcome.status} (${outcome.detail})`)
        if (step.expect.contains && !String(outcome.detail).includes(step.expect.contains)) throw new Error(`${where} → detail "${outcome.detail}"`)
      }
    }
    passed++
  } catch (e) { failures.push(e.message) }
}

// Reset do mock: estado após várias ações + reset == estado inicial.
offset = 0
await MockAPI.reset()
const initial = JSON.stringify(MockAPI._debugState())
await MockAPI.createCluster({ name: 'tmp-rs', type: 'Replica Set', members: 3 })
await MockAPI.takeSnapshot('rs-staging')
await MockAPI.upgradeCluster('rs-staging', { target_version: '6.0.13' })
await MockAPI.startRestore({ cluster: 'rs-prod-01', point: '2024-01-15T05:00', target: 'same' })
await MockAPI.acknowledgeAlert(1)
await MockAPI.deleteRole('appWriter')
await MockAPI.metrics('rs-prod-01')
await MockAPI.realtime('rs-prod-01')
await MockAPI.perfAdvisor()
const dirty = JSON.stringify(MockAPI._debugState())
await MockAPI.reset()
const after = JSON.stringify(MockAPI._debugState())
if (dirty === initial) failures.push('reset: ações não mudaram o estado (teste inválido)')
if (after !== initial) failures.push('reset: estado após reset difere do inicial')
else passed++

console.log(`mock parity: ${passed}/${scenarios.length + 1} ok`)
if (failures.length) { failures.forEach((f) => console.error('FAIL', f)); process.exit(1) }
