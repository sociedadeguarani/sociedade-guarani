import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = auth.supabase;
    const [sociosResult, dependentesResult, mensalidadesResult, contasResult, movimentosResult] = await Promise.all([
      supabase.from("socios").select("id,matricula,nome,cpf,whatsapp,telefone,foto_url,situacao,responsavel_id,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento").order("matricula", { ascending: true }),
      supabase.from("dependentes").select("id,socio_id,nome,cpf,telefone,ativo,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento").order("nome", { ascending: true }),
      supabase.from("mensalidades").select("*").order("competencia", { ascending: false }).order("data_vencimento", { ascending: true }),
      supabase.from("contas_bancarias").select("*").eq("ativo", true).order("nome", { ascending: true }),
      supabase.from("movimentacoes_financeiras").select("*").order("data_movimentacao", { ascending: false }).order("created_at", { ascending: false }),
    ]);

    const erro = [sociosResult.error, dependentesResult.error, mensalidadesResult.error, contasResult.error, movimentosResult.error].find(Boolean);
    if (erro) return NextResponse.json({ error: erro.message }, { status: 500 });

    return NextResponse.json({
      socios: sociosResult.data || [],
      dependentes: dependentesResult.data || [],
      mensalidades: mensalidadesResult.data || [],
      contasBancarias: contasResult.data || [],
      movimentosFinanceiros: movimentosResult.data || [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o financeiro." }, { status: 500 });
  }
}
