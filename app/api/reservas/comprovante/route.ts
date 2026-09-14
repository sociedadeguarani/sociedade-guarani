import { NextResponse } from "next/server";
import { exigirAdministrador, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";
const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function POST(request: Request) {
  const authAdmin = await exigirAdministrador(request);
  const ehAdmin = !("error" in authAdmin);
  let db: any;
  let usuario: any = null;

  if (!ehAdmin) {
    const authUser = await usuarioAutenticado(request);
    if ("error" in authUser) return NextResponse.json({ error: authUser.error }, { status: authUser.status });
    if (!authUser.usuario.socio_id) return NextResponse.json({ error: "Associado não identificado." }, { status: 403 });
    db = authUser.supabase;
    usuario = authUser.usuario;
  } else {
    db = authAdmin.supabase;
    usuario = authAdmin.usuario;
  }

  const form = await request.formData();
  const id = String(form.get("origem_id") || "");
  const arquivo = form.get("arquivo");

  if (!id || !(arquivo instanceof File)) return NextResponse.json({ error: "Selecione o comprovante." }, { status: 400 });
  if (!TIPOS.includes(arquivo.type)) return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
  if (arquivo.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Máximo de 8 MB." }, { status: 400 });

  const { data: r, error: e } = await db
    .from("reservas")
    .select("id,responsavel_nome,valor,socio_id")
    .eq("id", id)
    .single();

  if (e || !r) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });
  if (!ehAdmin && r.socio_id !== usuario.socio_id) return NextResponse.json({ error: "Você não pode enviar comprovante para esta reserva." }, { status: 403 });

  const atual = await db.storage.getBucket(BUCKET);
  if (atual.error) {
    const cr = await db.storage.createBucket(BUCKET, { public: true });
    if (cr.error && !/already exists/i.test(cr.error.message)) {
      return NextResponse.json({ error: cr.error.message }, { status: 500 });
    }
  }

  const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
  const caminho = `pagamentos/reserva/${id}-${Date.now()}.${ext}`;
  const up = await db.storage.from(BUCKET).upload(caminho, new Uint8Array(await arquivo.arrayBuffer()), {
    contentType: arquivo.type,
    upsert: false,
  });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  const { data: url } = db.storage.from(BUCKET).getPublicUrl(caminho);
  const agora = new Date().toISOString();

  const { data, error } = await db
    .from("reservas")
    .update({
      comprovante_url: url.publicUrl,
      comprovante_enviado_em: agora,
      comprovante_status: "pendente",
      motivo_recusa: null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const n = await db.from("notificacoes_admin").insert({
    tipo: "comprovante_pagamento",
    titulo: "Novo comprovante de reserva aguardando aprovação",
    mensagem: `Reserva de ${r.responsavel_nome || "responsável"} no valor de R$ ${Number(r.valor || 0).toFixed(2).replace(".", ",")} foi enviada para conferência.`,
    origem_tipo: "reserva",
    origem_id: id,
    lida: false,
  });

  if (n.error) {
    return NextResponse.json({
      ok: true,
      aviso: `Comprovante enviado, mas a notificação não foi criada: ${n.error.message}`,
      url: url.publicUrl,
      reserva: data,
    });
  }

  return NextResponse.json({ ok: true, url: url.publicUrl, reserva: data });
}
