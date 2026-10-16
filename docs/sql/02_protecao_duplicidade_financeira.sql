-- PROTEÇÃO CONTRA DUPLICIDADE FINANCEIRA.
-- 1) Faça backup do banco antes de executar.
-- 2) Execute primeiro docs/sql/01_diagnostico_integridade_financeira.sql.
-- 3) Este script NÃO apaga nem altera lançamentos existentes. Ele aborta se
--    ainda houver duplicatas nas origens cobertas.
-- 4) Após a criação do índice, a aplicação trata o conflito 23505 em operações
--    idempotentes de reservas, temporadas e vendas de eventos.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION
      'Índice não criado: existem origens financeiras duplicadas. Revise os resultados do diagnóstico antes de tentar novamente.';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS ux_movimentacoes_origem_idempotente
    ON public.movimentacoes_financeiras (origem_tipo, origem_id)
    WHERE origem_id IS NOT NULL
      AND origem_tipo IN (
        'mensalidade',
        'reserva',
        'temporada_parcela',
        'evento_venda'
      );
END $$;
