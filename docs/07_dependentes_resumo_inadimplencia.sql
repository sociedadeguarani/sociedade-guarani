-- Otimiza a listagem de Dependentes: agrega mensalidades no PostgreSQL e
-- retorna somente o resumo de inadimplência por associado.
-- Executar no SQL Editor do Supabase antes de publicar a nova API.

create or replace function public.dependentes_resumo_inadimplencia(
  p_socio_ids uuid[],
  p_hoje date
)
returns table (
  socio_id uuid,
  quantidade_atraso bigint,
  dias_atraso integer,
  possui_lancamentos boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with ids as (
    select unnest(coalesce(p_socio_ids, '{}'::uuid[])) as socio_id
  ),
  linhas as (
    select
      m.socio_id,
      m.situacao,
      coalesce(
        m.data_vencimento::date,
        case
          when left(m.competencia::text, 7) ~ '^[0-9]{4}-[0-9]{2}$'
            and left(m.competencia::text, 7) < to_char(p_hoje, 'YYYY-MM')
            then to_date(left(m.competencia::text, 7) || '-01', 'YYYY-MM-DD')
          else null
        end
      ) as vencimento,
      coalesce(
        nullif(left(m.competencia::text, 7), ''),
        to_char(m.data_vencimento::date, 'YYYY-MM')
      ) as competencia_ref
    from public.mensalidades m
    join ids on ids.socio_id = m.socio_id
  ),
  resumo as (
    select
      l.socio_id,
      count(distinct l.competencia_ref) filter (
        where l.vencimento < p_hoje
          and lower(trim(coalesce(l.situacao, ''))) not in (
            'pago', 'paga', 'paid', 'quitado', 'quitada',
            'recebido', 'recebida', 'baixado', 'baixada',
            'confirmado', 'confirmada', 'compensado', 'compensada',
            'isento', 'isenta', 'cancelado', 'cancelada'
          )
      ) as quantidade_atraso,
      greatest(
        coalesce(max(p_hoje - l.vencimento) filter (
          where l.vencimento < p_hoje
            and lower(trim(coalesce(l.situacao, ''))) not in (
              'pago', 'paga', 'paid', 'quitado', 'quitada',
              'recebido', 'recebida', 'baixado', 'baixada',
              'confirmado', 'confirmada', 'compensado', 'compensada',
              'isento', 'isenta', 'cancelado', 'cancelada'
            )
        ), 0),
        0
      )::integer as dias_atraso,
      count(*) > 0 as possui_lancamentos
    from linhas l
    group by l.socio_id
  )
  select
    ids.socio_id,
    coalesce(resumo.quantidade_atraso, 0)::bigint,
    coalesce(resumo.dias_atraso, 0)::integer,
    coalesce(resumo.possui_lancamentos, false)
  from ids
  left join resumo on resumo.socio_id = ids.socio_id;
$$;

revoke all on function public.dependentes_resumo_inadimplencia(uuid[], date) from public, anon, authenticated;
grant execute on function public.dependentes_resumo_inadimplencia(uuid[], date) to service_role;
