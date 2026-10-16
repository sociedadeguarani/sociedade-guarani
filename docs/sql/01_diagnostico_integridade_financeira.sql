-- DIAGNÓSTICO SOMENTE LEITURA — não altera nenhum dado.
-- Execute no Supabase SQL Editor antes de ativar o índice de idempotência.

-- 1) Origens que podem gerar uma única movimentação principal.
-- Qualquer linha retornada precisa ser conferida manualmente. Não apague
-- registros apenas para fazer o índice passar.
SELECT
  origem_tipo,
  origem_id,
  COUNT(*) AS quantidade,
  ARRAY_AGG(id::text ORDER BY id::text) AS ids_movimentacao,
  SUM(valor) AS soma_valores
FROM public.movimentacoes_financeiras
WHERE origem_id IS NOT NULL
  AND origem_tipo IN (
    'mensalidade',
    'reserva',
    'temporada_parcela',
    'evento_venda'
  )
GROUP BY origem_tipo, origem_id
HAVING COUNT(*) > 1
ORDER BY quantidade DESC, origem_tipo, origem_id;

-- 1b) Tarifas de mensalidade são listadas separadamente porque o fluxo atual
-- de estorno pode preservar uma tarifa bancária antiga e gerar outra em uma
-- nova tentativa. Não aplicar índice único nesse tipo sem revisar essa regra.
SELECT
  origem_tipo,
  origem_id,
  COUNT(*) AS quantidade,
  ARRAY_AGG(id::text ORDER BY id::text) AS ids_movimentacao,
  SUM(valor) AS soma_valores
FROM public.movimentacoes_financeiras
WHERE origem_tipo = 'tarifa_mensalidade'
  AND origem_id IS NOT NULL
GROUP BY origem_tipo, origem_id
HAVING COUNT(*) > 1
ORDER BY quantidade DESC, origem_id;

-- 2) Mensalidades pagas sem uma entrada financeira correspondente.
-- Pode haver registros legados ou ajustes antigos; revise antes de corrigir.
SELECT
  m.id AS mensalidade_id,
  m.socio_id,
  m.competencia,
  m.situacao,
  m.valor_base,
  m.data_pagamento
FROM public.mensalidades AS m
LEFT JOIN public.movimentacoes_financeiras AS f
  ON f.origem_tipo = 'mensalidade'
 AND f.origem_id::text = m.id::text
WHERE LOWER(COALESCE(m.situacao, '')) = 'pago'
  AND f.id IS NULL
ORDER BY m.data_pagamento DESC NULLS LAST, m.competencia DESC;

-- 3) Entradas financeiras de mensalidades cujo cadastro não aparece como pago.
SELECT
  f.id AS movimentacao_id,
  f.origem_id AS mensalidade_id,
  f.valor,
  f.data_movimentacao,
  m.situacao AS situacao_mensalidade,
  m.competencia
FROM public.movimentacoes_financeiras AS f
LEFT JOIN public.mensalidades AS m
  ON m.id::text = f.origem_id::text
WHERE f.origem_tipo = 'mensalidade'
  AND LOWER(COALESCE(m.situacao, '')) <> 'pago'
ORDER BY f.data_movimentacao DESC NULLS LAST;

