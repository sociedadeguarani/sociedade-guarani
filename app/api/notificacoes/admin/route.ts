import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const url = new URL(request.url);
    const naoLidas = url.searchParams.get("nao_lidas") !== "false";
    const limite = Math.min(Math.max(Number(url.searchParams.get("limite") || 50), 1), 100);

    let query = auth.supabase
      .from("notificacoes_admin")
      .select("id,tipo,titulo,mensagem,origem_tipo,origem_id,lida,criado_em")
      .order("criado_em", { ascending: false })
      .limit(limite);

    if (naoLidas) query = query.eq("lida", false);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const lista = (data || []) as any[];

    // Inclui o link do comprovante e o valor original na notificação.
    // Algumas notificações antigas podem usar "mensalidade_lote" e guardar
    // vários IDs separados por vírgula. Nesse caso buscamos todos os registros
    // e usamos o comprovante comum do lote.
    // A leitura dos lançamentos usa o service client porque a tela administrativa
    // precisa enxergar o comprovante mesmo quando a política RLS da tabela bloqueia
    // a leitura pelo cliente autenticado. A autenticação do administrador continua
    // sendo exigida acima.
    const serviceDb = getServiceClient();

    for (const n of lista) {
      if (!n.origem_tipo || !n.origem_id) continue;

      let tabela: string | null = null;
      let ids: string[] = [];

      if (n.origem_tipo === "mensalidade" || n.origem_tipo === "mensalidade_lote") {
        tabela = "mensalidades";
        ids = String(n.origem_id).split(",").map((x) => x.trim()).filter(Boolean);
      } else if (n.origem_tipo === "convite") {
        tabela = "convites";
        ids = [String(n.origem_id).trim()];
      } else if (["reserva", "reserva_pagamento", "pagamento_reserva"].includes(n.origem_tipo)) {
        tabela = "reservas";
        ids = [String(n.origem_id).trim()];
      }

      if (!tabela || !ids.length) continue;

      const { data: registros, error: registroError } = await serviceDb
        .from(tabela)
        .select("id,valor,comprovante_url,comprovante_status,forma_pagamento,tipo_pagamento")
        .in("id", ids);

      if (registroError || !registros?.length) continue;

      const registrosOrdenados = ids
        .map((id) => registros.find((r: any) => String(r.id) === id))
        .filter(Boolean) as any[];

      const total = registrosOrdenados.reduce(
        (soma, r) => soma + Number(r.valor || 0),
        0
      );
      const comprovante =
        registrosOrdenados.find((r) => r.comprovante_url)?.comprovante_url || null;
      const status =
        registrosOrdenados.find((r) => r.comprovante_status)?.comprovante_status || null;
      const forma =
        registrosOrdenados.find((r) => r.forma_pagamento || r.tipo_pagamento);

      n.valor = total;
      n.comprovante_url = comprovante;
      n.comprovante_status = status;
      n.forma_pagamento = forma?.forma_pagamento || forma?.tipo_pagamento || null;
      n.origem_ids = registrosOrdenados.map((r) => r.id);
    }

    const { data: contas_bancarias, error: contasError } = await auth.supabase
      .from("contas_bancarias")
      .select("id,nome,banco,ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (contasError) return NextResponse.json({ error: contasError.message }, { status: 500 });

    return NextResponse.json({ notificacoes: lista, contas_bancarias: contas_bancarias || [] });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao carregar notificações."
    }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();

    if (body.todas === true) {
      const { error } = await auth.supabase
        .from("notificacoes_admin")
        .update({ lida: true })
        .eq("lida", false);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((x: unknown) => String(x).trim()).filter(Boolean)
      : [];

    if (!ids.length) {
      return NextResponse.json({ error: "Informe a notificação." }, { status: 400 });
    }

    // IMPORTANTE: marcar como lida NÃO confirma pagamento.
    // A confirmação financeira acontece somente no botão "Confirmar pagamento",
    // depois que o administrador verifica o comprovante.
    const { error } = await auth.supabase
      .from("notificacoes_admin")
      .update({ lida: true })
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro ao marcar notificação como lida."
    }, { status: 500 });
  }
}
