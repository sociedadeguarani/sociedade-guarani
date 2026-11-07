-- Implantação de saldos bancários atuais sem duplicar o histórico financeiro.
-- A implantação cria uma base auditável por conta; os lançamentos anteriores
-- ficam preservados e não são somados novamente ao saldo-base.

ALTER TABLE public.contas_bancarias
  ADD COLUMN IF NOT EXISTS saldo_base_conta_corrente numeric(14,2),
  ADD COLUMN IF NOT EXISTS saldo_base_aplicado numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS data_implantacao_saldo timestamptz,
  ADD COLUMN IF NOT EXISTS saldo_base_observacao text,
  ADD COLUMN IF NOT EXISTS saldo_base_atualizado_por uuid,
  ADD COLUMN IF NOT EXISTS saldo_base_atualizado_por_nome text;

COMMENT ON COLUMN public.contas_bancarias.saldo_base_conta_corrente IS
  'Saldo disponível em conta corrente ou dinheiro físico no momento da implantação.';
COMMENT ON COLUMN public.contas_bancarias.saldo_base_aplicado IS
  'Total de aplicações/investimentos vinculados à conta no momento da implantação.';
COMMENT ON COLUMN public.contas_bancarias.data_implantacao_saldo IS
  'Instante da implantação do saldo-base. Movimentações criadas depois deste instante são aplicadas ao saldo.';

CREATE TABLE IF NOT EXISTS public.historico_implantacao_saldos_bancarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  saldo_conta_corrente numeric(14,2) NOT NULL CHECK (saldo_conta_corrente >= 0),
  saldo_aplicado numeric(14,2) NOT NULL DEFAULT 0 CHECK (saldo_aplicado >= 0),
  saldo_total numeric(14,2) NOT NULL CHECK (saldo_total >= 0),
  data_implantacao timestamptz NOT NULL DEFAULT clock_timestamp(),
  observacao text,
  created_by uuid,
  created_by_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_historico_implantacao_saldos_conta_data
  ON public.historico_implantacao_saldos_bancarios (conta_bancaria_id, data_implantacao DESC);

ALTER TABLE public.historico_implantacao_saldos_bancarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.historico_implantacao_saldos_bancarios FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.historico_implantacao_saldos_bancarios TO service_role;

CREATE OR REPLACE FUNCTION public.financeiro_implantar_saldo_atual(
  p_conta_bancaria_id uuid,
  p_saldo_conta_corrente numeric,
  p_saldo_aplicado numeric,
  p_observacao text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_usuario_nome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta public.contas_bancarias%ROWTYPE;
  v_instante timestamptz := clock_timestamp();
  v_total numeric(14,2);
  v_observacao text := left(nullif(trim(coalesce(p_observacao, '')), ''), 500);
  v_historico_id uuid;
BEGIN
  IF p_conta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'Conta bancária não informada.' USING ERRCODE = '22023';
  END IF;
  IF p_saldo_conta_corrente IS NULL OR p_saldo_aplicado IS NULL
     OR p_saldo_conta_corrente < 0 OR p_saldo_aplicado < 0 THEN
    RAISE EXCEPTION 'Informe valores de saldo válidos e não negativos.' USING ERRCODE = '22023';
  END IF;

  v_total := round(p_saldo_conta_corrente + p_saldo_aplicado, 2);
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'O saldo total implantado deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_conta
  FROM public.contas_bancarias
  WHERE id = p_conta_bancaria_id
  FOR UPDATE;

  IF NOT FOUND OR v_conta.ativo IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Conta bancária não encontrada ou inativa.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.historico_implantacao_saldos_bancarios (
    conta_bancaria_id,
    saldo_conta_corrente,
    saldo_aplicado,
    saldo_total,
    data_implantacao,
    observacao,
    created_by,
    created_by_nome
  ) VALUES (
    p_conta_bancaria_id,
    round(p_saldo_conta_corrente, 2),
    round(p_saldo_aplicado, 2),
    v_total,
    v_instante,
    coalesce(v_observacao, 'Implantação do saldo existente'),
    p_usuario_id,
    coalesce(nullif(trim(p_usuario_nome), ''), 'Administrador')
  ) RETURNING id INTO v_historico_id;

  UPDATE public.contas_bancarias
  SET saldo_base_conta_corrente = round(p_saldo_conta_corrente, 2),
      saldo_base_aplicado = round(p_saldo_aplicado, 2),
      data_implantacao_saldo = v_instante,
      saldo_base_observacao = coalesce(v_observacao, 'Implantação do saldo existente'),
      saldo_base_atualizado_por = p_usuario_id,
      saldo_base_atualizado_por_nome = coalesce(nullif(trim(p_usuario_nome), ''), 'Administrador')
  WHERE id = p_conta_bancaria_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_historico_id,
    'conta_bancaria_id', p_conta_bancaria_id,
    'saldo_conta_corrente', round(p_saldo_conta_corrente, 2),
    'saldo_aplicado', round(p_saldo_aplicado, 2),
    'saldo_total', v_total,
    'data_implantacao', v_instante,
    'observacao', coalesce(v_observacao, 'Implantação do saldo existente')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_implantar_saldo_atual(uuid, numeric, numeric, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_implantar_saldo_atual(uuid, numeric, numeric, text, uuid, text)
  TO service_role;

-- Calcula o saldo atual de cada conta. Contas ainda não implantadas mantêm
-- a regra legada de saldo de abertura + movimentos posteriores à data de abertura.
-- Contas implantadas usam o total de conta corrente + aplicações e somente
-- movimentações criadas depois do instante da implantação. Isso evita duplicar
-- o histórico antigo e inclui normalmente novos recebimentos, pagamentos e transferências.
CREATE OR REPLACE FUNCTION public.financeiro_saldos_por_conta_implantados()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    jsonb_object_agg(s.id::text, to_jsonb(s.saldo_atual)),
    '{}'::jsonb
  )
  FROM (
    SELECT
      c.id,
      round(
        CASE
          WHEN c.data_implantacao_saldo IS NOT NULL THEN
            coalesce(c.saldo_base_conta_corrente, 0)
            + coalesce(c.saldo_base_aplicado, 0)
            + coalesce(sum(
                CASE
                  WHEN m.tipo::text = 'entrada' AND m.conta_bancaria_id = c.id THEN coalesce(m.valor, 0)
                  WHEN m.tipo::text = 'saida' AND m.conta_bancaria_id = c.id THEN -coalesce(m.valor, 0)
                  WHEN m.tipo::text = 'transferencia' AND m.conta_bancaria_id = c.id THEN -coalesce(m.valor, 0)
                  WHEN m.tipo::text = 'transferencia' AND m.conta_destino_id = c.id THEN coalesce(m.valor, 0)
                  ELSE 0
                END
              ) FILTER (WHERE m.id IS NOT NULL AND m.created_at > c.data_implantacao_saldo), 0)
          ELSE
            coalesce(c.saldo_inicial, 0)
            + coalesce(sum(
                CASE
                  WHEN m.tipo::text = 'entrada' AND m.conta_bancaria_id = c.id THEN coalesce(m.valor, 0)
                  WHEN m.tipo::text = 'saida' AND m.conta_bancaria_id = c.id THEN -coalesce(m.valor, 0)
                  WHEN m.tipo::text = 'transferencia' AND m.conta_bancaria_id = c.id THEN -coalesce(m.valor, 0)
                  WHEN m.tipo::text = 'transferencia' AND m.conta_destino_id = c.id THEN coalesce(m.valor, 0)
                  ELSE 0
                END
              ) FILTER (
                WHERE m.id IS NOT NULL
                  AND (c.data_saldo_inicial IS NULL OR m.data_movimentacao::date > c.data_saldo_inicial)
              ), 0)
        END,
        2
      ) AS saldo_atual
    FROM public.contas_bancarias c
    LEFT JOIN public.movimentacoes_financeiras m
      ON m.conta_bancaria_id = c.id OR m.conta_destino_id = c.id
    WHERE c.ativo IS TRUE
    GROUP BY
      c.id,
      c.saldo_inicial,
      c.data_saldo_inicial,
      c.saldo_base_conta_corrente,
      c.saldo_base_aplicado,
      c.data_implantacao_saldo
  ) s;
$$;

REVOKE ALL ON FUNCTION public.financeiro_saldos_por_conta_implantados()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financeiro_saldos_por_conta_implantados()
  TO service_role;

COMMENT ON FUNCTION public.financeiro_saldos_por_conta_implantados() IS
  'Retorna o saldo atual por conta, aplicando saldo-base implantado sem duplicar o histórico anterior.';
