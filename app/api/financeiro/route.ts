import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const competencia = String(searchParams.get("competencia") || "").trim();
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const pageSize = Math.max(1, Math.min(100, Number(searchParams.get("page_size") || 50)));
    const dataInicio = searchParams.get("data_inicio") || null;
    const dataFim = searchParams.get("data_fim") || null;
    const contaId = searchParams.get("conta_id") || null;
    const tipo = searchParams.get("tipo") || "todos";
    const forma = searchParams.get("forma") || "todos";
    const conciliacao = searchParams.get("conciliacao") || "todos";
    const aba = searchParams.get("aba") || "fluxo";

    let competenciaInicio: string | null = null;
    let competenciaFim: string | null = null;
    if (/^\d{4}-\d{2}$/.test(competencia)) {
      const [ano, mes] = competencia.split("-").map(Number);
      const proxAno = mes === 12 ? ano + 1 : ano;
      const proxMes = mes === 12 ? 1 : mes + 1;
      competenciaInicio = `${competencia}-01`;
      competenciaFim = `${proxAno}-${String(proxMes).padStart(2, "0")}-01`;
    }

    const { data: resumo, error: resumoError } = await supabase.rpc("financeiro_listar_paginado", {
      p_page: page,
      p_page_size: pageSize,
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
      p_conta_id: contaId,
      p_tipo: tipo,
      p_forma: forma,
      p_conciliacao: conciliacao,
      p_aba: aba,
      p_competencia_inicio: competenciaInicio,
      p_competencia_fim: competenciaFim,
    });
    if (resumoError) throw resumoError;

    const [{ data: contas, error: contasError }] = await Promise.all([
      supabase.from("contas_bancarias")
        .select("id,nome,banco,agencia,conta,saldo_inicial,data_saldo_inicial,ativo,observacoes")
        .eq("ativo", true).order("nome", { ascending: true }),
    ]);
    if (contasError) throw contasError;

    const listaMovimentos = Array.isArray(resumo?.movimentos) ? resumo.movimentos : [];
    const movimentosTemporada = listaMovimentos.filter(
      (movimento: { origem_tipo?: string | null }) => String(movimento.origem_tipo || "").toLowerCase() === "temporada_parcela"
    );
    const idsParcelasTemporada = Array.from(new Set(
      movimentosTemporada.map((movimento: { origem_id?: string | null }) => String(movimento.origem_id || "").trim()).filter(Boolean)
    ));
    const idsMovimentosTemporada = movimentosTemporada.map((movimento: { id: string }) => String(movimento.id));

    let parcelasPorId: { id: string; numero: number | null; temporada_id: string | null; movimentacao_id: string | null }[] = [];
    let parcelasPorMovimento: { id: string; numero: number | null; temporada_id: string | null; movimentacao_id: string | null }[] = [];
    if (idsParcelasTemporada.length) {
      const resultado = await supabase.from("temporadas_parcelas")
        .select("id,numero,temporada_id,movimentacao_id").in("id", idsParcelasTemporada);
      if (resultado.error) throw resultado.error;
      parcelasPorId = resultado.data || [];
    }
    if (idsMovimentosTemporada.length) {
      const resultado = await supabase.from("temporadas_parcelas")
        .select("id,numero,temporada_id,movimentacao_id").in("movimentacao_id", idsMovimentosTemporada);
      if (resultado.error) throw resultado.error;
      parcelasPorMovimento = resultado.data || [];
    }
    const parcelas = [...parcelasPorId, ...parcelasPorMovimento];
    const parcelaPorId = new Map(parcelas.map((parcela) => [String(parcela.id), parcela]));
    const parcelaPorMovimento = new Map(parcelas.filter((parcela) => parcela.movimentacao_id).map((parcela) => [String(parcela.movimentacao_id), parcela]));
    const idsTemporadas = Array.from(new Set(parcelas.map((parcela) => String(parcela.temporada_id || "")).filter(Boolean)));
    const idsTemporadasLegadas = Array.from(new Set(movimentosTemporada.map((movimento: { origem_id?: string | null }) => String(movimento.origem_id || "").trim()).filter(Boolean)));
    const idsTodasTemporadas = Array.from(new Set([...idsTemporadas, ...idsTemporadasLegadas]));
    const { data: temporadas, error: temporadasError } = idsTodasTemporadas.length
      ? await supabase.from("temporadas").select("id,responsavel_nome,codigo,matricula").in("id", idsTodasTemporadas)
      : { data: [], error: null };
    if (temporadasError) throw temporadasError;
    const temporadaPorId = new Map((temporadas || []).map((temporada) => [String(temporada.id), temporada]));
    for (const movimento of movimentosTemporada) {
      const parcela = parcelaPorId.get(String(movimento.origem_id || "")) || parcelaPorMovimento.get(String(movimento.id));
      const temporada = parcela ? temporadaPorId.get(String(parcela.temporada_id || "")) : temporadaPorId.get(String(movimento.origem_id || ""));
      const nome = String(temporada?.responsavel_nome || "").trim();
      if (nome) movimento.descricao = parcela?.numero ? `Temporada — ${nome} — Parcela ${parcela.numero}` : `Temporada — ${nome}`;
      else if (/temporada/i.test(String(movimento.descricao || "")) && /[0-9a-f]{8}-[0-9a-f-]{27,}/i.test(String(movimento.descricao || ""))) {
        movimento.descricao = "Temporada — Responsável não identificado — Parcela a identificar";
      }
    }

    const usuarioIds = Array.from(new Set(listaMovimentos.map((movimento: { created_by?: string | null }) => movimento.created_by).filter(Boolean))) as string[];
    const usuariosPorId = new Map<string, string | null>();
    if (usuarioIds.length) {
      const { data: usuarios, error: usuariosError } = await supabase.from("usuarios_sistema")
        .select("id,nome_exibicao").in("id", usuarioIds);
      if (usuariosError) console.error("[api/financeiro][GET] Falha ao resolver responsáveis:", usuariosError);
      for (const usuario of usuarios || []) usuariosPorId.set(String(usuario.id), usuario.nome_exibicao || null);
    }
    const movimentosComResponsavel = listaMovimentos.map((movimento: { created_by?: string | null }) => ({
      ...movimento,
      created_by_nome: movimento.created_by ? usuariosPorId.get(String(movimento.created_by)) || null : null,
      created_by_email: null,
    }));

    return NextResponse.json({
      contas: contas || [],
      movimentos: movimentosComResponsavel,
      page,
      page_size: pageSize,
      total_count: Number(resumo?.total_count || 0),
      totais: resumo?.totais || { entradas: 0, saidas: 0, transferencias: 0, pendentes: 0 },
      saldos_por_conta: resumo?.saldos_por_conta || {},
    });
  } catch (error) {
    console.error("[api/financeiro][GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar o financeiro." }, { status: 500 });
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
      // Reutiliza o agregado calculado no PostgreSQL sobre o histórico completo.
      // Assim a conferência respeita o saldo de abertura e transferências entre contas,
      // sem baixar centenas/milhares de movimentações para o servidor Next.js.
      const { data: resumoSaldo, error: resumoSaldoError } = await db.rpc("financeiro_listar_paginado", {
        p_page: 1,
        p_page_size: 1,
        p_data_inicio: null,
        p_data_fim: null,
        p_conta_id: null,
        p_tipo: "todos",
        p_forma: "todos",
        p_conciliacao: "todos",
        p_aba: "fluxo",
        p_competencia_inicio: null,
        p_competencia_fim: null,
      });
      if (resumoSaldoError) throw resumoSaldoError;

      const resumo = (Array.isArray(resumoSaldo) ? resumoSaldo[0] : resumoSaldo) as
        | { saldos_por_conta?: Record<string, number | string | null> }
        | null;
      const saldosPorConta = resumo?.saldos_por_conta || {};
      const saldoBruto = Object.prototype.hasOwnProperty.call(saldosPorConta, contaId)
        ? saldosPorConta[contaId]
        : conta.saldo_inicial;
      const saldoSistema = Number(Number(saldoBruto || 0).toFixed(2));
      if (!Number.isFinite(saldoSistema)) {
        throw new Error("O banco não retornou um saldo válido para esta conta.");
      }

      const diferenca = Number((saldoBanco - saldoSistema).toFixed(2));
      const { data: conferencia, error: conferenciaError } = await db
        .from("conferencias_bancarias")
        .insert({
          conta_bancaria_id: contaId,
          saldo_sistema: saldoSistema,
          saldo_banco: Number(saldoBanco.toFixed(2)),
          diferenca,
          data_conferencia: data,
          observacao: observacao || "Conferência do saldo bancário",
          created_by: auth.usuario.id,
          created_by_nome: auth.usuario.nome_exibicao || "Administrador",
        })
        .select("id,conta_bancaria_id,saldo_sistema,saldo_banco,diferenca,data_conferencia,observacao,created_by,created_by_nome,created_at")
        .single();
      if (conferenciaError) {
        console.error("[api/financeiro][POST][conferir_saldo]", conferenciaError);
        const detalhe = conferenciaError.code === "42P01"
          ? "A tabela de histórico não existe. Execute docs/sql/08_conferencias_bancarias.sql no Supabase."
          : conferenciaError.message;
        return NextResponse.json(
          { error: `Não foi possível gravar a conferência bancária. ${detalhe}` },
          { status: 500 },
        );
      }
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
    const supabase = getServiceClient();

    if (acao === "conciliar_movimentos") {
      const ids = Array.isArray(body.ids)
        ? Array.from(new Set(body.ids.map((valor: unknown) => String(valor || "").trim()).filter(Boolean)))
        : [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "Selecione ao menos um lançamento pendente." }, { status: 400 });
      }
      if (ids.length > 100) {
        return NextResponse.json({ error: "Concilie no máximo 100 lançamentos por vez." }, { status: 400 });
      }

      const dataConciliacao = String(body.data_conciliacao || "").trim();
      const observacao = String(body.observacao || "").trim().slice(0, 500);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataConciliacao)) {
        return NextResponse.json({ error: "Informe uma data de conciliação válida." }, { status: 400 });
      }

      const { data: registros, error: buscaError } = await supabase
        .from("movimentacoes_financeiras")
        .select("id,observacoes,conciliado")
        .in("id", ids);

      if (buscaError) throw buscaError;

      const registrosEncontrados = registros || [];
      const encontrados = new Set(registrosEncontrados.map((registro) => String(registro.id)));
      const naoEncontrados = ids.filter((idSelecionado) => !encontrados.has(idSelecionado)).length;
      const movimentosAtualizados: NonNullable<typeof registros> = [];
      const falhas: Array<{ id: string; erro: string }> = [];
      let jaConciliados = 0;

      for (const registro of registrosEncontrados) {
        if (registro.conciliado) {
          jaConciliados += 1;
          continue;
        }

        const instante = new Date().toISOString();
        const nomeUsuario = auth.usuario.nome_exibicao || "Administrador";
        const usuarioId = auth.usuario.id;
        const blocoAuditoria = `[CONCILIACAO_BANCARIA] ${instante} | por: ${nomeUsuario} | usuario_id: ${usuarioId} | observação: ${observacao || "Conferido em lote no extrato bancário."}`;
        const novasObservacoes = [String(registro.observacoes || "").trim(), blocoAuditoria].filter(Boolean).join("\n");

        const { data: atualizado, error: atualizarError } = await supabase
          .from("movimentacoes_financeiras")
          .update({
            conciliado: true,
            data_conciliacao: dataConciliacao,
            observacoes: novasObservacoes,
          })
          .eq("id", registro.id)
          .eq("conciliado", false)
          .select("id,conta_bancaria_id,conta_destino_id,grupo_transferencia,tipo,categoria,descricao,valor,data_movimentacao,created_at,created_by,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes")
          .maybeSingle();

        if (atualizarError) {
          falhas.push({ id: String(registro.id), erro: "Não foi possível atualizar este lançamento." });
        } else if (atualizado) {
          movimentosAtualizados.push(atualizado);
        } else {
          jaConciliados += 1;
        }
      }

      return NextResponse.json({
        ok: falhas.length === 0,
        movimentos: movimentosAtualizados,
        conciliados: movimentosAtualizados.length,
        ja_conciliados: jaConciliados,
        nao_encontrados: naoEncontrados,
        falhas,
        message: `${movimentosAtualizados.length} lançamento(s) conciliado(s). ${jaConciliados} já estavam conciliados.${naoEncontrados ? ` ${naoEncontrados} não encontrado(s).` : ""}`,
      });
    }

    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });

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
