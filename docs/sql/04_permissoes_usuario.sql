-- Sistema Guarani: permissões individuais por usuário.
-- Execute no Supabase SQL Editor uma vez, se a tabela ainda não existir.
-- Esta migração não altera nem exclui usuários ou registros existentes.

CREATE TABLE IF NOT EXISTS public.permissoes_usuario (
  usuario_id uuid NOT NULL REFERENCES public.usuarios_sistema(id) ON DELETE CASCADE,
  chave text NOT NULL,
  permitido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT permissoes_usuario_usuario_chave_pk PRIMARY KEY (usuario_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_permissoes_usuario_chave
  ON public.permissoes_usuario (chave);

ALTER TABLE public.permissoes_usuario ENABLE ROW LEVEL SECURITY;

-- As operações são realizadas pelas rotas server-side usando service_role.
-- Clientes públicos e usuários autenticados comuns não recebem acesso direto.
REVOKE ALL ON TABLE public.permissoes_usuario FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.permissoes_usuario TO service_role;
