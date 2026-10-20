-- Sistema Guarani — permitir empréstimos identificados pelo dependente.
-- Execute uma vez no Supabase SQL Editor ANTES de publicar o código da aplicação.
-- A migração não altera empréstimos existentes: a nova coluna começa como NULL.

BEGIN;

ALTER TABLE public.inventario_emprestimos
  ADD COLUMN IF NOT EXISTS dependente_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventario_emprestimos_dependente_id_fkey'
      AND conrelid = 'public.inventario_emprestimos'::regclass
  ) THEN
    ALTER TABLE public.inventario_emprestimos
      ADD CONSTRAINT inventario_emprestimos_dependente_id_fkey
      FOREIGN KEY (dependente_id)
      REFERENCES public.dependentes(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_inventario_emprestimos_dependente_id
  ON public.inventario_emprestimos (dependente_id)
  WHERE dependente_id IS NOT NULL;

-- Wrapper transacional: a função existente continua controlando estoque e histórico.
-- O wrapper acrescenta o dependente ao mesmo registro; se a atualização falhar,
-- toda a operação é revertida pelo PostgreSQL.
CREATE OR REPLACE FUNCTION public.registrar_emprestimo_inventario_com_dependente(
  p_item_id uuid,
  p_socio_id uuid,
  p_quantidade integer,
  p_data_prevista date,
  p_responsavel text,
  p_observacoes text,
  p_dependente_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_titular_id uuid;
  v_emprestimo_id uuid;
BEGIN
  IF p_dependente_id IS NULL THEN
    RAISE EXCEPTION 'Informe o dependente para este tipo de empréstimo.';
  END IF;

  SELECT d.socio_id
    INTO v_titular_id
    FROM public.dependentes AS d
   WHERE d.id = p_dependente_id
     AND d.ativo IS DISTINCT FROM false
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dependente não encontrado ou inativo.';
  END IF;

  IF v_titular_id IS DISTINCT FROM p_socio_id THEN
    RAISE EXCEPTION 'O dependente não pertence ao titular informado.';
  END IF;

  v_emprestimo_id := public.registrar_emprestimo_inventario(
    p_item_id => p_item_id,
    p_socio_id => p_socio_id,
    p_quantidade => p_quantidade,
    p_data_prevista => p_data_prevista,
    p_responsavel => p_responsavel,
    p_observacoes => p_observacoes
  );

  UPDATE public.inventario_emprestimos
     SET dependente_id = p_dependente_id
   WHERE id = v_emprestimo_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O empréstimo foi criado sem que o dependente pudesse ser vinculado.';
  END IF;

  RETURN v_emprestimo_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_emprestimo_inventario_com_dependente(
  uuid, uuid, integer, date, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_emprestimo_inventario_com_dependente(
  uuid, uuid, integer, date, text, text, uuid
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_emprestimo_inventario_com_dependente(
  uuid, uuid, integer, date, text, text, uuid
) TO service_role;

COMMIT;
