import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

/** Atualiza somente os dependentes selecionados do núcleo familiar do sócio informado.
 * Um sócio que é dependente em outra família também pode ser responsável por sua própria família.
 */
export async function PUT(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json() as {
      titular_id?: unknown;
      validade?: unknown;
      dependente_ids?: unknown;
    };
    const titularId = String(body.titular_id || "").trim();
    const validade = body.validade ? String(body.validade).slice(0, 10) : null;
    const dependenteIds = Array.isArray(body.dependente_ids)
      ? [...new Set(body.dependente_ids.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    if (!titularId) {
      return NextResponse.json({ error: "Titular não informado." }, { status: 400 });
    }
    if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) {
      return NextResponse.json({ error: "Data de validade inválida." }, { status: 400 });
    }
    if (dependenteIds.length === 0) {
      return NextResponse.json({ sucesso: true, dependentes_atualizados: 0 });
    }

    const db = getServiceClient();
    const { data: cadastroResponsavel, error: titularError } = await db
      .from("socios")
      .select("id")
      .eq("id", titularId)
      .maybeSingle();
    if (titularError) throw titularError;
    if (!cadastroResponsavel) {
      return NextResponse.json({ error: "Cadastro responsável pela família não encontrado." }, { status: 404 });
    }

    // Não permite salvar parcialmente uma seleção: todos os IDs precisam
    // pertencer ao titular informado.
    const { data: vinculados, error: vinculoError } = await db
      .from("dependentes")
      .select("id")
      .eq("socio_id", titularId)
      .in("id", dependenteIds);
    if (vinculoError) throw vinculoError;

    const idsValidos = (vinculados || []).map((item) => String(item.id));
    if (idsValidos.length !== dependenteIds.length) {
      return NextResponse.json(
        { error: "Um ou mais dependentes selecionados não pertencem a este titular. Nenhum exame foi alterado." },
        { status: 409 },
      );
    }

    const { data: atualizados, error: updateError } = await db
      .from("dependentes")
      .update({ exame_medico_validade: validade })
      .eq("socio_id", titularId)
      .in("id", idsValidos)
      .select("id,exame_medico_validade");
    if (updateError) throw updateError;

    const quantidadeAtualizada = atualizados?.length || 0;
    if (quantidadeAtualizada !== dependenteIds.length) {
      return NextResponse.json(
        { error: `A atualização foi confirmada para ${quantidadeAtualizada} de ${dependenteIds.length} dependente(s). Confira os cadastros antes de repetir.` },
        { status: 409 },
      );
    }

    return NextResponse.json({
      sucesso: true,
      dependentes_atualizados: quantidadeAtualizada,
      dependentes: atualizados,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar exames da família." },
      { status: 500 },
    );
  }
}
