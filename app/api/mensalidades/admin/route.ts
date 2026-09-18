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
  const categoria = normalizarTexto(socio?.categoria);

  if (categoria) {
    if (
      categoria.includes("c/ mensalidade") ||
      categoria.includes("com mensalidade")
    ) {
      return true;
    }

    // Categoria preenchida e sem indicação de mensalidade: não cobrar.
    return false;
  }

  return TIPOS_DEPENDENTES_COM_MENSALIDADE.includes(
    String(socio?.tipo_socio || "")
  );
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


function normalizarBanco(valor: unknown) {
  return normalizarTexto(valor)
    .replace(/banco\s+do\s+brasil/g, "bb")
    .replace(/banco\s+banrisul/g, "banrisul");
}

function chaveTarifa(
  tipoPagamento: unknown,
  contaBancaria: any | null
) {
  const tipo = normalizarTexto(tipoPagamento);

  const aliases: Record<string, string> = {
    banrisul: "banrisul",
    bergs: "banrisul",
    debito_banrisul: "banrisul",
    "debito banrisul": "banrisul",
    sicredi: "sicredi",
    debito_sicredi: "sicredi",
    "debito sicredi": "sicredi",
    bb: "bb",
    banco_do_brasil: "bb",
    debito_bb: "bb",
    debito_banco_do_brasil: "bb",
    "debito banco do brasil": "bb",
    boleto: "boleto",
    pix: "pix",
    botero: "pix",
    dinheiro: "dinheiro",
    transferencia: "transferencia",
    outro: "outro",
  };

  if (aliases[tipo]) return aliases[tipo];

  // No cadastro, Banrisul/Sicredi/BB ficam como "debito_em_conta".
  // A tarifa correta vem da instituição da conta bancária vinculada.
  if (
    tipo === "debito_em_conta" ||
    tipo === "debito em conta" ||
    tipo === "debito"
  ) {
    const banco = normalizarBanco(
      `${contaBancaria?.nome || ""} ${contaBancaria?.banco || ""}`
    );

    if (banco.includes("banrisul") || banco.includes("bergs")) {
      return "banrisul";
    }
    if (banco.includes("sicredi")) {
      return "sicredi";
    }
    if (banco === "bb" || banco.includes("bb") || banco.includes("banco do brasil")) {
      return "bb";
    }
  }

  return tipo;
}

function valorTarifa(
  tarifas: any[],
  tipoPagamento: unknown,
  contaBancaria: any | null
) {
  const chave = chaveTarifa(tipoPagamento, contaBancaria);
  if (!chave) return 0;

  const tarifa = (tarifas || []).find(
    (t: any) =>
      normalizarTexto(t.tipo_pagamento) === chave &&
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

    const mensalidadesComSocio = (mensalidades || []).map((m: any) => ({
      ...m,
      socio: mapaSocios.get(String(m.socio_id)) || null,
    }));

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
          "id,nome,matricula,categoria,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,conta_bancaria_id,situacao,ativo"
        )
        .order("nome");

      if (erroSocios) throw erroSocios;

      const cobraveis = (socios || []).filter((s: any) => {
        if (
          String(s.situacao || "").toLowerCase() === "inativo" ||
          s.ativo === false
        ) {
          return false;
        }

        if (!s.responsavel_id) {
          return Boolean(s.possui_mensalidade);
        }

        return dependenteTemMensalidade(s);
      });

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

      const { data: contasBancarias, error: erroContas } = await db
        .from("contas_bancarias")
        .select("id,nome,banco")
        .eq("ativo", true);

      if (erroContas) throw erroContas;

      const mapaContas = new Map<string, any>(
        (contasBancarias || []).map((c: any) => [String(c.id), c])
      );

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

      const novos = cobraveis
        .filter((s: any) => !idsExistentes.has(String(s.id)))
        .map((s: any) => {
          const config = escolherConfiguracao(
            configuracoes || [],
            s.tipo_socio,
            competencia
          );

          const valor =
            config?.valor !== undefined
              ? Number(config.valor || 0)
              : Number(s.valor_mensalidade || 0);

          const dia = config?.dia_vencimento
            ? Number(config.dia_vencimento)
            : Number(s.dia_vencimento || 10);

          const tipoPagamento =
            s.tipo_pagamento || config?.tipo_pagamento || null;
          const vencimento = dataVencimento(competencia, dia);
          const contaBancaria = s.conta_bancaria_id ? mapaContas.get(String(s.conta_bancaria_id)) || null : null;
          const tarifa = valorTarifa(tarifas || [], tipoPagamento, contaBancaria);
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
            conta_bancaria_id: s.conta_bancaria_id || null,
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
          "id,nome,categoria,tipo_socio,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,conta_bancaria_id,situacao,ativo"
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
      const cobraveis = (socios || []).filter((s: any) => {
        if (
          String(s.situacao || "").toLowerCase() === "inativo" ||
          s.ativo === false
        ) {
          return false;
        }

        const ehDependente = Boolean(s.responsavel_id);

        if (!ehDependente) {
          return Boolean(s.possui_mensalidade);
        }

        return dependenteTemMensalidade(s);
      });

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

      const { data: contasBancarias, error: erroContas } = await db
        .from("contas_bancarias")
        .select("id,nome,banco")
        .eq("ativo", true);

      if (erroContas) throw erroContas;

      const mapaContas = new Map<string, any>(
        (contasBancarias || []).map((c: any) => [String(c.id), c])
      );

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

      /*
       * A lista "cobraveis" acima já representa os pagadores desta
       * competência. O gerador apenas cria o lançamento financeiro;
       * ele não modifica o cadastro do sócio.
       */
      const novos = cobraveis
        .filter((s: any) => !idsExistentes.has(String(s.id)))
        .map((s: any) => {
          const config = escolherConfiguracao(
            configuracoes || [],
            s.tipo_socio,
            competencia
          );

          const valor =
            config?.valor !== undefined
              ? Number(config.valor || 0)
              : Number(s.valor_mensalidade || 0);

          const dia = config?.dia_vencimento
            ? Number(config.dia_vencimento)
            : Number(s.dia_vencimento || 10);

          const tipoPagamento =
            s.tipo_pagamento ||
            config?.tipo_pagamento ||
            null;

          const vencimento = dataVencimento(competencia, dia);
          const contaBancaria = s.conta_bancaria_id ? mapaContas.get(String(s.conta_bancaria_id)) || null : null;
          const tarifa = valorTarifa(tarifas || [], tipoPagamento, contaBancaria);
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
            situacao: valor === 0 ? "isento" : "em_aberto",
            tipo_pagamento: tipoPagamento,
            conta_bancaria_id: s.conta_bancaria_id || null,
          };
        });

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
        ? body.ids.map((id: unknown) => String(id))
        : [];

      if (ids.length === 0) {
        return NextResponse.json(
          { error: "Selecione ao menos uma mensalidade." },
          { status: 400 }
        );
      }

      const dataPagamento =
        body.data_pagamento ||
        new Date().toISOString().slice(0, 10);
      const tipoPagamento = body.tipo_pagamento || "dinheiro";

      const { data: registros, error: erroBusca } = await db
        .from("mensalidades")
        .select("id,socio_id,situacao,valor,valor_base,data_vencimento,tipo_pagamento,conta_bancaria_id")
        .in("id", ids);

      if (erroBusca) throw erroBusca;

      const idsJaPagos: string[] = (registros || [])
        .filter((x: any) => x.situacao === "pago")
        .map((x: any) => String(x.id));

      const idsParaBaixar = ids.filter(
        (id: string) => !idsJaPagos.includes(id)
      );

      if (idsParaBaixar.length === 0) {
        return NextResponse.json({
          ok: true,
          baixadas: 0,
          message: "As mensalidades selecionadas já estão pagas.",
        });
      }

      const { data: tarifas, error: erroTarifas } = await db
        .from("configuracoes_tarifas_mensalidades")
        .select("*")
        .eq("ativo", true);

      const { data: contasBancarias, error: erroContas } = await db
        .from("contas_bancarias")
        .select("id,nome,banco")
        .eq("ativo", true);

      if (erroContas) throw erroContas;

      const mapaContas = new Map<string, any>(
        (contasBancarias || []).map((c: any) => [String(c.id), c])
      );

      if (erroTarifas) throw erroTarifas;

      const { data: cobrancas, error: erroCobrancas } = await db
        .from("configuracoes_cobranca_mensalidades")
        .select("*")
        .eq("ativo", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (erroCobrancas) throw erroCobrancas;

      const regraCobranca = cobrancas?.[0] || null;
      const registrosParaBaixar = (registros || []).filter((r: any) =>
        idsParaBaixar.includes(String(r.id))
      );

      for (const registro of registrosParaBaixar) {
        const formaPagamento =
          body.tipo_pagamento || registro.tipo_pagamento || "dinheiro";

        const valorBase = Number(
          registro.valor_base ?? registro.valor ?? 0
        );

        const calculado = calcularCobranca(
          valorBase,
          registro.data_vencimento || null,
          String(dataPagamento),
          valorTarifa(tarifas || [], formaPagamento, registro.conta_bancaria_id ? mapaContas.get(String(registro.conta_bancaria_id)) || null : null),
          regraCobranca
        );

        const { error: erroBaixa } = await db
          .from("mensalidades")
          .update({
            situacao: "pago",
            data_pagamento: dataPagamento,
            tipo_pagamento: formaPagamento,
            valor_base: valorBase,
            tarifa_pagamento: calculado.tarifa_pagamento,
            multa: calculado.multa,
            juros: calculado.juros,
            desconto: calculado.desconto,
            total_cobrado: calculado.total_cobrado,
            dias_atraso: calculado.dias_atraso,
            observacoes: body.observacoes || null,
          })
          .eq("id", registro.id);

        if (erroBaixa) throw erroBaixa;
      }

      return NextResponse.json({
        ok: true,
        baixadas: idsParaBaixar.length,
        ignoradas: idsJaPagos.length,
        message:
          `${idsParaBaixar.length} mensalidade(s) baixada(s).`,
      });
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
