import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const PAGAMENTOS_DB = ["pix", "debito_em_conta", "boleto", "dinheiro", "transferencia", "cartao", "outro"] as const;
type PagamentoDb = (typeof PAGAMENTOS_DB)[number];
type PagamentoEntrada = "pix" | "dinheiro" | "transferencia" | "pendente";

function erroBanco(error: unknown) {
  const e = error as { message?: string; details?: string; hint?: string; code?: string };
  return [e?.message, e?.details, e?.hint, e?.code ? `Código ${e.code}` : ""]
    .filter(Boolean)
    .join(" — ");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizarTexto(valor: unknown) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizarEspacoBanco(row: Record<string, unknown>) {
  const categoriaBruta = normalizarTexto(row.categoria ?? row.categoria_espaco ?? row.tipo);
  const nome = String(row.nome ?? "").trim();

  let categoria: "esporte" | "lazer" | "eventos" = "lazer";
  if (categoriaBruta.includes("esport") || categoriaBruta.includes("quadra") || normalizarTexto(nome).includes("quadra")) {
    categoria = "esporte";
  } else if (categoriaBruta.includes("event") || categoriaBruta.includes("salao") || normalizarTexto(nome).includes("salao")) {
    categoria = "eventos";
  }

  const cobrancaBruta = normalizarTexto(
    row.cobranca ?? row.tipo_cobranca ?? row.unidade_cobranca ?? row.forma_cobranca ?? row.tipo,
  );
  const cobranca: "hora" | "diaria" = cobrancaBruta.includes("diar") || cobrancaBruta.includes("dia") ? "diaria" : "hora";

  const precoBase = Number(
    cobranca === "diaria" ? row.preco_diaria ?? row.valor_diaria : row.preco_hora ?? row.valor_hora,
  );

  const precoSocio = Number(
    row.preco_socio ??
      row.valor_socio ??
      row.preco_associado ??
      row.valor_associado ??
      row.preco ??
      row.valor ??
      (Number.isFinite(precoBase) ? precoBase : 0),
  ) || 0;

  const precoNaoSocio = Number(
    row.preco_nao_socio ?? row.valor_nao_socio ?? row.preco_nao_associado ?? row.valor_nao_associado ?? 0,
  ) || 0;

  const permiteNaoSocio = Boolean(
    row.permite_nao_socio ?? row.permiteNaoSocio ?? row.nao_socio_permitido ?? precoNaoSocio > 0,
  );

  return {
    id: String(row.id ?? ""),
    nome,
    categoria,
    cobranca,
    precoSocio,
    precoNaoSocio,
    permiteNaoSocio: permiteNaoSocio && precoNaoSocio > 0,
    capacidade: row.capacidade == null ? undefined : String(row.capacidade),
    ativo: row.ativo !== false,
  };
}

async function resolverEspacoId(db: any, informado: string, nome: string) {
  const valor = informado.trim();
  if (UUID_RE.test(valor)) {
    const { data, error } = await db.from("espacos").select("id,nome").eq("id", valor).limit(1);
    if (error) throw error;
    if (data?.[0]?.id) return String(data[0].id);
  }

  const { data, error } = await db.from("espacos").select("id,nome").limit(1000);
  if (error) throw error;

  const alvo = normalizarTexto(nome);
  const encontrado = (data || []).find((item: { id?: unknown; nome?: unknown }) => normalizarTexto(item?.nome) === alvo);
  if (encontrado?.id) return String(encontrado.id);

  const disponiveis = (data || [])
    .map((item: { nome?: unknown }) => String(item.nome ?? "").trim())
    .filter(Boolean)
    .slice(0, 20);

  throw new Error(
    `O espaço "${nome}" não foi encontrado na tabela de espaços.${disponiveis.length ? ` Espaços cadastrados: ${disponiveis.join(", ")}.` : " A tabela de espaços está sem registros."}`,
  );
}

function dividirHorario(horario: string) {
  const [inicio, fim] = horario.split("-").map((v) => v.trim());
  return { inicio: inicio || horario.trim(), fim: fim || inicio || horario.trim() };
}

function statusFrontend(situacao: string | null | undefined) {
  const v = String(situacao || "").toLowerCase();
  if (v === "cancelada") return "cancelada" as const;
  if (v === "confirmada" || v === "utilizada") return "confirmada" as const;
  return "pendente" as const;
}

function pagamentoFrontend(value: unknown) {
  if (value === "pix" || value === "dinheiro" || value === "transferencia") return value;
  return "pendente" as const;
}

function normalizarReserva(dbRow: Record<string, unknown>) {
  const espacoRel = Array.isArray(dbRow.espacos) ? dbRow.espacos[0] : dbRow.espacos as Record<string, unknown> | undefined;
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
    status: statusFrontend(String(dbRow.situacao || "")),
    pagamento: pagamentoFrontend(dbRow.tipo_pagamento),
  };
}

async function assinaturaComprovante(db: any, path: string | null) {
  if (!path) return null;
  const { data } = await db.storage.from("comprovantes-financeiro").createSignedUrl(path, 60 * 60);
  return data?.signedUrl || null;
}

async function verificarMovimentacao(db: any, reservaId: string) {
  const { data, error } = await db
    .from("movimentacoes_financeiras")
    .select("id,valor,forma_pagamento")
    .eq("origem_tipo", "reserva")
    .eq("origem_id", reservaId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function registrarFinanceiro(
  db: any,
  reserva: Record<string, any>,
  contaBancariaId: string,
  usuarioId: string,
  formaPagamento: "pix" | "dinheiro",
) {
  if (!contaBancariaId) throw new Error("Informe a conta bancária/caixa que recebeu o pagamento.");

  const { data: conta, error: contaError } = await db
    .from("contas_bancarias")
    .select("id,nome,banco,ativo")
    .eq("id", contaBancariaId)
    .eq("ativo", true)
    .maybeSingle();
  if (contaError) throw contaError;
  if (!conta) throw new Error("Conta bancária/caixa não encontrada ou inativa.");

  const existente = await verificarMovimentacao(db, String(reserva.id));
  if (existente) return existente;

  const normalizada = normalizarReserva(reserva) as Record<string, any>;
  const conciliado = true;
  const { data: movimento, error } = await db
    .from("movimentacoes_financeiras")
    .insert({
      conta_bancaria_id: contaBancariaId,
      conta_destino_id: null,
      grupo_transferencia: null,
      tipo: "entrada",
      categoria: "Reserva",
      descricao: `Reserva - ${normalizada.nome || "Responsável"}${normalizada.data ? ` - ${normalizada.data}` : ""}`,
      valor: Number(normalizada.valor || 0),
      data_movimentacao: normalizada.data || new Date().toISOString().slice(0, 10),
      forma_pagamento: formaPagamento,
      origem_tipo: "reserva",
      origem_id: String(reserva.id),
      socio_id: reserva.socio_id || null,
      dependente_id: reserva.dependente_id || null,
      comprovante_url: reserva.comprovante_url || null,
      conciliado,
      data_conciliacao: conciliado ? new Date().toISOString() : null,
      created_by: usuarioId,
      observacoes:
        formaPagamento === "pix"
          ? `Pagamento PIX confirmado após conferência do crédito no banco. Reserva ${reserva.id}. Conta: ${conta.nome}.`
          : `Pagamento em dinheiro recebido na portaria. Reserva ${reserva.id}. Caixa/conta: ${conta.nome}.`,
    })
    .select("*")
    .single();

  if (error) throw error;
  return movimento;
}

function selecionarCampoExistente(row: Record<string, unknown>, candidates: string[]) {
  return candidates.find((key) => Object.prototype.hasOwnProperty.call(row, key));
}

async function atualizarEspaco(db: any, body: Record<string, unknown>) {
  const id = String(body.id || "").trim();
  if (!id) throw new Error("Espaço não informado.");

  const { data: atual, error: buscaError } = await db.from("espacos").select("*").eq("id", id).maybeSingle();
  if (buscaError) throw buscaError;
  if (!atual) throw new Error("Espaço não encontrado.");

  const row = atual as Record<string, unknown>;
  const precoSocio = Math.max(0, Number(body.preco_socio ?? 0));
  const precoNaoSocio = Math.max(0, Number(body.preco_nao_socio ?? 0));
  const permiteNaoSocio = Boolean(body.permite_nao_socio) && precoNaoSocio > 0;
  const cobranca = normalizarEspacoBanco(row).cobranca;

  const update: Record<string, unknown> = {};
  const campoSocio = selecionarCampoExistente(row, ["preco_socio", "valor_socio", "preco_associado", "valor_associado"]);
  const campoNaoSocio = selecionarCampoExistente(row, ["preco_nao_socio", "valor_nao_socio", "preco_nao_associado", "valor_nao_associado"]);
  const campoPermissao = selecionarCampoExistente(row, ["permite_nao_socio", "permiteNaoSocio", "nao_socio_permitido"]);

  if (campoSocio) update[campoSocio] = precoSocio;
  else {
    const campoBase = cobranca === "diaria"
      ? selecionarCampoExistente(row, ["preco_diaria", "valor_diaria"])
      : selecionarCampoExistente(row, ["preco_hora", "valor_hora"]);
    if (campoBase) update[campoBase] = precoSocio;
  }
  if (campoNaoSocio) update[campoNaoSocio] = precoNaoSocio;
  if (campoPermissao) update[campoPermissao] = permiteNaoSocio;

  if (!Object.keys(update).length) throw new Error("Não encontrei no banco os campos de preço/permissão deste espaço.");

  const { data, error } = await db.from("espacos").update(update).eq("id", id).select("*").single();
  if (error) throw error;
  return normalizarEspacoBanco(data as Record<string, unknown>);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = String(url.searchParams.get("status") || "").trim();
    const publico = url.searchParams.get("publico") === "1";

    if (!publico) {
      const auth = await requireRoles(request, ["funcionario", "administrador_master", "administrador"]);
      if ("response" in auth) return auth.response;
    }

    const db = getServiceClient();
    let query = publico
      ? db.from("reservas").select("id,espaco_id,data_reserva,hora_inicio,hora_fim,situacao,tipo_pagamento")
      : db.from("reservas").select("*,espacos:espaco_id(id,nome)");
    query = query.order("created_at", { ascending: false });

    if (status === "cancelada") query = query.eq("situacao", "cancelada");
    else if (status === "confirmada") query = query.in("situacao", ["confirmada", "utilizada"]);
    else if (status === "pendente") query = query.in("situacao", ["solicitada", "aguardando_pagamento"]);

    const [{ data, error }, { data: espacosDb, error: erroEspacos }] = await Promise.all([
      query,
      db.from("espacos").select("*").order("nome", { ascending: true }),
    ]);

    if (error) throw error;
    if (erroEspacos) throw erroEspacos;

    const reservas = await Promise.all(
      (data || []).map(async (r: Record<string, unknown>) => ({
        ...normalizarReserva(r),
        ...(publico ? {} : {
          comprovante_url: await assinaturaComprovante(db, r.comprovante_url ? String(r.comprovante_url) : null),
          comprovante_status: r.comprovante_status || null,
          comprovante_nome: r.comprovante_nome || null,
        }),
      })),
    );

    const espacos = (espacosDb || [])
      .map((row: Record<string, unknown>) => normalizarEspacoBanco(row))
      .filter((espaco: ReturnType<typeof normalizarEspacoBanco>) => espaco.id && espaco.nome && espaco.ativo);

    let contas: unknown[] = [];
    if (!publico) {
      const { data: contasDb, error: erroContas } = await db
        .from("contas_bancarias")
        .select("id,nome,banco,ativo")
        .eq("ativo", true)
        .order("nome");
      if (erroContas) throw erroContas;
      contas = contasDb || [];
    }

    return NextResponse.json({ reservas, espacos, contas_bancarias: contas });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao carregar reservas." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["funcionario", "administrador_master", "administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const db = getServiceClient();

    const espacoInformado = String(body.espaco_id || "").trim();
    const espacoNome = String(body.espaco_nome || "").trim();
    const data = String(body.data || "").trim();
    const horario = String(body.horario || "").trim();
    const nome = String(body.nome || "").trim();
    const pagamento = String(body.pagamento || "pendente") as PagamentoEntrada;
    const valor = Number(body.valor || 0);
    const contaBancariaId = String(body.conta_bancaria_id || "").trim();

    if (!espacoInformado || !espacoNome || !data || !horario || !nome) {
      return NextResponse.json({ error: "Espaço, data, horário e nome são obrigatórios." }, { status: 400 });
    }

    if (!["pix", "dinheiro", "transferencia", "pendente"].includes(pagamento)) {
      return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    }

    const espacoId = await resolverEspacoId(db, espacoInformado, espacoNome);
    const { inicio, fim } = dividirHorario(horario);
    const tipoPagamento: PagamentoDb | null =
      pagamento === "pendente" ? null : (pagamento as PagamentoDb);
    const situacao = pagamento === "pix" ? "solicitada" : "confirmada";

    const dados: Record<string, unknown> = {
      espaco_id: espacoId,
      socio_id: body.socio_id || null,
      dependente_id: body.dependente_id || null,
      responsavel_nome: nome,
      data_reserva: data,
      hora_inicio: inicio,
      hora_fim: fim,
      valor: Number.isFinite(valor) ? valor : 0,
      situacao,
      tipo_pagamento: tipoPagamento,
      matricula: body.matricula == null ? null : String(body.matricula),
      tipo_pessoa: body.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
      comprovante_url: null,
      comprovante_status: null,
      motivo_recusa: null,
    };

    const { data: reserva, error } = await db.from("reservas").insert(dados).select("*").single();
    if (error) {
      if (String(error.code) === "23505") {
        return NextResponse.json({ error: "Este espaço e horário já estão reservados." }, { status: 409 });
      }
      throw error;
    }

    try {
      if (pagamento === "dinheiro") {
        if (!contaBancariaId) throw new Error("Selecione a conta/caixa que recebeu o dinheiro.");
        const movimento = await registrarFinanceiro(db, reserva, contaBancariaId, auth.usuario.id, "dinheiro");
        try {
          const { data: atualizada, error: updateError } = await db
            .from("reservas")
            .update({ data_pagamento: new Date().toISOString().slice(0, 10) })
            .eq("id", reserva.id)
            .select("*")
            .single();
          if (updateError) throw updateError;
          return NextResponse.json({ reserva: normalizarReserva(atualizada) });
        } catch (updateError) {
          if (movimento?.id) await db.from("movimentacoes_financeiras").delete().eq("id", movimento.id);
          throw updateError;
        }
      }
    } catch (error) {
      await db.from("reservas").delete().eq("id", reserva.id);
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

export async function PATCH(request: Request) {
  const auth = await requireRoles(request, ["funcionario", "administrador_master", "administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id || "").trim();
    const acao = String(body.acao || "").trim();
    if (!id) return NextResponse.json({ error: "Reserva não informada." }, { status: 400 });

    const db = getServiceClient();

    if (acao === "editar_espaco") {
      if (!["administrador", "administrador_master"].includes(auth.usuario.perfil)) {
        return NextResponse.json({ error: "Somente administradores podem configurar os espaços." }, { status: 403 });
      }
      const espaco = await atualizarEspaco(db, body);
      return NextResponse.json({ espaco });
    }

    const { data: reserva, error: erroBusca } = await db.from("reservas").select("*").eq("id", id).maybeSingle();
    if (erroBusca) throw erroBusca;
    if (!reserva) return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });

    if (acao === "confirmar_pix") {
      if (!["administrador", "administrador_master"].includes(auth.usuario.perfil)) {
        return NextResponse.json({ error: "Somente administradores podem confirmar o PIX." }, { status: 403 });
      }
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

      const movimento = await registrarFinanceiro(db, reserva, contaBancariaId, auth.usuario.id, "pix");
      const agora = new Date().toISOString();
      try {
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
      } catch (updateError) {
        if (movimento?.id) await db.from("movimentacoes_financeiras").delete().eq("id", movimento.id);
        throw updateError;
      }
    }

    if (acao === "estornar_pagamento") {
      if (!['administrador', 'administrador_master'].includes(auth.usuario.perfil)) {
        return NextResponse.json({ error: "Somente administradores podem estornar pagamentos de reservas." }, { status: 403 });
      }

      if (!["confirmada", "utilizada"].includes(String(reserva.situacao))) {
        return NextResponse.json({ error: "Somente reservas confirmadas podem ter o pagamento estornado." }, { status: 409 });
      }

      const { data: movimento, error: movimentoError } = await db
        .from("movimentacoes_financeiras")
        .select("id,conta_bancaria_id,tipo,valor,forma_pagamento,conciliado,descricao")
        .eq("origem_tipo", "reserva")
        .eq("origem_id", id)
        .maybeSingle();

      if (movimentoError) throw movimentoError;
      if (!movimento) {
        return NextResponse.json({ error: "Não encontrei o lançamento financeiro desta reserva." }, { status: 404 });
      }
      if (String(movimento.tipo) !== "entrada") {
        return NextResponse.json({ error: "O lançamento da reserva não é uma entrada válida para estorno." }, { status: 409 });
      }

      const { data: estornoExistente, error: estornoBuscaError } = await db
        .from("movimentacoes_financeiras")
        .select("id")
        .eq("origem_tipo", "estorno_reserva")
        .eq("origem_id", id)
        .limit(1)
        .maybeSingle();

      if (estornoBuscaError) throw estornoBuscaError;
      if (estornoExistente) {
        return NextResponse.json({ error: "Esta reserva já possui estorno financeiro." }, { status: 409 });
      }

      const valorEstorno = Number(movimento.valor || 0);
      if (!(valorEstorno > 0)) {
        return NextResponse.json({ error: "O valor do lançamento não é válido para estorno." }, { status: 400 });
      }

      const agora = new Date().toISOString();
      const motivoEstorno = String(body.motivo || "Não informado").trim().slice(0, 500);
      const { data: movimentoEstorno, error: inserirEstornoError } = await db
        .from("movimentacoes_financeiras")
        .insert({
          conta_bancaria_id: movimento.conta_bancaria_id,
          conta_destino_id: null,
          grupo_transferencia: null,
          tipo: "saida",
          categoria: "Estorno de Reserva",
          descricao: `Estorno de reserva - ${String(reserva.responsavel_nome || "Responsável")}`,
          valor: valorEstorno,
          data_movimentacao: agora.slice(0, 10),
          forma_pagamento: movimento.forma_pagamento || null,
          origem_tipo: "estorno_reserva",
          origem_id: id,
          socio_id: reserva.socio_id || null,
          dependente_id: reserva.dependente_id || null,
          comprovante_url: null,
          conciliado: false,
          data_conciliacao: null,
          created_by: auth.usuario.id,
          observacoes: `Estorno do pagamento da reserva ${id}. Lançamento original: ${movimento.id}. Reservado por ${auth.usuario.nome_exibicao || "Administrador"}. Motivo: ${motivoEstorno}.`,
        })
        .select("*")
        .single();

      if (inserirEstornoError) throw inserirEstornoError;

      try {
        const { data: atualizada, error: atualizarReservaError } = await db
          .from("reservas")
          .update({
            situacao: "cancelada",
            motivo_recusa: "Pagamento estornado pela administração.",
          })
          .eq("id", id)
          .select("*")
          .single();

        if (atualizarReservaError) throw atualizarReservaError;
        return NextResponse.json({
          reserva: normalizarReserva(atualizada),
          movimento: movimentoEstorno,
          message: "Pagamento estornado e reserva cancelada com sucesso.",
        });
      } catch (updateError) {
        if (movimentoEstorno?.id) await db.from("movimentacoes_financeiras").delete().eq("id", movimentoEstorno.id);
        throw updateError;
      }
    }

    if (acao === "cancelar") {
      const movimento = await verificarMovimentacao(db, id);
      if (movimento) {
        return NextResponse.json({ error: "Esta reserva já possui lançamento no Financeiro. Faça o estorno no Financeiro antes de cancelar." }, { status: 409 });
      }
      const { data: atualizada, error } = await db.from("reservas").update({ situacao: "cancelada" }).eq("id", id).select("*").single();
      if (error) throw error;
      return NextResponse.json({ reserva: normalizarReserva(atualizada), message: "Reserva cancelada." });
    }

    if (acao === "editar") {
      const movimento = await verificarMovimentacao(db, id);
      if (movimento) {
        return NextResponse.json({ error: "Esta reserva já possui lançamento no Financeiro e não pode ser alterada. Faça o estorno primeiro." }, { status: 409 });
      }

      const espacoInformado = String(body.espaco_id || "").trim();
      const espacoNome = String(body.espaco_nome || "").trim();
      const data = String(body.data || "").trim();
      const horario = String(body.horario || "").trim();
      const nome = String(body.nome || "").trim();
      const pagamento = String(body.pagamento || "pendente") as PagamentoEntrada;
      const valor = Number(body.valor || 0);
      if (!espacoInformado || !espacoNome || !data || !horario || !nome) {
        return NextResponse.json({ error: "Espaço, data, horário e nome são obrigatórios." }, { status: 400 });
      }
      if (!["pix", "dinheiro", "transferencia", "pendente"].includes(pagamento)) {
        return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
      }

      const espacoId = await resolverEspacoId(db, espacoInformado, espacoNome);
      const { inicio, fim } = dividirHorario(horario);
      const tipoPagamento: PagamentoDb | null = pagamento === "pendente" ? null : (pagamento as PagamentoDb);
      const situacao = pagamento === "pix" ? "solicitada" : "confirmada";
      const contaBancariaId = String(body.conta_bancaria_id || "").trim();

      if (pagamento === "dinheiro" && !contaBancariaId) {
        return NextResponse.json({ error: "Selecione a conta/caixa que recebeu o dinheiro." }, { status: 400 });
      }

      const dadosAntes = {
        espaco_id: reserva.espaco_id ?? null,
        socio_id: reserva.socio_id ?? null,
        dependente_id: reserva.dependente_id ?? null,
        responsavel_nome: reserva.responsavel_nome ?? null,
        data_reserva: reserva.data_reserva ?? null,
        hora_inicio: reserva.hora_inicio ?? null,
        hora_fim: reserva.hora_fim ?? null,
        valor: reserva.valor ?? 0,
        situacao: reserva.situacao ?? null,
        tipo_pagamento: reserva.tipo_pagamento ?? null,
        matricula: reserva.matricula ?? null,
        tipo_pessoa: reserva.tipo_pessoa ?? null,
        comprovante_url: reserva.comprovante_url ?? null,
        comprovante_status: reserva.comprovante_status ?? null,
        motivo_recusa: reserva.motivo_recusa ?? null,
        data_pagamento: reserva.data_pagamento ?? null,
      };

      const { data: atualizada, error } = await db
        .from("reservas")
        .update({
          espaco_id: espacoId,
          socio_id: body.socio_id || null,
          dependente_id: body.dependente_id || null,
          responsavel_nome: nome,
          data_reserva: data,
          hora_inicio: inicio,
          hora_fim: fim,
          valor: Number.isFinite(valor) ? valor : 0,
          situacao,
          tipo_pagamento: tipoPagamento,
          matricula: body.matricula == null ? null : String(body.matricula),
          tipo_pessoa: body.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
          comprovante_url: null,
          comprovante_status: null,
          motivo_recusa: null,
          data_pagamento: null,
        })
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        if (String(error.code) === "23505") {
          return NextResponse.json({ error: "Este espaço e horário já estão reservados." }, { status: 409 });
        }
        throw error;
      }

      try {
        if (pagamento === "dinheiro") {
          const movimento = await registrarFinanceiro(db, atualizada, contaBancariaId, auth.usuario.id, "dinheiro");
          try {
            const { error: pagamentoError } = await db.from("reservas").update({ data_pagamento: new Date().toISOString().slice(0, 10) }).eq("id", id);
            if (pagamentoError) throw pagamentoError;
          } catch (pagamentoError) {
            if (movimento?.id) await db.from("movimentacoes_financeiras").delete().eq("id", movimento.id);
            throw pagamentoError;
          }
        }
      } catch (financeError) {
        await db.from("reservas").update(dadosAntes).eq("id", id);
        throw financeError;
      }

      return NextResponse.json({ reserva: normalizarReserva(atualizada), message: "Reserva atualizada." });
    }

    return NextResponse.json({ error: "Ação de reserva inválida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : erroBanco(error) || "Erro ao atualizar reserva." },
      { status: 500 },
    );
  }
}
