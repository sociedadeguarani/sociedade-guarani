import { NextResponse } from "next/server";
import { usuarioAutenticado, exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

async function gerarNumero(supabase: ReturnType<typeof getServiceClient>, eventoId: string, prefixo = "ON") {
  const { data, error } = await supabase.from("eventos_vendas").select("numero").eq("evento_id", eventoId).not("numero", "is", null).order("numero", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  const maior = Number(data?.[0]?.numero || 0);
  return { numero: maior + 1, prefixo };
}

export async function GET(request: Request) {
  try {
    const resultado = await usuarioAutenticado(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });

    let query = resultado.supabase
      .from("eventos_vendas")
      .select("*, eventos:evento_id(id,titulo,data_inicio,local,imagem_url,conta_bancaria_id,pix_copia_e_cola), socios:socio_id(id,nome,matricula)")
      .order("data_compra", { ascending: false });

    if (resultado.perfil === "associado") query = query.eq("socio_id", resultado.usuario.socio_id || "00000000-0000-0000-0000-000000000000");

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ vendas: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar vendas." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const resultado = await usuarioAutenticado(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    if (resultado.perfil !== "associado") return NextResponse.json({ error: "A compra de ingresso é feita pela área do associado." }, { status: 403 });
    if (!resultado.usuario.socio_id) return NextResponse.json({ error: "Seu usuário não está vinculado a um sócio." }, { status: 403 });

    const body = await request.json();
    const evento_id = String(body.evento_id || "").trim();
    const quantidade = Math.max(1, Math.floor(Number(body.quantidade || 1)));
    const forma_pagamento = String(body.forma_pagamento || "pix").trim() || "pix";
    const valorUnitarioBody = body.valor === "" || body.valor == null ? null : Number(body.valor);

    if (!evento_id) return NextResponse.json({ error: "Informe o evento." }, { status: 400 });

    const { data: evento, error: eventoError } = await resultado.supabase.from("eventos").select("id,titulo,publicado,valor_ingresso,quantidade_disponivel,conta_bancaria_id,pix_copia_e_cola").eq("id", evento_id).single();
    if (eventoError || !evento?.publicado) return NextResponse.json({ error: "Evento não disponível para compra." }, { status: 404 });
    const valorUnitario = Number(evento.valor_ingresso ?? valorUnitarioBody ?? 0);
    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) return NextResponse.json({ error: "Este evento ainda não possui um valor válido para compra." }, { status: 400 });

    if (evento.quantidade_disponivel != null) {
      const { data: vendas } = await resultado.supabase.from("eventos_vendas").select("quantidade").eq("evento_id", evento_id).in("status", ["pendente", "aprovado"]);
      const vendido = (vendas || []).reduce((acc: number, item: { quantidade?: number }) => acc + Number(item.quantidade || 0), 0);
      if (vendido + quantidade > Number(evento.quantidade_disponivel)) return NextResponse.json({ error: `Quantidade indisponível. Restam ${Math.max(0, Number(evento.quantidade_disponivel) - vendido)} ingresso(s).` }, { status: 409 });
    }

    const total = Number((valorUnitario * quantidade).toFixed(2));
    const { data, error } = await resultado.supabase.from("eventos_vendas").insert({
      evento_id,
      socio_id: resultado.usuario.socio_id,
      tipo_venda: "ingresso",
      prefixo: "ON",
      numero: null,
      codigo: null,
      valor: valorUnitario,
      quantidade,
      valor_total: total,
      status: "pendente",
      forma_pagamento,
      codigo_transacao: null,
      comprovante_url: null,
      comprovante_enviado_em: null,
      observacoes: null,
    }).select("*, eventos:evento_id(id,titulo,data_inicio,local,imagem_url,conta_bancaria_id,pix_copia_e_cola)").single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, venda: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar compra." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const id = String(body.id || "").trim();
    const acao = String(body.acao || "").trim().toLowerCase();
    if (!id || !["aprovar", "recusar"].includes(acao)) return NextResponse.json({ error: "Informe a venda e a ação." }, { status: 400 });

    const { data: venda, error: vendaError } = await resultado.supabase.from("eventos_vendas").select("*").eq("id", id).single();
    if (vendaError || !venda) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    if (venda.status === "aprovado") return NextResponse.json({ error: "Esta venda já foi aprovada." }, { status: 409 });

    if (acao === "recusar") {
      const motivo = String(body.motivo_recusa || "Compra recusada pela administração.").trim();
      const { data, error } = await resultado.supabase.from("eventos_vendas").update({ status: "recusado", motivo_recusa: motivo, aprovado_por: resultado.usuario.id, aprovado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, venda: data });
    }

    const { data: evento, error: eventoError } = await resultado.supabase
      .from("eventos")
      .select("id,titulo,valor_ingresso,conta_bancaria_id,pix_copia_e_cola")
      .eq("id", venda.evento_id)
      .single();
    if (eventoError || !evento) return NextResponse.json({ error: "Evento da venda não encontrado." }, { status: 404 });
    if (!evento.conta_bancaria_id) return NextResponse.json({ error: "Este evento não possui conta bancária de recebimento. Edite o evento e selecione a conta antes de aprovar." }, { status: 409 });

    const { data: conta, error: contaError } = await resultado.supabase
      .from("contas_bancarias")
      .select("id,nome,banco")
      .eq("id", evento.conta_bancaria_id)
      .eq("ativo", true)
      .single();
    if (contaError || !conta) return NextResponse.json({ error: "A conta bancária do evento não está disponível." }, { status: 409 });

    const { data: movimentoExistente, error: movimentoBuscaError } = await resultado.supabase
      .from("movimentacoes_financeiras")
      .select("id")
      .eq("origem_tipo", "evento_venda")
      .eq("origem_id", venda.id)
      .maybeSingle();
    if (movimentoBuscaError) throw new Error(movimentoBuscaError.message);

    if (!movimentoExistente) {
      const { error: movimentoError } = await resultado.supabase.from("movimentacoes_financeiras").insert({
        conta_bancaria_id: evento.conta_bancaria_id,
        conta_destino_id: null,
        grupo_transferencia: null,
        tipo: "entrada",
        categoria: "Evento",
        descricao: `${evento.titulo} - ${venda.codigo || "Venda de ingresso"} - ${venda.id.slice(0, 8)}`,
        valor: Number(venda.valor_total || 0),
        data_movimentacao: new Date().toISOString().slice(0, 10),
        forma_pagamento: venda.forma_pagamento || "pix",
        origem_tipo: "evento_venda",
        origem_id: venda.id,
        socio_id: venda.socio_id || null,
        dependente_id: null,
        comprovante_url: venda.comprovante_url || null,
        conciliado: false,
        data_conciliacao: null,
        observacoes: `Recebimento do evento na conta ${conta.nome}${conta.banco ? ` (${conta.banco})` : ""}.`,
      });
      if (movimentoError) throw new Error(`Pagamento aprovado, mas não foi possível lançar no financeiro: ${movimentoError.message}`);
    }

    const { numero, prefixo } = await gerarNumero(resultado.supabase, venda.evento_id, venda.prefixo || "ON");
    const codigo = `${prefixo}${String(numero).padStart(4, "0")}`;
    const { data, error } = await resultado.supabase.from("eventos_vendas").update({ status: "aprovado", prefixo, numero, codigo, codigo_qr: codigo, aprovado_por: resultado.usuario.id, aprovado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, venda: data, financeiro_pendente: false, conta_bancaria: conta });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao processar venda." }, { status: 500 });
  }
}
