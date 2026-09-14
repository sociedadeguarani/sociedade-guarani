import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

async function confirmarPagamento(supabase: any, origemTipo: string, origemId: string, valorInformado?: unknown) {
  const tabela =
    origemTipo === "mensalidade" ? "mensalidades" :
    origemTipo === "convite" ? "convites" :
    origemTipo === "reserva" ? "reservas" : "";

  if (!tabela || !origemId) throw new Error("Origem do pagamento inválida.");

  const { data: registro, error: registroError } = await supabase
    .from(tabela).select("*").eq("id", origemId).single();

  if (registroError || !registro) throw new Error("Lançamento do pagamento não encontrado.");
  if (registro.comprovante_status !== "pendente") return;

  const { data: contas, error: contasError } = await supabase
    .from("contas_bancarias")
    .select("id,nome,banco")
    .eq("ativo", true);

  if (contasError) throw new Error(contasError.message);

  const conta =
    (contas || []).find((c: any) =>
      `${c.nome || ""} ${c.banco || ""}`.toLowerCase().includes("sicredi")
    );

  if (!conta) {
    throw new Error("Não encontrei uma conta bancária ativa do Sicredi. Cadastre/ative a conta do Sicredi em Financeiro > Contas bancárias.");
  }

  const valor =
    valorInformado === undefined || valorInformado === null || valorInformado === ""
      ? Number(registro.valor || 0)
      : Number(String(valorInformado).replace(",", "."));

  if (!Number.isFinite(valor) || valor < 0) throw new Error("Valor do pagamento inválido.");

  const { data: movimentoExistente, error: buscaError } = await supabase
    .from("movimentacoes_financeiras")
    .select("id")
    .eq("origem_tipo", origemTipo)
    .eq("origem_id", origemId)
    .maybeSingle();

  if (buscaError) throw new Error(buscaError.message);

  if (!movimentoExistente) {
    const descricao =
      origemTipo === "mensalidade"
        ? `Mensalidade ${String(registro.competencia || "").slice(0, 7)} - PIX`
        : origemTipo === "convite"
          ? `Convite - ${registro.nome_convidado || "Convidado"}`
          : `Reserva - ${registro.responsavel_nome || "Responsável"}${registro.data_reserva ? ` - ${registro.data_reserva}` : ""}`;

    const { error } = await supabase.from("movimentacoes_financeiras").insert({
      conta_bancaria_id: conta.id,
      conta_destino_id: null,
      grupo_transferencia: null,
      tipo: "entrada",
      categoria: origemTipo === "mensalidade" ? "Mensalidade" : origemTipo === "convite" ? "Convite" : "Reserva",
      descricao,
      valor,
      data_movimentacao: new Date().toISOString().slice(0, 10),
      forma_pagamento: registro.forma_pagamento || registro.tipo_pagamento || "pix",
      origem_tipo: origemTipo,
      origem_id: origemId,
      socio_id: registro.socio_id || null,
      dependente_id: registro.dependente_id || null,
      comprovante_url: registro.comprovante_url || null,
      conciliado: false,
      data_conciliacao: null,
      observacoes: `PIX recebido no ${conta.nome}${conta.banco ? ` (${conta.banco})` : ""}. Comprovante aprovado pela administração.`,
    });

    if (error) throw new Error(`Não foi possível lançar no financeiro: ${error.message}`);
  }

  const agora = new Date().toISOString();
  const update =
    origemTipo === "mensalidade"
      ? {
          situacao: "pago",
          data_pagamento: new Date().toISOString().slice(0, 10),
          tipo_pagamento: "pix",
          comprovante_status: "aprovado",
          comprovante_aprovado_em: agora,
          motivo_recusa: null,
        }
      : origemTipo === "convite"
        ? {
            status: "pago",
            forma_pagamento: "pix",
            comprovante_status: "aprovado",
            comprovante_aprovado_em: agora,
            motivo_recusa: null,
          }
        : {
            situacao: "confirmada",
            data_pagamento: new Date().toISOString().slice(0, 10),
            tipo_pagamento: "pix",
            comprovante_status: "aprovado",
            comprovante_aprovado_em: agora,
            motivo_recusa: null,
          };

  const { error: updateError } = await supabase.from(tabela).update(update).eq("id", origemId);
  if (updateError) throw new Error(updateError.message);

  return { conta, valor };
}

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const naoLidas = url.searchParams.get("nao_lidas") !== "false";
    const limite = Math.min(Math.max(Number(url.searchParams.get("limite") || 50), 1), 100);

    let query = auth.supabase
      .from("notificacoes_admin")
      .select("id,tipo,titulo,mensagem,origem_tipo,origem_id,lida,criado_em")
      .order("criado_em", { ascending: false })
      .limit(limite);

    if (naoLidas) query = query.eq("lida", false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ notificacoes: data || [] });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao carregar notificações."
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();

    if (body.todas === true) {
      const { error } = await auth.supabase
        .from("notificacoes_admin")
        .update({ lida: true })
        .eq("lida", false);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, pagamento_processado: false });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "Informe a notificação." }, { status: 400 });
    }

    const { data: notificacoes, error: buscaError } = await auth.supabase
      .from("notificacoes_admin")
      .select("id,tipo,origem_tipo,origem_id,lida")
      .in("id", ids);

    if (buscaError) return NextResponse.json({ error: buscaError.message }, { status: 500 });

    const resultados: any[] = [];

    for (const n of notificacoes || []) {
      // Para comprovantes de pagamento, clicar em "Lida" confirma o recebimento
      // e lança automaticamente o valor original na conta ativa do Sicredi.
      if (
        n.tipo === "comprovante_pagamento" &&
        n.origem_tipo &&
        n.origem_id &&
        !n.lida
      ) {
        try {
          const r = await confirmarPagamento(
            auth.supabase,
            String(n.origem_tipo),
            String(n.origem_id),
            body.valor
          );
          resultados.push({ id: n.id, pagamento_confirmado: true, ...r });
        } catch (e) {
          return NextResponse.json({
            error: e instanceof Error ? e.message : "Não foi possível confirmar o pagamento."
          }, { status: 409 });
        }
      }

      const { error: markError } = await auth.supabase
        .from("notificacoes_admin")
        .update({ lida: true })
        .eq("id", n.id);

      if (markError) return NextResponse.json({ error: markError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, resultados });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao processar notificação."
    }, { status: 500 });
  }
}
