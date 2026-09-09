import { NextResponse } from "next/server";
import { getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

export async function POST(request: Request) {
  try {
    const acesso = await usuarioAutenticado(request);
    if ("error" in acesso) return NextResponse.json({ error: acesso.error }, { status: acesso.status });
    if (!["administrador", "funcionario"].includes(acesso.perfil)) return NextResponse.json({ error: "Sem permissão." }, { status: 403 });

    const form = await request.formData();
    const socioId = String(form.get("socio_id") || "").trim();
    const file = form.get("file");
    if (!socioId || !(file instanceof File)) return NextResponse.json({ error: "Envie o sócio e a foto." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "A foto deve ter no máximo 5 MB." }, { status: 400 });
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return NextResponse.json({ error: "Formato de foto não permitido." }, { status: 400 });

    const supabase = getServiceClient();
    const bucket = "fotos-associados";
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucket)) {
      const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: true });
      if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) throw bucketError;
    }

    const ext = file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `socios/${socioId}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, { upsert: true, contentType: file.type });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const { error: updateError } = await supabase.from("socios").update({ foto_url: data.publicUrl }).eq("id", socioId);
    if (updateError) throw updateError;

    return NextResponse.json({ ok: true, foto_url: data.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao enviar foto." }, { status: 500 });
  }
}

