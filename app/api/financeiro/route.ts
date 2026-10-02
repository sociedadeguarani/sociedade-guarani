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
      .select("id,conta_bancaria_id,conta_destino_id,grupo_transferencia,tipo,categoria,descricao,valor,data_movimentacao,forma_pagamento,origem_tipo,origem_id,socio_id,dependente_id,comprovante_url,conciliado,data_conciliacao,observacoes,created_at")
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

    return NextResponse.json({ contas: contas || [], movimentos: movimentosData || [] });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar financeiro: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json(
    { error: "Os lançamentos financeiros são realizados pela tela autenticada do Financeiro." },
    { status: 405 }
  );
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const acao = String(body.acao || "").trim().toLowerCase();
    if (acao !== "estornar_movimento") {
      return NextResponse.json({ error: "Ação financeira inválida." }, { status: 400 });
    }

    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Lançamento não informado." }, { status: 400 });

    const supabase = getServiceClient();
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

    const agora = new Date().toISOString().slice(0, 10);
    const valor = Number(original.valor || 0);
    if (!(valor > 0)) return NextResponse.json({ error: "O lançamento não possui um valor válido para estorno." }, { status: 400 });

    const base = {
      conta_destino_id: null,
      grupo_transferencia: null,
      categoria: "Estorno",
      descricao: `Estorno: ${String(original.descricao || "Lançamento financeiro")}`,
      valor,
      data_movimentacao: agora,
      forma_pagamento: original.forma_pagamento || null,
      origem_tipo: "estorno_movimento",
      origem_id: id,
      socio_id: original.socio_id || null,
      dependente_id: original.dependente_id || null,
      comprovante_url: null,
      conciliado: false,
      data_conciliacao: null,
      created_by: auth.usuario.id,
      observacoes: `Estorno do lançamento ${id} registrado por ${auth.usuario.nome_exibicao || "Administrador"}. Motivo: ${String(body.motivo || "Não informado").trim().slice(0, 500)}.`,
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
      return NextResponse.json({ ok: true, movimento: data, message: "Transferência estornada com sucesso." });
    }

    const tipo = String(original.tipo) === "entrada" ? "saida" : "entrada";
    const { data, error } = await supabase
      .from("movimentacoes_financeiras")
      .insert({ ...base, conta_bancaria_id: original.conta_bancaria_id, tipo })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, movimento: data, message: "Estorno registrado com sucesso. O histórico original foi preservado." });
  } catch (error) {
    return NextResponse.json({ error: `Não foi possível estornar o lançamento: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
