import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

/** Atualiza o exame do titular e somente os dependentes explicitamente selecionados. */
export async function PUT(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json() as { titular_id?: unknown; validade?: unknown; dependente_ids?: unknown };
    const titularId = String(body.titular_id || "").trim();
    const validade = body.validade ? String(body.validade).slice(0, 10) : null;
    const dependenteIds = Array.isArray(body.dependente_ids)
      ? [...new Set(body.dependente_ids.map((id) => String(id).trim()).filter(Boolean))]
      : [];
    if (!titularId) return NextResponse.json({ error: "Titular não informado." }, { status: 400 });
    if (validade && !/^\d{4}-\d{2}-\d{2}$/.test(validade)) return NextResponse.json({ error: "Data de validade inválida." }, { status: 400 });

    const db = getServiceClient();
    const { data: titular, error: titularError } = await db.from("socios").select("id,responsavel_id").eq("id", titularId).maybeSingle();
    if (titularError) throw titularError;
    if (!titular || titular.responsavel_id) return NextResponse.json({ error: "Selecione um cadastro titular válido." }, { status: 400 });

    const { error: updateTitularError } = await db.from("socios").update({ exame_medico_validade: validade }).eq("id", titularId);
    if (updateTitularError) throw updateTitularError;

    let atualizados = 0;
    if (dependenteIds.length) {
      // Confirma vínculo familiar para impedir atualização de dependentes de outra família.
      const { data: vinculados, error: vinculoError } = await db.from("dependentes").select("id").eq("socio_id", titularId).in("id", dependenteIds);
      if (vinculoError) throw vinculoError;
      const idsValidos = (vinculados || []).map((item) => String(item.id));
      if (idsValidos.length) {
        const { error: updateDependentesError } = await db.from("dependentes").update({ exame_medico_validade: validade }).eq("socio_id", titularId).in("id", idsValidos);
        if (updateDependentesError) throw updateDependentesError;
        atualizados = idsValidos.length;
      }
    }
    return NextResponse.json({ sucesso: true, titular_atualizado: true, dependentes_atualizados: atualizados });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao atualizar exames da família." }, { status: 500 });
  }
}
