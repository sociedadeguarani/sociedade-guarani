import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const TIPOS_PERMITIDOS = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const EXTENSOES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export async function POST(request: Request) {
  const auth = await requireRoles(request, [
    "funcionario",
    "administrador",
    "administrador_normal",
    "administrador_master",
  ]);
  if ("response" in auth) return auth.response;

  try {
    const form = await request.formData();
    const arquivo = form.get("arquivo");

    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: "Selecione um comprovante para enviar." }, { status: 400 });
    }

    if (!TIPOS_PERMITIDOS.has(arquivo.type)) {
      return NextResponse.json(
        { error: "Envie o comprovante em JPG, PNG, WEBP ou PDF." },
        { status: 400 },
      );
    }

    if (arquivo.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "O comprovante deve ter no máximo 8 MB." },
        { status: 400 },
      );
    }

    const extensao = EXTENSOES[arquivo.type] || "bin";
    const caminho = `reservas/${crypto.randomUUID()}.${extensao}`;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const db = getServiceClient();

    const { error } = await db.storage
      .from("comprovantes-financeiro")
      .upload(caminho, bytes, {
        upsert: false,
        contentType: arquivo.type,
      });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Não foi possível armazenar o comprovante." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, path: caminho, nome: arquivo.name });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível enviar o comprovante." },
      { status: 500 },
    );
  }
}
