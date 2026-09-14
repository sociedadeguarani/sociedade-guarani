import { NextResponse } from "next/server";
import { getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

// Devolve as mensalidades do próprio associado logado (e das dos
// dependentes vinculados a ele) — nunca de outra pessoa.
export async function GET(request: Request) {
  const auth = await usuarioAutenticado(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const socioId = auth.usuario.socio_id;
    if (!socioId) {
      return NextResponse.json({ error: "Seu login não está vinculado a um cadastro de sócio." }, { status: 403 });
    }

    const supabase = getServiceClient();

    const [mensalidadesResult, dependentesResult, socioResult] = await Promise.all([
      supabase
        .from("mensalidades")
        .select("id,socio_id,competencia,valor,data_vencimento,situacao,data_pagamento,tipo_pagamento,numero_recibo,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa")
        .eq("socio_id", socioId)
        .order("competencia", { ascending: false })
        .limit(24),
      supabase
        .from("dependentes")
        .select("id,nome")
        .eq("socio_id", socioId),
      supabase
        .from("socios")
        .select("nome,matricula,situacao_financeira")
        .eq("id", socioId)
        .maybeSingle(),
    ]);

    if (mensalidadesResult.error) throw new Error(mensalidadesResult.error.message);

    return NextResponse.json({
      socio: socioResult.data || null,
      dependentes: dependentesResult.data || [],
      mensalidades: mensalidadesResult.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar mensalidades: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

