import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

function erroBanco(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code ? `Código ${error.code}` : ""]
    .filter(Boolean)
    .join(" — ");
}

const ESPACOS_UUID: Record<string, string> = {
  fut: "10000000-0000-4000-8000-000000000001",
  volei: "10000000-0000-4000-8000-000000000002",
  areia: "10000000-0000-4000-8000-000000000003",
  q48: "10000000-0000-4000-8000-000000000004",
  q1: "10000000-0000-4000-8000-000000000005",
  q2: "10000000-0000-4000-8000-000000000006",
  q3: "10000000-0000-4000-8000-000000000007",
  salao_p: "10000000-0000-4000-8000-000000000008",
  salao_g: "10000000-0000-4000-8000-000000000009",
  ctg: "10000000-0000-4000-8000-000000000010",
};

function normalizarEspacoId(valor: string) {
  const v = valor.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) return v;
  return ESPACOS_UUID[v] || null;
}

function dividirHorario(horario: string) {
  const [inicio, fim] = horario.split("-").map((v) => v.trim());
  return { inicio: inicio || horario.trim(), fim: fim || inicio || horario.trim() };
}

function statusFrontend(situacao: string | null | undefined) {
  const v = String(situacao || "").toLowerCase();
  if (v === "cancelada") return "cancelada";
  if (v === "confirmada" || v === "utilizada") return "confirmada";
  return "pendente";
}

async function assinaturaComprovante(db: any, path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from("comprovantes-financeiro").createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

function normalizarReserva(dbRow: any) {
  const espacoRel = Array.isArray(dbRow.espacos) ? dbRow.espacos[0] : dbRow.espacos;
  return {
    ...dbRow,
    espaco_id: dbRow.espaco_id,
    espaco_nome: espacoRel?.nome || dbRow.espaco_nome || "",
    data: dbRow.data_reserva,
    horario: `${String(dbRow.hora_inicio || "").slice(0, 5)} - ${String(dbRow.hora_fim || "").slice(0, 5)}`,
    nome: dbRow.responsavel_nome,
    matricula: dbRow.matricula ?? null,
    tipo_pessoa: dbRow.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
    valor: Number(dbRow.valor || 0),
    status: statusFrontend(dbRow.situacao),
    pagamento: dbRow.tipo_pagamento || "pendente",
  };
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["funcionario", "administrador_normal", "administrador_master", "administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const db = getServiceClient();

    let query = db
      .from("reservas")
      .select("*,espacos:espaco_id(id,nome)")
      .order("created_at", { ascending: false });

    if (status === "cancelada") query = query.eq("situacao", "cancelada");
    else if (status === "confirmada") query = query.in("situacao", ["confirmada", "utilizada"]);
    else if (status === "pendente") query = query.in("situacao", ["solicitada", "aguardando_pagamento"]);

    const { data, error } = await query;
    if (error) throw error;

    const reservas = await Promise.all(
      (data || []).map(async (r: any) => ({
        ...normalizarReserva(r),
        comprovante_url: await assinaturaComprovante(db, r.comprovante_url || null),
      })),
    );

    const { data: contas } = await db
      .from("contas_bancarias")
      .select("id,nome,banco,ativo")
      .eq("ativo", true)
      .order("nome");

    return NextResponse.json({ reservas, contas_bancarias: contas || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao carregar reservas." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["funcionario", "administrador_normal", "administrador_master", "administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json();
    const db = getServiceClient();

    const espacoId = normalizarEspacoId(String(body.espaco_id || ""));
    const espacoNome = String(body.espaco_nome || "").trim();
    const data = String(body.data || "").trim();
    const horario = String(body.horario || "").trim();
    const nome = String(body.nome || "").trim();
    const pagamento = String(body.pagamento || "").trim();
    const status = String(body.status || "").trim() || (pagamento === "pix" ? "pendente" : "confirmada");
    const valor = Number(body.valor || 0);

    if (!espacoId || !espacoNome || !data || !horario || !nome) {
      return NextResponse.json({ error: "Espaço, data, horário e nome são obrigatórios." }, { status: 400 });
    }
    if (!["pix", "dinheiro", "transferencia", "pendente"].includes(pagamento)) {
      return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    }

    const { inicio, fim } = dividirHorario(horario);
    const situacao = status === "cancelada" ? "cancelada" : status === "confirmada" ? "confirmada" : "solicitada";

    // A tabela de reservas existente no Supabase usa o modelo histórico:
    // responsavel_nome/data_reserva/hora_inicio/hora_fim/situacao/tipo_pagamento.
    // Mantemos esse modelo para não quebrar registros já existentes.
    const dados: Record<string, any> = {
      espaco_id: espacoId,
      socio_id: body.socio_id || null,
      dependente_id: body.dependente_id || null,
      responsavel_nome: nome,
      data_reserva: data,
      hora_inicio: inicio,
      hora_fim: fim,
      valor,
      situacao,
      tipo_pagamento: pagamento,
      matricula: body.matricula == null ? null : String(body.matricula),
      tipo_pessoa: body.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
      comprovante_url: body.comprovante_url || null,
    };

    const { data: reserva, error } = await db.from("reservas").insert(dados).select("*").single();

    if (error) {
      if (String(error.code) === "23505") {
        return NextResponse.json({ error: "Este espaço e horário já estão reservados." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ reserva: normalizarReserva(reserva) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao criar reserva." },
      { status: 500 },
    );
  }
}

async function registrarFinanceiro(db: any, reserva: any, contaBancariaId: string, usuarioId: string) {
  if (!contaBancariaId) throw new Error("Informe a conta bancária que recebeu o pagamento.");

  const { data: existente, error: erroExistente } = await db
    .from("movimentacoes_financeiras")
    .select("id")
    .eq("origem_tipo", "reserva")
    .eq("origem_id", reserva.id)
    .limit(1)
    .maybeSingle();
  if (erroExistente) throw erroExistente;
  if (existente) return existente;

  const normalizada = normalizarReserva(reserva);
  const { data: movimento, error } = await db
    .from("movimentacoes_financeiras")
    .insert({
      conta_bancaria_id: contaBancariaId,
      tipo: "entrada",
      categoria: "Reserva",
      descricao: `Reserva - ${normalizada.nome || "Responsável"}${normalizada.data ? ` - ${normalizada.data}` : ""}`,
      valor: Number(normalizada.valor || 0),
      data_movimentacao: normalizada.data || new Date().toISOString().slice(0, 10),
      forma_pagamento: "pix",
      origem_tipo: "reserva",
      origem_id: reserva.id,
      socio_id: reserva.socio_id || null,
      dependente_id: reserva.dependente_id || null,
      comprovante_url: reserva.comprovante_url || null,
      conciliado: false,
      created_by: usuarioId,
      observacoes: `Pagamento confirmado manualmente após conferência do PIX. Reserva ${reserva.id}.`,
    })
    .select("*")
    .single();
  if (error) throw error;
  return movimento;
}

export async function PATCH(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const acao = String(body.acao || "").trim();
    if (!id) return NextResponse.json({ error: "Reserva não informada." }, { status: 400 });

    const db = getServiceClient();
    const { data: reserva, error: erroBusca } = await db.from("reservas").select("*").eq("id", id).maybeSingle();
    if (erroBusca) throw erroBusca;
    if (!reserva) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

    if (acao === "confirmar_pix") {
      if (!["solicitada", "aguardando_pagamento"].includes(String(reserva.situacao))) {
        return NextResponse.json({ error: "Esta reserva não está pendente de conferência." }, { status: 409 });
      }
      if (String(reserva.tipo_pagamento) !== "pix") {
        return NextResponse.json({ error: "Esta reserva não é PIX." }, { status: 400 });
      }
      if (!reserva.comprovante_url) {
        return NextResponse.json({ error: "A reserva não possui comprovante." }, { status: 400 });
      }

      const contaBancariaId = String(body.conta_bancaria_id || "").trim();
      if (!contaBancariaId) return NextResponse.json({ error: "Informe a conta bancária que recebeu o PIX." }, { status: 400 });

      await registrarFinanceiro(db, reserva, contaBancariaId, auth.usuario.id);
      const agora = new Date().toISOString();
      const { data: atualizada, error } = await db
        .from("reservas")
        .update({
          situacao: "confirmada",
          tipo_pagamento: "pix",
          data_pagamento: agora.slice(0, 10),
          comprovante_status: "aprovado",
          comprovante_aprovado_por: auth.usuario.id,
          comprovante_aprovado_em: agora,
          motivo_recusa: null,
        })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ reserva: normalizarReserva(atualizada), message: "PIX confirmado e lançamento criado no Financeiro." });
    }

    if (acao === "cancelar") {
      const { data: atualizada, error } = await db
        .from("reservas")
        .update({ situacao: "cancelada" })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ reserva: normalizarReserva(atualizada), message: "Reserva cancelada." });
    }

    return NextResponse.json({ error: "Ação de reserva inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao atualizar reserva." },
      { status: 500 },
    );
  }
}
