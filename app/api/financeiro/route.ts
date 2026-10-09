import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const competencia = searchParams.get("competencia");

    let movimentos = supabase
      .from("movimentacoes_financeiras")
      .select("id,conta_bancaria_id,conta_destino_id,grupo_transferencia,tipo,categoria,descricao,valor,data_movimentacao,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes,created_at,created_by")
      .order("data_movimentacao", { ascending: false })
      .order("created_at", { ascending: false });

    const filtro = String(competencia || "").trim();
    if (/^\d{4}-\d{2}$/.test(filtro)) {
      const [ano, mes] = filtro.split("-").map(Number);
      const proximoAno = mes === 12 ? ano + 1 : ano;
      const proximoMes = mes === 12 ? 1 : mes + 1;
      const inicioProximoMes = `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`;
      movimentos = movimentos.gte("data_movimentacao", `${filtro}-01`).lt("data_movimentacao", inicioProximoMes);
    }

    const [{ data: contas, error: contasError }, { data: movimentosData, error: movimentosError }] = await Promise.all([
      supabase.from("contas_bancarias").select("id,nome,banco,agencia,conta,saldo_inicial,data_saldo_inicial,ativo,observacoes").eq("ativo", true).order("nome", { ascending: true }),
      movimentos,
    ]);

    if (contasError) throw contasError;
    if (movimentosError) throw movimentosError;

    // Resolve o responsável no servidor com service role. A consulta feita
    // pelo navegador pode ser filtrada por RLS e deixar o nome em branco.
    const listaMovimentos = movimentosData || [];
    const usuarioIds = Array.from(new Set(
      listaMovimentos
        .map((movimento) => movimento.created_by)
        .filter((id): id is string => Boolean(id))
    ));
    const usuariosPorId = new Map<string, { nome: string | null; email: string | null }>();

    if (usuarioIds.length > 0) {
      const { data: usuarios, error: usuariosError } = await supabase
        .from("usuarios_sistema")
        .select("id,nome_exibicao,email")
        .in("id", usuarioIds);
      if (usuariosError) throw usuariosError;
      for (const usuario of usuarios || []) {
        usuariosPorId.set(String(usuario.id), {
          nome: usuario.nome_exibicao || null,
          email: usuario.email || null,
        });
      }
    }

    const movimentosComResponsavel = listaMovimentos.map((movimento) => {
      const usuario = movimento.created_by
        ? usuariosPorId.get(String(movimento.created_by))
        : null;
      return {
        ...movimento,
        created_by_nome: usuario?.nome || null,
        created_by_email: usuario?.email || null,
      };
    });

    return NextResponse.json({ contas: contas || [], movimentos: movimentosComResponsavel });
  } catch (error) {
    console.error("[api/financeiro][GET]", error);
    return NextResponse.json(
      { error: "Não foi possível carregar o financeiro." },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

const TIPOS_MOVIMENTO = new Set(["entrada", "saida"]);
const FORMAS_PAGAMENTO = new Set(["pix", "debito_em_conta", "boleto", "dinheiro", "transferencia", "outro"]);
const TIPOS_COMPROVANTE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const BUCKET_COMPROVANTES = "comprovantes-financeiro";

async function garantirBucketComprovantes(db: ReturnType<typeof getServiceClient>) {
  const atual = await db.storage.getBucket(BUCKET_COMPROVANTES);
  if (!atual.error) return;
  const criado = await db.storage.createBucket(BUCKET_COMPROVANTES, {
    public: true,
    fileSizeLimit: "8MB",
    allowedMimeTypes: [...TIPOS_COMPROVANTE],
  });
  if (criado.error && !/already exists/i.test(criado.error.message)) {
    throw new Error(criado.error.message);
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const acao = String(form.get("acao") || "").trim().toLowerCase();
      if (acao !== "salvar_movimento") {
        return NextResponse.json({ error: "Ação financeira inválida." }, { status: 400 });
      }

      const contaId = String(form.get("conta_bancaria_id") || "").trim();
      const descricao = String(form.get("descricao") || "").trim();
      const tipo = String(form.get("tipo") || "").trim().toLowerCase();
      const categoria = String(form.get("categoria") || "").trim();
      const forma = String(form.get("forma_pagamento") || "").trim().toLowerCase();
      const dataMovimentacao = String(form.get("data_movimentacao") || "").trim();
      const observacoes = String(form.get("observacoes") || "").trim();
      const valor = Number(String(form.get("valor") || "0").replace(",", "."));
      const arquivo = form.get("arquivo");

      if (!contaId || !descricao || !TIPOS_MOVIMENTO.has(tipo) || !Number.isFinite(valor) || valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dataMovimentacao)) {
        return NextResponse.json({ error: "Informe conta, tipo, descrição, valor e data válidos." }, { status: 400 });
      }
      if (forma && !FORMAS_PAGAMENTO.has(forma)) {
        return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
      }

      const { data: conta, error: contaError } = await db
        .from("contas_bancarias")
        .select("id,ativo")
        .eq("id", contaId)
        .maybeSingle();
      if (contaError) throw contaError;
      if (!conta || conta.ativo !== true) {
        return NextResponse.json({ error: "Conta bancária não encontrada ou inativa." }, { status: 400 });
      }

      let comprovantePath: string | null = null;
      if (arquivo instanceof File && arquivo.size > 0) {
        if (!TIPOS_COMPROVANTE.has(arquivo.type) || arquivo.size > 8 * 1024 * 1024) {
          return NextResponse.json({ error: "Comprovante inválido. Use JPG, PNG, WEBP ou PDF até 8 MB." }, { status: 400 });
        }
        await garantirBucketComprovantes(db);
        const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
        const caminho = `movimentos/${crypto.randomUUID()}.${ext}`;
        const upload = await db.storage.from(BUCKET_COMPROVANTES).upload(caminho, new Uint8Array(await arquivo.arrayBuffer()), {
          contentType: arquivo.type,
          upsert: false,
        });
        if (upload.error) throw upload.error;
        comprovantePath = caminho;
      }

      const { data, error } = await db
        .from("movimentacoes_financeiras")
        .insert({
          created_by: auth.usuario.id,
          conta_bancaria_id: contaId,
          conta_destino_id: null,
          grupo_transferencia: null,
          tipo,
          categoria: categoria || null,
          descricao,
          valor: Number(valor.toFixed(2)),
          data_movimentacao: dataMovimentacao,
          forma_pagamento: forma || null,
          origem_tipo: "manual",
          origem_id: null,
          socio_id: null,
          dependente_id: null,
          comprovante_url: comprovantePath,
          conciliado: false,
          data_conciliacao: null,
          observacoes: observacoes || null,
        })
        .select("id,conta_bancaria_id,conta_destino_id,grupo_transferencia,tipo,categoria,descricao,valor,data_movimentacao,created_at,created_by,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes")
        .single();
      if (error) {
        if (comprovantePath) await db.storage.from(BUCKET_COMPROVANTES).remove([comprovantePath]).catch(() => undefined);
        throw error;
      }
      return NextResponse.json({ ok: true, movimento: data });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const acao = String(body.acao || "").trim().toLowerCase();

    if (acao === "salvar_conta") {
      const id = String(body.id || "").trim();
      const nome = String(body.nome || "").trim();
      const banco = String(body.banco || "").trim() || null;
      const agencia = String(body.agencia || "").trim() || null;
      const conta = String(body.conta || "").trim() || null;
      const observacoes = String(body.observacoes || "").trim() || null;
      const saldoInicial = Number(String(body.saldo_inicial ?? "0").replace(",", "."));
      const dataSaldoInicial = String(body.data_saldo_inicial || "").trim() || null;
      if (!nome || !Number.isFinite(saldoInicial) || saldoInicial < 0) {
        return NextResponse.json({ error: "Informe nome e saldo inicial válidos." }, { status: 400 });
      }
      const payload = { nome, banco, agencia, conta, saldo_inicial: Number(saldoInicial.toFixed(2)), data_saldo_inicial: dataSaldoInicial, ativo: true, observacoes };
      const result = id
        ? await db.from("contas_bancarias").update(payload).eq("id", id).select("id,nome,banco,agencia,conta,saldo_inicial,data_saldo_inicial,ativo,observacoes").single()
        : await db.from("contas_bancarias").insert(payload).select("id,nome,banco,agencia,conta,saldo_inicial,data_saldo_inicial,ativo,observacoes").single();
      if (result.error) throw result.error;
      return NextResponse.json({ ok: true, conta: result.data });
    }

    if (acao === "conferir_saldo") {
      const contaId = String(body.conta_bancaria_id || "").trim();
      const saldoBanco = Number(String(body.saldo_banco ?? "").replace(",", "."));
      const data = String(body.data_conferencia || "").trim();
      const observacao = String(body.observacao || "Conferência do saldo bancário").trim().slice(0, 500);
      if (!contaId || !Number.isFinite(saldoBanco) || saldoBanco < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return NextResponse.json({ error: "Dados de conferência inválidos." }, { status: 400 });
      }
      const { data: conta, error: contaError } = await db.from("contas_bancarias").select("id,ativo,saldo_inicial,data_saldo_inicial").eq("id", contaId).maybeSingle();
      if (contaError) throw contaError;
      if (!conta || conta.ativo !== true) return NextResponse.json({ error: "Conta bancária não encontrada ou inativa." }, { status: 404 });
      const { data: movimentos, error: movimentosError } = await db.from("movimentacoes_financeiras").select("tipo,valor").eq("conta_bancaria_id", contaId);
      if (movimentosError) throw movimentosError;
      const saldoSistema = Number((Number(conta.saldo_inicial || 0) + (movimentos || []).reduce((sum, m) => sum + (String(m.tipo) === "entrada" ? Number(m.valor || 0) : String(m.tipo) === "saida" ? -Number(m.valor || 0) : 0), 0)).toFixed(2));
      const diferenca = Number((saldoBanco - saldoSistema).toFixed(2));
      const { data: conferencia, error } = await db.from("conferencias_bancarias").insert({ conta_bancaria_id: contaId, saldo_sistema: saldoSistema, saldo_banco: Number(saldoBanco.toFixed(2)), diferenca, data_conferencia: data, observacao: observacao || "Conferência do saldo bancário" }).select().single();
      if (error) throw error;
      return NextResponse.json({ ok: true, conferencia });
    }

    if (acao === "transferencia") {
      const origemId = String(body.conta_origem_id || "").trim();
      const destinoId = String(body.conta_destino_id || "").trim();
      const descricao = String(body.descricao || "Transferência entre contas").trim();
      const data = String(body.data_movimentacao || "").trim();
      const observacoes = String(body.observacoes || "").trim() || null;
      const valor = Number(String(body.valor || "0").replace(",", "."));
      if (!origemId || !destinoId || origemId === destinoId || !Number.isFinite(valor) || valor <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return NextResponse.json({ error: "Informe contas diferentes, valor e data válidos." }, { status: 400 });
      }
      const { data: contas, error: contasError } = await db.from("contas_bancarias").select("id,ativo").in("id", [origemId, destinoId]);
      if (contasError) throw contasError;
      if (!contas || contas.length !== 2 || contas.some((c) => c.ativo !== true)) return NextResponse.json({ error: "As duas contas precisam existir e estar ativas." }, { status: 400 });
      const grupo = crypto.randomUUID();
      const { data: movimento, error } = await db.from("movimentacoes_financeiras").insert({ created_by: auth.usuario.id, conta_bancaria_id: origemId, conta_destino_id: destinoId, grupo_transferencia: grupo, tipo: "transferencia", categoria: "Transferência interna", descricao, valor: Number(valor.toFixed(2)), data_movimentacao: data, forma_pagamento: "transferencia", origem_tipo: "transferencia", origem_id: null, socio_id: null, dependente_id: null, comprovante_url: null, conciliado: false, data_conciliacao: null, observacoes }).select("id,conta_bancaria_id,conta_destino_id,grupo_transferencia,tipo,categoria,descricao,valor,data_movimentacao,created_at,created_by,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, movimento });
    }

    return NextResponse.json({ error: "Ação financeira inválida." }, { status: 400 });
  } catch (error) {
    console.error("[api/financeiro][POST]", error);
    return NextResponse.json({ error: "Não foi possível registrar a operação financeira." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const acao = String(body.acao || "").trim().toLowerCase();

    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });

    const supabase = getServiceClient();

    if (acao === "conciliar_movimento") {
      const dataConciliacao = String(body.data_conciliacao || "").trim();
      const observacao = String(body.observacao || "").trim().slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataConciliacao)) {
        return NextResponse.json({ error: "Informe uma data de conciliação válida." }, { status: 400 });
      }

      const { data: movimento, error: buscaError } = await supabase
        .from("movimentacoes_financeiras")
        .select("id,conta_bancaria_id,conta_destino_id,tipo,categoria,descricao,valor,data_movimentacao,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes,created_at,created_by")
        .eq("id", id)
        .maybeSingle();

      if (buscaError) throw buscaError;
      if (!movimento) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
      if (movimento.conciliado) return NextResponse.json({ error: "Este lançamento já está conciliado." }, { status: 409 });

      const instante = new Date().toISOString();
      const nomeUsuario = auth.usuario.nome_exibicao || "Administrador";
      const usuarioId = auth.usuario.id;
      const blocoAuditoria = `[CONCILIACAO_BANCARIA] ${instante} | por: ${nomeUsuario} | usuario_id: ${usuarioId} | observação: ${observacao || "Conferido no extrato bancário."}`;
      const novasObservacoes = [String(movimento.observacoes || "").trim(), blocoAuditoria].filter(Boolean).join("\n");

      const { data: atualizado, error: atualizarError } = await supabase
        .from("movimentacoes_financeiras")
        .update({
          conciliado: true,
          data_conciliacao: dataConciliacao,
          observacoes: novasObservacoes,
        })
        .eq("id", id)
        .eq("conciliado", false)
        .select("id,conta_bancaria_id,conta_destino_id,grupo_transferencia,tipo,categoria,descricao,valor,data_movimentacao,created_at,created_by,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes")
        .maybeSingle();

      if (atualizarError) throw atualizarError;
      if (!atualizado) {
        return NextResponse.json({ error: "O lançamento foi conciliado por outra operação. Atualize a tela." }, { status: 409 });
      }

      return NextResponse.json({
        ok: true,
        movimento: atualizado,
        conciliado_por: { nome: nomeUsuario, usuario_id: usuarioId },
        message: "Conciliação registrada com sucesso. O lançamento foi conferido no extrato.",
      });
    }

    if (acao !== "estornar_movimento") {
      return NextResponse.json({ error: "Ação financeira inválida." }, { status: 400 });
    }

    const { data: original, error: buscaError } = await supabase
      .from("movimentacoes_financeiras")
      .select("id,conta_bancaria_id,conta_destino_id,tipo,categoria,descricao,valor,data_movimentacao,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,observacoes")
      .eq("id", id)
      .maybeSingle();

    if (buscaError) throw buscaError;
    if (!original) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });

    const origem = String(original.origem_tipo || "").toLowerCase();
    if (!["manual", "transferencia"].includes(origem)) {
      return NextResponse.json({ error: "Este lançamento deve ser estornado pelo módulo que o originou." }, { status: 409 });
    }

    if (origem.startsWith("estorno_")) {
      return NextResponse.json({ error: "Este lançamento já é um estorno." }, { status: 409 });
    }

    const { data: existente, error: existenteError } = await supabase
      .from("movimentacoes_financeiras")
      .select("id")
      .eq("origem_tipo", "estorno_movimento")
      .eq("origem_id", id)
      .limit(1);

    if (existenteError) throw existenteError;
    if (existente?.length) return NextResponse.json({ error: "Este lançamento já possui um estorno registrado." }, { status: 409 });

    const agoraData = new Date().toISOString().slice(0, 10);
    const agoraInstante = new Date().toISOString();
    const valor = Number(original.valor || 0);
    const motivoEstorno = String(body.motivo || "Não informado").trim().slice(0, 500) || "Não informado";
    const nomeEstorno = auth.usuario.nome_exibicao || "Administrador";
    const auditoriaEstorno = `[ESTORNO_FINANCEIRO] ${agoraInstante} | por: ${nomeEstorno} | usuario_id: ${auth.usuario.id} | motivo: ${motivoEstorno}`;
    if (!(valor > 0)) return NextResponse.json({ error: "O lançamento não possui um valor válido para estorno." }, { status: 400 });

    const base = {
      conta_destino_id: null,
      grupo_transferencia: null,
      categoria: "Estorno",
      descricao: `Estorno: ${String(original.descricao || "Lançamento financeiro")}`,
      valor,
      data_movimentacao: agoraData,
      forma_pagamento: original.forma_pagamento || null,
      origem_tipo: "estorno_movimento",
      origem_id: id,
      socio_id: original.socio_id || null,
      dependente_id: original.dependente_id || null,
      comprovante_url: null,
      conciliado: false,
      data_conciliacao: null,
      created_by: auth.usuario.id,
      observacoes: auditoriaEstorno,
    };

    if (String(original.tipo) === "transferencia") {
      if (!original.conta_destino_id) {
        return NextResponse.json({ error: "A transferência não possui conta de destino registrada." }, { status: 409 });
      }
      const { data, error } = await supabase
        .from("movimentacoes_financeiras")
        .insert({
          ...base,
          conta_bancaria_id: original.conta_destino_id,
          conta_destino_id: original.conta_bancaria_id,
          grupo_transferencia: crypto.randomUUID(),
          tipo: "transferencia",
          origem_tipo: "estorno_movimento",
          origem_id: id,
        })
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ ok: true, movimento: data, estornado_por: { nome: nomeEstorno, usuario_id: auth.usuario.id, instante: agoraInstante, motivo: motivoEstorno }, message: "Transferência estornada com sucesso." });
    }

    const tipo = String(original.tipo) === "entrada" ? "saida" : "entrada";
    const { data, error } = await supabase
      .from("movimentacoes_financeiras")
      .insert({ ...base, conta_bancaria_id: original.conta_bancaria_id, tipo })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, movimento: data, estornado_por: { nome: nomeEstorno, usuario_id: auth.usuario.id, instante: agoraInstante, motivo: motivoEstorno }, message: "Estorno registrado com sucesso. O histórico original foi preservado." });
  } catch (error) {
    console.error("[api/financeiro][PATCH]", error);
    return NextResponse.json({ error: "Não foi possível concluir a operação financeira." }, { status: 500 });
  }
}
