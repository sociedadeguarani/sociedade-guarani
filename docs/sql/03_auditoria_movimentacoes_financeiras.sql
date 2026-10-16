-- TRILHA DE AUDITORIA DE MOVIMENTAÇÕES FINANCEIRAS.
-- Faça backup antes de executar. O script não altera movimentações existentes.
-- Ele cria uma tabela separada e um trigger para registrar INSERT/UPDATE/DELETE.
-- Os snapshots contêm apenas campos financeiros e identificadores; não copiam
-- nomes, CPF, e-mail, telefone, comprovantes ou observações livres.

CREATE TABLE IF NOT EXISTS public.auditoria_movimentacoes_financeiras (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  operacao text NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
  movimentacao_id text NOT NULL,
  usuario_criador_referencia text NULL,
  dados_antes jsonb NULL,
  dados_depois jsonb NULL
);

ALTER TABLE public.auditoria_movimentacoes_financeiras ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auditoria_movimentacoes_financeiras FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.auditoria_movimentacoes_financeiras TO service_role;

CREATE OR REPLACE FUNCTION public.auditar_movimentacao_financeira()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  snapshot_antes jsonb;
  snapshot_depois jsonb;
  id_movimentacao text;
  usuario_referencia text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    snapshot_antes := jsonb_build_object(
      'id', OLD.id,
      'tipo', OLD.tipo,
      'categoria', OLD.categoria,
      'valor', OLD.valor,
      'data_movimentacao', OLD.data_movimentacao,
      'forma_pagamento', OLD.forma_pagamento,
      'conta_bancaria_id', OLD.conta_bancaria_id,
      'origem_tipo', OLD.origem_tipo,
      'origem_id', OLD.origem_id,
      'conciliado', OLD.conciliado,
      'created_by', OLD.created_by
    );
    id_movimentacao := OLD.id::text;
    usuario_referencia := OLD.created_by::text;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    snapshot_depois := jsonb_build_object(
      'id', NEW.id,
      'tipo', NEW.tipo,
      'categoria', NEW.categoria,
      'valor', NEW.valor,
      'data_movimentacao', NEW.data_movimentacao,
      'forma_pagamento', NEW.forma_pagamento,
      'conta_bancaria_id', NEW.conta_bancaria_id,
      'origem_tipo', NEW.origem_tipo,
      'origem_id', NEW.origem_id,
      'conciliado', NEW.conciliado,
      'created_by', NEW.created_by
    );
    id_movimentacao := NEW.id::text;
    usuario_referencia := COALESCE(NEW.created_by::text, usuario_referencia);
  END IF;

  INSERT INTO public.auditoria_movimentacoes_financeiras (
    operacao,
    movimentacao_id,
    usuario_criador_referencia,
    dados_antes,
    dados_depois
  ) VALUES (
    TG_OP,
    id_movimentacao,
    usuario_referencia,
    snapshot_antes,
    snapshot_depois
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_movimentacao_financeira() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_movimentacao_financeira() TO service_role;

DROP TRIGGER IF EXISTS trg_auditar_movimentacoes_financeiras
  ON public.movimentacoes_financeiras;

CREATE TRIGGER trg_auditar_movimentacoes_financeiras
AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_financeiras
FOR EACH ROW EXECUTE FUNCTION public.auditar_movimentacao_financeira();

-- Para consultar alterações recentes no SQL Editor:
-- SELECT * FROM public.auditoria_movimentacoes_financeiras
-- ORDER BY ocorrido_em DESC LIMIT 200;
--
-- Nota: usuario_criador_referencia identifica o usuário de criação registrado
-- na movimentação; como a aplicação usa service role no servidor, esse campo
-- não garante identificar quem fez uma edição/remoção posterior. Para auditoria
-- exata do operador, as rotas deverão passar explicitamente o usuário da sessão.
