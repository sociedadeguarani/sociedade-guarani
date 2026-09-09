import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "A foto deve ter no máximo 5 MB." }, { status: 400 });
    const tipos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!tipos.includes(file.type)) return NextResponse.json({ error: "Formato não permitido. Use JPG, PNG, WEBP ou GIF." }, { status: 400 });
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
    const caminho = `inventario/${crypto.randomUUID()}.${ext}`;
    const supabase = getServiceClient();
    const bucket = "fotos-inventario";
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.some((b) => b.name === bucket)) {
      const { error: bucketError } = await supabase.storage.createBucket(bucket, { public: true });
      if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) throw bucketError;
    }
    const { error: uploadError } = await supabase.storage.from(bucket).upload(caminho, file, { upsert: true, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(bucket).getPublicUrl(caminho);
    return NextResponse.json({ ok: true, path: caminho, url: data.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível enviar a foto." }, { status: 500 });
  }
}

