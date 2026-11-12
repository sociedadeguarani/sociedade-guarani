-- Evita reutilizar o mesmo lançamento financeiro em mais de uma parcela de venda de título.
-- Pode ser executado mais de uma vez (idempotente).
create unique index if not exists uq_vendas_titulos_parcelas_movimentacao
  on public.vendas_titulos_parcelas(movimentacao_id)
  where movimentacao_id is not null;
