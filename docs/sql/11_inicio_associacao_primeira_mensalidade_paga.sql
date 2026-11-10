-- Sistema Guarani
-- Regra complementar de início da associação:
-- se socios.data_associacao estiver vazia, a primeira competência com mensalidade
-- efetivamente paga passa a ser a referência de início da cobrança.
-- A data cadastrada continua tendo prioridade. Este SQL não atualiza cadastros,
-- mensalidades, recebimentos ou movimentações financeiras.

-- 1) Consulta reutilizável pela aplicação para obter a primeira competência paga.
CREATE OR REPLACE FUNCTION public.socios_primeira_competencia_paga_v1(
  p_socio_ids uuid[]
)
RETURNS TABLE (
  socio_id uuid,
  primeira_competencia_paga date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(COALESCE(p_socio_ids, ARRAY[]::uuid[])) AS socio_id
  ),
  pagamentos AS (
    SELECT
      m.socio_id,
      MIN(LEFT(m.competencia::text, 7)) AS primeira_competencia
    FROM public.mensalidades AS m
    JOIN ids ON ids.socio_id = m.socio_id
    JOIN public.socios AS s ON s.id = m.socio_id AND s.data_associacao IS NULL
    WHERE LOWER(TRIM(COALESCE(m.situacao, ''))) IN (
      'pago', 'paga', 'paid', 'quitado', 'quitada',
      'recebido', 'recebida', 'baixado', 'baixada',
      'confirmado', 'confirmada', 'compensado', 'compensada'
    )
      AND LEFT(m.competencia::text, 7) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    GROUP BY m.socio_id
  )
  SELECT
    ids.socio_id,
    CASE
      WHEN pagamentos.primeira_competencia IS NULL THEN NULL
      ELSE TO_DATE(pagamentos.primeira_competencia || '-01', 'YYYY-MM-DD')
    END AS primeira_competencia_paga
  FROM ids
  LEFT JOIN pagamentos ON pagamentos.socio_id = ids.socio_id;
$$;

REVOKE ALL ON FUNCTION public.socios_primeira_competencia_paga_v1(uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.socios_primeira_competencia_paga_v1(uuid[])
  TO service_role;

-- 2) Atualiza a função de resumo usada na página Dependentes. O tipo de retorno
-- permanece idêntico à versão v2 já instalada, portanto CREATE OR REPLACE é seguro.
CREATE OR REPLACE FUNCTION public.dependentes_resumo_inadimplencia_v2(
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
  primeira_competencia_paga AS (
    SELECT
      m.socio_id,
      MIN(LEFT(m.competencia::text, 7)) AS competencia
    FROM public.mensalidades AS m
    JOIN ids ON ids.socio_id = m.socio_id
    JOIN public.socios AS s ON s.id = m.socio_id AND s.data_associacao IS NULL
    WHERE LOWER(TRIM(COALESCE(m.situacao, ''))) IN (
      'pago', 'paga', 'paid', 'quitado', 'quitada',
      'recebido', 'recebida', 'baixado', 'baixada',
      'confirmado', 'confirmada', 'compensado', 'compensada'
    )
      AND LEFT(m.competencia::text, 7) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    GROUP BY m.socio_id
  ),
  mensalidades_base AS (
    SELECT
      m.id,
      m.socio_id,
      COALESCE(LEFT(m.competencia::text, 7), TO_CHAR(m.data_vencimento, 'YYYY-MM')) AS competencia_ref,
      m.data_vencimento,
      m.situacao,
      COALESCE(
        s.data_associacao::date,
        CASE
          WHEN primeira.competencia IS NULL THEN NULL
          ELSE TO_DATE(primeira.competencia || '-01', 'YYYY-MM-DD')
        END
      ) AS data_associacao_efetiva,
      COALESCE(
        EXTRACT(DAY FROM m.data_vencimento)::integer,
        LEAST(GREATEST(COALESCE(s.dia_vencimento, 10)::integer, 1), 28)
      ) AS dia_vencimento
    FROM public.mensalidades AS m
    JOIN ids ON ids.socio_id = m.socio_id
    LEFT JOIN public.socios AS s ON s.id = m.socio_id
    LEFT JOIN primeira_competencia_paga AS primeira ON primeira.socio_id = m.socio_id
  ),
  mensalidades_validas AS (
    SELECT *
    FROM mensalidades_base AS l
    WHERE l.data_associacao_efetiva IS NULL
       OR l.competencia_ref > TO_CHAR(l.data_associacao_efetiva, 'YYYY-MM')
       OR (
         l.competencia_ref = TO_CHAR(l.data_associacao_efetiva, 'YYYY-MM')
         AND EXTRACT(DAY FROM l.data_associacao_efetiva)::integer <= COALESCE(l.dia_vencimento, 10)
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

REVOKE ALL ON FUNCTION public.dependentes_resumo_inadimplencia_v2(uuid[], date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dependentes_resumo_inadimplencia_v2(uuid[], date)
  TO service_role;
