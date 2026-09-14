import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";
const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function POST(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const db = auth.supabase;
    const form = await request.formData();
    const id = String(form.get("origem_id") || "").trim();
    const arquivo = form.get("arquivo");
    if (!id || !(arquivo instanceof File)) return NextResponse.json({ error: "Selecione o comprovante." }, { status: 400 });
    if (!TIPOS.includes(arquivo.type) || arquivo.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF até 8 MB." }, { status: 400 });
    const { data: convite, error: ce } = await db.from("convites").select("id,nome_convidado,valor,status,forma_pagamento,comprovante_status").eq("id", id).single();
    if (ce || !convite) return NextResponse.json({ error: "Convite não encontrado." }, { status: 404 });
    if (convite.status === "pago") return NextResponse.json({ error: "Este convite já está pago." }, { status: 409 });
    if (convite.comprovante_status === "pendente") return NextResponse.json({ error: "Este convite já possui comprovante aguardando aprovação." }, { status: 409 });

    const atual = await db.storage.getBucket(BUCKET);
    if (atual.error) {
      const cr = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "8MB", allowedMimeTypes: TIPOS });
      if (cr.error && !/already exists/i.test(cr.error.message)) return NextResponse.json({ error: cr.error.message }, { status: 500 });
    }
    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/convite/${id}-${Date.now()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(caminho, new Uint8Array(await arquivo.arrayBuffer()), { contentType: arquivo.type, upsert: false });
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();
    const { data: atualizado, error: ue } = await db.from("convites").update({ comprovante_url: pub.publicUrl, comprovante_enviado_em: agora, comprovante_status: "pendente", motivo_recusa: null }).eq("id", id).select("*").single();
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
    const { error: ne } = await db.from("notificacoes_admin").insert({ tipo: "comprovante_pagamento", titulo: "Novo comprovante de convite aguardando aprovação", mensagem: `Convite de ${convite.nome_convidado || "convidado"} no valor de R$ ${Number(convite.valor || 0).toFixed(2).replace(".", ",")} foi enviado para conferência.`, origem_tipo: "convite", origem_id: id, lida: false });
    return NextResponse.json({ ok: true, url: pub.publicUrl, convite: atualizado, aviso: ne ? `Comprovante salvo, mas a notificação não foi criada: ${ne.message}` : undefined });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao enviar comprovante." }, { status: 500 }); }
}
