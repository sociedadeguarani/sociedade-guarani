import { NextResponse } from "next/server";
import { POST as registrarAcesso } from "../route";

/**
 * Mantém o endpoint usado pelas carteirinhas QR, mas delega a validação ao
 * fluxo principal de acessos. Assim, o QR não pode liberar alguém ignorando
 * mensalidades atrasadas, situação cadastral ou regras da temporada.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body?.id || body?.socio_id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Associado não informado." }, { status: 400 });
    }

    const url = new URL(request.url);
    url.pathname = url.pathname.replace(/\/qr\/?$/, "");
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");

    const resposta = await registrarAcesso(new Request(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({ socio_id: id }),
    }));
    // A tipagem inferida da rota principal permite, em alguns caminhos, um
    // retorno ausente. Trate esse caso antes de acessar json()/ok/status.
    if (!resposta) {
      return NextResponse.json(
        { error: "A validação principal de acesso não retornou uma resposta." },
        { status: 500 }
      );
    }

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      return NextResponse.json(dados, { status: resposta.status });
    }

    // Mantém o formato esperado pela tela QR antiga sem duplicar as regras.
    const exameBase = dados?.exame || {};
    const exameStatus = exameBase?.status;
    const exame = {
      ...exameBase,
      label: exameBase.label || exameStatus?.texto || "Controle de exame médico não configurado",
      cor: exameBase.cor || exameStatus?.cor || "cinza",
      validade: exameBase.validade || null,
    };

    return NextResponse.json({ ...dados, exame });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível validar o QR Code. Tente novamente." },
      { status: 500 }
    );
  }
}
