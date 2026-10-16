import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
import { assinarArquivosEmLote } from "@/lib/storageSignedUrls";

export const dynamic = "force-dynamic";

function erroBanco(error: unknown) {
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return [e?.message, e?.details, e?.hint, e?.code ? `Código ${e.code}` : ""]
    .filter(Boolean)
    .join(" — ");
}

function normalizarStatus(value: unknown) {
  const status = String(value ?? "").trim().toLowerCase();
  if (status === "cancelada") return "cancelada" as const;
  if (["confirmada", "utilizada", "paga", "pago"].includes(status)) return "confirmada" as const;
  return "pendente" as const;
}

function normalizarPagamento(value: unknown) {
  const pagamento = String(value ?? "").trim().toLowerCase();
  if (!pagamento) return "sem_pagamento";
  return pagamento;
}

function normalizarTexto(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function inferirCategoriaEspaco(nome: string) {
  const texto = normalizarTexto(nome);
  if (texto.includes("quadra") || texto.includes("cancha") || texto.includes("campo")) return "esporte";
  if (texto.includes("salao") || texto.includes("ctg")) return "eventos";
  return "lazer";
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "administrador_master"]);
  if ("response" in auth) return auth.response;

  try {
    const url = new URL(request.url);
    const dataInicial = String(url.searchParams.get("data_inicial") || "").trim();
    const dataFinal = String(url.searchParams.get("data_final") || "").trim();
    const statusFiltro = String(url.searchParams.get("status") || "todos").trim();
    const espacoId = String(url.searchParams.get("espaco_id") || "todos").trim();
    const pagamentoFiltro = String(url.searchParams.get("pagamento") || "todos").trim();
    const tipoPessoaFiltro = String(url.searchParams.get("tipo_pessoa") || "todos").trim();

    const db = getServiceClient();
    let query = db
      .from("reservas")
      .select(
        "id,espaco_id,socio_id,dependente_id,responsavel_nome,motivo_locacao,matricula,data_reserva,hora_inicio,hora_fim,valor,situacao,tipo_pagamento,tipo_pessoa,data_pagamento,comprovante_url,comprovante_status,created_at,reservado_por_nome,reservado_por_perfil,lista_presenca_path,lista_presenca_nome,quantidade_convidados,espacos(id,nome)",
      )
      .order("data_reserva", { ascending: false })
      .order("hora_inicio", { ascending: false });

    if (dataInicial) query = query.gte("data_reserva", dataInicial);
    if (dataFinal) query = query.lte("data_reserva", dataFinal);
    if (espacoId !== "todos") query = query.eq("espaco_id", espacoId);
    if (pagamentoFiltro !== "todos") {
      if (pagamentoFiltro === "sem_pagamento") query = query.is("tipo_pagamento", null);
      else query = query.eq("tipo_pagamento", pagamentoFiltro);
    }
    if (tipoPessoaFiltro !== "todos") query = query.eq("tipo_pessoa", tipoPessoaFiltro);

    const [{ data, error }, { data: espacosDb, error: erroEspacos }] = await Promise.all([
      query.limit(10000),
      // O relatório precisa listar TODOS os espaços ativos, mesmo os que
      // não tenham nenhuma reserva no mês selecionado.
      db.from("espacos").select("*").order("nome", { ascending: true }),
    ]);
    if (error) throw error;
    if (erroEspacos) throw erroEspacos;

    const linhasReservas = data || [];
    const linksListasPresenca = await assinarArquivosEmLote(
      db,
      "listas-presenca",
      linhasReservas.map((row: Record<string, unknown>) => row.lista_presenca_path == null ? null : String(row.lista_presenca_path)),
    );

    const reservas = linhasReservas.map((row: Record<string, unknown>) => {
      const rel = Array.isArray(row.espacos)
        ? (row.espacos[0] as Record<string, unknown> | undefined)
        : (row.espacos as Record<string, unknown> | undefined);
      return {
        id: String(row.id ?? ""),
        espaco_id: row.espaco_id == null ? null : String(row.espaco_id),
        espaco_nome: String(rel?.nome ?? row.espaco_nome ?? "Espaço não informado"),
        categoria: inferirCategoriaEspaco(String(rel?.nome ?? row.espaco_nome ?? "")),
        socio_id: row.socio_id == null ? null : String(row.socio_id),
        dependente_id: row.dependente_id == null ? null : String(row.dependente_id),
        responsavel_nome: String(row.responsavel_nome ?? ""),
        motivo_locacao: row.motivo_locacao == null ? "" : String(row.motivo_locacao),
        matricula: row.matricula == null ? null : String(row.matricula),
        data_reserva: String(row.data_reserva ?? "").slice(0, 10),
        hora_inicio: String(row.hora_inicio ?? "").slice(0, 5),
        hora_fim: String(row.hora_fim ?? "").slice(0, 5),
        valor: Number(row.valor || 0),
        situacao: String(row.situacao ?? ""),
        status: normalizarStatus(row.situacao),
        tipo_pagamento: normalizarPagamento(row.tipo_pagamento),
        tipo_pessoa: row.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
        data_pagamento: row.data_pagamento == null ? null : String(row.data_pagamento).slice(0, 10),
        comprovante_status: row.comprovante_status == null ? null : String(row.comprovante_status),
        created_at: row.created_at == null ? null : String(row.created_at),
        reservado_por_nome: row.reservado_por_nome == null ? null : String(row.reservado_por_nome),
        reservado_por_perfil: row.reservado_por_perfil == null ? null : String(row.reservado_por_perfil),
        lista_presenca_nome: row.lista_presenca_nome == null ? null : String(row.lista_presenca_nome),
        quantidade_convidados: row.quantidade_convidados == null ? null : Number(row.quantidade_convidados),
        lista_presenca_url: row.lista_presenca_path == null
          ? null
          : linksListasPresenca.get(String(row.lista_presenca_path)) || null,
      };
    });

    const reservasFiltradas = statusFiltro === "todos"
      ? reservas
      : reservas.filter((item) => item.status === statusFiltro);

    const espacos = (espacosDb || [])
      .filter((row: Record<string, unknown>) =>
        Boolean(row.ativo) && row.id != null && String(row.nome ?? "").trim() !== "" &&
        (espacoId === "todos" || String(row.id) === espacoId),
      )
      .map((row: Record<string, unknown>) => {
        const nome = String(row.nome ?? "").trim();
        return {
          id: String(row.id),
          nome,
          categoria: String(row.categoria ?? row.categoria_espaco ?? inferirCategoriaEspaco(nome)),
        };
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));

    return NextResponse.json({ reservas: reservasFiltradas, espacos });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Não foi possível gerar o relatório de reservas." },
      { status: 500 },
    );
  }
}
