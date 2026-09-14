import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

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

export async function POST(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const form = await request.formData();
    const origemId = String(form.get("origem_id") || "").trim();
    const arquivo = form.get("arquivo");

    if (!origemId || !(arquivo instanceof File)) {
      return NextResponse.json({ error: "Selecione o convite e o comprovante." }, { status: 400 });
    }
    if (!TIPOS.includes(arquivo.type)) {
      return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
    }
    if (arquivo.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "O comprovante deve ter no máximo 8 MB." }, { status: 400 });
    }

    const { data: convite, error: conviteError } = await auth.supabase
      .from("convites")
      .select("id,nome_convidado,valor,status,forma_pagamento")
      .eq("id", origemId)
      .single();

    if (conviteError || !convite) {
      return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
    }
    if (convite.forma_pagamento !== "pix") {
      return NextResponse.json({ error: "Comprovante só é necessário para pagamentos via PIX." }, { status: 400 });
    }
    if (convite.status === "pago") {
      return NextResponse.json({ error: "Este convite já está pago." }, { status: 409 });
    }

    await prepararBucket(auth.supabase);
    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/convite/${origemId}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const upload = await auth.supabase.storage.from(BUCKET).upload(caminho, bytes, {
      contentType: arquivo.type,
      upsert: false,
    });
    if (upload.error) {
      return NextResponse.json({ error: `Erro ao enviar comprovante: ${upload.error.message}` }, { status: 500 });
    }

    const { data: publicUrl } = auth.supabase.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();

    const { data, error } = await auth.supabase
      .from("convites")
      .update({
        comprovante_url: publicUrl.publicUrl,
        comprovante_enviado_em: agora,
        comprovante_status: "pendente",
        motivo_recusa: null,
      })
      .eq("id", origemId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const { error: notificacaoError } = await auth.supabase.from("notificacoes_admin").insert({
      tipo: "comprovante_pagamento",
      titulo: "Novo comprovante de convite aguardando aprovação",
      mensagem: `O comprovante do convite de ${convite.nome_convidado || "Convidado"}, no valor de R$ ${Number(convite.valor || 0).toFixed(2).replace(".", ",")}, foi enviado e aguarda aprovação.`,
      origem_tipo: "convite",
      origem_id: convite.id,
      lida: false,
    });

    if (notificacaoError) {
      return NextResponse.json({
        ok: true,
        url: publicUrl.publicUrl,
        registro: data,
        aviso: `Comprovante salvo, mas a notificação não foi criada: ${notificacaoError.message}`,
      });
    }

    return NextResponse.json({ ok: true, url: publicUrl.publicUrl, registro: data, notificado: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao enviar comprovante.",
    }, { status: 500 });
  }
}
