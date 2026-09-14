import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function POST(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const form = await request.formData();
    const origemTipo = String(form.get("origem_tipo") || "").trim().toLowerCase();
    const origemId = String(form.get("origem_id") || "").trim();
    const arquivo = form.get("arquivo");

    if (origemTipo !== "convite") return NextResponse.json({ error: "Origem de comprovante não suportada." }, { status: 400 });
    if (!origemId || !(arquivo instanceof File)) return NextResponse.json({ error: "Selecione o comprovante." }, { status: 400 });
    if (!TIPOS.includes(arquivo.type)) return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
    if (arquivo.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Máximo de 8 MB." }, { status: 400 });

    const { data: convite, error: conviteError } = await auth.supabase
      .from("convites")
      .select("id,nome_convidado,valor,socio_id,status,forma_pagamento")
      .eq("id", origemId)
      .single();

    if (conviteError || !convite) return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
    if (convite.forma_pagamento !== "pix") return NextResponse.json({ error: "Comprovante é usado somente para convites pagos por PIX." }, { status: 400 });

    const bucket = await auth.supabase.storage.getBucket(BUCKET);
    if (bucket.error) {
      const created = await auth.supabase.storage.createBucket(BUCKET, { public: true });
      if (created.error && !/already exists/i.test(created.error.message)) {
        return NextResponse.json({ error: created.error.message }, { status: 500 });
      }
    }

    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/convite/${origemId}-${Date.now()}.${ext}`;
    const upload = await auth.supabase.storage.from(BUCKET).upload(
      caminho,
      new Uint8Array(await arquivo.arrayBuffer()),
      { contentType: arquivo.type, upsert: false }
    );
    if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });

    const { data: publicUrl } = auth.supabase.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();

    const { data, error } = await auth.supabase
      .from("convites")
      .update({ comprovante_url: publicUrl.publicUrl, comprovante_status: "pendente" })
      .eq("id", origemId)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const n = await auth.supabase.from("notificacoes_admin").insert({
      tipo: "comprovante_pagamento",
      titulo: "Novo comprovante de convite",
      mensagem: `Comprovante do convite de ${convite.nome_convidado || "convidado"} no valor de R$ ${Number(convite.valor || 0).toFixed(2).replace(".", ",")} foi enviado para conferência.`,
      origem_tipo: "convite",
      origem_id: origemId,
      lida: false,
    });

    return NextResponse.json({
      ok: true,
      url: publicUrl.publicUrl,
      convite: data,
      notificacao: !n.error,
      aviso: n.error ? `Comprovante enviado, mas a notificação não foi criada: ${n.error.message}` : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar comprovante." }, { status: 500 });
  }
}
