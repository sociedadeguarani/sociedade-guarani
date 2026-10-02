import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await requireRoles(request, ["associado", "funcionario", "funcionario_inventario", "administrador"]);
  if ("response" in auth) return auth.response;
  try {
    const db = getServiceClient();
    const [socios, ativos, inativos, dependentesDb, dependentesLegados, reservas, notificacoes] = await Promise.all([
      db.from("socios").select("id", { count: "exact", head: true }).eq("possui_mensalidade", true),
      db.from("socios").select("id", { count: "exact", head: true }).eq("possui_mensalidade", true).ilike("situacao", "ativo"),
      db.from("socios").select("id", { count: "exact", head: true }).eq("possui_mensalidade", true).ilike("situacao", "inativo"),
      db.from("dependentes").select("id,socio_id,nome,cpf"),
      db.from("socios").select("id,responsavel_id,nome,cpf").not("responsavel_id", "is", null).eq("possui_mensalidade", false),
      db.from("reservas").select("id", { count: "exact", head: true }).in("situacao", ["solicitada", "aguardando_pagamento"]),
      db.from("notificacoes_admin").select("id", { count: "exact", head: true }).eq("lida", false).in("origem_tipo", ["mensalidade", "mensalidade_lote", "convite", "reserva", "reserva_pagamento", "pagamento_reserva"]),
    ]);
    const erro = [socios, ativos, inativos, dependentesDb, dependentesLegados, reservas, notificacoes].find((r) => r.error)?.error;
    if (erro) throw erro;

    const chaveDependente = (d: any) => {
      const responsavel = String(d?.socio_id || d?.responsavel_id || "");
      const cpf = String(d?.cpf || "").replace(/\D/g, "");
      const nome = String(d?.nome || "").trim().toLowerCase().replace(/\s+/g, " ");
      return `${responsavel}|${cpf}|${nome}`;
    };
    const dependentesUnicos = new Set([
      ...(dependentesDb.data || []).map(chaveDependente),
      ...(dependentesLegados.data || []).map(chaveDependente),
    ]);

    return NextResponse.json({
      socios: socios.count || 0,
      sociosAtivos: ativos.count || 0,
      sociosInativos: inativos.count || 0,
      dependentes: dependentesUnicos.size,
      reservasPendentes: reservas.count || 0,
      pixPendentes: notificacoes.count || 0,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar resumo do painel." }, { status: 500 });
  }
}

