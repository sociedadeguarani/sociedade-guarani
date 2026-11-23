-- Sistema Guarani: corrige a colisão TE0006A e garante códigos únicos.
-- Execute uma única vez no SQL Editor do Supabase, antes de publicar a API.

DO $$
DECLARE
  v_temporada_id uuid;
  v_quantidade integer;
  v_proximo_numero bigint;
  v_novo_codigo text;
  v_base_nova text;
BEGIN
  SELECT COUNT(*)
    INTO v_quantidade
  FROM public.temporadas
  WHERE tipo = 'temporada_individual'
    AND (codigo = 'TE0006A' OR matricula = 'TE0006A');

  IF v_quantidade > 1 THEN
    RAISE EXCEPTION 'Há mais de uma temporada individual com TE0006A. A correção automática foi interrompida para evitar alterar o registro errado.';
  END IF;

  IF v_quantidade = 1 THEN
    SELECT id
      INTO v_temporada_id
    FROM public.temporadas
    WHERE tipo = 'temporada_individual'
      AND (codigo = 'TE0006A' OR matricula = 'TE0006A')
    LIMIT 1;

    -- Calcula o próximo número considerando códigos de temporadas e matrículas
    -- já emitidas, sem reutilizar números existentes.
    SELECT COALESCE(MAX(numero), 0) + 1
      INTO v_proximo_numero
    FROM (
      SELECT (regexp_match(codigo, '^TE([0-9]+)A$'))[1]::bigint AS numero
      FROM public.temporadas
      WHERE codigo ~ '^TE[0-9]+A$'
      UNION ALL
      SELECT (regexp_match(matricula, '^TE([0-9]+)[A-Z]$'))[1]::bigint
      FROM public.temporadas
      WHERE matricula ~ '^TE[0-9]+[A-Z]$'
      UNION ALL
      SELECT (regexp_match(matricula, '^TE([0-9]+)[A-Z]$'))[1]::bigint
      FROM public.temporadas_participantes
      WHERE matricula ~ '^TE[0-9]+[A-Z]$'
    ) codigos;

    v_novo_codigo := 'TE' || lpad(v_proximo_numero::text, 4, '0') || 'A';
    v_base_nova := 'TE' || lpad(v_proximo_numero::text, 4, '0');

    UPDATE public.temporadas
    SET codigo = v_novo_codigo,
        matricula = CASE WHEN matricula IS NULL THEN NULL ELSE v_novo_codigo END
    WHERE id = v_temporada_id;

    -- Atualiza somente as matrículas dos participantes vinculados à temporada
    -- individual corrigida, preservando o sufixo de cada participante.
    UPDATE public.temporadas_participantes
    SET matricula = regexp_replace(matricula, '^TE[0-9]+', v_base_nova)
    WHERE temporada_id = v_temporada_id
      AND matricula ~ '^TE[0-9]+[A-Z]$';
  END IF;
END $$;

-- Sequência PostgreSQL: nextval é atômico e não repete números em cadastros simultâneos.
CREATE SEQUENCE IF NOT EXISTS public.temporadas_codigo_seq;

SELECT setval(
  'public.temporadas_codigo_seq',
  COALESCE(MAX(numero), 1),
  COALESCE(MAX(numero), 0) > 0
)
FROM (
  SELECT (regexp_match(codigo, '^TE([0-9]+)A$'))[1]::bigint AS numero
  FROM public.temporadas
  WHERE codigo ~ '^TE[0-9]+A$'
  UNION ALL
  SELECT (regexp_match(matricula, '^TE([0-9]+)[A-Z]$'))[1]::bigint
  FROM public.temporadas
  WHERE matricula ~ '^TE[0-9]+[A-Z]$'
  UNION ALL
  SELECT (regexp_match(matricula, '^TE([0-9]+)[A-Z]$'))[1]::bigint
  FROM public.temporadas_participantes
  WHERE matricula ~ '^TE[0-9]+[A-Z]$'
) codigos;

CREATE OR REPLACE FUNCTION public.proximo_codigo_temporada()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'TE' || lpad(nextval('public.temporadas_codigo_seq')::text, 4, '0') || 'A';
$$;

REVOKE ALL ON FUNCTION public.proximo_codigo_temporada() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proximo_codigo_temporada() TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.temporadas_codigo_seq TO service_role;
