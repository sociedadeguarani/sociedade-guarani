-- Campos usados pela busca familiar e pela regra de acesso dos Convites.
-- dependente_id aponta para a pessoa da tabela dependentes; socio_id guarda o titular.
alter table public.convites
  add column if not exists dependente_id uuid
  references public.dependentes(id) on delete set null;

-- true = inclui banho; false = somente parque; NULL = convite histórico sem classificação.
alter table public.convites
  add column if not exists banho_incluido boolean;

create index if not exists idx_convites_dependente_id
  on public.convites(dependente_id);
