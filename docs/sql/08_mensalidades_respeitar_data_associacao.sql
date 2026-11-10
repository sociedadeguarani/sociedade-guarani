-- Sistema Guarani — início da cobrança respeita a data de associação.
-- Atualiza somente a função de resumo; não altera nem apaga mensalidades históricas.

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
      COALESCE(LEFT(m.competencia::text, 7), TO_CHAR(m.data_vencimento, 'YYYY-MM')) AS competencia_ref,
      m.data_vencimento,
      m.situacao,
      s.data_associacao::date AS data_associacao,
      COALESCE(
        EXTRACT(DAY FROM m.data_vencimento)::integer,
        LEAST(GREATEST(COALESCE(s.dia_vencimento, 10)::integer, 1), 28)
      ) AS dia_vencimento
    FROM public.mensalidades AS m
    JOIN ids ON ids.socio_id = m.socio_id
    LEFT JOIN public.socios AS s ON s.id = m.socio_id
  ),
  mensalidades_validas AS (
    SELECT *
    FROM mensalidades_base AS l
    WHERE l.data_associacao IS NULL
       OR l.competencia_ref > TO_CHAR(l.data_associacao, 'YYYY-MM')
       OR (
         l.competencia_ref = TO_CHAR(l.data_associacao, 'YYYY-MM')
         AND EXTRACT(DAY FROM l.data_associacao)::integer <= COALESCE(l.dia_vencimento, 10)
       )
  ),
  resumo AS (
    SELECT
      l.socio_id,
      COUNT(DISTINCT l.competencia_ref) FILTER (
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
    FROM mensalidades_validas AS l
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
GRANT EXECUTE ON FUNCTION public.dependentes_resumo_inadimplencia(uuid[], date)
  TO service_role;
