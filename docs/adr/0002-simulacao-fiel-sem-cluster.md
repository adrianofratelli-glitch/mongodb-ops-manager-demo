# ADR 0002 — Simulação fiel ao produto atual, sem depender de cluster

- Data: 2026-11-13
- Status: aceito

## Contexto

A avaliação do portfólio (rodada pós-fase 3) apontou duas lacunas: "simulação" e "laboratório desligado".
A decisão do dono da PoV é manter a demo como **simulação**: ela não deve depender de um cluster, e o
laboratório real do Performance Advisor ([ADR 0001](0001-laboratorio-real-performance-advisor.md)) continua
opcional e desligado por padrão.

Rodando a demo, o que fragilizava a simulação não era a falta de banco, e sim a distância do produto de hoje:
o catálogo aceitava MongoDB 4.4 e 5.0 (EOL no Ops Manager 9.0), eventos datados de 2024 numa tela "Ops Manager
9.0.1", um conceito do Atlas (IP access list de rede) na tela de segurança do Ops Manager, CSFLE como chave
de projeto, e nenhuma tela dizia o que viria do produto real.

## Decisão

1. **Fonte única de status de produto** (`frontend/src/api/product_status.json`): versão do Ops Manager,
   agentes, matriz de suporte e data da conferência, lida pelo backend e pelo mock. Série EOL é recusada
   (422); série Deprecated é aceita com aviso.
2. **Nota por tela** (`components/ProductNote.jsx` + `lib/product_notes.json`): o que é simulado ali, o que
   o Ops Manager 9.0 real faz (com o endpoint da Administration API quando houver), como fica no Atlas e a
   fonte. A nota fica no shell, então toda seção nova precisa de uma entrada (teste garante).
3. **Página "Ops Manager × Atlas"** (`lib/ops_vs_atlas.json`): ganhos e perdas do on-prem, sem preço e sem dado
   de cliente, uma fonte oficial por linha.
4. Registro das afirmações e correções em [`docs/status-de-produto.md`](../status-de-produto.md).

## Consequências

- A demo continua rodando sem `.env`, no Docker e no GitHub Pages; nenhuma rota nova escreve em banco.
- O texto de produto envelhece: reconferir as páginas a cada release do Ops Manager e mudar `checked_on` nos
  três arquivos de uma vez (`backend/tests/test_product_status.py` exige datas iguais).
- O que a doc não diz literalmente aparece como "inferido"; números de patch seguem fictícios.

## Alternativas descartadas

- Ligar o laboratório por padrão ou integrar a um Ops Manager real: contraria a decisão do dono e cria
  dependência de infraestrutura para a demo abrir.
- Banner único "tudo é simulado": já existia (chip no topo) e não diz o que viria do produto real.
