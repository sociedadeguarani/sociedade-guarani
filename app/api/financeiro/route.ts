import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get("competencia");

    let mensalidades = supabase
      .from("mensalidades")
      .select("*")
      .order("competencia", { ascending: false })
      .order("data_vencimento", { ascending: true });

    if (competencia) mensalidades = mensalidades.eq("competencia", competencia);

    const [{ data: contas, error: contasError }, { data: mensalidadesData, error: mensalidadesError }] = await Promise.all([
      supabase.from("contas_bancarias").select("*").eq("ativo", true).order("nome", { ascending: true }),
      mensalidades,
    ]);

    if (contasError) throw contasError;
    if (mensalidadesError) throw mensalidadesError;

    return NextResponse.json({ contas: contas || [], mensalidades: mensalidadesData || [] });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar financeiro: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Os lançamentos financeiros são realizados pela tela autenticada do Financeiro." },
    { status: 405 }
  );
}
