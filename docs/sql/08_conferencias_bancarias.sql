-- Histórico de conferências de saldo bancário.
-- Não altera saldo inicial nem movimentações financeiras: registra apenas a comparação.
-- Execute uma única vez no Supabase SQL Editor antes de publicar a rota atualizada.

CREATE TABLE IF NOT EXISTS public.conferencias_bancarias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_bancaria_id uuid NOT NULL
    REFERENCES public.contas_bancarias(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  saldo_sistema numeric(14,2) NOT NULL CHECK (saldo_sistema >= 0),
  saldo_banco numeric(14,2) NOT NULL CHECK (saldo_banco >= 0),
  diferenca numeric(14,2) NOT NULL,
  data_conferencia date NOT NULL,
  observacao text NOT NULL DEFAULT 'Conferência do saldo bancário',
  created_by uuid NOT NULL,
  created_by_nome text NOT NULL DEFAULT 'Administrador',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Complementa uma tabela criada manualmente em versões anteriores, se existir.
ALTER TABLE public.conferencias_bancarias
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS conta_bancaria_id uuid,
  ADD COLUMN IF NOT EXISTS saldo_sistema numeric(14,2),
  ADD COLUMN IF NOT EXISTS saldo_banco numeric(14,2),
  ADD COLUMN IF NOT EXISTS diferenca numeric(14,2),
  ADD COLUMN IF NOT EXISTS data_conferencia date,
  ADD COLUMN IF NOT EXISTS observacao text DEFAULT 'Conferência do saldo bancário',
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS created_by_nome text DEFAULT 'Administrador',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_conferencias_bancarias_conta_data
  ON public.conferencias_bancarias (conta_bancaria_id, data_conferencia DESC, created_at DESC);

ALTER TABLE public.conferencias_bancarias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.conferencias_bancarias FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.conferencias_bancarias TO service_role;

COMMENT ON TABLE public.conferencias_bancarias IS
  'Histórico de conferências entre o saldo calculado pelo sistema e o saldo informado pelo banco. Não gera movimentações.';
