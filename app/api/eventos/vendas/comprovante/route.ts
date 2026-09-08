import { NextResponse } from "next/server";
import { usuarioAutenticado } from "@/lib/guaraniAuth";

export async function PATCH(request: Request) {
  try {
    const resultado = await usuarioAutenticado(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    const body = await request.json();
    const id = String(body.id || "").trim();
    const comprovante_url = String(body.comprovante_url || "").trim();
    if (!id || !comprovante_url) return NextResponse.json({ error: "Informe o comprovante." }, { status: 400 });
    const { data: venda, error: vendaError } = await resultado.supabase.from("eventos_vendas").select("id,socio_id,status").eq("id", id).single();
    if (vendaError || !venda) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
    if (resultado.perfil !== "associado" || venda.socio_id !== resultado.usuario.socio_id) return NextResponse.json({ error: "Você não pode alterar esta compra." }, { status: 403 });
    if (venda.status !== "pendente") return NextResponse.json({ error: "Esta compra não está pendente." }, { status: 409 });
    const { data, error } = await resultado.supabase.from("eventos_vendas").update({ comprovante_url, comprovante_enviado_em: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).select("*, eventos:evento_id(id,titulo,data_inicio,local,imagem_url), socios:socio_id(id,nome,matricula)").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, venda: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar comprovante." }, { status: 500 });
  }
}

