import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

function erro(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function competenciaAtual() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${p.find(x => x.type === "year")?.value}-${p.find(x => x.type === "month")?.value}`;
}

function dataHoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function formaMensalidade(valor: unknown) {
  const forma = String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  if (["pix", "boleto", "cartao", "debito_em_conta", "dinheiro", "transferencia", "outro"].includes(forma)) return forma;
  if (forma.includes("sicredi") || forma.includes("banrisul") || forma === "bb" || forma.includes("banco_do_brasil")) return "debito_em_conta";
  return "outro";
}

function dataVencimento(inicio: string, meses: number) {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

async function criarMovimento(db: ReturnType<typeof getServiceClient>, parcela: any, contrato: any, userId: string, contaId: string, forma: string, data: string) {
  const { data: existente, error: buscaErro } = await db.from("movimentacoes_financeiras")
    .select("id").eq("origem_tipo", "venda_titulo_parcela").eq("origem_id", parcela.id).maybeSingle();
  if (buscaErro) throw buscaErro;
  if (existente?.id) return String(existente.id);

  const { data: movimento, error } = await db.from("movimentacoes_financeiras").insert({
    conta_bancaria_id: contaId, conta_destino_id: null, grupo_transferencia: null,
    tipo: "entrada", categoria: "Venda de título",
    descricao: `Venda de título — ${contrato.comprador_nome} — Parcela ${parcela.numero}`,
    valor: Number(parcela.valor), data_movimentacao: data, forma_pagamento: forma,
    origem_tipo: "venda_titulo_parcela", origem_id: parcela.id,
    socio_id: contrato.socio_id, dependente_id: null, created_by: userId,
    conciliado: false, data_conciliacao: null,
    observacoes: `Recebimento do contrato ${contrato.codigo}.`,
  }).select("id").single();
  if (error) throw error;
  return String(movimento.id);
}

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  const db = getServiceClient();
  const { searchParams } = new URL(request.url);
  try {
    const [contratosResult, sociosResult, contasResult] = await Promise.all([
      db.from("vendas_titulos").select("*,parcelas:vendas_titulos_parcelas(*)").order("created_at", { ascending: false }),
      db.from("socios").select("id,nome,matricula,cpf,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,conta_bancaria_id,situacao,ativo").eq("ativo", true).order("nome"),
      db.from("contas_bancarias").select("id,nome,banco").eq("ativo", true).order("nome"),
    ]);
    if (contratosResult.error) throw contratosResult.error;
    if (sociosResult.error) throw sociosResult.error;
    if (contasResult.error) throw contasResult.error;

    const movimentoSocio = String(searchParams.get("socio_id") || "");
    let entradas: any[] = [];
    let outrasEntradas: any[] = [];
    if (movimentoSocio) {
      const socioSelecionado = (sociosResult.data || []).find((item: any) => String(item.id) === movimentoSocio);
      if (!socioSelecionado) return erro("Associado selecionado não foi encontrado.", 404);

      const { data, error } = await db.from("movimentacoes_financeiras")
        .select("id,socio_id,descricao,valor,data_movimentacao,conta_bancaria_id,forma_pagamento,origem_tipo,origem_id")
        .eq("tipo", "entrada")
        .order("data_movimentacao", { ascending: false }).limit(500);
      if (error) throw error;

      const normalizar = (valor: unknown) => String(valor || "")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const nome = normalizar(socioSelecionado.nome);
      const tokensNome = nome.split(/\s+/).filter((token: string) => token.length >= 3);
      const todos = data || [];
      entradas = todos.filter((movimento: any) => {
        if (String(movimento.socio_id || "") === movimentoSocio) return true;
        if (movimento.socio_id) return false;
        const descricao = normalizar(movimento.descricao);
        const encontrados = tokensNome.filter((token: string) => descricao.includes(token)).length;
        return tokensNome.length > 0 && encontrados >= Math.min(2, tokensNome.length);
      });
      outrasEntradas = todos.filter((movimento: any) =>
        !movimento.socio_id && !entradas.some((entrada: any) => entrada.id === movimento.id)
      ).slice(0, 100);
    }
    return NextResponse.json({
      contratos: contratosResult.data || [], socios: sociosResult.data || [],
      contas: contasResult.data || [], entradas, outras_entradas: outrasEntradas,
      competencia_atual: competenciaAtual(),
    });
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Erro ao carregar vendas de títulos.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  const db = getServiceClient();
  try {
    const body = await request.json();
    const acao = String(body.acao || "criar");
    if (acao === "criar") {
      const socioId = String(body.socio_id || "");
      const valorTotal = Number(body.valor_total);
      const quantidade = Number(body.quantidade_parcelas || 1);
      const inicio = String(body.primeiro_vencimento || dataHoje());
      const entradaPaga = body.entrada_paga === true;
      const movimentoEntradaId = String(body.movimentacao_entrada_id || "");
      const confirmarEntradaSemVinculo = body.confirmar_entrada_sem_vinculo === true;
      const valores = Array.isArray(body.parcelas) ? body.parcelas : [];
      if (!socioId || !Number.isFinite(valorTotal) || valorTotal <= 0 || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 24) {
        return erro("Informe associado, valor total e quantidade de parcelas válida.");
      }
      const { data: socio, error: socioError } = await db.from("socios")
        .select("id,nome,matricula,cpf,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,conta_bancaria_id,ativo")
        .eq("id", socioId).maybeSingle();
      if (socioError) throw socioError;
      if (!socio || socio.ativo === false) return erro("Associado não encontrado ou inativo.", 404);

      const soma = valores.reduce((acc: number, p: any) => acc + Number(p.valor || 0), 0);
      if (valores.length !== quantidade || valores.some((p: any) => !Number.isFinite(Number(p.valor)) || Number(p.valor) <= 0) || Math.abs(soma - valorTotal) > 0.01) {
        return erro("As parcelas precisam somar exatamente o valor total do título.");
      }
      if (entradaPaga && !movimentoEntradaId) return erro("Selecione o lançamento financeiro já recebido para vincular a entrada.");
      let movimentoEntrada: any = null;
      if (entradaPaga) {
        const { data, error } = await db.from("movimentacoes_financeiras")
          .select("id,socio_id,tipo,valor,conta_bancaria_id,forma_pagamento,data_movimentacao,descricao")
          .eq("id", movimentoEntradaId).maybeSingle();
        if (error) throw error;
        const primeira = valores[0];
        if (!data || data.tipo !== "entrada" ||
            (data.socio_id && data.socio_id !== socioId) ||
            Math.abs(Number(data.valor) - Number(primeira.valor)) > 0.01) {
          return erro("O lançamento selecionado não corresponde ao associado e ao valor da entrada.");
        }
        if (!data.socio_id && !confirmarEntradaSemVinculo) {
          return erro("Confirme que o lançamento sem associado vinculado é realmente a entrada deste comprador.");
        }
        const { data: jaVinculada, error: erroVinculo } = await db.from("vendas_titulos_parcelas")
          .select("id").eq("movimentacao_id", movimentoEntradaId).maybeSingle();
        if (erroVinculo) throw erroVinculo;
        if (jaVinculada) return erro("Este lançamento financeiro já está vinculado a outra venda de título.", 409);
        movimentoEntrada = data;
      }

      const hoje = dataHoje();
      const comp = competenciaAtual();
      const codigo = `VT-${Date.now().toString().slice(-8)}`;
      const { data: contrato, error: contratoError } = await db.from("vendas_titulos").insert({
        codigo, socio_id: socioId, comprador_nome: socio.nome, comprador_cpf: socio.cpf || null,
        valor_total: valorTotal, quantidade_parcelas: quantidade, data_contratacao: hoje,
        situacao: "ativo", observacoes: String(body.observacoes || "").trim() || null,
        created_by: auth.usuario.id,
      }).select("*").single();
      if (contratoError) throw contratoError;

      const parcelas = valores.map((p: any, i: number) => ({
        venda_titulo_id: contrato.id, numero: i + 1, descricao: i === 0 ? "Entrada" : `Parcela ${i + 1}`,
        valor: Number(p.valor), data_vencimento: String(p.data_vencimento || dataVencimento(inicio, i)),
        situacao: entradaPaga && i === 0 ? "pago" : "em_aberto",
        data_pagamento: entradaPaga && i === 0 ? (movimentoEntrada.data_movimentacao || hoje) : null,
        forma_pagamento: entradaPaga && i === 0 ? movimentoEntrada.forma_pagamento : null,
        conta_bancaria_id: entradaPaga && i === 0 ? movimentoEntrada.conta_bancaria_id : null,
        movimentacao_id: entradaPaga && i === 0 ? movimentoEntrada.id : null,
      }));
      const { error: parcelasError } = await db.from("vendas_titulos_parcelas").insert(parcelas);
      if (parcelasError) {
        await db.from("vendas_titulos").delete().eq("id", contrato.id);
        throw parcelasError;
      }

      // A mensalidade começa na competência vigente. Se já existir, não duplica.
      if (socio.possui_mensalidade === true && Number(socio.valor_mensalidade || 0) > 0) {
        const { data: mensalidadeExistente, error: mensalidadeBuscaError } = await db.from("mensalidades")
          .select("id").eq("socio_id", socioId).eq("competencia", comp).is("dependente_id", null).maybeSingle();
        if (mensalidadeBuscaError) throw mensalidadeBuscaError;
        if (!mensalidadeExistente) {
          const dia = Math.min(28, Math.max(1, Number(socio.dia_vencimento || 10)));
          const { error: mensalidadeInsertError } = await db.from("mensalidades").insert({
            socio_id: socioId, competencia: comp, valor: Number(socio.valor_mensalidade),
            valor_base: Number(socio.valor_mensalidade), tarifa_pagamento: 0, multa: 0, juros: 0,
            desconto: 0, total_cobrado: Number(socio.valor_mensalidade), dias_atraso: 0,
            data_vencimento: `${comp}-` + String(dia).padStart(2, "0"),
            situacao: "em_aberto", tipo_pagamento: formaMensalidade(socio.tipo_pagamento),
            conta_pagadora_id: socio.conta_bancaria_id || null,
            observacoes: `Mensalidade da competência ${comp} iniciada pela venda do título ${codigo}.`,
          });
          if (mensalidadeInsertError) throw mensalidadeInsertError;
        }
      }
      return NextResponse.json({ ok: true, contrato, message: `Venda ${codigo} cadastrada. Mensalidade da competência ${comp} verificada.` });
    }

    if (acao === "baixar_parcela") {
      const parcelaId = String(body.parcela_id || "");
      const contaId = String(body.conta_bancaria_id || "");
      const forma = String(body.forma_pagamento || "pix");
      const data = String(body.data_pagamento || dataHoje());
      if (!parcelaId || !contaId) return erro("Selecione a parcela e a conta de recebimento.");
      const { data: parcela, error: parcelaError } = await db.from("vendas_titulos_parcelas")
        .select("*").eq("id", parcelaId).maybeSingle();
      if (parcelaError) throw parcelaError;
      if (!parcela) return erro("Parcela não encontrada.", 404);
      if (parcela.situacao === "pago") return erro("Esta parcela já está paga.", 409);
      const { data: contrato, error: contratoError } = await db.from("vendas_titulos")
        .select("*").eq("id", parcela.venda_titulo_id).single();
      if (contratoError) throw contratoError;
      const { data: atualizada, error: updateError } = await db.from("vendas_titulos_parcelas")
        .update({ situacao: "pago", data_pagamento: data, forma_pagamento: forma, conta_bancaria_id: contaId })
        .eq("id", parcelaId).neq("situacao", "pago").select("*").maybeSingle();
      if (updateError) throw updateError;
      if (!atualizada) return erro("Esta parcela já foi baixada. Atualize a tela.", 409);
      try {
        const movimentoId = await criarMovimento(db, atualizada, contrato, auth.usuario.id, contaId, forma, data);
        await db.from("vendas_titulos_parcelas").update({ movimentacao_id: movimentoId }).eq("id", parcelaId);
        const { count: abertas, error: abertasError } = await db.from("vendas_titulos_parcelas")
          .select("id", { count: "exact", head: true })
          .eq("venda_titulo_id", contrato.id).neq("situacao", "pago").neq("situacao", "cancelado");
        if (abertasError) throw abertasError;
        if ((abertas || 0) === 0) {
          const { error: quitarError } = await db.from("vendas_titulos").update({ situacao: "quitado" }).eq("id", contrato.id);
          if (quitarError) throw quitarError;
        }
      } catch (e) {
        await db.from("vendas_titulos_parcelas").update({ situacao: "em_aberto", data_pagamento: null, forma_pagamento: null, conta_bancaria_id: null }).eq("id", parcelaId);
        throw e;
      }
      return NextResponse.json({ ok: true, message: "Parcela recebida e lançada no Financeiro." });
    }
    return erro("Ação não reconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Erro ao processar venda de título.", 500);
  }
}
