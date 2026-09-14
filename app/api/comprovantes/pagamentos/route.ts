import { NextResponse } from "next/server";
import { exigirAdministrador, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";
const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

async function prepararBucket(supabase: any) {
  const atual = await supabase.storage.getBucket(BUCKET);
  if (!atual.error) return;
  const criado = await supabase.storage.createBucket(BUCKET, { public: true });
  if (criado.error && !/already exists/i.test(criado.error.message)) {
    throw new Error(`Não foi possível preparar o armazenamento: ${criado.error.message}`);
  }
}

async function notificar(supabase: any, tipo: string, titulo: string, mensagem: string, origemTipo: string, origemId: string) {
  const { error } = await supabase.from("notificacoes_admin").insert({
    tipo, titulo, mensagem, origem_tipo: origemTipo, origem_id: origemId, lida: false,
  });
  if (error) throw new Error(`Pagamento salvo, mas não foi possível criar a notificação: ${error.message}`);
}

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const supabase = auth.supabase;

    const [mens, conv, reservas] = await Promise.all([
      supabase.from("mensalidades").select("id,socio_id,dependente_id,competencia,valor,data_vencimento,situacao,tipo_pagamento,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,socios:socio_id(id,nome,matricula)").eq("comprovante_status", "pendente").order("comprovante_enviado_em", { ascending: false }),
      supabase.from("convites").select("id,socio_id,nome_convidado,cidade_convidado,data_inicio,data_fim,valor,status,forma_pagamento,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,socios:socio_id(id,nome,matricula)").eq("comprovante_status", "pendente").order("comprovante_enviado_em", { ascending: false }),
      supabase.from("reservas").select("id,espaco_id,socio_id,dependente_id,responsavel_nome,data_reserva,hora_inicio,hora_fim,valor,situacao,tipo_pagamento,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,espacos:espaco_id(id,nome),socios:socio_id(id,nome,matricula)").eq("comprovante_status", "pendente").order("comprovante_enviado_em", { ascending: false }),
    ]);
    if (mens.error) throw new Error(mens.error.message);
    if (conv.error) throw new Error(conv.error.message);
    if (reservas.error) throw new Error(reservas.error.message);

    return NextResponse.json({
      comprovantes: [
        ...(mens.data || []).map((x: any) => ({ ...x, origem_tipo: "mensalidade", origem_id: x.id, pessoa: x.socios })),
        ...(conv.data || []).map((x: any) => ({ ...x, origem_tipo: "convite", origem_id: x.id, pessoa: x.socios })),
        ...(reservas.data || []).map((x: any) => ({
          ...x,
          origem_tipo: "reserva",
          origem_id: x.id,
          pessoa: x.socios,
          nome_responsavel: x.responsavel_nome,
          espaco_nome: Array.isArray(x.espacos) ? x.espacos[0]?.nome : x.espacos?.nome,
          data_reserva: x.data_reserva,
          hora_inicio: x.hora_inicio,
          hora_fim: x.hora_fim,
        })),
      ].sort((a: any, b: any) => String(b.comprovante_enviado_em || "").localeCompare(String(a.comprovante_enviado_em || ""))),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar comprovantes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await usuarioAutenticado(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (auth.perfil !== "associado" || !auth.usuario.socio_id) return NextResponse.json({ error: "Somente o associado pode enviar comprovantes." }, { status: 403 });
    const form = await request.formData();
    const origemTipo = String(form.get("origem_tipo") || "").trim().toLowerCase();
    const origemId = String(form.get("origem_id") || "").trim();
    const origemIdsRaw = String(form.get("origem_ids") || "").trim();
    let origemIds: string[] = origemId ? [origemId] : [];
    if (origemIdsRaw) {
      try {
        const parsed = JSON.parse(origemIdsRaw);
        if (Array.isArray(parsed)) origemIds = parsed.map((x) => String(x).trim()).filter(Boolean);
      } catch {
        return NextResponse.json({ error: "Lista de mensalidades inválida." }, { status: 400 });
      }
    }
    origemIds = [...new Set(origemIds)];
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File) || origemIds.length === 0 || !["mensalidade", "convite"].includes(origemTipo)) {
      return NextResponse.json({ error: "Informe o lançamento e selecione o comprovante." }, { status: 400 });
    }
    if (!TIPOS.includes(arquivo.type)) return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
    if (arquivo.size > 8 * 1024 * 1024) return NextResponse.json({ error: "O comprovante deve ter no máximo 8 MB." }, { status: 400 });
    const tabela = origemTipo === "mensalidade" ? "mensalidades" : "convites";
    const { data: registros, error: buscaError } = await auth.supabase.from(tabela).select("*").in("id", origemIds);
    if (buscaError) return NextResponse.json({ error: buscaError.message }, { status: 500 });
    if (!registros || registros.length !== origemIds.length) return NextResponse.json({ error: "Uma ou mais mensalidades não foram encontradas." }, { status: 404 });
    for (const registro of registros) {
      if (origemTipo === "mensalidade" && registro.socio_id !== auth.usuario.socio_id) return NextResponse.json({ error: "Você não pode alterar uma destas mensalidades." }, { status: 403 });
      if (origemTipo === "convite" && registro.socio_id && registro.socio_id !== auth.usuario.socio_id) return NextResponse.json({ error: "Você não pode alterar este convite." }, { status: 403 });
      if (registro.situacao === "pago" || registro.status === "pago") return NextResponse.json({ error: "Uma das cobranças selecionadas já foi confirmada." }, { status: 409 });
      if (registro.comprovante_status === "pendente") return NextResponse.json({ error: "Uma das cobranças selecionadas já possui comprovante aguardando aprovação." }, { status: 409 });
    }
    await prepararBucket(auth.supabase);
    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const loteId = origemIds.length > 1 ? `lote-${Date.now()}` : origemIds[0];
    const caminho = `pagamentos/${origemTipo}/${loteId}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const upload = await auth.supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: arquivo.type, upsert: false });
    if (upload.error) return NextResponse.json({ error: `Erro ao enviar comprovante: ${upload.error.message}` }, { status: 500 });
    const { data: publicUrl } = auth.supabase.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();
    const { data, error } = await auth.supabase.from(tabela).update({ comprovante_url: publicUrl.publicUrl, comprovante_enviado_em: agora, comprovante_status: "pendente", motivo_recusa: null }).in("id", origemIds).select("*");
    if (error) throw new Error(error.message);
    const descricoes = registros.map((registro: any) => origemTipo === "mensalidade" ? String(registro.competencia || "").slice(0, 7) : (registro.nome_convidado || "Convidado"));
    const total = registros.reduce((soma: number, registro: any) => soma + Number(registro.valor || 0), 0);
    await notificar(auth.supabase, "comprovante_pagamento", origemIds.length > 1 ? "Novo comprovante para várias mensalidades" : "Novo comprovante aguardando aprovação", `${origemTipo === "mensalidade" ? "Mensalidades" : "Convite"} ${descricoes.join(", ")} no valor total de R$ ${total.toFixed(2).replace(".", ",")} foi enviado por um associado.`, origemIds.length > 1 ? "mensalidade_lote" : origemTipo, origemIds.join(","));
    return NextResponse.json({ ok: true, registros: data, url: publicUrl.publicUrl, quantidade: origemIds.length, total });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar comprovante." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    const origemTipo = String(body.origem_tipo || "").trim().toLowerCase();
    const origemId = String(body.origem_id || "").trim();
    const origemIds = Array.from(new Set((Array.isArray(body.origem_ids) ? body.origem_ids : [origemId]).map((x: unknown) => String(x).trim()).filter(Boolean)));
    const acao = String(body.acao || "").trim().toLowerCase();
    const contaId = String(body.conta_bancaria_id || "").trim();
    if (origemIds.length === 0 || !["mensalidade", "convite", "reserva"].includes(origemTipo) || !["aprovar", "recusar"].includes(acao)) return NextResponse.json({ error: "Informe lançamento, origem e ação." }, { status: 400 });
    if (origemIds.length > 1) return NextResponse.json({ error: "A aprovação em lote será liberada na tela administrativa. Por enquanto, aprove cada comprovante individualmente." }, { status: 400 });

    const tabela = origemTipo === "mensalidade" ? "mensalidades" : origemTipo === "convite" ? "convites" : "reservas";
    const { data: registro, error: registroError } = await auth.supabase.from(tabela).select("*").eq("id", origemIds[0]).single();
    if (registroError || !registro) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    if (registro.comprovante_status !== "pendente") return NextResponse.json({ error: "Este comprovante não está aguardando aprovação." }, { status: 409 });

    if (acao === "recusar") {
      const motivo = String(body.motivo_recusa || "Comprovante recusado pela administração.").trim();
      const { data, error } = await auth.supabase.from(tabela).update({ comprovante_status: "recusado", motivo_recusa: motivo }).eq("id", origemId).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, registro: data });
    }

    if (!contaId) return NextResponse.json({ error: "Selecione a conta bancária que recebeu o pagamento." }, { status: 400 });
    const { data: conta, error: contaError } = await auth.supabase.from("contas_bancarias").select("id,nome,banco").eq("id", contaId).eq("ativo", true).single();
    if (contaError || !conta) return NextResponse.json({ error: "Conta bancária não encontrada ou inativa." }, { status: 409 });

    const movimentoBusca = await auth.supabase.from("movimentacoes_financeiras").select("id").eq("origem_tipo", origemTipo).eq("origem_id", origemId).maybeSingle();
    if (movimentoBusca.error) throw new Error(movimentoBusca.error.message);
    if (!movimentoBusca.data) {
      const descricao = origemTipo === "mensalidade"
        ? `Mensalidade ${String(registro.competencia || "").slice(0, 7)} - pagamento via PIX`
        : origemTipo === "convite"
          ? `Convite - ${registro.nome_convidado || "Convidado"}`
          : `Reserva - ${registro.responsavel_nome || "Responsável"}${registro.data_reserva ? ` - ${registro.data_reserva}` : ""}`;
      const { error } = await auth.supabase.from("movimentacoes_financeiras").insert({
        conta_bancaria_id: contaId,
        conta_destino_id: null,
        grupo_transferencia: null,
        tipo: "entrada",
        categoria: origemTipo === "mensalidade" ? "Mensalidade" : origemTipo === "convite" ? "Convite" : "Reserva",
        descricao,
        valor: Number(registro.valor || 0),
        data_movimentacao: new Date().toISOString().slice(0, 10),
        forma_pagamento: registro.forma_pagamento || registro.tipo_pagamento || "pix",
        origem_tipo: origemTipo,
        origem_id: origemId,
        socio_id: registro.socio_id || null,
        dependente_id: registro.dependente_id || null,
        comprovante_url: registro.comprovante_url || null,
        conciliado: false,
        data_conciliacao: null,
        observacoes: `Comprovante aprovado pela administração. Conta: ${conta.nome}${conta.banco ? ` (${conta.banco})` : ""}.`,
      });
      if (error) throw new Error(`Não foi possível lançar no financeiro: ${error.message}`);
    }

    const agora = new Date().toISOString();
    const update = origemTipo === "mensalidade"
      ? { situacao: "pago", data_pagamento: new Date().toISOString().slice(0, 10), tipo_pagamento: "pix", comprovante_status: "aprovado", comprovante_aprovado_por: auth.usuario.id, comprovante_aprovado_em: agora, motivo_recusa: null }
      : origemTipo === "convite"
        ? { status: "pago", forma_pagamento: "pix", comprovante_status: "aprovado", comprovante_aprovado_por: auth.usuario.id, comprovante_aprovado_em: agora, motivo_recusa: null }
        : { situacao: "confirmada", data_pagamento: new Date().toISOString().slice(0, 10), tipo_pagamento: "pix", comprovante_status: "aprovado", comprovante_aprovado_por: auth.usuario.id, comprovante_aprovado_em: agora, motivo_recusa: null };

    const { data, error } = await auth.supabase.from(tabela).update(update).eq("id", origemId).select("*").single();
    if (error) throw new Error(error.message);
    if (origemTipo === "mensalidade" && registro.socio_id && !registro.dependente_id) {
      await auth.supabase.from("socios").update({ situacao_financeira: "em_dia", data_ultimo_pagamento: new Date().toISOString().slice(0, 10) }).eq("id", registro.socio_id);
    }
    return NextResponse.json({ ok: true, registro: data, conta });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao processar comprovante." }, { status: 500 });
  }
}
