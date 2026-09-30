// Exportação CSV local: nada sai do browser, mas o arquivo é real.
function celula(v) {
  const t = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' | ') : String(v)
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export function paraCsv(linhas, colunas) {
  if (!linhas.length) return ''
  const cols = colunas || Object.keys(linhas[0])
  return [cols.join(','), ...linhas.map((l) => cols.map((c) => celula(l[c])).join(','))].join('\n')
}

export function baixarCsv(nome, linhas, colunas) {
  const blob = new Blob(['﻿' + paraCsv(linhas, colunas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
