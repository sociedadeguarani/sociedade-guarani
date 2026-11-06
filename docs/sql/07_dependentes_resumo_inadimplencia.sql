-- Sistema Guarani — resumo agregado de inadimplência dos dependentes.
-- Função somente de leitura: retorna uma linha por sócio consultado.
-- A API usa este resumo para evitar carregar todo o histórico de mensalidades.

CREATE OR REPLACE FUNCTION public.dependentes_resumo_inadimplencia(
  p_socio_ids uuid[],
  p_hoje date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  socio_id uuid,
  quantidade_atraso integer,
  dias_atraso integer,
  possui_lancamentos boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(COALESCE(p_socio_ids, ARRAY[]::uuid[])) AS socio_id
  ),
  mensalidades_base AS (
    SELECT
      m.id,
      m.socio_id,
      m.competencia AS competencia_ref,
      m.data_vencimento,
      m.situacao
    FROM public.mensalidades AS m
    JOIN ids ON ids.socio_id = m.socio_id
  ),
  resumo AS (
    SELECT
      l.socio_id,
      count(distinct l.competencia_ref) FILTER (
        WHERE l.data_vencimento < p_hoje
          AND LOWER(TRIM(COALESCE(l.situacao, ''))) NOT IN (
            'pago', 'paga', 'paid', 'quitado', 'quitada',
            'recebido', 'recebida', 'baixado', 'baixada',
            'confirmado', 'confirmada', 'compensado', 'compensada',
            'isento', 'isenta', 'cancelado', 'cancelada'
          )
      )::integer AS quantidade_atraso,
      COALESCE(MAX((p_hoje - l.data_vencimento)) FILTER (
        WHERE l.data_vencimento < p_hoje
          AND LOWER(TRIM(COALESCE(l.situacao, ''))) NOT IN (
            'pago', 'paga', 'paid', 'quitado', 'quitada',
            'recebido', 'recebida', 'baixado', 'baixada',
            'confirmado', 'confirmada', 'compensado', 'compensada',
            'isento', 'isenta', 'cancelado', 'cancelada'
          )
      ), 0)::integer AS dias_atraso,
      COUNT(l.id) > 0 AS possui_lancamentos
    FROM mensalidades_base AS l
    GROUP BY l.socio_id
  )
  SELECT
    ids.socio_id,
    COALESCE(resumo.quantidade_atraso, 0)::integer,
    COALESCE(resumo.dias_atraso, 0)::integer,
    COALESCE(resumo.possui_lancamentos, false)
  FROM ids
  LEFT JOIN resumo ON resumo.socio_id = ids.socio_id;
$$;

REVOKE ALL ON FUNCTION public.dependentes_resumo_inadimplencia(uuid[], date)
  FROM PUBLIC, anon, authenticated;
grant execute on function public.dependentes_resumo_inadimplencia(uuid[], date)
  TO service_role;
