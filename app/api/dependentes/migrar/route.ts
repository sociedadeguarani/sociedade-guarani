import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

const ROLES = [
  "administrador",
  "administrador_normal",
  "administrador_master",
  "funcionario",
];

export async function GET(request: Request) {
  const auth = await requireRoles(request, ROLES);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();

    const [sociosResult, dependentesResult] = await Promise.all([
      supabase
        .from("socios")
        .select("id,matricula,nome,situacao,situacao_financeira")
        .order("nome"),
      supabase
        .from("dependentes")
        .select("id,socio_id,matricula,nome,cpf,data_nascimento,parentesco,telefone,whatsapp,ativo,created_at,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao_financeira,data_ultimo_pagamento")
        .order("nome"),
    ]);

    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;

    const socios = sociosResult.data || [];
    const dependentes = dependentesResult.data || [];

    // O status financeiro exibido para dependentes familiares acompanha o titular.
    const ids = socios.map((s: any) => String(s.id)).filter(Boolean);
    const statusResponsaveis: Record<string, string> = {};
    const hoje = new Date();
    const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const { data: mensalidades, error } = await supabase
        .from("mensalidades")
        .select("socio_id,competencia,data_vencimento,situacao")
        .in("socio_id", lote);

      if (error) throw error;

      for (const id of lote) {
        const itens = (mensalidades || []).filter((m: any) => String(m.socio_id) === id);
        const pendencias = new Set<string>();

        for (const m of itens) {
          const situacao = String(m.situacao || "").trim().toLowerCase();
          if (["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(situacao)) continue;

          const base = m.competencia || m.data_vencimento;
          if (!base) continue;
          const texto = String(base).slice(0, 10);
          const partes = texto.split("-").map(Number);
          if (partes.length < 2 || !partes[0] || !partes[1]) continue;

          const mes = new Date(partes[0], partes[1] - 1, 1);
          if (mes < inicioMesAtual) {
            pendencias.add(`${partes[0]}-${String(partes[1]).padStart(2, "0")}`);
          }
        }

        const atraso = pendencias.size;
        statusResponsaveis[id] = atraso <= 2 ? "em_dia" : atraso <= 4 ? "atrasado" : "muito_atrasado";
      }
    }

    return NextResponse.json({
      socios,
      dependentes,
      statusResponsaveis,
    });
  } catch (error) {
    console.error("GET /api/dependentes:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar dependentes." },
      { status: 500 }
    );
  }
}
