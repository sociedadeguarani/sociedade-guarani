-- Sistema Guarani — resumo agregado de inadimplência para a tela Sócios.
-- Função somente de leitura: retorna uma linha por associado consultado.
-- Reduz a transferência do histórico completo de mensalidades para o Next.js.
--
-- Implantação segura:
-- 1) executar este SQL no Supabase somente depois de revisar a PR;
-- 2) a API mantém fallback para a consulta antiga se esta função ainda não existir;
-- 3) não altera mensalidades, recebimentos, sócios ou movimentações financeiras.

CREATE OR REPLACE FUNCTION public.socios_resumo_inadimplencia_v1(
  p_socio_ids uuid[],
  p_hoje date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  socio_id uuid,
  quantidade_atraso integer,
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
      NULLIF(LEFT(m.competencia::text, 7), '') AS competencia_associacao,
      COALESCE(
        NULLIF(LEFT(m.competencia::text, 7), ''),
        TO_CHAR(m.data_vencimento::date, 'YYYY-MM')
      ) AS competencia_ref,
      COALESCE(
        m.data_vencimento::date,
        CASE
          WHEN LEFT(m.competencia::text, 7) ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
            AND LEFT(m.competencia::text, 7) < TO_CHAR(p_hoje, 'YYYY-MM')
            THEN TO_DATE(LEFT(m.competencia::text, 7) || '-01', 'YYYY-MM-DD')
          ELSE NULL
        END
      ) AS vencimento_efetivo,
      COALESCE(
        s.data_associacao::date,
        CASE
          WHEN primeira.competencia IS NULL THEN NULL
          ELSE TO_DATE(primeira.competencia || '-01', 'YYYY-MM-DD')
        END
      ) AS data_associacao_efetiva,
      COALESCE(
        EXTRACT(DAY FROM m.data_vencimento::date)::integer,
        LEAST(GREATEST(COALESCE(s.dia_vencimento, 10)::integer, 1), 28)
      ) AS dia_vencimento,
      m.situacao
    FROM public.mensalidades AS m
    JOIN ids ON ids.socio_id = m.socio_id
    LEFT JOIN public.socios AS s ON s.id = m.socio_id
    LEFT JOIN primeira_competencia_paga AS primeira ON primeira.socio_id = m.socio_id
  ),
  mensalidades_validas AS (
    SELECT *
    FROM mensalidades_base AS l
    WHERE l.data_associacao_efetiva IS NULL
       OR l.competencia_associacao IS NULL
       OR l.competencia_associacao !~ '^[0-9]{4}-(0[1-9]|1[0-2])
         AND EXTRACT(DAY FROM l.data_associacao_efetiva)::integer <= COALESCE(l.dia_vencimento, 10)
       )
  ),
  resumo AS (
    SELECT
      l.socio_id,
      COUNT(DISTINCT l.competencia_ref) FILTER (
        WHERE l.vencimento_efetivo < p_hoje
          AND LOWER(TRIM(COALESCE(l.situacao, ''))) NOT IN (
            'pago', 'paga', 'paid', 'quitado', 'quitada',
            'recebido', 'recebida', 'baixado', 'baixada',
            'confirmado', 'confirmada', 'compensado', 'compensada',
            'isento', 'isenta', 'cancelado', 'cancelada'
          )
          AND l.competencia_ref ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      )::integer AS quantidade_atraso,
      COUNT(l.id) > 0 AS possui_lancamentos
    FROM mensalidades_validas AS l
    GROUP BY l.socio_id
  )
  SELECT
    ids.socio_id,
    COALESCE(resumo.quantidade_atraso, 0)::integer,
    COALESCE(resumo.possui_lancamentos, false)
  FROM ids
  LEFT JOIN resumo ON resumo.socio_id = ids.socio_id;
$$;

REVOKE ALL ON FUNCTION public.socios_resumo_inadimplencia_v1(uuid[], date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.socios_resumo_inadimplencia_v1(uuid[], date)
  TO service_role;

       OR l.competencia_associacao > TO_CHAR(l.data_associacao_efetiva, 'YYYY-MM')
       OR (
         l.competencia_associacao = TO_CHAR(l.data_associacao_efetiva, 'YYYY-MM')
         AND EXTRACT(DAY FROM l.data_associacao_efetiva)::integer <= COALESCE(l.dia_vencimento, 10)
       )
  ),
  resumo AS (
    SELECT
      l.socio_id,
      COUNT(DISTINCT l.competencia_ref) FILTER (
        WHERE l.vencimento_efetivo < p_hoje
          AND LOWER(TRIM(COALESCE(l.situacao, ''))) NOT IN (
            'pago', 'paga', 'paid', 'quitado', 'quitada',
            'recebido', 'recebida', 'baixado', 'baixada',
            'confirmado', 'confirmada', 'compensado', 'compensada',
            'isento', 'isenta', 'cancelado', 'cancelada'
          )
          AND l.competencia_ref ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      )::integer AS quantidade_atraso,
      COUNT(l.id) > 0 AS possui_lancamentos
    FROM mensalidades_validas AS l
    GROUP BY l.socio_id
  )
  SELECT
    ids.socio_id,
    COALESCE(resumo.quantidade_atraso, 0)::integer,
    COALESCE(resumo.possui_lancamentos, false)
  FROM ids
  LEFT JOIN resumo ON resumo.socio_id = ids.socio_id;
$$;

REVOKE ALL ON FUNCTION public.socios_resumo_inadimplencia_v1(uuid[], date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.socios_resumo_inadimplencia_v1(uuid[], date)
  TO service_role;
