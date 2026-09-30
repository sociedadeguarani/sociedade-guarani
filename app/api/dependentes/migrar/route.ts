import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const ADMIN = ["administrador", "administrador_master"];

function erroBanco(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code].filter(Boolean).join(" — ");
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ADMIN);
  if ("response" in auth) return auth.response;
  try {
    const db = getServiceClient();
    const [sociosResult, dependentesResult] = await Promise.all([
      db.from("socios").select("id,matricula,nome,situacao,situacao_financeira,responsavel_id,possui_mensalidade").order("nome"),
      db.from("dependentes").select("id,socio_id,matricula,nome,cpf,data_nascimento,parentesco,telefone,whatsapp,ativo,created_at,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao_financeira,data_ultimo_pagamento").order("nome"),
    ]);
    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;
    const socios = sociosResult.data || [];
    const dependentes = dependentesResult.data || [];
    const ids = socios.map((s: any) => String(s.id)).filter(Boolean);
    const statusResponsaveis: Record<string, string> = {};
    const hoje = new Date();
    const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const { data: mensalidades, error } = await db.from("mensalidades").select("socio_id,competencia,data_vencimento,situacao").in("socio_id", lote);
      if (error) throw error;
      for (const id of lote) {
        const pendencias = new Set<string>();
        for (const m of (mensalidades || []).filter((item: any) => String(item.socio_id) === id)) {
          const situacao = String(m.situacao || "").trim().toLowerCase();
          if (["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(situacao)) continue;
          const base = m.competencia || m.data_vencimento;
          if (!base) continue;
          const partes = String(base).slice(0, 10).split("-").map(Number);
          if (partes.length < 2 || !partes[0] || !partes[1]) continue;
          if (new Date(partes[0], partes[1] - 1, 1) < inicioMesAtual) pendencias.add(`${partes[0]}-${String(partes[1]).padStart(2, "0")}`);
        }
        const atraso = pendencias.size;
        statusResponsaveis[id] = atraso <= 2 ? "em_dia" : atraso <= 4 ? "atrasado" : "muito_atrasado";
      }
    }
    return NextResponse.json({ socios, dependentes, statusResponsaveis });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao carregar dependentes." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ADMIN);
  if ("response" in auth) return auth.response;
  try {
    const db = getServiceClient();
    const body = await request.json().catch(() => ({}));
    const source = body.source === "dependentes" ? "dependentes" : "socios";
    const data = body.data && typeof body.data === "object" ? body.data : {};
    const { data: row, error } = await db.from(source).insert(data).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, ...(source === "socios" ? { socio: row } : { dependente: row }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : erroBanco(error) || "Não foi possível cadastrar o dependente." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireRoles(request, ADMIN);
  if ("response" in auth) return auth.response;
  try {
    const db = getServiceClient();
    const body = await request.json().catch(() => ({}));
    const source = body.source === "dependentes" ? "dependentes" : "socios";
    const id = String(body.id || "").trim();
    const data = body.data && typeof body.data === "object" ? body.data : {};
    if (!id) return NextResponse.json({ error: "Dependente não informado." }, { status: 400 });
    const { data: row, error } = await db.from(source).update(data).eq("id", id).select("*").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, ...(source === "socios" ? { socio: row } : { dependente: row }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : erroBanco(error) || "Não foi possível atualizar o dependente." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireRoles(request, ADMIN);
  if ("response" in auth) return auth.response;
  try {
    const db = getServiceClient();
    const body = await request.json().catch(() => ({}));
    const source = body.source === "dependentes" ? "dependentes" : "socios";
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Dependente não informado." }, { status: 400 });
    const { error } = await db.from(source).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : erroBanco(error) || "Não foi possível excluir o dependente." }, { status: 500 });
  }
}
