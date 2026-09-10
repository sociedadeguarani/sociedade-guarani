import { NextResponse } from "next/server";
import { exigirAdministrador, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const resultado = await usuarioAutenticado(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });

    let query = resultado.supabase
      .from("eventos")
      .select("*")
      .order("data_inicio", { ascending: true });

    if (resultado.perfil === "associado") query = query.eq("publicado", true);

    const [{ data, error }, { data: contas, error: contasError }] = await Promise.all([
      query,
      resultado.supabase.from("contas_bancarias").select(resultado.perfil === "administrador" ? "id,nome,banco,agencia,conta,ativo" : "id,nome,banco,ativo").eq("ativo", true).order("nome", { ascending: true }),
    ]);
    if (error) throw new Error(error.message);
    if (contasError) throw new Error(contasError.message);
    return NextResponse.json({ eventos: data || [], contasBancarias: contas || [], perfil: resultado.perfil, socio_id: resultado.usuario.socio_id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar eventos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });

    const body = await request.json();
    const titulo = String(body.titulo || "").trim();
    const descricao = String(body.descricao || "").trim() || null;
    const tipo = String(body.tipo || "evento").trim() || "evento";
    const local = String(body.local || "").trim() || null;
    const data_inicio = String(body.data_inicio || "").trim();
    const data_fim = String(body.data_fim || "").trim() || null;
    const imagem_url = String(body.imagem_url || "").trim() || null;
    const link_externo = String(body.link_externo || "").trim() || null;
    const publicado = body.publicado !== false;
    const destaque = body.destaque === true;
    const valor_ingresso = body.valor_ingresso === "" || body.valor_ingresso == null ? null : Number(body.valor_ingresso);
    const quantidade_disponivel = body.quantidade_disponivel === "" || body.quantidade_disponivel == null ? null : Math.max(0, Math.floor(Number(body.quantidade_disponivel)));
    const conta_bancaria_id = String(body.conta_bancaria_id || "").trim() || null;
    const pix_copia_e_cola = String(body.pix_copia_e_cola || "").trim() || null;

    if (!titulo || !data_inicio) return NextResponse.json({ error: "Título e data do evento são obrigatórios." }, { status: 400 });
    if (valor_ingresso !== null && valor_ingresso > 0 && !conta_bancaria_id) return NextResponse.json({ error: "Selecione a conta bancária de recebimento do evento." }, { status: 400 });
    if (valor_ingresso !== null && (!Number.isFinite(valor_ingresso) || valor_ingresso < 0)) return NextResponse.json({ error: "Valor do ingresso inválido." }, { status: 400 });

    const { data, error } = await resultado.supabase
      .from("eventos")
      .insert({ titulo, descricao, tipo, local, data_inicio, data_fim, imagem_url, link_externo, publicado, destaque, valor_ingresso, quantidade_disponivel, conta_bancaria_id, pix_copia_e_cola, criado_por: resultado.usuario.id })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, evento: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar evento." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o evento." }, { status: 400 });

    const permitido: Record<string, unknown> = {};
    for (const campo of ["titulo", "descricao", "tipo", "local", "data_inicio", "data_fim", "imagem_url", "link_externo", "publicado", "destaque", "valor_ingresso", "quantidade_disponivel", "conta_bancaria_id", "pix_copia_e_cola"]) {
      if (Object.prototype.hasOwnProperty.call(body, campo)) permitido[campo] = body[campo] === "" ? null : body[campo];
    }
    permitido.updated_at = new Date().toISOString();

    const { data, error } = await resultado.supabase.from("eventos").update(permitido).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, evento: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar evento." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o evento." }, { status: 400 });

    const { count, error: vendaError } = await resultado.supabase.from("eventos_vendas").select("id", { count: "exact", head: true }).eq("evento_id", id);
    if (vendaError) throw new Error(vendaError.message);
    if ((count || 0) > 0) return NextResponse.json({ error: "Este evento já possui vendas e não pode ser excluído. Despublique-o em vez disso." }, { status: 409 });

    const { error } = await resultado.supabase.from("eventos").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir evento." }, { status: 500 });
  }
}
