# Auditoria técnica de desempenho — Sistema Guarani

**Base analisada:** `sociedade-guarani-main (5)(4).zip`  
**Data:** 29/10/2026  
**Escopo:** páginas, rotas API, consultas Supabase, ciclos de atualização, listas, histórico financeiro e testes.  
**Tipo:** auditoria estática do código incluído no ZIP. Não houve acesso ao projeto Supabase de produção, métricas da Vercel ou execução completa do build.

## Resumo executivo

O principal problema de desempenho confirmado no código era trabalho excessivo em telas de resumo: o painel carregava a API completa de carteirinhas/dependentes para calcular um único número, baixava reservas para contar PIX e repetia o ciclo a cada 15 segundos sem impedir sobreposição. A página Dependentes também fazia uma busca linear por titular para cada dependente ao calcular os totais.

Esses pontos foram corrigidos neste pacote. O painel passa a usar um endpoint de contagem leve, o número de PIX pendentes é calculado no banco, a atualização automática passa para 60 segundos e ciclos concorrentes são evitados. O cálculo de totais na página Dependentes usa o mapa de titulares já criado pela página.

A auditoria encontrou outros gargalos de arquitetura que exigem etapas posteriores, especialmente paginação de listas grandes e redução do histórico financeiro transferido para o navegador/servidor.

## Correções incluídas neste pacote

1. `app/painel/page.tsx`
   - Troca a carga completa `/api/carteirinhas?modo=dependentes` por `/api/dependentes/resumo` para o card de quantidade.
   - Troca o download completo das reservas por `/api/reservas?resumo=pix-pendentes`.
   - Aumenta a atualização automática de 15 para 60 segundos.
   - Evita iniciar outro ciclo enquanto as consultas do ciclo anterior ainda estão em andamento.
2. `app/api/reservas/route.ts`
   - Adiciona consulta de contagem no banco para reservas pendentes com pagamento PIX, sem buscar dados pessoais nem assinar arquivos.
3. `app/api/dependentes/resumo/route.ts`
   - Inclui identificação de registros já promovidos para Sócios, com fallback se a coluna de migração ainda não existir.
4. `app/dependentes/page.tsx`
   - Reutiliza `socioPorId` no cálculo de ativos/inativos, evitando `socios.find(...)` para cada dependente.
5. `tests/auditoria-performance.test.mjs`
   - Adiciona testes de regressão para os gargalos corrigidos.

## Achados priorizados

### P1 — Carga excessiva para contar dados no painel — corrigido neste pacote

**Arquivos:** `app/painel/page.tsx`, `app/api/carteirinhas/route.ts`, `app/api/reservas/route.ts`.

O painel utilizava a rota de carteirinhas/dependentes, que consulta associados, histórico de mensalidades e dependentes, embora precisasse apenas da contagem. Para o card de PIX, carregava a lista de reservas pendentes e os dados necessários para a tela de reservas, em vez de executar uma contagem SQL. O painel repetia essas operações a cada 15 segundos e ao focar/retornar à aba.

**Impacto provável:** uso excessivo de chamadas Supabase, CPU de funções serverless, tráfego e concorrência de requisições. A contagem de PIX agora usa `count/head`; o card de dependentes usa uma rota específica.

### P1 — Tela Dependentes ainda usa uma rota de domínio amplo

**Arquivos:** `app/dependentes/page.tsx`, `app/api/carteirinhas/route.ts`.

A tela chama `/api/carteirinhas?modo=dependentes`. Mesmo nesse modo, a API ainda busca até 5.000 registros de Sócios, consulta o histórico de mensalidades em lotes/páginas e só depois monta a resposta de dependentes. A resposta contém dados de que a listagem precisa, mas a rota também faz trabalho de carteirinhas e situação financeira.

**Impacto provável:** tempo de resposta cresce com o número de mensalidades históricas, não apenas com os 460 dependentes exibidos.

**Próxima correção recomendada:** criar uma rota de listagem dedicada para Dependentes, com campos estritamente necessários e resumo financeiro agregado por titular. Para manter a precisão do status, o agregado deve ser calculado no banco (view/RPC) ou por consulta indexada, não truncando o histórico nem presumindo “em dia”. Antes de adotar, validar a regra de dependentes com mensalidade própria e familiares isentos.

### P1 — Histórico de mensalidades é carregado integralmente para calcular o status

**Arquivos:** `app/api/carteirinhas/route.ts`, `app/api/socios/route.ts` e `lib/politicaInadimplencia.ts`.

As rotas consultam as mensalidades em lotes e percorrem páginas de 1.000 registros para evitar truncamento. Isso protege a correção do cálculo, mas faz o custo aumentar conforme o histórico cresce. O histórico é transferido para a função e agregado em memória em cada abertura da página.

**Impacto provável:** latência variável conforme o volume histórico e maior consumo de memória nas funções serverless.

**Próxima correção recomendada:** agregar por `socio_id` e competência vencida no banco, mantendo uma distinção explícita entre `sem_lancamentos`, `em_dia`, `atencao` e `bloqueio`. Adicionar testes de paridade entre cálculo antigo e novo antes da troca.

### P1 — Endpoint financeiro sem paginação por padrão

**Arquivo:** `app/api/financeiro/route.ts`.

A consulta de `movimentacoes_financeiras` aplica ordenação e, opcionalmente, filtro por competência, mas não aplica paginação ou limite visível no trecho analisado. Depois enriquece lançamentos de temporada com consultas adicionais.

**Impacto provável:** o módulo Financeiro tende a ficar progressivamente mais lento conforme crescem os lançamentos.

**Próxima correção recomendada:** paginação server-side por cursor/intervalo, filtros obrigatórios para telas históricas, contagens e totais agregados no banco. Não impor limite silencioso que esconda lançamentos; a UI deve indicar a página e o total.

### P1 — Tela Sócios contém leitura com efeito colateral

**Arquivo:** `app/socios/page.tsx`, função `carregarMensalidades`.

Ao carregar a competência, o navegador procura cobranças `em_aberto` vencidas e executa `UPDATE` para alterar a situação para `em_atraso`. Uma operação de leitura da tela passa a escrever no banco.

**Impacto provável:** atualizações repetidas, condições de corrida entre usuários, dependência do fuso horário do navegador (`toISOString()` usa UTC) e acoplamento entre visualização e manutenção financeira.

**Próxima correção recomendada:** remover a mutação do carregamento da tela. O atraso deve ser derivado do vencimento/status ou atualizado por uma rotina idempotente no servidor, com data de referência de `America/Sao_Paulo`. Antes de mudar, confirmar se relatórios e baixas dependem de persistir `em_atraso`.

### P2 — Listas e endpoints com retorno integral

**Arquivos identificados:** `app/api/convites/route.ts`, `app/api/avisos/route.ts`, `app/api/reservas/route.ts`, `app/api/socios/route.ts`, `app/api/carteirinhas/route.ts`.

Há endpoints que consultam conjuntos inteiros sem paginação explícita. Alguns têm volumes pequenos hoje, mas convites, reservas, avisos e associados são dados cumulativos. Em `carteirinhas`, o limite de 5.000 evita uma consulta ilimitada, mas também pode truncar silenciosamente se a base ultrapassar esse número.

**Próxima correção recomendada:** definir paginação para listagens, manter rotas de resumo separadas e usar seleção explícita de colunas em todas as consultas de leitura.

### P1 — Segmento de rota com espaço no nome

**Caminho encontrado no ZIP:** `app/acessos/qr/[id] /page.tsx` (há um espaço depois de `]`).

Esse nome não segue o formato normal de segmento dinâmico do App Router (`[id]`). Pode impedir a resolução esperada da rota ou causar comportamento inesperado no build. Não renomeei automaticamente nesta etapa porque a remoção do caminho antigo precisa ser aplicada como uma renomeação real no repositório, não apenas pela sobreposição de um arquivo novo. Corrigir para `app/acessos/qr/[id]/page.tsx`, remover a pasta antiga com espaço e confirmar a rota no build.

### P2 — Componentes de página muito extensos

Tamanhos encontrados no ZIP: `app/socios/page.tsx` (~3.874 linhas), `app/mensalidades/page.tsx` (~2.818), `app/financeiro/page.tsx` (~1.509), `app/temporadas/page.tsx` (~1.244), `app/relatorios/page.tsx` (~1.109) e `app/dependentes/page.tsx` (~881).

O tamanho, isoladamente, não prova lentidão de execução, mas aumenta o risco de duplicação de carregamentos, efeitos que disparam muitas vezes e regressões ao corrigir uma parte. Recomenda-se extrair hooks de carregamento e componentes por módulo, sem redesenhar as telas na mesma etapa da otimização.

### P2 — Consultas e índices do banco precisam de medição real

O ZIP contém SQL de integridade financeira e idempotência, mas a auditoria estática não consegue confirmar quais índices existem de fato no Supabase de produção nem quais consultas são as mais lentas.

**Verificação necessária no Supabase:** consultar `pg_stat_statements` (se habilitado), planos `EXPLAIN (ANALYZE, BUFFERS)` em consultas representativas e índices existentes. Avaliar índices nas colunas usadas com frequência em filtros/joins, especialmente mensalidades (`socio_id`, `data_vencimento`, `competencia`), dependentes (`socio_id`, `matricula`), reservas (`situacao`, `tipo_pagamento`, `data_reserva`, `espaco_id`) e movimentações (`data_movimentacao`, `origem_tipo`, `origem_id`). Não aplicar índices sem conferir nomes/colunas existentes e o impacto de escrita.

## Segurança e integridade — observações estáticas

- Os testes existentes verificam que a chave `service_role` não é referenciada explicitamente por componentes client-side e que rotas administrativas críticas aplicam verificações de perfil.
- A presença de `getServiceClient()` em rotas exige manter autorização explícita antes de toda leitura/escrita; essa auditoria não substitui uma revisão de permissões por endpoint.
- O ZIP inclui testes e SQL de idempotência/auditoria financeira, mas a auditoria não executou comandos contra a base real e não alterou registros.
- A rota de reservas mantém validação de conflitos no servidor e tratamento de conflito de unicidade conforme os testes de arquitetura.

## Correções adicionais aplicadas em 29/10/2026

- `app/api/socios/route.ts`: corrigido o erro ESLint da variável `sociosComHistorico` (`let` para `const`), sem alterar a regra financeira.
- `app/api/dependentes/resumo/route.ts`: corrigido o problema de inferência de tipos entre a consulta principal e o fallback de compatibilidade da coluna `migrado_para_socio_id`, mantendo os erros de banco visíveis.
- `app/acessos/qr/[id]/page.tsx`: incluída a página no caminho dinâmico correto e ajustada para ler o parâmetro com `useParams`, compatível com o App Router atual. Ao aplicar o pacote, excluir também o arquivo antigo `app/acessos/qr/[id] /page.tsx` (a pasta antiga contém um espaço após `]`), para concluir a renomeação.

## Validação executada

- `npm test`: **51 testes aprovados, 0 falhas** após as correções incluídas.
- `npm ci --no-audit --no-fund`: excedeu o limite de execução do ambiente; dependências não foram instaladas.
- Por isso, `npm run lint`, `npm run typecheck` e `npm run build` **não foram confirmados nesta execução**.
- Não foi possível medir tempo real de resposta, consultar logs da Vercel ou analisar índices/planos do Supabase porque o ambiente de produção não está conectado nesta auditoria.

## Plano de execução recomendado

1. Aplicar este pacote e confirmar os testes do GitHub Actions.
2. Medir separadamente TTFB e tempo de resposta das rotas `/api/carteirinhas?modo=dependentes`, `/api/socios`, `/api/financeiro` e `/api/reservas`.
3. Criar a rota dedicada e agregação financeira no banco para Dependentes; validar paridade de inadimplência com casos reais anonimizados.
4. Adicionar paginação ao Financeiro e às listas históricas.
5. Remover a escrita financeira do carregamento da página Sócios após verificar dependências funcionais.
6. Confirmar índices e planos no Supabase antes de adicionar migrações.
7. Reexecutar testes, lint, TypeScript e build; só então publicar e validar as telas de produção.
