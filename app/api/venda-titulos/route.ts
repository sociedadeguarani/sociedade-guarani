import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

function erro(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function competenciaAtual() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${p.find(x => x.type === "year")?.value}-${p.find(x => x.type === "month")?.value}`;
}

function dataHoje() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function formaMensalidade(valor: unknown) {
  const forma = String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_");
  if (["pix", "boleto", "debito_em_conta", "dinheiro", "transferencia", "outro"].includes(forma)) return forma;
  if (forma.includes("sicredi") || forma.includes("banrisul") || forma === "bb" || forma.includes("banco_do_brasil")) return "debito_em_conta";
  return "outro";
}

function dataVencimento(inicio: string, meses: number) {
  const [ano, mes, dia] = inicio.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

const BUCKET_COMPROVANTES = "comprovantes-financeiro";
const TIPOS_COMPROVANTE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const FORMAS_PAGAMENTO = new Set(["pix", "dinheiro", "transferencia", "boleto", "debito_em_conta", "cheque", "cartao", "outro"]);

type ArquivoComprovante = { url: string; caminho: string };
type ParcelaVendaInput = {
  valor: number | string;
  data_vencimento: string;
  forma_pagamento: string;
  conta_bancaria_id?: string | null;
  recebido?: boolean;
  data_pagamento?: string | null;
};
type ParcelaVendaRow = {
  id: string;
  numero: number;
  valor: number;
  descricao?: string;
  data_vencimento: string;
  situacao?: string;
};
type ContratoVendaRow = {
  id: string;
  codigo: string;
  comprador_nome: string;
  socio_id: string;
};

async function salvarComprovante(db: ReturnType<typeof getServiceClient>, arquivo: File | null, identificador: string): Promise<ArquivoComprovante | null> {
  if (!arquivo || arquivo.size <= 0) return null;
  if (!TIPOS_COMPROVANTE.has(arquivo.type) || arquivo.size > 8 * 1024 * 1024) {
    throw new Error("Comprovante inválido. Envie JPG, PNG, WEBP ou PDF de até 8 MB.");
  }
  const { error: erroBucket } = await db.storage.getBucket(BUCKET_COMPROVANTES);
  if (erroBucket) {
    const criado = await db.storage.createBucket(BUCKET_COMPROVANTES, {
      public: true,
      fileSizeLimit: "8MB",
      allowedMimeTypes: [...TIPOS_COMPROVANTE],
    });
    if (criado.error && !/already exists/i.test(criado.error.message)) throw criado.error;
  }
  const extensao = arquivo.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const caminho = `vendas-titulos/${identificador}-${Date.now()}.${extensao}`;
  const upload = await db.storage.from(BUCKET_COMPROVANTES).upload(
    caminho,
    new Uint8Array(await arquivo.arrayBuffer()),
    { contentType: arquivo.type, upsert: false },
  );
  if (upload.error) throw upload.error;
  const { data } = db.storage.from(BUCKET_COMPROVANTES).getPublicUrl(caminho);
  return { url: data.publicUrl, caminho };
}

async function removerComprovante(db: ReturnType<typeof getServiceClient>, caminho: string | null | undefined) {
  if (caminho) await db.storage.from(BUCKET_COMPROVANTES).remove([caminho]);
}

async function criarMovimento(
  db: ReturnType<typeof getServiceClient>, parcela: ParcelaVendaRow, contrato: ContratoVendaRow,
  userId: string, contaId: string, forma: string, data: string,
  comprovanteUrl: string | null = null,
) {
  const { data: existente, error: buscaErro } = await db.from("movimentacoes_financeiras")
    .select("id,comprovante_url").eq("origem_tipo", "venda_titulo_parcela").eq("origem_id", parcela.id).maybeSingle();
  if (buscaErro) throw buscaErro;
  if (existente?.id) {
    if (comprovanteUrl && !existente.comprovante_url) {
      const { error } = await db.from("movimentacoes_financeiras")
        .update({ comprovante_url: comprovanteUrl }).eq("id", existente.id).is("comprovante_url", null);
      if (error) throw error;
    }
    return String(existente.id);
  }

  const { data: movimento, error } = await db.from("movimentacoes_financeiras").insert({
    conta_bancaria_id: contaId, conta_destino_id: null, grupo_transferencia: null,
    tipo: "entrada", categoria: "Venda de título",
    descricao: `Venda de título — ${contrato.comprador_nome} — Parcela ${parcela.numero}`,
    valor: Number(parcela.valor), data_movimentacao: data, forma_pagamento: forma,
    origem_tipo: "venda_titulo_parcela", origem_id: parcela.id,
    socio_id: contrato.socio_id, dependente_id: null, created_by: userId,
    comprovante_url: comprovanteUrl,
    conciliado: false, data_conciliacao: null,
    observacoes: `Recebimento do contrato ${contrato.codigo}.`,
  }).select("id").single();
  if (error) throw error;
  return String(movimento.id);
}

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  const db = getServiceClient();
  try {
    const [contratosResult, sociosResult, contasResult] = await Promise.all([
      db.from("vendas_titulos").select("*,parcelas:vendas_titulos_parcelas(*)").order("created_at", { ascending: false }),
      db.from("socios").select("id,nome,matricula,cpf,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,conta_bancaria_id,situacao,ativo").eq("ativo", true).order("nome"),
      db.from("contas_bancarias").select("id,nome,banco").eq("ativo", true).order("nome"),
    ]);
    if (contratosResult.error) throw contratosResult.error;
    if (sociosResult.error) throw sociosResult.error;
    if (contasResult.error) throw contasResult.error;

    return NextResponse.json({
      contratos: contratosResult.data || [], socios: sociosResult.data || [],
      contas: contasResult.data || [],
      competencia_atual: competenciaAtual(),
    });
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Erro ao carregar vendas de títulos.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  const db = getServiceClient();
  let arquivo: File | null = null;
  let caminhoComprovante: string | null = null;
  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("dados") || "{}"));
      const valorArquivo = form.get("comprovante");
      arquivo = valorArquivo instanceof File && valorArquivo.size > 0 ? valorArquivo : null;
    } else {
      body = await request.json();
    }

    const acao = String(body.acao || "criar");
    if (acao === "criar") {
      const socioId = String(body.socio_id || "");
      const valorTotal = Number(body.valor_total);
      const quantidade = Number(body.quantidade_parcelas || 1);
      const inicio = String(body.primeiro_vencimento || dataHoje());
      const registrarEntrada = body.registrar_entrada === true;
      const contaEntradaId = String(body.conta_entrada_id || "");
      const formaEntrada = String(body.forma_entrada || "pix");
      const dataEntrada = String(body.data_entrada || dataHoje());
      const valores: ParcelaVendaInput[] = Array.isArray(body.parcelas) ? body.parcelas as ParcelaVendaInput[] : [];
      if (!socioId || !Number.isFinite(valorTotal) || valorTotal <= 0 || !Number.isInteger(quantidade) || quantidade < 1 || quantidade > 7) {
        return erro("Informe associado, valor total e quantidade de parcelas válida.");
      }
      if (registrarEntrada && (!contaEntradaId || !/^\d{4}-\d{2}-\d{2}$/.test(dataEntrada) || !FORMAS_PAGAMENTO.has(formaEntrada))) {
        return erro("Para lançar a entrada, informe a forma de pagamento, a conta/banco que recebeu e a data do recebimento.");
      }
      if (!registrarEntrada && arquivo) return erro("Anexe o comprovante somente quando registrar a entrada como recebida.");

      const { data: socio, error: socioError } = await db.from("socios")
        .select("id,nome,matricula,cpf,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,conta_bancaria_id,ativo")
        .eq("id", socioId).maybeSingle();
      if (socioError) throw socioError;
      if (!socio || socio.ativo === false) return erro("Associado não encontrado ou inativo.", 404);

      const soma = valores.reduce((acc, p) => acc + Number(p.valor || 0), 0);
      if (valores.length !== quantidade || valores.some((p) =>
        !Number.isFinite(Number(p.valor)) || Number(p.valor) <= 0 ||
        !FORMAS_PAGAMENTO.has(String(p.forma_pagamento || "")) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(p.data_vencimento || ""))
      ) || Math.abs(soma - valorTotal) > 0.01) {
        return erro("Confira valores, vencimentos e formas de pagamento. As parcelas precisam somar exatamente o valor total do título.");
      }
      const contaEntrada = registrarEntrada
        ? await db.from("contas_bancarias").select("id,ativo").eq("id", contaEntradaId).maybeSingle()
        : { data: null, error: null };
      if (contaEntrada.error) throw contaEntrada.error;
      if (registrarEntrada && (!contaEntrada.data || contaEntrada.data.ativo === false)) return erro("Conta bancária/caixa não encontrada ou inativa.");

      const hoje = dataHoje();
      const comp = competenciaAtual();
      const codigo = `VT-${Date.now().toString().slice(-8)}`;
      const { data: contrato, error: contratoError } = await db.from("vendas_titulos").insert({
        codigo, socio_id: socioId, comprador_nome: socio.nome, comprador_cpf: socio.cpf || null,
        valor_total: valorTotal, quantidade_parcelas: quantidade, data_contratacao: hoje,
        situacao: "ativo", observacoes: String(body.observacoes || "").trim() || null,
        created_by: auth.usuario.id,
      }).select("*").single();
      if (contratoError) throw contratoError;

      const parcelas = valores.map((p, i) => ({
        venda_titulo_id: contrato.id, numero: i + 1, descricao: i === 0 ? "Entrada" : `Parcela ${i + 1}`,
        valor: Number(p.valor), data_vencimento: String(p.data_vencimento || dataVencimento(inicio, i)),
        situacao: p.recebido === true && i === 0 ? "pago" : "em_aberto",
        data_pagamento: p.recebido === true && i === 0 ? String(p.data_pagamento || dataEntrada) : null,
        forma_pagamento: String(p.forma_pagamento || (i === 0 ? formaEntrada : "boleto")),
        conta_bancaria_id: p.conta_bancaria_id ? String(p.conta_bancaria_id) : (i === 0 && registrarEntrada ? contaEntradaId : null),
        movimentacao_id: null,
      }));
      const { data: parcelasCriadas, error: parcelasError } = await db.from("vendas_titulos_parcelas").insert(parcelas).select("*");
      if (parcelasError) {
        await db.from("vendas_titulos").delete().eq("id", contrato.id);
        throw parcelasError;
      }

      // Registra a entrada como uma nova receita do Financeiro, sem depender de um lançamento prévio.
      if (registrarEntrada) {
        const parcelaEntrada = ((parcelasCriadas || []) as ParcelaVendaRow[]).find((p) => Number(p.numero) === 1);
        if (!parcelaEntrada) throw new Error("A parcela de entrada não foi criada.");
        try {
          const comprovante = await salvarComprovante(db, arquivo, `entrada-${contrato.id}`);
          caminhoComprovante = comprovante?.caminho || null;
          const movimentoId = await criarMovimento(
            db, parcelaEntrada, contrato as ContratoVendaRow, auth.usuario.id, contaEntradaId, formaEntrada, dataEntrada,
            comprovante?.url || null,
          );
          const { error: vinculoErro } = await db.from("vendas_titulos_parcelas")
            .update({ movimentacao_id: movimentoId }).eq("id", parcelaEntrada.id);
          if (vinculoErro) throw vinculoErro;
        } catch (financeiroError) {
          await db.from("movimentacoes_financeiras").delete()
            .eq("origem_tipo", "venda_titulo_parcela").eq("origem_id", parcelaEntrada.id);
          await db.from("vendas_titulos_parcelas").delete().eq("venda_titulo_id", contrato.id);
          await db.from("vendas_titulos").delete().eq("id", contrato.id);
          await removerComprovante(db, caminhoComprovante);
          throw financeiroError;
        }
      }

      // A mensalidade começa na competência vigente. Se já existir, não duplica.
      try {
        if (socio.possui_mensalidade === true && Number(socio.valor_mensalidade || 0) > 0) {
          const { data: mensalidadeExistente, error: mensalidadeBuscaError } = await db.from("mensalidades")
            .select("id").eq("socio_id", socioId).eq("competencia", comp).is("dependente_id", null).maybeSingle();
          if (mensalidadeBuscaError) throw mensalidadeBuscaError;
          if (!mensalidadeExistente) {
            const dia = Math.min(28, Math.max(1, Number(socio.dia_vencimento || 10)));
            const { error: mensalidadeInsertError } = await db.from("mensalidades").insert({
              socio_id: socioId, competencia: comp, valor: Number(socio.valor_mensalidade),
              valor_base: Number(socio.valor_mensalidade), tarifa_pagamento: 0, multa: 0, juros: 0,
              desconto: 0, total_cobrado: Number(socio.valor_mensalidade), dias_atraso: 0,
              data_vencimento: `${comp}-` + String(dia).padStart(2, "0"),
              situacao: "em_aberto", tipo_pagamento: formaMensalidade(socio.tipo_pagamento),
              conta_pagadora_id: socio.conta_bancaria_id || null,
              observacoes: `Mensalidade da competência ${comp} iniciada pela venda do título ${codigo}.`,
            });
            if (mensalidadeInsertError) throw mensalidadeInsertError;
          }
        }
      } catch (mensalidadeError) {
        const primeiraParcela = ((parcelasCriadas || []) as ParcelaVendaRow[]).find((p) => Number(p.numero) === 1);
        if (registrarEntrada && primeiraParcela?.id) {
          await db.from("movimentacoes_financeiras").delete()
            .eq("origem_tipo", "venda_titulo_parcela").eq("origem_id", primeiraParcela.id);
        }
        await db.from("vendas_titulos_parcelas").delete().eq("venda_titulo_id", contrato.id);
        await db.from("vendas_titulos").delete().eq("id", contrato.id);
        await removerComprovante(db, caminhoComprovante);
        throw mensalidadeError;
      }
      return NextResponse.json({
        ok: true, contrato,
        message: registrarEntrada
          ? `Venda ${codigo} cadastrada. Entrada de ${Number(valores[0].valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} lançada no Financeiro.`
          : `Venda ${codigo} cadastrada com a entrada em aberto. Mensalidade da competência ${comp} verificada.`,
      });
    }

    if (acao === "baixar_parcela") {
      const parcelaId = String(body.parcela_id || "");
      const contaId = String(body.conta_bancaria_id || "");
      const forma = String(body.forma_pagamento || "pix");
      const data = String(body.data_pagamento || dataHoje());
      if (!parcelaId || !contaId || !FORMAS_PAGAMENTO.has(forma) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return erro("Informe parcela, conta/banco, forma de pagamento e data válida.");
      }
      const { data: conta, error: contaError } = await db.from("contas_bancarias")
        .select("id,ativo").eq("id", contaId).maybeSingle();
      if (contaError) throw contaError;
      if (!conta || conta.ativo === false) return erro("Conta de recebimento não encontrada ou inativa.");
      const { data: parcela, error: parcelaError } = await db.from("vendas_titulos_parcelas")
        .select("*").eq("id", parcelaId).maybeSingle();
      if (parcelaError) throw parcelaError;
      if (!parcela) return erro("Parcela não encontrada.", 404);
      if (parcela.situacao === "pago") return erro("Esta parcela já está paga.", 409);
      const { data: contrato, error: contratoError } = await db.from("vendas_titulos")
        .select("*").eq("id", parcela.venda_titulo_id).single();
      if (contratoError) throw contratoError;

      let comprovante: ArquivoComprovante | null = null;
      try {
        comprovante = await salvarComprovante(db, arquivo, `parcela-${parcela.id}`);
        const { data: atualizada, error: updateError } = await db.from("vendas_titulos_parcelas")
          .update({ situacao: "pago", data_pagamento: data, forma_pagamento: forma, conta_bancaria_id: contaId })
          .eq("id", parcelaId).neq("situacao", "pago").select("*").maybeSingle();
        if (updateError) throw updateError;
        if (!atualizada) {
          await removerComprovante(db, comprovante?.caminho);
          return erro("Esta parcela já foi baixada. Atualize a tela.", 409);
        }
        try {
          const movimentoId = await criarMovimento(db, atualizada as ParcelaVendaRow, contrato as ContratoVendaRow, auth.usuario.id, contaId, forma, data, comprovante?.url || null);
          const { error: vinculoErro } = await db.from("vendas_titulos_parcelas").update({ movimentacao_id: movimentoId }).eq("id", parcelaId);
          if (vinculoErro) throw vinculoErro;
          const { count: abertas, error: abertasError } = await db.from("vendas_titulos_parcelas")
            .select("id", { count: "exact", head: true })
            .eq("venda_titulo_id", contrato.id).neq("situacao", "pago").neq("situacao", "cancelado");
          if (abertasError) throw abertasError;
          if ((abertas || 0) === 0) {
            const { error: quitarError } = await db.from("vendas_titulos").update({ situacao: "quitado" }).eq("id", contrato.id);
            if (quitarError) throw quitarError;
          }
        } catch (financeiroError) {
          await db.from("movimentacoes_financeiras").delete()
            .eq("origem_tipo", "venda_titulo_parcela").eq("origem_id", parcelaId);
          await db.from("vendas_titulos_parcelas").update({ situacao: "em_aberto", data_pagamento: null, forma_pagamento: null, conta_bancaria_id: null, movimentacao_id: null }).eq("id", parcelaId);
          throw financeiroError;
        }
      } catch (e) {
        await removerComprovante(db, comprovante?.caminho);
        throw e;
      }
      return NextResponse.json({ ok: true, message: "Parcela recebida e lançada no Financeiro." });
    }
    return erro("Ação não reconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Erro ao processar venda de título.", 500);
  }
}
