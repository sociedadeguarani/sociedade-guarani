import { NextResponse } from "next/server";
import { getServiceClient, exigirAdministrador } from "@/lib/guaraniAuth";

type ConfiguracaoMensalidadeUpdate = {
  tipo_socio?: unknown;
  nome?: unknown;
  vigencia_inicio?: unknown;
  ativo?: unknown;
  valor?: number;
  updated_at: string;
};

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data, error } = await getServiceClient()
    .from("configuracoes_mensalidades")
    .select("*")
    .order("vigencia_inicio", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ configuracoes: data || [] });
}

export async function PATCH(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (!id) {
      return NextResponse.json({ error: "Configuração não informada." }, { status: 400 });
    }

    const dados: ConfiguracaoMensalidadeUpdate = {
      updated_at: new Date().toISOString(),
    };
    const camposEditaveis = ["tipo_socio", "nome", "vigencia_inicio", "ativo"] as const;
    for (const campo of camposEditaveis) {
      if (body[campo] !== undefined) dados[campo] = body[campo];
    }
    if (body.valor !== undefined) dados.valor = Number(body.valor);

    const { data, error } = await getServiceClient()
      .from("configuracoes_mensalidades")
      .update(dados)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ config: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar." },
      { status: 500 },
    );
  }
}
