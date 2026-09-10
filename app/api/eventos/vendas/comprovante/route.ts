import { NextResponse } from "next/server";
import { usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const BUCKET = "comprovantes-financeiro";

export async function POST(request: Request) {
  try {
    const resultado = await usuarioAutenticado(request);
    if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    if (resultado.perfil !== "associado" || !resultado.usuario.socio_id) {
      return NextResponse.json({ error: "Somente o associado pode enviar este comprovante." }, { status: 403 });
    }

    const form = await request.formData();
    const vendaId = String(form.get("venda_id") || "").trim();
    const arquivo = form.get("arquivo");
    if (!vendaId || !(arquivo instanceof File)) return NextResponse.json({ error: "Informe a venda e selecione o comprovante." }, { status: 400 });

    const { data: venda, error: vendaError } = await resultado.supabase
      .from("eventos_vendas").select("id,socio_id,status").eq("id", vendaId).single();
    if (vendaError || !venda) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });
    if (venda.socio_id !== resultado.usuario.socio_id) return NextResponse.json({ error: "Você não pode alterar esta compra." }, { status: 403 });
    if (venda.status !== "pendente") return NextResponse.json({ error: "Esta compra não está pendente." }, { status: 409 });

    const tipos = ["image/jpeg","image/png","image/webp","application/pdf"];
    if (!tipos.includes(arquivo.type)) return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
    if (arquivo.size > 8 * 1024 * 1024) return NextResponse.json({ error: "O comprovante deve ter no máximo 8 MB." }, { status: 400 });

    const bucket = await resultado.supabase.storage.getBucket(BUCKET);
    if (bucket.error) {
      const created = await resultado.supabase.storage.createBucket(BUCKET, { public: true });
      if (created.error && !/already exists/i.test(created.error.message)) {
        return NextResponse.json({ error: `Não foi possível preparar o armazenamento: ${created.error.message}` }, { status: 500 });
      }
    }

    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `eventos/vendas/${vendaId}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const { error: uploadError } = await resultado.supabase.storage.from(BUCKET).upload(caminho, bytes, { contentType: arquivo.type, upsert: false });
    if (uploadError) return NextResponse.json({ error: `Erro ao enviar comprovante: ${uploadError.message}` }, { status: 500 });

    const { data: publicUrl } = resultado.supabase.storage.from(BUCKET).getPublicUrl(caminho);
    const { data, error } = await resultado.supabase.from("eventos_vendas")
      .update({ comprovante_url: publicUrl.publicUrl, comprovante_enviado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", vendaId).select("*, eventos:evento_id(id,titulo,data_inicio,local,imagem_url), socios:socio_id(id,nome,matricula)").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, venda: data, url: publicUrl.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar comprovante." }, { status: 500 });
  }
}
