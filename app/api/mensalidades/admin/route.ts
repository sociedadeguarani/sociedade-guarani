import { NextResponse } from "next/server";

import {
  exigirAdministrador,
  getServiceClient,
} from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const MOTIVOS = [
  "Não debitou — sem saldo",
  "Não debitou — débito não autorizado",
  "Não debitou — conta encerrada",
  "Pagamento não identificado",
  "Acordo",
  "Isento",
  "Outro",
];

const TIPOS_DEPENDENTES_COM_MENSALIDADE = [
  "dependente_patrimonial_familiar_mensalidade",
  "dependente_patrimonial_individual_mensalidade",
  "dependente_contribuinte_familiar_mensalidade",
  "dependente_contribuinte_individual_mensalidade",
];

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Para dependentes, a categoria importada do sistema antigo é a
 * referência principal para saber se aquela pessoa realmente paga
 * mensalidade. Isso evita transformar automaticamente esposa, filhos
 * e outros dependentes em pagadores apenas porque o tipo_socio foi
 * normalizado durante a migração/sincronização.
 *
 * Exemplos de categorias pagantes:
 * - Dependente Patrimonial C/ Mensalidade
 * - Dependente Contribuinte C/ Mensalidade
 * - Sócio dependente c/ mensalidade
 *
 * Quando a categoria não estiver preenchida, usamos o tipo_socio como
 * fallback para manter compatibilidade com novos cadastros.
 */
function dependenteTemMensalidade(socio: any) {
  if (!socio?.responsavel_id || socio?.possui_mensalidade !== true) return false;

  // Dependente pagante é uma exceção explícita e usa matrícula SD....A.
  const matricula = String(socio.matricula || "").trim().toUpperCase();
  if (/^SD\d{1,6}A$/.test(matricula)) return true;

  // Compatibilidade com cadastros antigos já marcados explicitamente.
  const categoria = normalizarTexto(socio.categoria);
  const tipo = normalizarTexto(socio.tipo_socio);
  return (
    categoria.includes("c/ mensalidade") ||
    categoria.includes("com mensalidade") ||
    TIPOS_DEPENDENTES_COM_MENSALIDADE.includes(tipo)
  );
}

function ehPagador(socio: any) {
  if (!socio || socio.ativo === false || normalizarTexto(socio.situacao) === "inativo") return false;
  if (!socio.responsavel_id) return socio.possui_mensalidade === true;
  return dependenteTemMensalidade(socio);
}

function valorEfetivoMensalidade(socio: any, configuracao: any) {
  const individual = Number(socio?.valor_mensalidade || 0);
  if (individual > 0) return individual;
  return configuracao?.valor !== undefined ? Number(configuracao.valor || 0) : 0;
}

const primeiroDia = (ano: number, mes: number) =>
  `${ano}-${String(mes).padStart(2, "0")}-01`;

function dataVencimento(competencia: string, dia: unknown) {
  const d = Math.min(Math.max(Number(dia || 10), 1), 28);
  return `${competencia.slice(0, 8)}${String(d).padStart(2, "0")}`;
}

function escolherConfiguracao(
  configuracoes: any[],
  tipoSocio: string,
  competencia: string
) {
  return (configuracoes || [])
    .filter(
      (c: any) =>
        String(c.tipo_socio || "") === String(tipoSocio || "") &&
        c.ativo !== false &&
        String(c.vigencia_inicio || "0000-00-00") <= competencia
    )
    .sort((a: any, b: any) =>
      String(b.vigencia_inicio || "").localeCompare(
        String(a.vigencia_inicio || "")
      )
    )[0];
}


function valorTarifa(
  tarifas: any[],
  tipoPagamento: unknown
) {
  const tipo = String(tipoPagamento || "").toLowerCase().trim();
  if (!tipo) return 0;

  const aliases: Record<string, string> = {
    // Banrisul / "bergs" — nome usado na planilha antiga
    banrisul: "banrisul",
    bergs: "banrisul",
    debito_banrisul: "banrisul",
    "débito banrisul": "banrisul",

    // Sicredi
    sicredi: "sicredi",
    debito_sicredi: "sicredi",
    "débito sicredi": "sicredi",

    // Banco do Brasil
    bb: "bb",
    banco_do_brasil: "bb",
    debito_bb: "bb",
    debito_banco_do_brasil: "bb",
    "débito banco do brasil": "bb",

    // Boleto
    boleto: "boleto",

    // PIX — "botero" é a identificação usada na planilha antiga
    pix: "pix",
    botero: "pix",

    dinheiro: "dinheiro",
    transferencia: "transferencia",
    transferência: "transferencia",
    outro: "outro",
  };

  const chave = aliases[tipo] || tipo;
  const tarifa = (tarifas || []).find(
    (t: any) =>
      String(t.tipo_pagamento || "").toLowerCase() === chave &&
      t.ativo !== false
  );

  return Number(tarifa?.valor_tarifa || 0);
}

function diasDeAtraso(
  vencimento: string | null,
  dataReferencia: string
) {
  if (!vencimento) return 0;

  const inicio = new Date(`${vencimento.slice(0, 10)}T00:00:00`);
  const fim = new Date(`${dataReferencia.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    return 0;
  }

  const diferenca = Math.floor(
    (fim.getTime() - inicio.getTime()) / 86400000
  );

  return Math.max(0, diferenca);
}

function calcularCobranca(
  valorBase: number,
  dataVencimentoAtual: string | null,
  dataReferencia: string,
  tarifa: number,
  regra: any
) {
  const dias = diasDeAtraso(dataVencimentoAtual, dataReferencia);
  const tolerancia = Number(regra?.dias_tolerancia || 0);
  const diasCobrados = Math.max(0, dias - tolerancia);

  let multa = 0;
  let juros = 0;

  if (diasCobrados > 0) {
    if (regra?.multa_tipo === "valor") {
      multa = Number(regra?.multa_valor || 0);
    } else {
      multa =
        valorBase * (Number(regra?.multa_valor || 0) / 100);
    }

    const jurosValor = Number(regra?.juros_valor || 0);

    switch (regra?.juros_tipo) {
      case "percentual_dia":
        juros =
          valorBase *
          (jurosValor / 100) *
          diasCobrados;
        break;
      case "valor_dia":
        juros = jurosValor * diasCobrados;
        break;
      case "valor_mes":
        juros =
          jurosValor *
          Math.ceil(diasCobrados / 30);
        break;
      case "percentual_mes":
      default:
        juros =
          valorBase *
          (jurosValor / 100) *
          (diasCobrados / 30);
        break;
    }
  }

  let desconto = 0;
  if (regra?.desconto_tipo === "percentual") {
    desconto =
      valorBase *
      (Number(regra?.desconto_valor || 0) / 100);
  } else {
    desconto = Number(regra?.desconto_valor || 0);
  }

  const total = Math.max(
    0,
    valorBase + tarifa + multa + juros - desconto
  );

  return {
    dias_atraso: dias,
    multa: Number(multa.toFixed(2)),
    juros: Number(juros.toFixed(2)),
    desconto: Number(desconto.toFixed(2)),
    tarifa_pagamento: Number(tarifa.toFixed(2)),
    total_cobrado: Number(total.toFixed(2)),
  };
}

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const url = new URL(request.url);
    const ano = Number(
      url.searchParams.get("ano") || new Date().getFullYear()
    );
    const mes = Number(url.searchParams.get("mes") || 0);
    const socioId = String(url.searchParams.get("socio_id") || "").trim();

    const db = getServiceClient();

    const { data: socios, error: erroSocios } = await db
      .from("socios")
      .select(
        "id,matricula,nome,cpf,categoria,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao,situacao_financeira"
      )
      .order("nome");

    if (erroSocios) throw erroSocios;

    let consulta = db
      .from("mensalidades")
      .select("*")
      .gte("competencia", `${ano}-01-01`)
      .lt("competencia", `${ano + 1}-01-01`)
      .order("competencia", { ascending: true });

    if (mes >= 1 && mes <= 12) {
      consulta = consulta.eq("competencia", primeiroDia(ano, mes));
    }
    if (socioId) {
      consulta = consulta.eq("socio_id", socioId);
    }

    const { data: mensalidades, error: erroMensalidades } =
      await consulta;

    if (erroMensalidades) throw erroMensalidades;

    const { data: configuracoes, error: erroConfiguracoes } = await db
      .from("configuracoes_mensalidades")
      .select("*")
      .order("vigencia_inicio", { ascending: false });

    if (erroConfiguracoes) throw erroConfiguracoes;

    const { data: tarifas, error: erroTarifas } = await db
      .from("configuracoes_tarifas_mensalidades")
      .select("*")
      .order("tipo_pagamento");

    if (erroTarifas) throw erroTarifas;

    const { data: cobrancas, error: erroCobrancas } = await db
      .from("configuracoes_cobranca_mensalidades")
      .select("*")
      .eq("ativo", true)
      .order("created_at", { ascending: false })
      .limit(1);

    if (erroCobrancas) throw erroCobrancas;

    const mapaSocios = new Map<string, any>(
      (socios || []).map((s: any) => [String(s.id), s])
    );

    const mensalidadesComSocio = (mensalidades || [])
      .map((m: any) => ({
        ...m,
        socio: mapaSocios.get(String(m.socio_id)) || null,
      }))
      .filter((m: any) => {
        // Lançamentos antigos de dependentes comuns não entram mais na
        // tela operacional de mensalidades. Eles permanecem no banco para
        // eventual auditoria/limpeza controlada.
        if (!m.socio) return true;
        return ehPagador(m.socio);
      });

    return NextResponse.json({
      socios: socios || [],
      mensalidades: mensalidadesComSocio,
      configuracoes: configuracoes || [],
      tarifas: tarifas || [],
      cobranca: cobrancas?.[0] || null,
      motivos: MOTIVOS,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Erro ao carregar mensalidades.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status }
    );
  }

  try {
    const body = await request.json();
    const db = getServiceClient();
    const acao = String(body.acao || body.action || "");

    /*
     * =====================================================
     * PRÉVIA DA COMPETÊNCIA
     * =====================================================
     */
    if (acao === "previsualizar" || acao === "preview") {
      const ano = Number(body.ano);
      const mes = Number(body.mes);

      if (
        !Number.isInteger(ano) ||
        !Number.isInteger(mes) ||
        mes < 1 ||
        mes > 12
      ) {
        return NextResponse.json(
          { error: "Ano ou competência inválidos." },
          { status: 400 }
        );
      }

      const competencia = primeiroDia(ano, mes);
      const agora = new Date();
      const inicioMesAtual = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        1
      );
      const inicioMesAlvo = new Date(ano, mes - 1, 1);

      if (inicioMesAlvo > inicioMesAtual) {
        return NextResponse.json(
          {
            error:
              "Não é permitido gerar mensalidades de meses futuros.",
          },
          { status: 400 }
        );
      }

      const { data: socios, error: erroSocios } = await db
        .from("socios")
        .select(
          "id,nome,matricula,categoria,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao,ativo"
        )
        .order("nome");

      if (erroSocios) throw erroSocios;

      const cobraveis = (socios || []).filter((s: any) => ehPagador(s));

      const { data: configuracoes, error: erroConfiguracoes } =
        await db
          .from("configuracoes_mensalidades")
          .select("*")
          .eq("ativo", true)
          .order("vigencia_inicio", { ascending: false });

      if (erroConfiguracoes) throw erroConfiguracoes;

      const { data: tarifas, error: erroTarifas } = await db
        .from("configuracoes_tarifas_mensalidades")
        .select("*")
        .eq("ativo", true);

      if (erroTarifas) throw erroTarifas;

      const { data: cobrancas, error: erroCobrancas } = await db
        .from("configuracoes_cobranca_mensalidades")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (erroCobrancas) throw erroCobrancas;

      const regraCobranca = cobrancas?.[0] || null;

      const { data: existentes, error: erroExistentes } = await db
        .from("mensalidades")
        .select("socio_id")
        .eq("competencia", competencia);

      if (erroExistentes) throw erroExistentes;

      const idsExistentes = new Set<string>(
        (existentes || []).map((x: any) => String(x.socio_id))
      );

      const idsSolicitados = Array.isArray(body.socio_ids)
        ? new Set(body.socio_ids.map((id: unknown) => String(id)))
        : null;
      const cobraveisSelecionados = idsSolicitados
        ? cobraveis.filter((s: any) => idsSolicitados.has(String(s.id)))
        : cobraveis;

      const novos = cobraveisSelecionados
        .filter((s: any) => !idsExistentes.has(String(s.id)))
        .map((s: any) => {
          const config = escolherConfiguracao(
            configuracoes || [],
            s.tipo_socio,
            competencia
          );

          const valor = valorEfetivoMensalidade(s, config);

          const dia = config?.dia_vencimento
            ? Number(config.dia_vencimento)
            : Number(s.dia_vencimento || 10);

          const tipoPagamento =
            s.tipo_pagamento || config?.tipo_pagamento || null;
          const vencimento = dataVencimento(competencia, dia);
          const tarifa = valorTarifa(tarifas || [], tipoPagamento);
          const calculado = calcularCobranca(
            valor,
            vencimento,
            competencia,
            tarifa,
            regraCobranca
          );

          return {
            id: s.id,
            nome: s.nome,
            matricula: s.matricula,
            categoria: s.categoria,
            valor_base: Number(valor.toFixed(2)),
            tarifa_pagamento: calculado.tarifa_pagamento,
            multa: calculado.multa,
            juros: calculado.juros,
            desconto: calculado.desconto,
            total_cobrado: calculado.total_cobrado,
            tipo_pagamento: tipoPagamento,
            data_vencimento: vencimento,
          };
        });

      const soma = (campo: string) =>
        Number(
          novos
            .reduce(
              (total: number, item: any) =>
                total + Number(item[campo] || 0),
              0
            )
            .toFixed(2)
        );

      return NextResponse.json({
        ok: true,
        competencia,
        total_cobraveis: cobraveis.length,
        ja_existentes: cobraveis.filter((s: any) =>
          idsExistentes.has(String(s.id))
        ).length,
        quantidade_nova: novos.length,
        valor_base: soma("valor_base"),
        tarifa_pagamento: soma("tarifa_pagamento"),
        multa: soma("multa"),
        juros: soma("juros"),
        desconto: soma("desconto"),
        total_cobrado: soma("total_cobrado"),
        itens: novos,
      });
    }

    /*
     * =====================================================
     * GERAR COMPETÊNCIA
     * =====================================================
     */
    if (acao === "gerar" || acao === "gerar_mes") {
      const ano = Number(body.ano);
      const mes = Number(body.mes);

      if (
        !Number.isInteger(ano) ||
        !Number.isInteger(mes) ||
        mes < 1 ||
        mes > 12
      ) {
        return NextResponse.json(
          { error: "Ano ou competência inválidos." },
          { status: 400 }
        );
      }

      const competencia = primeiroDia(ano, mes);
      const agora = new Date();
      const inicioMesAtual = new Date(
        agora.getFullYear(),
        agora.getMonth(),
        1
      );
      const inicioMesAlvo = new Date(ano, mes - 1, 1);

      if (inicioMesAlvo > inicioMesAtual) {
        return NextResponse.json(
          {
            error:
              "Não é permitido gerar mensalidades de meses futuros.",
          },
          { status: 400 }
        );
      }

      const { data: socios, error: erroSocios } = await db
        .from("socios")
        .select(
          "id,nome,categoria,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao,ativo"
        );

      if (erroSocios) throw erroSocios;

      /*
       * REGRA OFICIAL DO GERADOR
       *
       * O gerador NÃO altera cadastro e NÃO usa o botão antigo
       * de sincronização.
       *
       * Titulares:
       *   possui_mensalidade = true => pode gerar.
       *
       * Dependentes:
       *   usamos a categoria preservada da migração como referência
       *   principal. Só entram automaticamente quando a categoria
       *   informa "C/ Mensalidade" ou "Com Mensalidade".
       *
       * Isso é importante porque a sincronização anterior alterou
       * muitos dependentes para possui_mensalidade=true apenas por
       * causa do tipo_socio. A categoria antiga preserva a regra real
       * da família e evita cobrar esposa/filhos automaticamente.
       *
       * A definição de casos excepcionais (por exemplo, dependente
       * que passa a pagar individualmente) poderá ser ajustada no
       * cadastro do associado antes da geração.
       */
      const cobraveis = (socios || []).filter((s: any) => ehPagador(s));

      const { data: configuracoes, error: erroConfiguracoes } =
        await db
          .from("configuracoes_mensalidades")
          .select("*")
          .eq("ativo", true)
          .order("vigencia_inicio", { ascending: false });

      if (erroConfiguracoes) throw erroConfiguracoes;

      const { data: tarifas, error: erroTarifas } = await db
        .from("configuracoes_tarifas_mensalidades")
        .select("*")
        .eq("ativo", true);

      if (erroTarifas) throw erroTarifas;

      const { data: cobrancas, error: erroCobrancas } = await db
        .from("configuracoes_cobranca_mensalidades")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (erroCobrancas) throw erroCobrancas;

      const regraCobranca = cobrancas?.[0] || null;

      const { data: existentes, error: erroExistentes } = await db
        .from("mensalidades")
        .select("socio_id")
        .eq("competencia", competencia);

      if (erroExistentes) throw erroExistentes;

      const idsExistentes = new Set<string>(
        (existentes || []).map((x: any) => String(x.socio_id))
      );

      const idsSolicitados = Array.isArray(body.socio_ids)
        ? new Set(body.socio_ids.map((id: unknown) => String(id)))
        : null;

      const cobraveisSelecionados = idsSolicitados
        ? cobraveis.filter((s: any) => idsSolicitados.has(String(s.id)))
        : cobraveis;

      /*
       * A lista "cobraveis" acima já representa os pagadores desta
       * competência. O gerador apenas cria o lançamento financeiro;
       * ele não modifica o cadastro do sócio.
       */
      const novos = cobraveisSelecionados
        .filter((s: any) => !idsExistentes.has(String(s.id)))
        .map((s: any) => {
          const config = escolherConfiguracao(
            configuracoes || [],
            s.tipo_socio,
            competencia
          );

          const valor = valorEfetivoMensalidade(s, config);
          if (valor <= 0) return null;

          const dia = config?.dia_vencimento
            ? Number(config.dia_vencimento)
            : Number(s.dia_vencimento || 10);

          const tipoPagamento =
            s.tipo_pagamento ||
            config?.tipo_pagamento ||
            null;

          const vencimento = dataVencimento(competencia, dia);
          const tarifa = valorTarifa(tarifas || [], tipoPagamento);
          const calculado = calcularCobranca(
            valor,
            vencimento,
            competencia,
            tarifa,
            regraCobranca
          );

          return {
            socio_id: s.id,
            competencia,
            valor,
            valor_base: valor,
            tarifa_pagamento: calculado.tarifa_pagamento,
            multa: calculado.multa,
            juros: calculado.juros,
            desconto: calculado.desconto,
            total_cobrado: calculado.total_cobrado,
            dias_atraso: calculado.dias_atraso,
            data_vencimento: vencimento,
            situacao: "em_aberto",
            tipo_pagamento: tipoPagamento,
          };
        })
        .filter((item): item is Record<string, unknown> => item !== null);

      if (novos.length > 0) {
        const { error: erroInsert } = await db
          .from("mensalidades")
          .insert(novos);

        if (erroInsert) throw erroInsert;
      }

      return NextResponse.json({
        ok: true,
        criadas: novos.length,
        message:
          novos.length > 0
            ? `${novos.length} mensalidade(s) gerada(s).`
            : "Nenhuma nova mensalidade foi gerada. Os registros já existem.",
      });
    }

    /*
     * =====================================================
     * BAIXA EM LOTE
     * =====================================================
     */
    if (acao === "baixar") {
      const ids: string[] = Array.isArray(body.ids)
        ? Array.from(new Set((body.ids as unknown[]).map((id) => String(id)).filter((id) => id.length > 0)))
        : [];

      if (!ids.length) {
        return NextResponse.json({ error: "Selecione ao menos uma mensalidade." }, { status: 400 });
      }

      const dataPagamento = String(body.data_pagamento || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const tipoPagamento = String(body.tipo_pagamento || "dinheiro").trim().toLowerCase();
      const contaRecebimentoId = String(body.conta_recebimento_id || "").trim();

      if (!contaRecebimentoId) {
        return NextResponse.json({ error: "Selecione a conta da Sociedade que recebeu o pagamento." }, { status: 400 });
      }

      const { data: conta, error: erroConta } = await db
        .from("contas_bancarias")
        .select("id,nome,banco")
        .eq("id", contaRecebimentoId)
        .eq("ativo", true)
        .single();
      if (erroConta || !conta) {
        return NextResponse.json({ error: "Conta bancária da Sociedade não encontrada ou inativa." }, { status: 409 });
      }

      const { data: registros, error: erroBusca } = await db
        .from("mensalidades")
        .select("*")
        .in("id", ids);
      if (erroBusca) throw erroBusca;
      if (!registros || registros.length !== ids.length) {
        return NextResponse.json({ error: "Uma ou mais mensalidades não foram encontradas." }, { status: 404 });
      }

      const idsParaBaixar = registros
        .filter((r: any) => r.situacao !== "pago" && r.situacao !== "isento")
        .map((r: any) => String(r.id));

      if (!idsParaBaixar.length) {
        return NextResponse.json({ ok: true, baixadas: 0, message: "As mensalidades selecionadas já estão pagas ou isentas." });
      }

      const { data: tarifas, error: erroTarifas } = await db
        .from("configuracoes_tarifas_mensalidades")
        .select("*")
        .eq("ativo", true);
      if (erroTarifas) throw erroTarifas;

      const { data: cobrancas, error: erroCobrancas } = await db
        .from("configuracoes_cobranca_mensalidades")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1);
      if (erroCobrancas) throw erroCobrancas;

      const regraCobranca = cobrancas?.[0] || null;
      const criados: string[] = [];
      const movimentosCriados: string[] = [];

      try {
        for (const registro of registros.filter((r: any) => idsParaBaixar.includes(String(r.id)))) {
          const formaPagamentoRegistro = String(body.tipo_pagamento || registro.tipo_pagamento || "dinheiro").trim().toLowerCase();
          const valorBase = Number(registro.valor_base ?? registro.valor ?? 0);
          const tarifa = valorTarifa(tarifas || [], formaPagamentoRegistro);
          const calculado = calcularCobranca(
            valorBase,
            registro.data_vencimento || null,
            dataPagamento,
            tarifa,
            regraCobranca
          );

          // O financeiro registra o valor efetivamente recebido pela Sociedade.
          // A tarifa bancária fica fora da entrada (ex.: cobrança R$72,05 / entrada R$70,00).
          const valorRecebido = Number(
            Math.max(0, valorBase + calculado.multa + calculado.juros - calculado.desconto).toFixed(2)
          );

          const { error: erroBaixa } = await db
            .from("mensalidades")
            .update({
              situacao: "pago",
              data_pagamento: dataPagamento,
              tipo_pagamento: formaPagamentoRegistro,
              valor_base: valorBase,
              tarifa_pagamento: calculado.tarifa_pagamento,
              multa: calculado.multa,
              juros: calculado.juros,
              desconto: calculado.desconto,
              total_cobrado: calculado.total_cobrado,
              dias_atraso: calculado.dias_atraso,
              comprovante_url: body.comprovante_url || registro.comprovante_url || null,
              observacoes: body.observacoes || null,
            })
            .eq("id", registro.id);
          if (erroBaixa) throw erroBaixa;
          criados.push(String(registro.id));

          const movimentoOrigemId = String(registro.id);
          const { data: existente, error: erroMovBusca } = await db
            .from("movimentacoes_financeiras")
            .select("id")
            .eq("origem_tipo", "mensalidade")
            .eq("origem_id", movimentoOrigemId)
            .limit(1)
            .maybeSingle();
          if (erroMovBusca) throw erroMovBusca;

          if (!existente && valorRecebido > 0) {
            const { data: movimento, error: erroMov } = await db
              .from("movimentacoes_financeiras")
              .insert({
                conta_bancaria_id: contaRecebimentoId,
                conta_destino_id: null,
                grupo_transferencia: null,
                tipo: "entrada",
                categoria: "Mensalidade",
                descricao: `Mensalidade ${String(registro.competencia || "").slice(0, 7)} - ${formaPagamentoRegistro.toUpperCase()}`,
                valor: valorRecebido,
                data_movimentacao: dataPagamento,
                forma_pagamento: formaPagamentoRegistro,
                origem_tipo: "mensalidade",
                origem_id: movimentoOrigemId,
                socio_id: registro.socio_id || null,
                dependente_id: registro.dependente_id || null,
                comprovante_url: registro.comprovante_url || null,
                conciliado: false,
                data_conciliacao: null,
                observacoes: `Entrada financeira da mensalidade. Valor cobrado: R$ ${Number(calculado.total_cobrado).toFixed(2)}; valor recebido pela Sociedade: R$ ${valorRecebido.toFixed(2)}; tarifa: R$ ${Number(calculado.tarifa_pagamento).toFixed(2)}.`,
              })
              .select("id")
              .single();
            if (erroMov) throw erroMov;
            movimentosCriados.push(String(movimento.id));
          }

          if (registro.socio_id) {
            const { data: pendentes, error: erroPendentes } = await db
              .from("mensalidades")
              .select("id,situacao,data_vencimento")
              .eq("socio_id", registro.socio_id)
              .neq("situacao", "pago")
              .neq("situacao", "isento");
            if (erroPendentes) throw erroPendentes;

            const hoje = new Date().toISOString().slice(0, 10);
            const aindaAtrasado = (pendentes || []).some((m: any) => String(m.data_vencimento || "").slice(0, 10) < hoje);
            await db.from("socios").update({
              situacao_financeira: aindaAtrasado ? "inadimplente" : "em_dia",
              data_ultimo_pagamento: dataPagamento,
            }).eq("id", registro.socio_id);
          }
        }
      } catch (error) {
        if (movimentosCriados.length) {
          await db.from("movimentacoes_financeiras").delete().in("id", movimentosCriados);
        }
        if (criados.length) {
          await db.from("mensalidades").update({
            situacao: "em_aberto",
            data_pagamento: null,
            tipo_pagamento: null,
          }).in("id", criados);
        }
        throw error;
      }

      return NextResponse.json({
        ok: true,
        baixadas: criados.length,
        ignoradas: ids.length - criados.length,
        conta,
        message: `${criados.length} mensalidade(s) baixada(s) e lançada(s) no Financeiro.`,
      });
    }

    /*
     * =====================================================
     * MARCAR S.S. — SEM SALDO
     * =====================================================
     */
    if (acao === "marcar_sem_saldo") {
      const ids: string[] = Array.isArray(body.ids)
        ? Array.from(new Set((body.ids as unknown[]).map((id) => String(id)).filter((id) => id.length > 0)))
        : [];
      if (!ids.length) return NextResponse.json({ error: "Selecione ao menos uma mensalidade." }, { status: 400 });

      const { data: registros, error } = await db.from("mensalidades").select("id,situacao").in("id", ids);
      if (error) throw error;

      const elegiveis = (registros || []).filter((r: any) => r.situacao !== "pago" && r.situacao !== "isento").map((r: any) => String(r.id));
      if (elegiveis.length) {
        const { error: updateError } = await db.from("mensalidades").update({
          situacao: "em_aberto",
          motivo: "S.S",
          observacoes: body.observacoes || "S.S — Sem saldo",
          data_ocorrencia: new Date().toISOString().slice(0, 10),
        }).in("id", elegiveis);
        if (updateError) throw updateError;
      }

      return NextResponse.json({ ok: true, marcadas: elegiveis.length, message: `${elegiveis.length} mensalidade(s) marcada(s) como S.S — Sem saldo.` });
    }

    /*
     * =====================================================
     * ESTORNAR PAGAMENTO
     * =====================================================
     */
    if (acao === "estornar") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "Mensalidade não informada." }, { status: 400 });

      const { data: registro, error: buscaError } = await db.from("mensalidades").select("*").eq("id", id).single();
      if (buscaError || !registro) return NextResponse.json({ error: "Mensalidade não encontrada." }, { status: 404 });
      if (registro.situacao !== "pago") return NextResponse.json({ error: "A mensalidade não está paga." }, { status: 409 });

      const { error: movimentoError } = await db.from("movimentacoes_financeiras")
        .delete()
        .eq("origem_tipo", "mensalidade")
        .eq("origem_id", id);
      if (movimentoError) throw movimentoError;

      const { error: updateError } = await db.from("mensalidades").update({
        situacao: "em_aberto",
        data_pagamento: null,
        tipo_pagamento: null,
        motivo: null,
        observacoes: "Pagamento estornado.",
      }).eq("id", id);
      if (updateError) throw updateError;

      if (registro.socio_id) {
        const { data: pendentes } = await db.from("mensalidades")
          .select("id,situacao,data_vencimento")
          .eq("socio_id", registro.socio_id)
          .neq("situacao", "pago")
          .neq("situacao", "isento");
        const hoje = new Date().toISOString().slice(0, 10);
        const atrasado = (pendentes || []).some((m: any) => String(m.data_vencimento || "").slice(0, 10) < hoje);
        await db.from("socios").update({ situacao_financeira: atrasado ? "inadimplente" : "em_dia" }).eq("id", registro.socio_id);
      }

      return NextResponse.json({ ok: true, message: "Pagamento estornado e entrada financeira removida." });
    }

    /*
     * =====================================================
     * ATUALIZAR MENSALIDADE
     * =====================================================
     */
    if (acao === "atualizar") {
      const id = String(body.id || "");

      if (!id) {
        return NextResponse.json(
          { error: "Mensalidade não informada." },
          { status: 400 }
        );
      }

      const patch: Record<string, unknown> = {};
      const campos = [
        "situacao",
        "valor",
        "data_pagamento",
        "tipo_pagamento",
        "observacoes",
        "motivo",
        "data_ocorrencia",
      ];

      for (const campo of campos) {
        if (body[campo] !== undefined) {
          patch[campo] = body[campo] === "" ? null : body[campo];
        }
      }

      const { error } = await db
        .from("mensalidades")
        .update(patch)
        .eq("id", id);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        message: "Mensalidade atualizada.",
      });
    }

    /*
     * =====================================================
     * EDITAR TARIFA
     * =====================================================
     */
    if (acao === "tarifa_editar") {
      const tipoPagamento = String(body.tipo_pagamento || "").trim();

      if (!tipoPagamento) {
        return NextResponse.json(
          { error: "Forma de pagamento não informada." },
          { status: 400 }
        );
      }

      const dados = {
        tipo_pagamento: tipoPagamento,
        nome:
          String(body.nome || "").trim() ||
          tipoPagamento,
        valor_tarifa: Number(body.valor_tarifa || 0),
        ativo: body.ativo !== false,
        updated_at: new Date().toISOString(),
      };

      if (dados.valor_tarifa < 0) {
        return NextResponse.json(
          { error: "A tarifa não pode ser negativa." },
          { status: 400 }
        );
      }

      const { data, error } = await db
        .from("configuracoes_tarifas_mensalidades")
        .upsert(dados, { onConflict: "tipo_pagamento" })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        tarifa: data,
        message: "Tarifa atualizada com sucesso.",
      });
    }

    /*
     * =====================================================
     * EDITAR REGRAS DE COBRANÇA
     * =====================================================
     */
    if (acao === "cobranca_editar") {
      const dados = {
        nome:
          String(body.nome || "Configuração padrão").trim() ||
          "Configuração padrão",
        multa_tipo:
          body.multa_tipo === "valor"
            ? "valor"
            : "percentual",
        multa_valor: Number(body.multa_valor || 0),
        juros_tipo: [
          "percentual_dia",
          "percentual_mes",
          "valor_dia",
          "valor_mes",
        ].includes(String(body.juros_tipo))
          ? String(body.juros_tipo)
          : "percentual_mes",
        juros_valor: Number(body.juros_valor || 0),
        desconto_tipo:
          body.desconto_tipo === "percentual"
            ? "percentual"
            : "valor",
        desconto_valor: Number(body.desconto_valor || 0),
        dias_tolerancia: Math.max(
          0,
          Number(body.dias_tolerancia || 0)
        ),
        ativo: true,
        updated_at: new Date().toISOString(),
      };

      if (
        dados.multa_valor < 0 ||
        dados.juros_valor < 0 ||
        dados.desconto_valor < 0
      ) {
        return NextResponse.json(
          { error: "Os valores de cobrança não podem ser negativos." },
          { status: 400 }
        );
      }

      const id = String(body.id || "");

      if (id) {
        const { data, error } = await db
          .from("configuracoes_cobranca_mensalidades")
          .update(dados)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({
          ok: true,
          cobranca: data,
          message: "Regras de cobrança atualizadas com sucesso.",
        });
      }

      const { data: existentesCobranca, error: erroBuscaCobranca } =
        await db
          .from("configuracoes_cobranca_mensalidades")
          .select("id")
          .eq("ativo", true)
          .order("created_at", { ascending: false })
          .limit(1);

      if (erroBuscaCobranca) throw erroBuscaCobranca;

      if (existentesCobranca?.[0]?.id) {
        const { data, error } = await db
          .from("configuracoes_cobranca_mensalidades")
          .update(dados)
          .eq("id", existentesCobranca[0].id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({
          ok: true,
          cobranca: data,
          message: "Regras de cobrança atualizadas com sucesso.",
        });
      }

      const { data, error } = await db
        .from("configuracoes_cobranca_mensalidades")
        .insert(dados)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        cobranca: data,
        message: "Regras de cobrança criadas com sucesso.",
      });
    }

    /*
     * =====================================================
     * CRIAR CONFIGURAÇÃO
     * =====================================================
     */
    if (acao === "config_criar") {
      const tipoSocio = String(body.tipo_socio || "").trim();
      const nome = String(body.nome || "").trim();
      const valor = Number(body.valor || 0);
      const vigenciaInicio = String(
        body.vigencia_inicio ||
          new Date().toISOString().slice(0, 10)
      );

      if (!tipoSocio || !nome) {
        return NextResponse.json(
          { error: "Informe o tipo e o nome da mensalidade." },
          { status: 400 }
        );
      }

      const { data, error } = await db
        .from("configuracoes_mensalidades")
        .insert({
          tipo_socio: tipoSocio,
          nome,
          valor,
          vigencia_inicio: vigenciaInicio,
          ativo: true,
        })
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        config: data,
        message: "Configuração criada com sucesso.",
      });
    }

    /*
     * =====================================================
     * EDITAR CONFIGURAÇÃO
     * =====================================================
     */
    if (acao === "config_editar") {
      const id = String(body.id || "");

      if (!id) {
        return NextResponse.json(
          { error: "Configuração não informada." },
          { status: 400 }
        );
      }

      const dados: Record<string, unknown> = {};

      if (body.tipo_socio !== undefined) {
        dados.tipo_socio = body.tipo_socio;
      }
      if (body.nome !== undefined) {
        dados.nome = body.nome;
      }
      if (body.valor !== undefined) {
        dados.valor = Number(body.valor || 0);
      }
      if (body.vigencia_inicio !== undefined) {
        dados.vigencia_inicio = body.vigencia_inicio;
      }

      dados.updated_at = new Date().toISOString();

      const { data, error } = await db
        .from("configuracoes_mensalidades")
        .update(dados)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        config: data,
        message: "Configuração atualizada com sucesso.",
      });
    }

    return NextResponse.json(
      { error: "Operação inválida." },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Erro ao processar mensalidades.",
      },
      { status: 500 }
    );
  }
}
