import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireRoles } from "@/lib/guaraniAuth";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const itemId = String(form.get("item_id") || "");
    const acao = String(form.get("acao") || "criar_item");
    const acaoPermissao = acao === "editar_item" ? "inventario.editar" : "inventario.cadastrar";
    const auth = await requireRoles(
      request,
      ["administrador", "administrador_master", "funcionario", "funcionario_inventario"],
      ["menu.inventario", "inventario.consultar", acaoPermissao]
    );
    if ("response" in auth) return auth.response;
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione uma imagem." }, { status: 400 });
    if (!itemId) return NextResponse.json({ error: "Item não informado." }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "A imagem deve ter no máximo 5 MB." }, { status: 400 });
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return NextResponse.json({ error: "Formato permitido: JPG, PNG, WEBP ou GIF." }, { status: 400 });

    const supabase = admin();
    const bucket = "fotos-inventario";
    await supabase.storage.createBucket(bucket, { public: true }).catch(() => undefined);
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
    const path = `itens/${itemId}-${Date.now()}.${ext}`;
    const upload = await supabase.storage.from(bucket).upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: true });
    if (upload.error) throw upload.error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const { error } = await supabase.from("inventario_itens").update({ foto_url: data.publicUrl }).eq("id", itemId);
    if (error) throw error;
    return NextResponse.json({ ok: true, url: data.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a foto." }, { status: 500 });
  }
}
