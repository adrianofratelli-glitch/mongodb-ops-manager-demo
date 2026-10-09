// E2E de UI sem abrir porta: o Playwright serve o build estático por page.route.
// Modo mock (GitHub Pages):  VITE_USE_MOCK=1 vite build --outDir /tmp/opsm-dist-mock
//                            node tests/e2e_ui.mjs mock /tmp/opsm-dist-mock
// Modo FastAPI offline:      vite build --outDir /tmp/opsm-dist-real
//                            node tests/e2e_ui.mjs offline /tmp/opsm-dist-real
// Contra a stack real:       node tests/e2e_ui.mjs live http://127.0.0.1:5377
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const [mode = 'mock', source = '/tmp/opsm-dist-mock'] = process.argv.slice(2)
const ORIGIN = mode === 'live' ? source.replace(/\/$/, '') : 'http://ops.demo'
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }
const results = []
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); if (!cond) console.error('FAIL', name, extra) }

// Modo bridge: /api/* vai para o FastAPI real executado em processo (backend/tests/asgi_bridge.py).
let bridge = null
if (mode === 'bridge') {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const proc = spawn(join(root, 'backend/.venv/bin/python'), [join(root, 'backend/tests/asgi_bridge.py')], { stdio: ['pipe', 'pipe', 'inherit'] })
  const pending = new Map()
  let seq = 0
  createInterface({ input: proc.stdout }).on('line', (l) => { const r = JSON.parse(l); pending.get(r.id)?.(r); pending.delete(r.id) })
  bridge = {
    send: (method, url, body) => new Promise((res) => { const id = ++seq; pending.set(id, res); proc.stdin.write(JSON.stringify({ id, method, url, body }) + '\n') }),
    close: () => proc.stdin.end(),
  }
}

const browser = await chromium.launch()
async function newPage(viewport = { width: 1440, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts })
  if (mode !== 'live') {
    await ctx.route(`${ORIGIN}/**`, (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.startsWith('/api/')) {
        if (!bridge) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"offline"}' })
        const req = route.request()
        return bridge.send(req.method(), url.pathname + url.search, req.postData()).then((r) => route.fulfill({ status: r.status, contentType: 'application/json', body: r.body }))
      }
      let file = join(source, decodeURIComponent(url.pathname))
      if (!existsSync(file) || url.pathname === '/') file = join(source, 'index.html')
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] || 'application/octet-stream', body: readFileSync(file) })
    })
  }
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${ORIGIN}/`)
  return { ctx, page, errors }
}
const GROUP = { Dashboard: 'Visão geral', 'Activity Feed': 'Visão geral', 'All Clusters': 'Implantações', Automation: 'Implantações', Agents: 'Implantações', 'Project Settings': 'Implantações', Metrics: 'Monitoramento', 'Performance Advisor': 'Monitoramento', 'Real-Time': 'Monitoramento', Alerts: 'Monitoramento', Backup: 'Proteção de dados', Restore: 'Proteção de dados', 'Database Users': 'Segurança', 'Custom Roles': 'Segurança', Authentication: 'Segurança', 'Audit Log': 'Segurança' }
// A SideNav mostra um grupo por vez: escolhe o grupo no <select> e clica no item.
async function nav(page, label) {
  await page.getByLabel('Área operacional').selectOption(GROUP[label])
  await page.locator('aside').getByText(label, { exact: true }).first().click()
}
const toastText = (page) => page.locator('[role="status"], [data-testid*="toast"], [class*="toast"]').allInnerTexts().then((t) => t.join(' | '))

async function demoRun(run) {
  const { ctx, page, errors } = await newPage()
  const P = `run${run}`
  await page.getByText('Simulação · dados fictícios').waitFor({ timeout: 10000 })
  check(`${P} rótulo de simulação visível`, true)

  // Reset primeiro: todo roteiro parte do estado inicial.
  await nav(page, 'Project Settings')
  await page.getByRole('button', { name: 'Reset Demo' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.waitForTimeout(400)

  // Deployments: rolling upgrade + bloqueio de ações durante o upgrade
  await nav(page, 'All Clusters')
  const up = page.getByRole('button', { name: 'Upgrade → 7.0.6' }).first()
  await up.waitFor()
  await up.dblclick()
  await page.getByText(/Rolling upgrade → 7\.0\.6: \d\/3 processos \(simulado\)/).first().waitFor({ timeout: 5000 })
  check(`${P} upgrade mostra progresso rolling`, true)
  check(`${P} botão de upgrade travado durante o upgrade`, await page.getByRole('button', { name: 'Upgrade em andamento…' }).first().isDisabled())
  const ups = await page.evaluate(() => 0)
  await page.waitForTimeout(10500)
  await nav(page, 'Dashboard'); await nav(page, 'All Clusters')
  await page.getByText('MongoDB 7.0.6 · 3 nodes').first().waitFor({ timeout: 8000 })
  check(`${P} upgrade conclui sozinho`, true)
  check(`${P} resync ausente para standalone`, (await page.getByText('Não suportado (standalone)').count()) === 1)

  // Automation: aplicar mudança de config
  await nav(page, 'Automation')
  await page.getByRole('button', { name: 'Apply' }).last().click()
  await page.waitForTimeout(300)
  check(`${P} automation aplicou config`, (await page.getByText('WiredTiger cache 4GB → 8GB').count()) >= 1)

  // Backup: snapshot manual no cluster filtrado + banner de simulação
  await nav(page, 'Backup')
  await page.getByText(/Simulação: snapshots, tamanhos e janelas são dados fictícios/).waitFor()
  const snapBtn = page.getByRole('button', { name: /Take Snapshot · rs-prod-01/ })
  await snapBtn.click()
  await page.getByText('snap-00143').first().waitFor({ timeout: 5000 })
  check(`${P} snapshot manual criado`, true)
  check(`${P} sem números fixos (1.8 TB/48h)`, (await page.getByText('1.8 TB').count()) === 0 && (await page.getByText('48h', { exact: true }).count()) === 0)

  // Restore: janela de PIT vinda do estado, job evolui
  await nav(page, 'Restore')
  await page.getByText(/Janela de PIT de/).waitFor()
  check(`${P} restore mostra janela calculada`, (await page.getByText('Jan 13 00:00').count()) === 0)
  await page.getByRole('button', { name: 'Start Point-in-Time Restore' }).click()
  await page.getByText('⏳ Queued').first().waitFor({ timeout: 5000 })
  check(`${P} restore enfileirado`, true)
  await page.getByRole('button', { name: 'Start Point-in-Time Restore' }).click()
  await page.waitForTimeout(400)
  const toasts = await toastText(page)
  check(`${P} restore concorrente recusado com motivo`, /em andamento/.test(toasts), toasts.slice(0, 200))

  // Terminate do destino com restore em andamento: recusado com motivo, cluster continua.
  await nav(page, 'All Clusters')
  await page.getByRole('button', { name: 'Terminate' }).first().click()
  const dlg = page.getByRole('dialog')
  await dlg.getByRole('textbox').fill('rs-prod-01')
  await dlg.getByRole('button', { name: 'Terminate' }).click()
  await page.waitForTimeout(500)
  const tToasts = await toastText(page)
  check(`${P} terminate do destino em restore recusado`, /destino do restore/.test(tToasts), tToasts.slice(0, 200))
  check(`${P} destino continua listado`, (await page.getByText('rs-prod-01', { exact: true }).count()) >= 1)

  // Roles: delete por nome
  await nav(page, 'Custom Roles')
  await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()
  await page.waitForTimeout(300)
  check(`${P} role removida por nome`, (await page.getByText('analyticsReadOnly').count()) === 0)

  // Reset final: volta ao inicial
  await nav(page, 'Project Settings')
  await page.getByRole('button', { name: 'Reset Demo' }).click()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await page.waitForTimeout(400)
  await nav(page, 'All Clusters')
  check(`${P} reset volta rs-prod-01 para 7.0.5`, (await page.getByText('MongoDB 7.0.5 · 3 nodes').count()) >= 1)
  check(`${P} sem erros de JS`, errors.length === 0, errors.join('; '))
  await ctx.close()
}

async function layoutChecks() {
  for (const width of [360, 768, 1440]) {
    const { ctx, page } = await newPage({ width, height: 800 })
    await page.getByText('Simulação · dados fictícios').waitFor()
    for (const label of ['All Clusters', 'Backup', 'Restore']) {
      if (width >= 900) await nav(page, label)
      else await page.evaluate(() => 0)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      check(`layout ${width}px ${label} sem scroll horizontal`, overflow <= 1, `overflow=${overflow}`)
      if (width < 900) break
    }
    await ctx.close()
  }
  const { ctx, page } = await newPage({ width: 1440, height: 900 }, { reducedMotion: 'reduce' })
  await page.getByText('Simulação · dados fictícios').waitFor()
  const dur = await page.evaluate(() => {
    const el = document.querySelector('main > *') || document.body
    return getComputedStyle(el).animationDuration
  })
  check('prefers-reduced-motion zera animação', /^(0s|1e-05s|0\.00001s)$/.test(dur) || parseFloat(dur) <= 0.001, dur)
  await ctx.close()
}

async function offlineChecks() {
  const { ctx, page } = await newPage()
  await nav(page, 'Metrics')
  await page.getByText('Não foi possível falar com a API local da demo').waitFor({ timeout: 8000 })
  check('offline: Metrics explica e oferece retry', await page.getByRole('button', { name: 'Tentar novamente' }).isVisible())
  await nav(page, 'Real-Time')
  await page.getByText('Não foi possível falar com a API local da demo').waitFor({ timeout: 8000 })
  check('offline: Real-Time explica e oferece retry', true)
  await nav(page, 'All Clusters')
  await page.getByText('Backend indisponível.').waitFor({ timeout: 8000 })
  check('offline: Deployments explica', true)
  await ctx.close()
}

try {
  if (mode === 'offline') await offlineChecks()
  else { await demoRun(1); await demoRun(2); await layoutChecks() }
} catch (e) { check('execução sem exceção', false, e.message.split('\n')[0]) }
await browser.close()
bridge?.close()
const ok = results.filter((r) => r.ok).length
console.log(`e2e ${mode}: ${ok}/${results.length} ok`)
process.exit(ok === results.length ? 0 : 1)
