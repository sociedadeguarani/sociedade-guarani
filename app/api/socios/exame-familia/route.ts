import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

/**
 * Atualiza os exames dos dependentes selecionados na família de um sócio.
 * As famílias atuais ficam em `socios.responsavel_id`; cadastros legados
 * continuam em `dependentes.socio_id`. Um sócio que também é dependente de
 * outra pessoa pode, ainda assim, ser responsável por sua própria família.
 */
export async function PUT(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as {
      titular_id?: unknown;
      validade?: unknown;
      dependente_ids?: unknown;
      quantidade_pessoas?: unknown;
    };
    const titularId = String(body.titular_id || "").trim();
    const validade = body.validade ? String(body.validade).slice(0, 10) : null;
    const referenciasBrutas = Array.isArray(body.dependente_ids)
      ? [...new Set(body.dependente_ids.map((item) => String(item).trim()).filter(Boolean))]
      : [];

    if (!titularId) return NextResponse.json({ error: "Responsável familiar não informado." }, { status: 400 });
    if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) {
      return NextResponse.json({ error: "Data de validade inválida." }, { status: 400 });
    }
    if (referenciasBrutas.length === 0) {
      return NextResponse.json({ sucesso: true, dependentes_atualizados: 0, registros_atualizados: 0, pessoas_atualizadas: 0 });
    }

    const sociosIds: string[] = [];
    const dependentesIds: string[] = [];
    for (const referencia of referenciasBrutas) {
      if (referencia.startsWith("socio:")) {
        sociosIds.push(referencia.slice("socio:".length));
      } else if (referencia.startsWith("dependente:")) {
        dependentesIds.push(referencia.slice("dependente:".length));
      } else if (!referencia.includes(":")) {
        // Compatibilidade com versões anteriores da tela, que enviavam apenas
        // IDs da tabela legada `dependentes`.
        dependentesIds.push(referencia);
      } else {
        return NextResponse.json({ error: "Referência de dependente inválida." }, { status: 400 });
      }
    }

    const db = getServiceClient();
    const { data: responsavel, error: responsavelError } = await db
      .from("socios")
      .select("id,matricula")
      .eq("id", titularId)
      .maybeSingle();
    if (responsavelError) throw responsavelError;
    if (!responsavel) {
      return NextResponse.json({ error: "Cadastro responsável pela família não encontrado." }, { status: 404 });
    }

    // Valida todos os vínculos antes de alterar qualquer registro. A tabela
    // socios é a fonte atual; dependentes preserva famílias legadas.
    const matriculaResponsavel = String(responsavel.matricula ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const baseMatriculaFamiliar = matriculaResponsavel.endsWith("A") ? matriculaResponsavel.slice(0, -1) : "";
    const [sociosVinculadosResult, dependentesVinculadosResult] = await Promise.all([
      sociosIds.length
        ? db.from("socios").select("id,matricula,responsavel_id").in("id", sociosIds)
        : Promise.resolve({ data: [], error: null }),
      dependentesIds.length
        ? db.from("dependentes").select("id").eq("socio_id", titularId).in("id", dependentesIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sociosVinculadosResult.error) throw sociosVinculadosResult.error;
    if (dependentesVinculadosResult.error) throw dependentesVinculadosResult.error;

    const sociosVinculados = (sociosVinculadosResult.data || []) as Array<{ id: string; matricula: string | number | null; responsavel_id: string | null }>;
    const sociosDaFamilia = sociosVinculados.filter((item) => {
      if (item.responsavel_id === titularId) return true;
      const matriculaDependente = String(item.matricula ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      return Boolean(
        baseMatriculaFamiliar &&
        matriculaDependente.length === baseMatriculaFamiliar.length + 1 &&
        matriculaDependente.startsWith(baseMatriculaFamiliar) &&
        matriculaDependente.slice(-1) !== "A"
      );
    });
    const sociosValidos = sociosDaFamilia.map((item) => String(item.id));
    const dependentesValidos = (dependentesVinculadosResult.data || []).map((item) => String(item.id));
    if (sociosValidos.length !== sociosIds.length || dependentesValidos.length !== dependentesIds.length) {
      return NextResponse.json(
        { error: "Um ou mais dependentes selecionados não pertencem a esta família. Nenhum exame foi alterado." },
        { status: 409 },
      );
    }

    let sociosAtualizados: Array<{ id: string }> = [];
    let dependentesAtualizados: Array<{ id: string }> = [];

    if (sociosValidos.length) {
      const { data, error } = await db
        .from("socios")
        .update({ exame_medico_validade: validade })
        .in("id", sociosValidos)
        .select("id");
      if (error) throw error;
      sociosAtualizados = data || [];
    }

    if (dependentesValidos.length) {
      const { data, error } = await db
        .from("dependentes")
        .update({ exame_medico_validade: validade })
        .eq("socio_id", titularId)
        .in("id", dependentesValidos)
        .select("id");
      if (error) throw error;
      dependentesAtualizados = data || [];
    }

    const registrosAtualizados = sociosAtualizados.length + dependentesAtualizados.length;
    const registrosEsperados = sociosIds.length + dependentesIds.length;
    if (registrosAtualizados !== registrosEsperados) {
      return NextResponse.json(
        { error: `A atualização foi confirmada para ${registrosAtualizados} de ${registrosEsperados} registros. Confira os cadastros antes de repetir.` },
        { status: 409 },
      );
    }

    const pessoasSolicitadas = Number(body.quantidade_pessoas);
    return NextResponse.json({
      sucesso: true,
      dependentes_atualizados: Number.isFinite(pessoasSolicitadas) && pessoasSolicitadas >= 0 ? pessoasSolicitadas : referenciasBrutas.length,
      pessoas_atualizadas: Number.isFinite(pessoasSolicitadas) && pessoasSolicitadas >= 0 ? pessoasSolicitadas : referenciasBrutas.length,
      registros_atualizados: registrosAtualizados,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar exames da família." }, { status: 500 });
  }
}
