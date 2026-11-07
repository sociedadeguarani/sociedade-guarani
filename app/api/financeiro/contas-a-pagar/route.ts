import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const FORMAS_PAGAMENTO = new Set([
  "pix",
  "debito_em_conta",
  "boleto",
  "dinheiro",
  "transferencia",
  "cheque",
  "outro",
]);
const PERIODICIDADES = new Set([
  "unica",
  "semanal",
  "quinzenal",
  "mensal",
  "trimestral",
  "semestral",
  "anual",
]);
const TIPOS_COMPROVANTE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
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

function dataValida(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const db = getServiceClient();
    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "todos").trim();
    const busca = String(searchParams.get("busca") || "").trim().slice(0, 120);

    let obrigacoesQuery = db
      .from("contas_pagar")
      .select("id,descricao,fornecedor,categoria,valor_parcela,valor_total,quantidade_parcelas,periodicidade,data_primeiro_vencimento,conta_bancaria_preferencial_id,forma_pagamento_preferencial,observacoes,status,created_by,created_by_nome,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(500);

    if (status === "ativa" || status === "quitada" || status === "cancelada") {
      obrigacoesQuery = obrigacoesQuery.eq("status", status);
    }
    if (busca) {
      obrigacoesQuery = obrigacoesQuery.or(`descricao.ilike.%${busca.replace(/[(),]/g, " ")}%,fornecedor.ilike.%${busca.replace(/[(),]/g, " ")}%,categoria.ilike.%${busca.replace(/[(),]/g, " " )}%`);
    }

    const [obrigacoesResult, parcelasResult, contasResult] = await Promise.all([
      obrigacoesQuery,
      db.from("contas_pagar_parcelas")
        .select("id,conta_pagar_id,numero_parcela,quantidade_parcelas,data_vencimento,valor,status,data_pagamento,conta_bancaria_id,forma_pagamento,movimentacao_id,comprovante_url,observacoes_pagamento,paid_by,paid_by_nome,created_at,updated_at")
        .order("data_vencimento", { ascending: true })
        .limit(5000),
      db.from("contas_bancarias")
        .select("id,nome,banco,agencia,conta,ativo")
        .eq("ativo", true)
        .order("nome", { ascending: true }),
    ]);

    if (obrigacoesResult.error) throw obrigacoesResult.error;
    if (parcelasResult.error) throw parcelasResult.error;
    if (contasResult.error) throw contasResult.error;

    const idsObrigacoes = new Set((obrigacoesResult.data || []).map((item) => String(item.id)));
    const parcelas = (parcelasResult.data || []).filter((item) => idsObrigacoes.has(String(item.conta_pagar_id)));

    return NextResponse.json({
      ok: true,
      obrigacoes: obrigacoesResult.data || [],
      parcelas,
      contas: contasResult.data || [],
    });
  } catch (error) {
    console.error("[api/financeiro/contas-a-pagar][GET]", error);
    return NextResponse.json({ error: "Não foi possível carregar as contas a pagar." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  let comprovantePath: string | null = null;
  const db = getServiceClient();

  try {
    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    let arquivo: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = Object.fromEntries(Array.from(form.entries()).filter(([key]) => key !== "arquivo")) as Record<string, unknown>;
      const candidate = form.get("arquivo");
      arquivo = candidate instanceof File && candidate.size > 0 ? candidate : null;
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    const acao = String(body.acao || "").trim().toLowerCase();

    if (acao === "criar_obrigacao") {
      const descricao = String(body.descricao || "").trim();
      const fornecedor = String(body.fornecedor || "").trim();
      const categoria = String(body.categoria || "Outros").trim() || "Outros";
      const valorParcela = Number(String(body.valor_parcela ?? "0").replace(",", "."));
      const quantidadeParcelas = Number(body.quantidade_parcelas || 1);
      const periodicidade = String(body.periodicidade || "mensal").trim().toLowerCase();
      const primeiroVencimento = String(body.data_primeiro_vencimento || "").trim();
      const contaPreferencial = String(body.conta_bancaria_preferencial_id || "").trim() || null;
      const formaPreferencial = String(body.forma_pagamento_preferencial || "").trim().toLowerCase() || null;
      const observacoes = String(body.observacoes || "").trim();

      if (!descricao || !Number.isFinite(valorParcela) || valorParcela <= 0
        || !Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 1 || quantidadeParcelas > 360
        || !PERIODICIDADES.has(periodicidade) || !dataValida(primeiroVencimento)) {
        return NextResponse.json({ error: "Confira descrição, valor da parcela, quantidade, periodicidade e primeiro vencimento." }, { status: 400 });
      }
      if (periodicidade === "unica" && quantidadeParcelas !== 1) {
        return NextResponse.json({ error: "Para uma conta única, informe apenas uma parcela." }, { status: 400 });
      }
      if (formaPreferencial && !FORMAS_PAGAMENTO.has(formaPreferencial)) {
        return NextResponse.json({ error: "Forma de pagamento preferencial inválida." }, { status: 400 });
      }

      const { data, error } = await db.rpc("financeiro_criar_conta_pagar", {
        p_descricao: descricao,
        p_fornecedor: fornecedor || null,
        p_categoria: categoria,
        p_valor_parcela: Number(valorParcela.toFixed(2)),
        p_quantidade_parcelas: quantidadeParcelas,
        p_periodicidade: periodicidade,
        p_data_primeiro_vencimento: primeiroVencimento,
        p_conta_bancaria_preferencial_id: contaPreferencial,
        p_forma_pagamento_preferencial: formaPreferencial,
        p_observacoes: observacoes || null,
        p_usuario_id: auth.usuario.id,
        p_usuario_nome: auth.usuario.nome_exibicao || "Administrador",
      });
      if (error) throw error;
      return NextResponse.json({ ok: true, resultado: data });
    }

    if (acao === "baixar_parcela") {
      const parcelaId = String(body.parcela_id || "").trim();
      const contaId = String(body.conta_bancaria_id || "").trim();
      const dataPagamento = String(body.data_pagamento || "").trim();
      const forma = String(body.forma_pagamento || "").trim().toLowerCase();
      const observacoes = String(body.observacoes || "").trim();

      if (!parcelaId || !contaId || !dataValida(dataPagamento) || !FORMAS_PAGAMENTO.has(forma)) {
        return NextResponse.json({ error: "Informe parcela, conta bancária, data e forma de pagamento válidas." }, { status: 400 });
      }
      const hojeLocal = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      if (dataPagamento > hojeLocal) {
        return NextResponse.json({ error: "A baixa só pode ser registrada quando o pagamento realmente acontecer. Informe uma data de hoje ou anterior." }, { status: 400 });
      }

      if (arquivo) {
        if (!TIPOS_COMPROVANTE.has(arquivo.type) || arquivo.size > 8 * 1024 * 1024) {
          return NextResponse.json({ error: "Comprovante inválido. Use JPG, PNG, WEBP ou PDF até 8 MB." }, { status: 400 });
        }
        await garantirBucketComprovantes(db);
        const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
        comprovantePath = `contas-a-pagar/${crypto.randomUUID()}.${ext}`;
        const upload = await db.storage.from(BUCKET_COMPROVANTES).upload(
          comprovantePath,
          new Uint8Array(await arquivo.arrayBuffer()),
          { contentType: arquivo.type, upsert: false }
        );
        if (upload.error) throw upload.error;
      }

      const { data, error } = await db.rpc("financeiro_baixar_conta_pagar_parcela", {
        p_parcela_id: parcelaId,
        p_conta_bancaria_id: contaId,
        p_data_pagamento: dataPagamento,
        p_forma_pagamento: forma,
        p_usuario_id: auth.usuario.id,
        p_usuario_nome: auth.usuario.nome_exibicao || "Administrador",
        p_observacoes: observacoes || null,
        p_comprovante_url: comprovantePath,
      });
      if (error) {
        if (comprovantePath) await db.storage.from(BUCKET_COMPROVANTES).remove([comprovantePath]);
        throw error;
      }
      return NextResponse.json({ ok: true, resultado: data });
    }

    return NextResponse.json({ error: "Ação de contas a pagar inválida." }, { status: 400 });
  } catch (error) {
    if (comprovantePath) {
      await db.storage.from(BUCKET_COMPROVANTES).remove([comprovantePath]).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error("[api/financeiro/contas-a-pagar][POST]", error);
    return NextResponse.json({ error: message || "Não foi possível concluir a operação." }, { status: 400 });
  }
}
