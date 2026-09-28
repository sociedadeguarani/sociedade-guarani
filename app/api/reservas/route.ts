import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

function erroBanco(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code ? `Código ${error.code}` : ""]
    .filter(Boolean)
    .join(" — ");
}

async function assinaturaComprovante(db: any, path: string | null) {
  if (!path) return null;
  const { data } = await db.storage
    .from("comprovantes-financeiro")
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["funcionario", "administrador", "administrador_master"]);
  if ("response" in auth) return auth.response;

  try {
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const db = getServiceClient();

    let query = db
      .from("reservas")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;

    const reservas = await Promise.all(
      (data || []).map(async (r: any) => ({
        ...r,
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
  const auth = await requireRoles(request, ["funcionario", "administrador", "administrador_master"]);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json();
    const db = getServiceClient();

    const espacoId = String(body.espaco_id || "").trim();
    const espacoNome = String(body.espaco_nome || "").trim();
    const data = String(body.data || "").trim();
    const horario = String(body.horario || "").trim();
    const nome = String(body.nome || "").trim();
    const pagamento = String(body.pagamento || "").trim();
    const status = String(body.status || "").trim() || (pagamento === "pix" ? "pendente" : "confirmada");

    if (!espacoId || !espacoNome || !data || !horario || !nome) {
      return NextResponse.json({ error: "Espaço, data, horário e nome são obrigatórios." }, { status: 400 });
    }
    if (!["pix", "dinheiro", "transferencia", "pendente"].includes(pagamento)) {
      return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    }

    const contaBancariaId = body.conta_bancaria_id ? String(body.conta_bancaria_id) : null;
    if (status === "confirmada" && Number(body.valor || 0) > 0 && pagamento !== "pendente" && !contaBancariaId) {
      return NextResponse.json({ error: "Cadastre ou selecione uma conta bancária para registrar o pagamento no Financeiro." }, { status: 400 });
    }

    const dados = {
      espaco_id: espacoId,
      espaco_nome: espacoNome,
      data,
      horario,
      nome,
      socio_id: body.socio_id || null,
      dependente_id: body.dependente_id || null,
      matricula: body.matricula == null ? null : String(body.matricula),
      tipo_pessoa: body.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
      valor: Number(body.valor || 0),
      status: status === "pendente" ? "pendente" : "confirmada",
      pagamento,
      comprovante_url: body.comprovante_url || null,
      comprovante_nome: body.comprovante_nome || null,
      conta_bancaria_id: contaBancariaId,
      confirmado_em: status === "confirmada" ? new Date().toISOString() : null,
      confirmado_por: status === "confirmada" ? auth.usuario.id : null,
    };

    const { data: reserva, error } = await db
      .from("reservas")
      .insert(dados)
      .select("*")
      .single();

    if (error) {
      if (String(error.code) === "23505") {
        return NextResponse.json({ error: "Este espaço e horário já estão reservados." }, { status: 409 });
      }
      throw error;
    }

    if (dados.status === "confirmada" && Number(dados.valor) > 0 && dados.pagamento !== "pendente") {
      await registrarFinanceiro(db, reserva, dados.conta_bancaria_id, auth.usuario.id);
    }

    return NextResponse.json({ reserva });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao criar reserva." },
      { status: 500 },
    );
  }
}

async function registrarFinanceiro(db: any, reserva: any, contaBancariaId: string | null, usuarioId: string) {
  if (!contaBancariaId) {
    throw new Error("Informe a conta bancária que recebeu o pagamento.");
  }

  const { data: existente, error: erroExistente } = await db
    .from("movimentacoes_financeiras")
    .select("id")
    .eq("origem_tipo", "reserva")
    .eq("origem_id", reserva.id)
    .limit(1)
    .maybeSingle();

  if (erroExistente) throw erroExistente;
  if (existente) return existente;

  const { data: movimento, error } = await db
    .from("movimentacoes_financeiras")
    .insert({
      conta_bancaria_id: contaBancariaId,
      tipo: "entrada",
      categoria: "Reserva de espaço",
      descricao: `Reserva de espaço — ${reserva.espaco_nome} — ${reserva.nome}`,
      valor: Number(reserva.valor || 0),
      data_movimentacao: reserva.data,
      forma_pagamento: reserva.pagamento === "pix" ? "pix" : reserva.pagamento,
      origem_tipo: "reserva",
      origem_id: reserva.id,
      socio_id: reserva.socio_id || null,
      dependente_id: reserva.dependente_id || null,
      comprovante_url: reserva.comprovante_url || null,
      conciliado: false,
      created_by: usuarioId,
      observacoes: `Reserva ${reserva.id}.`,
    })
    .select("*")
    .single();

  if (error) throw error;
  return movimento;
}

export async function PATCH(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const id = String(body.id || "").trim();
    const acao = String(body.acao || "").trim();
    if (!id) return NextResponse.json({ error: "Reserva não informada." }, { status: 400 });

    const db = getServiceClient();
    const { data: reserva, error: erroBusca } = await db
      .from("reservas")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (erroBusca) throw erroBusca;
    if (!reserva) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

    if (acao === "confirmar_pix") {
      if (reserva.status !== "pendente") {
        return NextResponse.json({ error: "Esta reserva não está pendente de conferência." }, { status: 409 });
      }
      if (reserva.pagamento !== "pix") {
        return NextResponse.json({ error: "Esta reserva não é PIX." }, { status: 400 });
      }
      if (!reserva.comprovante_url) {
        return NextResponse.json({ error: "A reserva não possui comprovante." }, { status: 400 });
      }

      const contaBancariaId = String(body.conta_bancaria_id || "").trim();
      if (!contaBancariaId) {
        return NextResponse.json({ error: "Informe a conta bancária que recebeu o PIX." }, { status: 400 });
      }

      await registrarFinanceiro(db, reserva, contaBancariaId, auth.usuario.id);

      const { data: atualizada, error } = await db
        .from("reservas")
        .update({
          status: "confirmada",
          conta_bancaria_id: contaBancariaId,
          confirmado_em: new Date().toISOString(),
          confirmado_por: auth.usuario.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pendente")
        .select("*")
        .single();
      if (error) throw error;

      return NextResponse.json({ reserva: atualizada, message: "PIX confirmado e lançamento criado no Financeiro." });
    }

    if (acao === "cancelar") {
      if (reserva.status === "cancelada") {
        return NextResponse.json({ ok: true, message: "Reserva já estava cancelada." });
      }

      const { data: atualizada, error } = await db
        .from("reservas")
        .update({
          status: "cancelada",
          motivo_cancelamento: String(body.motivo || "Pagamento PIX não confirmado."),
          cancelado_em: new Date().toISOString(),
          cancelado_por: auth.usuario.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pendente")
        .select("*")
        .single();
      if (error) throw error;

      return NextResponse.json({ reserva: atualizada, message: "Reserva cancelada. O horário voltou a ficar disponível." });
    }

    return NextResponse.json({ error: "Ação de reserva inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao atualizar reserva." },
      { status: 500 },
    );
  }
}
