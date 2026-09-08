import { NextResponse } from "next/server";
import { exigirAdministrador, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const resultado = await usuarioAutenticado(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    let query = resultado.supabase.from("avisos").select("*").eq("ativo", true).order("fixado", { ascending: false }).order("data_publicacao", { ascending: false });
    if (resultado.perfil === "associado") query = query.in("publico", ["todos", "associados"]);
    if (resultado.perfil === "funcionario") query = query.in("publico", ["todos", "funcionarios"]);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ avisos: data || [], perfil: resultado.perfil });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar avisos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const titulo = String(body.titulo || "").trim();
    const mensagem = String(body.mensagem || "").trim();
    if (!titulo || !mensagem) return NextResponse.json({ error: "Título e mensagem são obrigatórios." }, { status: 400 });

    const payload = {
      titulo,
      mensagem,
      imagem_url: String(body.imagem_url || "").trim() || null,
      tipo: String(body.tipo || "informativo").trim() || "informativo",
      prioridade: String(body.prioridade || "normal").trim() || "normal",
      fixado: body.fixado === true,
      ativo: body.ativo !== false,
      publico: String(body.publico || "todos").trim() || "todos",
      data_inicio: String(body.data_inicio || "").trim() || null,
      data_fim: String(body.data_fim || "").trim() || null,
      criado_por: resultado.usuario.id,
    };
    const { data, error } = await resultado.supabase.from("avisos").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, aviso: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao criar aviso." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o aviso." }, { status: 400 });
    const campos = ["titulo", "mensagem", "imagem_url", "tipo", "prioridade", "fixado", "ativo", "publico", "data_inicio", "data_fim"];
    const update: Record<string, unknown> = {};
    for (const campo of campos) if (Object.prototype.hasOwnProperty.call(body, campo)) update[campo] = body[campo] === "" ? null : body[campo];
    const { data, error } = await resultado.supabase.from("avisos").update(update).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, aviso: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar aviso." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Informe o aviso." }, { status: 400 });
    const { error } = await resultado.supabase.from("avisos").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir aviso." }, { status: 500 });
  }
}
