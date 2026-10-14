import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const BUCKET = "listas-presenca";
const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSOES_PERMITIDAS = new Set(["pdf", "csv", "xlsx", "xls", "jpg", "jpeg", "png"]);

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function nomeSeguro(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100) || "lista-presenca";
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["funcionario", "administrador", "administrador_master"]);
  if ("response" in auth) return auth.response;

  const db = getServiceClient();
  let caminhoCriado: string | null = null;

  try {
    const form = await request.formData();
    const reservaId = String(form.get("reserva_id") || "").trim();
    const quantidade = Number(form.get("quantidade_convidados"));
    const arquivo = form.get("arquivo");

    if (!reservaId) return NextResponse.json({ error: "Informe a reserva." }, { status: 400 });
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 16) {
      return NextResponse.json({ error: "A lista do quiosque deve informar de 1 a 16 convidados." }, { status: 400 });
    }
    if (!(arquivo instanceof File)) {
      return NextResponse.json({ error: "Selecione a lista de presença para enviar." }, { status: 400 });
    }
    if (arquivo.size <= 0 || arquivo.size > MAX_BYTES) {
      return NextResponse.json({ error: "A lista deve ter conteúdo e no máximo 10 MB." }, { status: 400 });
    }

    const partes = arquivo.name.split(".");
    const extensao = (partes.length > 1 ? (partes.pop() ?? "") : "").toLowerCase();
    if (!extensao || !EXTENSOES_PERMITIDAS.has(extensao)) {
      return NextResponse.json({ error: "Use PDF, CSV, Excel (.xlsx/.xls) ou uma imagem JPG/PNG." }, { status: 400 });
    }

    const { data: reserva, error: reservaError } = await db
      .from("reservas")
      .select("id,espaco_id,lista_presenca_path,situacao")
      .eq("id", reservaId)
      .maybeSingle();
    if (reservaError) throw reservaError;
    if (!reserva) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });
    if (String(reserva.situacao || "").toLowerCase() === "cancelada") {
      return NextResponse.json({ error: "Não é possível anexar lista de presença a uma reserva cancelada." }, { status: 409 });
    }

    const { data: espaco, error: espacoError } = await db
      .from("espacos")
      .select("id,nome")
      .eq("id", reserva.espaco_id)
      .maybeSingle();
    if (espacoError) throw espacoError;
    if (!espaco || !normalizarTexto(espaco.nome).includes("quiosque")) {
      return NextResponse.json({ error: "A lista de presença está disponível somente para reservas de quiosques." }, { status: 400 });
    }

    const bucket = await db.storage.getBucket(BUCKET);
    if (bucket.error) {
      const criado = await db.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_BYTES });
      if (criado.error && !/already exists/i.test(criado.error.message)) {
        throw new Error(`Não foi possível preparar o armazenamento privado da lista: ${criado.error.message}`);
      }
    } else if (bucket.data?.public) {
      // Lista de convidados contém dados pessoais: bucket privado é obrigatório.
      const atualizado = await db.storage.updateBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES,
      });
      if (atualizado.error) {
        throw new Error(`O bucket de listas já existe, mas não foi possível torná-lo privado: ${atualizado.error.message}`);
      }
    }

    const nomeArquivo = nomeSeguro(arquivo.name);
    const caminho = `reservas/${reservaId}/${Date.now()}-${nomeArquivo}`;
    const upload = await db.storage.from(BUCKET).upload(
      caminho,
      new Uint8Array(await arquivo.arrayBuffer()),
      { contentType: arquivo.type || "application/octet-stream", upsert: false },
    );
    if (upload.error) throw new Error(`Não foi possível enviar a lista: ${upload.error.message}`);
    caminhoCriado = caminho;

    const { data: atualizada, error: atualizarError } = await db
      .from("reservas")
      .update({
        lista_presenca_path: caminho,
        lista_presenca_nome: arquivo.name.slice(0, 255),
        quantidade_convidados: quantidade,
      })
      .eq("id", reservaId)
      .select("id,lista_presenca_path,lista_presenca_nome,quantidade_convidados")
      .single();

    if (atualizarError) throw atualizarError;

    if (reserva.lista_presenca_path) {
      await db.storage.from(BUCKET).remove([String(reserva.lista_presenca_path)]);
    }

    const { data: assinado, error: assinaturaError } = await db.storage.from(BUCKET).createSignedUrl(caminho, 60 * 60);
    if (assinaturaError || !assinado?.signedUrl) {
      return NextResponse.json({
        ok: true,
        lista_presenca_nome: atualizada.lista_presenca_nome,
        quantidade_convidados: atualizada.quantidade_convidados,
        message: "Lista salva. A abertura segura do arquivo estará disponível ao atualizar a reserva.",
      });
    }

    return NextResponse.json({
      ok: true,
      lista_presenca_nome: atualizada.lista_presenca_nome,
      quantidade_convidados: atualizada.quantidade_convidados,
      lista_presenca_url: assinado.signedUrl,
    });
  } catch (error) {
    if (caminhoCriado) await db.storage.from(BUCKET).remove([caminhoCriado]);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a lista de presença." },
      { status: 500 },
    );
  }
}
