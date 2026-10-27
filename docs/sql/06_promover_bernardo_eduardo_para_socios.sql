-- Sistema Guarani — promover Bernardo e Eduardo para Sócios Dependentes com mensalidade própria.
-- Execute no Supabase SQL Editor ANTES de publicar o código que lê migrado_para_socio_id.
-- A operação é transacional, verifica conflitos e falha sem alterações se não conseguir
-- determinar os cadastros ou o valor real da mensalidade a partir da configuração do sistema.
-- Registros antigos de dependentes NÃO são apagados: ficam vinculados ao novo cadastro
-- para preservar referências históricas e permitir que não apareçam mais na tela Dependentes.

BEGIN;

ALTER TABLE public.dependentes
  ADD COLUMN IF NOT EXISTS migrado_para_socio_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'dependentes_migrado_para_socio_id_fkey'
       AND conrelid = 'public.dependentes'::regclass
  ) THEN
    ALTER TABLE public.dependentes
      ADD CONSTRAINT dependentes_migrado_para_socio_id_fkey
      FOREIGN KEY (migrado_para_socio_id)
      REFERENCES public.socios(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_dependentes_migrado_para_socio_id
  ON public.dependentes (migrado_para_socio_id)
  WHERE migrado_para_socio_id IS NOT NULL;

DO $$
DECLARE
  v_pessoa record;
  v_parent_id uuid;
  v_socio public.socios%ROWTYPE;
  v_dep public.dependentes%ROWTYPE;
  v_socio_id uuid;
  v_socio_existente boolean;
  v_dep_existente boolean;
  v_socio_count integer;
  v_dep_count integer;
  v_target_count integer;
  v_cpf_count integer;
  v_config_valor numeric;
  v_config_dia integer;
  v_valor numeric;
  v_dia integer;
BEGIN
  -- Usa a configuração vigente da categoria escolhida na tela de Sócios.
  SELECT cm.valor, cm.dia_vencimento
    INTO v_config_valor, v_config_dia
    FROM public.configuracoes_mensalidades AS cm
   WHERE cm.ativo IS TRUE
     AND lower(trim(cm.tipo_socio)) = 'dependente_contribuinte_individual_mensalidade'
     AND (cm.vigencia_inicio IS NULL OR cm.vigencia_inicio <= CURRENT_DATE)
   ORDER BY cm.vigencia_inicio DESC NULLS LAST
   LIMIT 1;

  -- A responsável deve ser única para preservar o vínculo familiar correto.
  SELECT count(*)
    INTO v_socio_count
    FROM public.socios AS s
   WHERE lower(trim(s.nome)) = lower('Marinês Terezinha Madke');

  IF v_socio_count <> 1 THEN
    RAISE EXCEPTION 'Migração cancelada: esperado exatamente um cadastro de Marinês Terezinha Madke na tabela socios; encontrados %.', v_socio_count;
  END IF;

  SELECT s.id
    INTO v_parent_id
    FROM public.socios AS s
   WHERE lower(trim(s.nome)) = lower('Marinês Terezinha Madke');

  FOR v_pessoa IN
    SELECT * FROM (VALUES
      ('Bernardo Madke dos Santos', 'SD0051A'),
      ('Eduardo Madke dos Santos', 'SD0047A')
    ) AS pessoas(nome, matricula)
  LOOP
    v_socio := NULL;
    v_dep := NULL;
    v_socio_id := NULL;
    v_socio_existente := false;
    v_dep_existente := false;

    SELECT count(*)
      INTO v_socio_count
      FROM public.socios AS s
     WHERE lower(trim(s.nome)) = lower(v_pessoa.nome)
       AND s.responsavel_id = v_parent_id;

    IF v_socio_count > 1 THEN
      RAISE EXCEPTION 'Migração cancelada: há mais de um cadastro de % vinculado a Marinês.', v_pessoa.nome;
    END IF;

    IF v_socio_count = 1 THEN
      SELECT s.* INTO v_socio
        FROM public.socios AS s
       WHERE lower(trim(s.nome)) = lower(v_pessoa.nome)
         AND s.responsavel_id = v_parent_id
       LIMIT 1;
      v_socio_existente := true;
      v_socio_id := v_socio.id;
    ELSE
      -- Não cria um segundo cadastro se o mesmo nome já existir com outro vínculo.
      SELECT count(*)
        INTO v_socio_count
        FROM public.socios AS s
       WHERE lower(trim(s.nome)) = lower(v_pessoa.nome);
      IF v_socio_count > 0 THEN
        RAISE EXCEPTION 'Migração cancelada: existe cadastro de % em socios, mas não está vinculado a Marinês. Conferir manualmente.', v_pessoa.nome;
      END IF;
    END IF;

    SELECT count(*)
      INTO v_dep_count
      FROM public.dependentes AS d
     WHERE lower(trim(d.nome)) = lower(v_pessoa.nome)
       AND d.socio_id = v_parent_id;

    IF v_dep_count > 1 THEN
      RAISE EXCEPTION 'Migração cancelada: há % registros antigos de % na tabela dependentes; conferir duplicatas antes de continuar.', v_dep_count, v_pessoa.nome;
    END IF;

    IF v_dep_count = 1 THEN
      SELECT d.* INTO v_dep
        FROM public.dependentes AS d
       WHERE lower(trim(d.nome)) = lower(v_pessoa.nome)
         AND d.socio_id = v_parent_id
       LIMIT 1;
      v_dep_existente := true;
      IF v_dep.migrado_para_socio_id IS NOT NULL
         AND v_socio_id IS NOT NULL
         AND v_dep.migrado_para_socio_id <> v_socio_id THEN
        RAISE EXCEPTION 'Migração cancelada: o registro antigo de % já aponta para outro sócio.', v_pessoa.nome;
      END IF;
    ELSIF NOT v_socio_existente THEN
      RAISE EXCEPTION 'Migração cancelada: não foi encontrado cadastro de % em socios nem em dependentes, vinculado a Marinês.', v_pessoa.nome;
    END IF;

    -- Não sobrescreve matrícula de outra pessoa.
    SELECT count(*)
      INTO v_target_count
      FROM public.socios AS s
     WHERE upper(trim(coalesce(s.matricula, ''))) = v_pessoa.matricula
       AND (v_socio_id IS NULL OR s.id <> v_socio_id);
    IF v_target_count > 0 THEN
      RAISE EXCEPTION 'Migração cancelada: a matrícula % já pertence a outro cadastro.', v_pessoa.matricula;
    END IF;

    -- Também evita criar duplicidade por CPF se não houver registro prévio em socios.
    IF NOT v_socio_existente AND v_dep_existente AND nullif(regexp_replace(coalesce(v_dep.cpf, ''), '\D', '', 'g'), '') IS NOT NULL THEN
      SELECT count(*)
        INTO v_cpf_count
        FROM public.socios AS s
       WHERE regexp_replace(coalesce(s.cpf, ''), '\D', '', 'g') = regexp_replace(v_dep.cpf, '\D', '', 'g');
      IF v_cpf_count > 0 THEN
        RAISE EXCEPTION 'Migração cancelada: o CPF de % já existe em socios. Conferir o cadastro para preservar histórico.', v_pessoa.nome;
      END IF;
    END IF;

    -- A tarifa vem da configuração ativa; só usa valor previamente cadastrado como alternativa.
    v_valor := coalesce(
      nullif(v_config_valor, 0),
      CASE WHEN v_socio_existente THEN nullif(v_socio.valor_mensalidade, 0) END,
      CASE WHEN v_dep_existente THEN nullif(v_dep.valor_mensalidade, 0) END
    );
    IF v_valor IS NULL OR v_valor <= 0 THEN
      RAISE EXCEPTION 'Migração cancelada: não há valor mensal positivo configurado para % nem valor individual antigo para %. Nenhuma alteração será confirmada.',
        'Dependente Sócio Contribuinte Individual com Mensalidade', v_pessoa.nome;
    END IF;

    v_dia := coalesce(
      nullif(v_config_dia, 0),
      CASE WHEN v_socio_existente THEN nullif(v_socio.dia_vencimento, 0) END,
      CASE WHEN v_dep_existente THEN nullif(v_dep.dia_vencimento, 0) END,
      10
    );

    IF v_socio_existente THEN
      -- Atualiza o registro de sócio em lugar de recriá-lo, preservando seu ID
      -- e todos os lançamentos da tabela mensalidades associados a ele.
      UPDATE public.socios
         SET matricula = v_pessoa.matricula,
             categoria = 'Dependente com Mensalidade',
             tipo_socio = 'dependente_contribuinte_individual_mensalidade',
             responsavel_id = v_parent_id,
             parentesco = coalesce(nullif(v_socio.parentesco, ''), 'Filho(a)'),
             possui_mensalidade = true,
             valor_mensalidade = v_valor,
             dia_vencimento = v_dia
       WHERE id = v_socio_id;
    ELSE
      -- Cria o cadastro em socios usando o registro legado como fonte de dados.
      INSERT INTO public.socios (
        matricula, nome, cpf, data_nascimento, telefone, whatsapp, email,
        data_associacao, categoria, situacao, observacoes, tipo_socio,
        responsavel_id, parentesco, possui_mensalidade, valor_mensalidade,
        dia_vencimento, tipo_pagamento, situacao_financeira, data_ultimo_pagamento, foto_url
      ) VALUES (
        v_pessoa.matricula,
        v_dep.nome,
        v_dep.cpf,
        v_dep.data_nascimento,
        v_dep.telefone,
        v_dep.whatsapp,
        v_dep.email,
        coalesce(v_dep.created_at::date, CURRENT_DATE),
        'Dependente com Mensalidade',
        CASE WHEN v_dep.ativo IS FALSE THEN 'inativo' ELSE 'ativo' END,
        v_dep.observacoes,
        'dependente_contribuinte_individual_mensalidade',
        v_parent_id,
        coalesce(nullif(v_dep.parentesco, ''), 'Filho(a)'),
        true,
        v_valor,
        v_dia,
        coalesce(nullif(v_dep.tipo_pagamento, ''), 'pix'),
        v_dep.situacao_financeira,
        v_dep.data_ultimo_pagamento,
        v_dep.foto_url
      ) RETURNING id INTO v_socio_id;
    END IF;

    -- Arquiva/vincula o registro antigo, sem apagá-lo fisicamente. A tela deixa de
    -- mostrá-lo como dependente, e referências históricas ao ID antigo continuam válidas.
    IF v_dep_existente THEN
      UPDATE public.dependentes
         SET migrado_para_socio_id = v_socio_id,
             ativo = false
       WHERE id = v_dep.id;
    END IF;

    RAISE NOTICE 'Cadastro verificado/promovido: % -> % (socio_id=%; valor=%; vencimento dia %).',
      v_pessoa.nome, v_pessoa.matricula, v_socio_id, v_valor, v_dia;
  END LOOP;
END;
$$;

COMMIT;
