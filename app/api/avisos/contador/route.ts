import { NextResponse } from "next/server";
import { getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

/**
 * Conta avisos ativos que o perfil atual pode visualizar.
 * Como o módulo não tem leitura individual por usuário, a badge representa
 * avisos ativos, não "não lidos".
 */
export async function GET(request: Request) {
  const auth = await usuarioAutenticado(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getServiceClient();
    // Mantém o mesmo universo da lista /avisos: avisos ativos, vigentes e visíveis
    // para o perfil. O módulo ainda não tem estado de leitura individual.
    const partesData = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const parte = (tipo: string) => partesData.find((p) => p.type === tipo)?.value || "";
    const hoje = `${parte("year")}-${parte("month")}-${parte("day")}`;

    let query = db
      .from("avisos")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true)
      .or(`data_inicio.is.null,data_inicio.lte.${hoje}`)
      .or(`data_fim.is.null,data_fim.gte.${hoje}`);

    const perfil = String(auth.perfil || "").toLowerCase();
    if (perfil === "associado") {
      query = query.in("publico", ["todos", "associados"]);
    } else if (perfil === "funcionario") {
      query = query.in("publico", ["todos", "funcionarios"]);
    } else if (perfil === "funcionario_inventario") {
      query = query.in("publico", ["todos", "funcionarios", "funcionario_inventario"]);
    }

    const { count, error } = await query;
    if (error) throw error;

    return NextResponse.json({ total: count || 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível contar avisos." },
      { status: 500 },
    );
  }
}

