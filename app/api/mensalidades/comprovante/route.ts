import { NextResponse } from "next/server";
import { usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";
const BUCKET = "comprovantes-financeiro";

export async function POST(request: Request) {
  const auth = await usuarioAutenticado(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.perfil !== "associado" || !auth.usuario.socio_id) {
    return NextResponse.json({ error: "Somente o associado pode enviar este comprovante." }, { status: 403 });
  }

  try {
    const form = await request.formData();
    const rawIds = String(form.get("mensalidade_ids") || "");
    const ids = Array.from(new Set(rawIds.split(",").map((v) => v.trim()).filter(Boolean)));
    const arquivo = form.get("arquivo");
    if (!ids.length || !(arquivo instanceof File)) {
      return NextResponse.json({ error: "Selecione as mensalidades e o comprovante." }, { status: 400 });
    }

    const tipos = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!tipos.includes(arquivo.type)) return NextResponse.json({ error: "Use JPG, PNG, WEBP ou PDF." }, { status: 400 });
    if (arquivo.size > 8 * 1024 * 1024) return NextResponse.json({ error: "O comprovante deve ter no máximo 8 MB." }, { status: 400 });

    const { data: mensalidades, error: mensalidadesError } = await auth.supabase
      .from("mensalidades")
      .select("id,socio_id,competencia,valor,situacao")
      .in("id", ids)
      .eq("socio_id", auth.usuario.socio_id);
    if (mensalidadesError) throw new Error(mensalidadesError.message);
    if (!mensalidades || mensalidades.length !== ids.length) {
      return NextResponse.json({ error: "Uma ou mais mensalidades não pertencem ao seu cadastro." }, { status: 403 });
    }
    const invalidas = mensalidades.filter((m) => !["em_aberto", "em_atraso"].includes(String(m.situacao || "")));
    if (invalidas.length) return NextResponse.json({ error: "Só é possível pagar mensalidades em aberto ou em atraso." }, { status: 409 });

    const { data: pendenteExistente } = await auth.supabase
      .from("comprovantes_mensalidades")
      .select("id,status")
      .eq("socio_id", auth.usuario.socio_id)
      .eq("status", "pendente")
      .overlaps("mensalidade_ids", ids)
      .maybeSingle();
    if (pendenteExistente) return NextResponse.json({ error: "Já existe um comprovante aguardando análise para uma dessas mensalidades." }, { status: 409 });

    const bucket = await auth.supabase.storage.getBucket(BUCKET);
    if (bucket.error) {
      const created = await auth.supabase.storage.createBucket(BUCKET, { public: true });
      if (created.error && !/already exists/i.test(created.error.message)) {
        return NextResponse.json({ error: `Não foi possível preparar o armazenamento: ${created.error.message}` }, { status: 500 });
      }
    }

    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const proofId = crypto.randomUUID();
    const caminho = `mensalidades/${auth.usuario.socio_id}/${proofId}.${ext}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const { error: uploadError } = await auth.supabase.storage.from(BUCKET).upload(caminho, bytes, {
      contentType: arquivo.type,
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: `Erro ao enviar comprovante: ${uploadError.message}` }, { status: 500 });

    const { data: publicUrl } = auth.supabase.storage.from(BUCKET).getPublicUrl(caminho);
    const total = mensalidades.reduce((s, m) => s + Number(m.valor || 0), 0);

    const { data: comprovante, error: insertError } = await auth.supabase
      .from("comprovantes_mensalidades")
      .insert({
        id: proofId,
        socio_id: auth.usuario.socio_id,
        mensalidade_ids: ids,
        valor_total: Number(total.toFixed(2)),
        comprovante_url: publicUrl.publicUrl,
        enviado_em: new Date().toISOString(),
        status: "pendente",
      })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    const competencias = mensalidades.map((m) => String(m.competencia).slice(0, 7)).join(", ");
    await auth.supabase.from("notificacoes_admin").insert({
      tipo: "comprovante_mensalidade",
      titulo: "Novo comprovante de mensalidade",
      mensagem: `Um associado enviou comprovante de PIX de R$ ${total.toFixed(2).replace(".", ",")} referente a ${competencias}.`,
      origem_tipo: "comprovante_mensalidade",
      origem_id: proofId,
      lida: false,
    });

    return NextResponse.json({ ok: true, comprovante });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar comprovante." }, { status: 500 });
  }
}

