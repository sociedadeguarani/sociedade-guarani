import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function ehDependenteFamiliarSocio(socio: Record<string, unknown>): boolean {
  if (!socio.responsavel_id) return false;

  const tipo = normalizar(socio.tipo_socio);
  const categoria = normalizar(socio.categoria);

  return (
    tipo === "dependente_patrimonial_familiar" ||
    tipo === "dependente_patrimonial_familiar_mensalidade" ||
    tipo === "dependente_contribuinte_familiar" ||
    tipo === "dependente_contribuinte_familiar_mensalidade" ||
    categoria.includes("dependente patrimonial familiar") ||
    categoria.includes("dependente contribuinte familiar")
  );
}

function ehTitular(matricula: unknown): boolean {
  return String(matricula ?? "").trim().toUpperCase().endsWith("A");
}

export async function GET(request: Request) {
  const auth = await requireRoles(
    request,
    [
      "administrador",
      "administrador_master",
      "funcionario",
      "funcionario_inventario",
      "associado",
    ],
    "menu.carteirinhas"
  );

  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();

    let dependentesQuery = db
      .from("dependentes")
      .select("nome,matricula,socio_id");
    let sociosQuery = db
      .from("socios")
      .select("nome,matricula,responsavel_id,tipo_socio,categoria,id");

    if (auth.usuario.perfil === "associado") {
      dependentesQuery = dependentesQuery.eq("socio_id", auth.usuario.socio_id);
      sociosQuery = sociosQuery.or(
        `id.eq.${auth.usuario.socio_id},responsavel_id.eq.${auth.usuario.socio_id}`
      );
    }

    const [
      { data: dependentes, error: dependentesError },
      { data: socios, error: sociosError },
    ] = await Promise.all([dependentesQuery, sociosQuery]);

    if (dependentesError) throw dependentesError;
    if (sociosError) throw sociosError;

    const dependentesCadastrados = (dependentes ?? []).filter(
      (dependente: { matricula?: unknown }) => !ehTitular(dependente.matricula)
    );

    const chavesExistentes = new Set(
      dependentesCadastrados
        .flatMap((dependente: { nome?: unknown; matricula?: unknown }) => [
          normalizar(dependente.nome),
          normalizar(dependente.matricula),
        ])
        .filter(Boolean)
    );

    const dependentesLegados = (socios ?? [])
      .filter((socio: Record<string, unknown>) => ehDependenteFamiliarSocio(socio))
      .filter((socio: Record<string, unknown>) => !ehTitular(socio.matricula))
      .filter((socio: Record<string, unknown>) => {
        return (
          !chavesExistentes.has(normalizar(socio.nome)) &&
          !chavesExistentes.has(normalizar(socio.matricula))
        );
      });

    return NextResponse.json({
      total: dependentesCadastrados.length + dependentesLegados.length,
    });
  } catch (error) {
    console.error("GET /api/dependentes/resumo:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao contar dependentes.",
      },
      { status: 500 }
    );
  }
}
