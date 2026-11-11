import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

type SocioBusca = {
  id: string;
  nome: string;
  matricula: string | null;
  cpf?: string | null;
  situacao: string | null;
  categoria: string | null;
  responsavel_id?: string | null;
  parentesco?: string | null;
};

type DependenteBusca = {
  id: string;
  socio_id: string;
  nome: string;
  matricula: string | null;
  cpf?: string | null;
  parentesco: string | null;
  ativo: boolean | null;
  migrado_para_socio_id?: string | null;
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

type GrupoBusca = {
  titular: ResultadoBusca;
  membros: ResultadoBusca[];
};

function socioEstaAtivo(situacao: string | null | undefined) {
  const valor = String(situacao || "").toLowerCase().trim();
  return !valor || !["inativo", "inativa", "cancelado", "cancelada", "desligado", "desligada"].includes(valor);
}

function normalizar(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function cpfNormalizado(valor: unknown) {
  const cpf = String(valor || "").replace(/\D/g, "");
  return cpf.length === 11 ? cpf : "";
}

function matriculaNormalizada(valor: unknown) {
  return String(valor || "").trim().toUpperCase();
}

function emLotes<T>(lista: T[], tamanho = 100): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function consultarDependentes(
  supabase: ReturnType<typeof getServiceClient>,
  socioIds: string[],
  termo?: string,
) {
  const colunasComMigracao = "id,socio_id,nome,matricula,cpf,parentesco,ativo,migrado_para_socio_id";
  const colunasCompatibilidade = "id,socio_id,nome,matricula,cpf,parentesco,ativo";
  const resultados: DependenteBusca[] = [];

  for (const lote of emLotes(socioIds)) {
    const executar = async (colunas: string) => {
      let query = supabase.from("dependentes").select(colunas).in("socio_id", lote);
      if (termo) query = query.ilike("nome", `%${termo}%`);
      return query.limit(5000);
    };

    let { data, error } = await executar(colunasComMigracao);
    if (error && /migrado_para_socio_id/i.test(`${error.message || ""} ${error.details || ""}`)) {
      ({ data, error } = await executar(colunasCompatibilidade));
    }
    if (error) throw error;
    resultados.push(...((data || []) as unknown as DependenteBusca[]));
  }

  return resultados;
}

function criarOpcaoSocio(socio: SocioBusca): ResultadoBusca {
  return {
    id: socio.id,
    tipo: "socio",
    socio_id: socio.id,
    dependente_id: null,
    nome: socio.nome,
    matricula: socio.matricula == null ? null : String(socio.matricula),
    situacao: socio.situacao,
    categoria: socio.categoria,
    parentesco: socio.parentesco || null,
  };
}

function criarOpcaoDependente(dependente: DependenteBusca, titular: SocioBusca): ResultadoBusca {
  return {
    id: dependente.id,
    tipo: "dependente",
    socio_id: dependente.socio_id,
    dependente_id: dependente.id,
    nome: dependente.nome,
    matricula: dependente.matricula == null ? null : String(dependente.matricula),
    situacao: dependente.ativo === false ? "inativo" : "ativo",
    socio_nome: titular.nome,
    categoria: titular.categoria,
    parentesco: dependente.parentesco,
  };
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
    const termoNormalizado = normalizar(termo);

    // O conjunto de sócios é leve (cadastros, sem histórico financeiro) e permite
    // montar o mesmo agrupamento familiar usado na tela de Carteirinhas.
    const [sociosResult, dependentesEncontradosResult] = await Promise.all([
      supabase
        .from("socios")
        .select("id,nome,matricula,cpf,situacao,categoria,responsavel_id,parentesco")
        .limit(5000),
      supabase
        .from("dependentes")
        .select("id,socio_id,nome,matricula,cpf,parentesco,ativo,migrado_para_socio_id")
        .ilike("nome", `%${termo}%`)
        .limit(50),
    ]);

    if (sociosResult.error) throw sociosResult.error;

    let dependentesEncontrados = (dependentesEncontradosResult.data || []) as unknown as DependenteBusca[];
    if (dependentesEncontradosResult.error) {
      if (/migrado_para_socio_id/i.test(`${dependentesEncontradosResult.error.message || ""} ${dependentesEncontradosResult.error.details || ""}`)) {
        const compatibilidade = await supabase
          .from("dependentes")
          .select("id,socio_id,nome,matricula,cpf,parentesco,ativo")
          .ilike("nome", `%${termo}%`)
          .limit(50);
        if (compatibilidade.error) throw compatibilidade.error;
        dependentesEncontrados = (compatibilidade.data || []) as unknown as DependenteBusca[];
      } else {
        throw dependentesEncontradosResult.error;
      }
    }

    const socios = ((sociosResult.data || []) as unknown as SocioBusca[]).filter((socio) => socioEstaAtivo(socio.situacao));
    const sociosPorId = new Map(socios.map((socio) => [String(socio.id), socio]));
    const matriculasSocios = new Set(socios.map((socio) => matriculaNormalizada(socio.matricula)).filter(Boolean));
    const cpfsSocios = new Set(socios.map((socio) => cpfNormalizado(socio.cpf)).filter(Boolean));

    // Repete a regra de Carteirinhas: registros de dependentes que já foram
    // promovidos a sócio ou que têm a mesma matrícula/CPF de um sócio não viram
    // uma segunda pessoa na lista de acesso. Quando o legado ainda aponta o
    // titular pela linha antiga de dependentes, aproveitamos esse vínculo apenas
    // para agrupar a pessoa sócio sob a família correta (sem exibir duplicidade).
    const dependentesAtivosEncontrados = dependentesEncontrados.filter((dependente) =>
      dependente.ativo !== false && sociosPorId.has(String(dependente.socio_id)),
    );
    const sociosPorMatricula = new Map<string, SocioBusca[]>();
    const sociosPorCpf = new Map<string, SocioBusca[]>();
    for (const socio of socios) {
      const matricula = matriculaNormalizada(socio.matricula);
      const cpf = cpfNormalizado(socio.cpf);
      if (matricula) sociosPorMatricula.set(matricula, [...(sociosPorMatricula.get(matricula) || []), socio]);
      if (cpf) sociosPorCpf.set(cpf, [...(sociosPorCpf.get(cpf) || []), socio]);
    }

    const responsaveisLegados = new Map<string, Set<string>>();
    for (const dependente of dependentesAtivosEncontrados) {
      const socioMigrado = dependente.migrado_para_socio_id
        ? sociosPorId.get(String(dependente.migrado_para_socio_id))
        : null;
      const porMatricula = matriculaNormalizada(dependente.matricula)
        ? sociosPorMatricula.get(matriculaNormalizada(dependente.matricula)) || []
        : [];
      const porCpf = cpfNormalizado(dependente.cpf)
        ? sociosPorCpf.get(cpfNormalizado(dependente.cpf)) || []
        : [];
      const correspondencias = socioMigrado
        ? [socioMigrado]
        : [...new Map([...porMatricula, ...porCpf].map((socio) => [socio.id, socio])).values()];
      if (correspondencias.length !== 1) continue;
      const socioCorrespondente = correspondencias[0];
      if (socioCorrespondente.responsavel_id || String(socioCorrespondente.id) === String(dependente.socio_id)) continue;
      const vinculos = responsaveisLegados.get(String(socioCorrespondente.id)) || new Set<string>();
      vinculos.add(String(dependente.socio_id));
      responsaveisLegados.set(String(socioCorrespondente.id), vinculos);
    }

    const dependentesEncontradosValidos = dependentesAtivosEncontrados.filter((dependente) => {
      if (dependente.migrado_para_socio_id) return false;
      const matriculaDep = matriculaNormalizada(dependente.matricula);
      const cpfDep = cpfNormalizado(dependente.cpf);
      if (matriculaDep && matriculasSocios.has(matriculaDep)) return false;
      if (cpfDep && cpfsSocios.has(cpfDep)) return false;
      return true;
    });

    const sociosEncontrados = socios.filter((socio) =>
      normalizar(socio.nome).includes(termoNormalizado) || matriculaNormalizada(socio.matricula).toLowerCase().includes(termoNormalizado),
    );

    // Encontra o titular raiz seguindo responsavel_id, sem permitir ciclos.
    // O vínculo legado só é usado quando o cadastro atual ainda não tem responsável.
    const responsavelEfetivo = (socio: SocioBusca) => {
      if (socio.responsavel_id) return String(socio.responsavel_id);
      const legados = [...(responsaveisLegados.get(String(socio.id)) || [])];
      return legados.length === 1 ? legados[0] : null;
    };
    const encontrarTitularRaiz = (socioId: string): SocioBusca | null => {
      let atual = sociosPorId.get(String(socioId)) || null;
      const visitados = new Set<string>();
      while (atual) {
        const atualId = String(atual.id);
        if (visitados.has(atualId)) break;
        visitados.add(atualId);
        const responsavelId = responsavelEfetivo(atual);
        if (!responsavelId) break;
        const responsavel = sociosPorId.get(responsavelId);
        if (!responsavel) break;
        atual = responsavel;
      }
      return atual;
    };

    const idsTitulares = new Set<string>();
    for (const socio of sociosEncontrados) {
      const raiz = encontrarTitularRaiz(socio.id);
      if (raiz) idsTitulares.add(String(raiz.id));
    }
    for (const dependente of dependentesEncontradosValidos) {
      const raiz = encontrarTitularRaiz(dependente.socio_id);
      if (raiz) idsTitulares.add(String(raiz.id));
    }

    const grupos: GrupoBusca[] = [];
    for (const titularId of idsTitulares) {
      const titular = sociosPorId.get(titularId);
      if (!titular) continue;

      const sociosDaFamilia = socios.filter((socio) => String(encontrarTitularRaiz(socio.id)?.id || socio.id) === titularId);
      const sociosFamiliaIds = sociosDaFamilia.map((socio) => String(socio.id));
      const dependentesFamilia = await consultarDependentes(supabase, sociosFamiliaIds);
      const dependentesValidos = dependentesFamilia.filter((dependente) => {
        if (dependente.ativo === false || dependente.migrado_para_socio_id) return false;
        const matriculaDep = matriculaNormalizada(dependente.matricula);
        const cpfDep = cpfNormalizado(dependente.cpf);
        if (matriculaDep && matriculasSocios.has(matriculaDep)) return false;
        if (cpfDep && cpfsSocios.has(cpfDep)) return false;
        return sociosPorId.has(String(dependente.socio_id));
      });

      const membrosSocios = sociosDaFamilia
        .filter((socio) => String(socio.id) !== titularId)
        .map(criarOpcaoSocio);
      const membrosDependentes = dependentesValidos.map((dependente) => {
        const responsavel = sociosPorId.get(String(dependente.socio_id));
        return responsavel ? criarOpcaoDependente(dependente, responsavel) : null;
      }).filter((item): item is ResultadoBusca => Boolean(item));

      const membrosPorChave = new Map<string, ResultadoBusca>();
      for (const membro of [...membrosSocios, ...membrosDependentes]) {
        membrosPorChave.set(`${membro.tipo}:${membro.id}`, membro);
      }
      const membros = [...membrosPorChave.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));

      grupos.push({ titular: criarOpcaoSocio(titular), membros });
    }

    grupos.sort((a, b) => a.titular.nome.localeCompare(b.titular.nome, "pt-BR", { sensitivity: "base" }));
    return NextResponse.json({ grupos: grupos.slice(0, 30) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mensagem = error instanceof Error ? error.message : "erro desconhecido";
    console.error("Erro ao pesquisar associados para a portaria:", error);
    return NextResponse.json({ error: `Erro ao pesquisar associados: ${mensagem}` }, { status: 500 });
  }
}
