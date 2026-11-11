import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

type SocioBusca = {
  id: string;
  nome: string;
  matricula: string | null;
  situacao: string | null;
  categoria: string | null;
};

type DependenteBusca = {
  id: string;
  socio_id: string;
  nome: string;
  matricula: string | null;
  parentesco: string | null;
  ativo: boolean | null;
};

type ResultadoBusca = {
  id: string;
  tipo: "socio" | "dependente";
  socio_id: string;
  dependente_id: string | null;
  nome: string;
  matricula: string | null;
  situacao: string | null;
  categoria?: string | null;
  socio_nome?: string | null;
  parentesco?: string | null;
};

function socioEstaAtivo(situacao: string | null | undefined) {
  const valor = String(situacao || "").toLowerCase().trim();
  return !valor || ["ativo", "ativa", "em_dia"].includes(valor);
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "administrador_master", "funcionario"]);
  if ("response" in auth) return auth.response;

  const termoOriginal = new URL(request.url).searchParams.get("q") || "";
  const termo = termoOriginal.trim().replace(/[%_]/g, "").replace(/\s+/g, " ").slice(0, 80);
  if (termo.length < 3) {
    return NextResponse.json({ error: "Digite pelo menos 3 letras para pesquisar pelo nome." }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const padrao = `%${termo}%`;
    const [sociosResult, dependentesResult] = await Promise.all([
      supabase
        .from("socios")
        .select("id,nome,matricula,situacao,categoria")
        .ilike("nome", padrao)
        .limit(25),
      supabase
        .from("dependentes")
        .select("id,socio_id,nome,matricula,parentesco,ativo")
        .ilike("nome", padrao)
        .limit(25),
    ]);

    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;

    const socios = ((sociosResult.data || []) as SocioBusca[]).filter((socio) => socioEstaAtivo(socio.situacao));
    const dependentes = ((dependentesResult.data || []) as DependenteBusca[]).filter((dependente) => dependente.ativo !== false);
    const titularesIds = [...new Set(dependentes.map((dependente) => dependente.socio_id).filter(Boolean))];

    const titularesResult = titularesIds.length
      ? await supabase.from("socios").select("id,nome,matricula,situacao,categoria").in("id", titularesIds)
      : { data: [] as SocioBusca[], error: null };
    if (titularesResult.error) throw titularesResult.error;

    const titulares = new Map(
      ((titularesResult.data || []) as SocioBusca[])
        .filter((socio) => socioEstaAtivo(socio.situacao))
        .map((socio) => [socio.id, socio])
    );

    const resultados: ResultadoBusca[] = [
      ...socios.map((socio) => ({
        id: socio.id,
        tipo: "socio" as const,
        socio_id: socio.id,
        dependente_id: null,
        nome: socio.nome,
        matricula: socio.matricula == null ? null : String(socio.matricula),
        situacao: socio.situacao,
        categoria: socio.categoria,
      })),
      ...dependentes.flatMap((dependente) => {
        const titular = titulares.get(dependente.socio_id);
        if (!titular) return [];
        return [{
          id: dependente.id,
          tipo: "dependente" as const,
          socio_id: dependente.socio_id,
          dependente_id: dependente.id,
          nome: dependente.nome,
          matricula: dependente.matricula == null ? null : String(dependente.matricula),
          situacao: dependente.ativo === false ? "inativo" : "ativo",
          socio_nome: titular.nome,
          categoria: titular.categoria,
          parentesco: dependente.parentesco,
        }];
      }),
    ];

    resultados.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    return NextResponse.json({ resultados: resultados.slice(0, 40) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "erro desconhecido";
    console.error("Erro ao pesquisar associados para a portaria:", error);
    return NextResponse.json({ error: `Erro ao pesquisar associados: ${mensagem}` }, { status: 500 });
  }
}
