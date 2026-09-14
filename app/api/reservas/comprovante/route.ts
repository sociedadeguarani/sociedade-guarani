import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

async function garantirBucket(supabase: any) {
  const atual = await supabase.storage.getBucket(BUCKET);
  if (!atual.error) {
    if (atual.data?.public !== true) {
      await supabase.storage.updateBucket(BUCKET, { public: true });
    }
    return;
  }

  const criado = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "8MB",
    allowedMimeTypes: TIPOS,
  });

  if (criado.error && !/already exists/i.test(criado.error.message)) {
    throw new Error(`Não foi possível preparar o armazenamento: ${criado.error.message}`);
  }
}

export async function POST(request: Request) {
  try {
    const authAdmin = await exigirAdministrador(request);
    const ehAdmin = !("error" in authAdmin);

    let db: any;
    let usuario: any = null;

    if (ehAdmin) {
      db = authAdmin.supabase;
      usuario = authAdmin.usuario;
    } else {
      const authUser = await usuarioAutenticado(request);
      if ("error" in authUser) {
        return NextResponse.json({ error: authUser.error }, { status: authUser.status });
      }
      if (!authUser.usuario.socio_id) {
        return NextResponse.json({ error: "Associado não identificado." }, { status: 403 });
      }
      db = authUser.supabase;
      usuario = authUser.usuario;
    }

    // Sempre usa o service client no armazenamento para evitar falhas de permissão/RLS.
    const storageDb = getServiceClient();

    const form = await request.formData();
    const id = String(form.get("origem_id") || "").trim();
    const arquivo = form.get("arquivo");

    if (!id || !(arquivo instanceof File)) {
      return NextResponse.json({ error: "Selecione o comprovante." }, { status: 400 });
    }
    if (!TIPOS.includes(arquivo.type)) {
      return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
    }
    if (arquivo.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Máximo de 8 MB." }, { status: 400 });
    }

    const { data: reserva, error: reservaError } = await db
      .from("reservas")
      .select("id,responsavel_nome,valor,socio_id")
      .eq("id", id)
      .single();

    if (reservaError || !reserva) {
      return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });
    }

    if (!ehAdmin && reserva.socio_id !== usuario.socio_id) {
      return NextResponse.json({ error: "Você não pode enviar comprovante para esta reserva." }, { status: 403 });
    }

    await garantirBucket(storageDb);

    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/reserva/${id}-${Date.now()}.${ext}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());

    const upload = await storageDb.storage.from(BUCKET).upload(caminho, bytes, {
      contentType: arquivo.type,
      upsert: false,
    });

    if (upload.error) {
      return NextResponse.json({ error: `Erro ao enviar comprovante: ${upload.error.message}` }, { status: 500 });
    }

    const { data: publicUrl } = storageDb.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();

    const { data, error } = await db
      .from("reservas")
      .update({
        comprovante_url: publicUrl.publicUrl,
        comprovante_enviado_em: agora,
        comprovante_status: "pendente",
        motivo_recusa: null,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const n = await db.from("notificacoes_admin").insert({
      tipo: "comprovante_pagamento",
      titulo: "Novo comprovante de reserva aguardando aprovação",
      mensagem: `Reserva de ${reserva.responsavel_nome || "Responsável"} no valor de R$ ${Number(reserva.valor || 0).toFixed(2).replace(".", ",")} foi enviada para conferência.`,
      origem_tipo: "reserva",
      origem_id: id,
      lida: false,
    });

    if (n.error) {
      return NextResponse.json({
        error: `Comprovante enviado, mas a notificação não foi criada: ${n.error.message}`,
        url: publicUrl.publicUrl,
      }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: publicUrl.publicUrl, reserva: data });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao enviar comprovante.",
    }, { status: 500 });
  }
}
