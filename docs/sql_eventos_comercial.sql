-- Complemento mínimo para o módulo de eventos.
-- Não cria tabelas novas. Adiciona somente os dados de preço/estoque
-- que a tabela eventos atual não possui.
ALTER TABLE public.eventos
  ADD COLUMN IF NOT EXISTS valor_ingresso numeric(12,2),
  ADD COLUMN IF NOT EXISTS quantidade_disponivel integer;

ALTER TABLE public.eventos
  DROP CONSTRAINT IF EXISTS eventos_quantidade_disponivel_check;

ALTER TABLE public.eventos
  ADD CONSTRAINT eventos_quantidade_disponivel_check
  CHECK (quantidade_disponivel IS NULL OR quantidade_disponivel >= 0);

ALTER TABLE public.eventos
  DROP CONSTRAINT IF EXISTS eventos_valor_ingresso_check;

ALTER TABLE public.eventos
  ADD CONSTRAINT eventos_valor_ingresso_check
  CHECK (valor_ingresso IS NULL OR valor_ingresso >= 0);
