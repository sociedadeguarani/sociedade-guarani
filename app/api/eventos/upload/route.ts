import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const BUCKET = "eventos";

export async function POST(request: Request) {
  try {
    const resultado = await exigirAdministrador(request);
    if ("error" in resultado) {
      return NextResponse.json({ error: resultado.error }, { status: resultado.status });
    }

    const form = await request.formData();
    const arquivo = form.get("arquivo");
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
    }

    const tipos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!tipos.includes(arquivo.type)) {
      return NextResponse.json({ error: "Formato inválido. Use JPG, PNG, WEBP ou GIF." }, { status: 400 });
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
    }

    const bucketResult = await resultado.supabase.storage.getBucket(BUCKET);
    if (bucketResult.error) {
      const created = await resultado.supabase.storage.createBucket(BUCKET, { public: true });
      if (created.error && !/already exists/i.test(created.error.message)) {
        return NextResponse.json({ error: `Não foi possível preparar o armazenamento: ${created.error.message}` }, { status: 500 });
      }
    }

    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
    const nome = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const caminho = `eventos/${nome}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());

    const { error } = await resultado.supabase.storage
      .from(BUCKET)
      .upload(caminho, bytes, { contentType: arquivo.type, upsert: false });

    if (error) {
      return NextResponse.json({ error: `Erro ao enviar imagem: ${error.message}` }, { status: 500 });
    }

    const { data } = resultado.supabase.storage.from(BUCKET).getPublicUrl(caminho);
    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar imagem." }, { status: 500 });
  }
}

