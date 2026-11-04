import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

type NotificacaoAdminRow = {
  id: string;
  tipo: string | null;
  titulo: string | null;
  mensagem: string | null;
  origem_tipo: string | null;
  origem_id: string | null;
  lida: boolean;
  criado_em: string;
  valor?: number | null;
  comprovante_url?: string | null;
  comprovante_status?: string | null;
  forma_pagamento?: string | null;
  origem_ids?: string[];
};

type RegistroComprovante = {
  id: string;
  valor?: number | string | null;
  comprovante_url?: string | null;
  comprovante_status?: string | null;
  forma_pagamento?: string | null;
  tipo_pagamento?: string | null;
};

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

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
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const lista = (data ?? []) as unknown as NotificacaoAdminRow[];
    const serviceDb = getServiceClient();

    for (const notificacao of lista) {
      if (!notificacao.origem_tipo || !notificacao.origem_id) continue;

      let tabela: "mensalidades" | "convites" | "reservas" | "temporadas_parcelas" | null = null;
      let ids: string[] = [];

      if (
        notificacao.origem_tipo === "mensalidade" ||
        notificacao.origem_tipo === "mensalidade_lote"
      ) {
        tabela = "mensalidades";
        ids = notificacao.origem_id.split(",").map((id) => id.trim()).filter(Boolean);
      } else if (notificacao.origem_tipo === "convite") {
        tabela = "convites";
        ids = [notificacao.origem_id.trim()];
      } else if (
        ["reserva", "reserva_pagamento", "pagamento_reserva"].includes(notificacao.origem_tipo)
      ) {
        tabela = "reservas";
        ids = [notificacao.origem_id.trim()];
      } else if (notificacao.origem_tipo === "temporada_parcela") {
        tabela = "temporadas_parcelas";
        ids = [notificacao.origem_id.trim()];
      }

      if (!tabela || ids.length === 0) continue;

      const campos = tabela === "temporadas_parcelas"
        ? "id,valor,comprovante_url,forma_pagamento,situacao,temporada_id"
        : "id,valor,comprovante_url,comprovante_status,forma_pagamento,tipo_pagamento";
      const { data: registros, error: registroError } = await serviceDb
        .from(tabela)
        .select(campos)
        .in("id", ids);

      if (registroError || !registros?.length) continue;

      const registrosTipados = registros as unknown as RegistroComprovante[];
      const registrosOrdenados = ids.reduce<RegistroComprovante[]>((ordenados, id) => {
        const registro = registrosTipados.find((item) => String(item.id) === id);
        if (registro) ordenados.push(registro);
        return ordenados;
      }, []);

      const total = registrosOrdenados.reduce(
        (soma, registro) => soma + Number(registro.valor ?? 0),
        0,
      );
      const comprovante = registrosOrdenados.find((registro) => registro.comprovante_url)?.comprovante_url || null;
      const status = registrosOrdenados.find((registro) => registro.comprovante_status)?.comprovante_status || null;
      const forma = registrosOrdenados.find((registro) => registro.forma_pagamento || registro.tipo_pagamento);

      notificacao.valor = total;
      notificacao.comprovante_url = comprovante;
      if (notificacao.comprovante_url && !/^https?:\/\//i.test(notificacao.comprovante_url)) {
        const caminho = notificacao.comprovante_url.replace(/^\/+/, "");
        const { data: publico } = serviceDb.storage
          .from("comprovantes-financeiro")
          .getPublicUrl(caminho);
        notificacao.comprovante_url = publico?.publicUrl || notificacao.comprovante_url;
      }
      notificacao.comprovante_status = status;
      notificacao.forma_pagamento = forma?.forma_pagamento || forma?.tipo_pagamento || null;
      notificacao.origem_ids = registrosOrdenados.map((registro) => registro.id);
    }

    const { data: contas_bancarias, error: contasError } = await auth.supabase
      .from("contas_bancarias")
      .select("id,nome,banco,ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (contasError) {
      return NextResponse.json({ error: contasError.message }, { status: 500 });
    }

    return NextResponse.json({ notificacoes: lista, contas_bancarias: contas_bancarias || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar notificações." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json() as Record<string, unknown>;

    if (body.todas === true) {
      const { error } = await auth.supabase
        .from("notificacoes_admin")
        .update({ lida: true })
        .eq("lida", false);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const ids = Array.isArray(body.ids)
      ? body.ids.map((id: unknown) => String(id).trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Informe a notificação." }, { status: 400 });
    }

    // Marcar como lida não confirma pagamento; a confirmação financeira ocorre
    // somente após a conferência do comprovante pelo administrador.
    const { error } = await auth.supabase
      .from("notificacoes_admin")
      .update({ lida: true })
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao marcar notificação como lida." },
      { status: 500 },
    );
  }
}
