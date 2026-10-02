import { NextResponse } from "next/server";
import { exigirAdministrador, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type RegistroGenerico = Record<string, any>;

async function prepararBucket(db: any) {
  const bucketAtual = await db.storage.getBucket(BUCKET);
  if (!bucketAtual.error) return;

  const criado = await db.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: "8MB",
    allowedMimeTypes: TIPOS,
  });

  if (criado.error && !/already exists/i.test(criado.error.message)) {
    throw new Error(criado.error.message);
  }
}

async function notificar(
  db: any,
  titulo: string,
  mensagem: string,
  tipo: string,
  id: string
) {
  const { error } = await db.from("notificacoes_admin").insert({
    tipo: "comprovante_pagamento",
    titulo,
    mensagem,
    origem_tipo: tipo,
    origem_id: id,
    lida: false,
  });

  return error ? error.message : null;
}

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const db = auth.supabase;
    const [mensalidades, convites, reservas] = await Promise.all([
      db
        .from("mensalidades")
        .select(
          "id,socio_id,dependente_id,competencia,valor,data_vencimento,situacao,tipo_pagamento,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,socios:socio_id(id,nome,matricula)"
        )
        .eq("comprovante_status", "pendente"),
      db
        .from("convites")
        .select(
          "id,socio_id,nome_convidado,cidade_convidado,data_inicio,data_fim,valor,status,forma_pagamento,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,socios:socio_id(id,nome,matricula)"
        )
        .eq("comprovante_status", "pendente"),
      db
        .from("reservas")
        .select(
          "id,espaco_id,socio_id,dependente_id,responsavel_nome,data_reserva,hora_inicio,hora_fim,valor,situacao,tipo_pagamento,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,espacos:espaco_id(id,nome),socios:socio_id(id,nome,matricula)"
        )
        .eq("comprovante_status", "pendente"),
    ]);

    if (mensalidades.error || convites.error || reservas.error) {
      throw new Error(
        mensalidades.error?.message ||
          convites.error?.message ||
          reservas.error?.message
      );
    }

    const comprovantes = [
      ...(mensalidades.data || []).map((registro: RegistroGenerico) => ({
        ...registro,
        origem_tipo: "mensalidade",
        origem_id: registro.id,
        pessoa: registro.socios,
      })),
      ...(convites.data || []).map((registro: RegistroGenerico) => ({
        ...registro,
        origem_tipo: "convite",
        origem_id: registro.id,
        pessoa: registro.socios,
      })),
      ...(reservas.data || []).map((registro: RegistroGenerico) => ({
        ...registro,
        origem_tipo: "reserva",
        origem_id: registro.id,
        pessoa: registro.socios,
        espaco_nome: Array.isArray(registro.espacos)
          ? registro.espacos[0]?.nome
          : registro.espacos?.nome,
      })),
    ].sort((a: RegistroGenerico, b: RegistroGenerico) =>
      String(b.comprovante_enviado_em || "").localeCompare(
        String(a.comprovante_enviado_em || "")
      )
    );

    return NextResponse.json({ comprovantes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar comprovantes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await usuarioAutenticado(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (auth.perfil !== "associado" || !auth.usuario.socio_id) {
      return NextResponse.json(
        { error: "Somente o associado pode enviar comprovantes." },
        { status: 403 }
      );
    }

    const form = await request.formData();
    const tipo = String(form.get("origem_tipo") || "").trim().toLowerCase();
    const origemId = String(form.get("origem_id") || "").trim();
    const arquivo = form.get("arquivo");

    let ids = origemId ? [origemId] : [];
    const origemIds = String(form.get("origem_ids") || "").trim();

    if (origemIds) {
      try {
        const parsed = JSON.parse(origemIds);
        if (Array.isArray(parsed)) {
          ids = parsed.map((value: unknown) => String(value).trim()).filter(Boolean);
        }
      } catch {
        return NextResponse.json(
          { error: "Lista de mensalidades inválida." },
          { status: 400 }
        );
      }
    }

    ids = [...new Set(ids)];

    if (
      !(arquivo instanceof File) ||
      !ids.length ||
      !["mensalidade", "convite"].includes(tipo)
    ) {
      return NextResponse.json(
        { error: "Informe o lançamento e selecione o comprovante." },
        { status: 400 }
      );
    }

    if (!TIPOS.includes(arquivo.type) || arquivo.size > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Comprovante inválido. Use JPG, PNG, WEBP ou PDF até 8 MB." },
        { status: 400 }
      );
    }

    const tabela = tipo === "mensalidade" ? "mensalidades" : "convites";
    const { data: registros, error: registrosError } = await auth.supabase
      .from(tabela)
      .select("*")
      .in("id", ids);

    if (registrosError) {
      return NextResponse.json({ error: registrosError.message }, { status: 500 });
    }

    if (!registros || registros.length !== ids.length) {
      return NextResponse.json(
        { error: "Uma ou mais cobranças não foram encontradas." },
        { status: 404 }
      );
    }

    for (const registro of registros as RegistroGenerico[]) {
      if (tipo === "mensalidade" && registro.socio_id !== auth.usuario.socio_id) {
        return NextResponse.json(
          { error: "Você não pode alterar uma destas mensalidades." },
          { status: 403 }
        );
      }

      if (
        tipo === "convite" &&
        registro.socio_id &&
        registro.socio_id !== auth.usuario.socio_id
      ) {
        return NextResponse.json(
          { error: "Você não pode alterar este convite." },
          { status: 403 }
        );
      }

      if (registro.situacao === "pago" || registro.status === "pago") {
        return NextResponse.json(
          { error: "Uma das cobranças selecionadas já foi confirmada." },
          { status: 409 }
        );
      }

      if (registro.comprovante_status === "pendente") {
        return NextResponse.json(
          { error: "Uma das cobranças selecionadas já possui comprovante aguardando aprovação." },
          { status: 409 }
        );
      }
    }

    const db = auth.supabase;
    await prepararBucket(db);

    const ext = arquivo.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/${tipo}/${ids.length > 1 ? `lote-${Date.now()}` : ids[0]}-${Date.now()}.${ext}`;
    const upload = await db.storage
      .from(BUCKET)
      .upload(caminho, new Uint8Array(await arquivo.arrayBuffer()), {
        contentType: arquivo.type,
        upsert: false,
      });

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message }, { status: 500 });
    }

    const { data: publicUrl } = db.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();
    const { data: atualizados, error: updateError } = await db
      .from(tabela)
      .update({
        comprovante_url: publicUrl.publicUrl,
        comprovante_enviado_em: agora,
        comprovante_status: "pendente",
        motivo_recusa: null,
      })
      .in("id", ids)
      .select("*");

    if (updateError) {
      await db.storage.from(BUCKET).remove([caminho]);
      throw new Error(updateError.message);
    }

    const total = (registros as RegistroGenerico[]).reduce(
      (soma, registro) => soma + Number(registro.valor || 0),
      0
    );
    const avisoErro = await notificar(
      db,
      ids.length > 1
        ? "Novo comprovante para várias mensalidades"
        : "Novo comprovante aguardando aprovação",
      `${tipo === "mensalidade" ? "Mensalidades" : "Convite"} no valor total de R$ ${total
        .toFixed(2)
        .replace(".", ",")} foi enviado por um associado.`,
      ids.length > 1 ? "mensalidade_lote" : tipo,
      ids.join(",")
    );

    return NextResponse.json({
      ok: true,
      registros: atualizados,
      url: publicUrl.publicUrl,
      quantidade: ids.length,
      total,
      aviso_erro: avisoErro,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar comprovante." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as Record<string, unknown>;
    let tipo = String(body.origem_tipo || "").trim().toLowerCase();
    const origemId = String(body.origem_id || "").trim();
    let ids = Array.isArray(body.origem_ids)
      ? body.origem_ids.map((value) => String(value).trim()).filter(Boolean)
      : [];

    if (tipo === "mensalidade_lote") {
      ids = ids.length
        ? ids
        : origemId
          ? origemId.split(",").map((value) => value.trim()).filter(Boolean)
          : [];
      tipo = "mensalidade";
    } else if (origemId && !ids.length) {
      ids = [origemId];
    }

    ids = [...new Set(ids)];
    const acao = String(body.acao || "").trim().toLowerCase();

    if (
      !ids.length ||
      !["mensalidade", "convite", "reserva"].includes(tipo) ||
      !["aprovar", "recusar"].includes(acao)
    ) {
      return NextResponse.json(
        { error: "Informe lançamento, origem e ação." },
        { status: 400 }
      );
    }

    const tabela = tipo === "mensalidade" ? "mensalidades" : tipo === "convite" ? "convites" : "reservas";
    const { data: registros, error: registrosError } = await auth.supabase
      .from(tabela)
      .select("*")
      .in("id", ids);

    if (registrosError) {
      return NextResponse.json({ error: registrosError.message }, { status: 500 });
    }

    if (!registros || registros.length !== ids.length) {
      return NextResponse.json(
        { error: "Um ou mais lançamentos não foram encontrados." },
        { status: 404 }
      );
    }

    const lista = registros as RegistroGenerico[];
    if (lista.some((registro) => registro.comprovante_status !== "pendente")) {
      return NextResponse.json(
        { error: "Um ou mais comprovantes não estão aguardando aprovação." },
        { status: 409 }
      );
    }

    if (acao === "recusar") {
      const motivo = String(
        body.motivo_recusa || "Comprovante recusado pela administração."
      ).trim();
      const { error } = await auth.supabase
        .from(tabela)
        .update({ comprovante_status: "recusado", motivo_recusa: motivo })
        .in("id", ids);

      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (lista.some((registro) => !registro.comprovante_url)) {
      return NextResponse.json(
        { error: "Não é possível confirmar: o comprovante não está disponível." },
        { status: 409 }
      );
    }

    const contaId = String(body.conta_bancaria_id || "").trim();
    if (!contaId) {
      return NextResponse.json(
        { error: "Selecione a conta bancária que recebeu o pagamento." },
        { status: 400 }
      );
    }

    const { data: conta, error: contaError } = await auth.supabase
      .from("contas_bancarias")
      .select("id,nome,banco")
      .eq("id", contaId)
      .eq("ativo", true)
      .single();

    if (contaError || !conta) {
      return NextResponse.json(
        { error: "Conta bancária não encontrada ou inativa." },
        { status: 409 }
      );
    }

    const originalTotal = lista.reduce(
      (soma, registro) => soma + Number(registro.valor || 0),
      0
    );
    const valor = Number(String(body.valor ?? "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json(
        { error: "Informe o valor realmente recebido no banco." },
        { status: 400 }
      );
    }

    const movimentoOrigemTipo = ids.length > 1 ? "mensalidade_lote" : tipo;
    const movimentoOrigemId = ids.length > 1 ? ids.join(",") : ids[0];
    const { data: existente, error: existenteError } = await auth.supabase
      .from("movimentacoes_financeiras")
      .select("id")
      .eq("origem_tipo", movimentoOrigemTipo)
      .eq("origem_id", movimentoOrigemId)
      .maybeSingle();

    if (existenteError) throw new Error(existenteError.message);
    if (existente) {
      return NextResponse.json(
        { error: "Este pagamento já possui lançamento no Financeiro." },
        { status: 409 }
      );
    }

    const descricao =
      ids.length > 1
        ? `Mensalidades - pagamento PIX em lote (${ids.length})`
        : tipo === "mensalidade"
          ? `Mensalidade ${String(lista[0].competencia || "").slice(0, 7)} - pagamento via PIX`
          : tipo === "convite"
            ? `Convite - ${lista[0].nome_convidado || "Convidado"}`
            : `Reserva - ${lista[0].responsavel_nome || "Responsável"}${lista[0].data_reserva ? ` - ${lista[0].data_reserva}` : ""}`;

    const { data: movimento, error: movimentoError } = await auth.supabase
      .from("movimentacoes_financeiras")
      .insert({
        conta_bancaria_id: contaId,
        conta_destino_id: null,
        grupo_transferencia: null,
        tipo: "entrada",
        categoria: tipo === "mensalidade" ? "Mensalidade" : tipo === "convite" ? "Convite" : "Reserva",
        descricao,
        valor,
        data_movimentacao: new Date().toISOString().slice(0, 10),
        forma_pagamento: "pix",
        origem_tipo: movimentoOrigemTipo,
        origem_id: movimentoOrigemId,
        socio_id: lista[0].socio_id || null,
        dependente_id: ids.length === 1 ? lista[0].dependente_id || null : null,
        comprovante_url: lista[0].comprovante_url || null,
        conciliado: true,
        data_conciliacao: new Date().toISOString(),
        observacoes: `Pagamento confirmado manualmente após conferência do crédito no banco. Valor informado como recebido: R$ ${valor.toFixed(2)}. Valor original das cobranças: R$ ${originalTotal.toFixed(2)}. Conta: ${conta.nome}${conta.banco ? ` (${conta.banco})` : ""}.`,
      })
      .select("id")
      .single();

    if (movimentoError || !movimento) {
      throw new Error(
        movimentoError?.message || "Não foi possível criar o lançamento financeiro."
      );
    }

    try {
      const agora = new Date().toISOString();
      const camposComuns = {
        comprovante_status: "aprovado",
        comprovante_aprovado_por: auth.usuario.id,
        comprovante_aprovado_em: agora,
        motivo_recusa: null,
      };

      if (tipo === "mensalidade") {
        const anterior = lista.map((registro) => ({
          id: registro.id,
          situacao: registro.situacao,
          data_pagamento: registro.data_pagamento,
          tipo_pagamento: registro.tipo_pagamento,
          comprovante_status: registro.comprovante_status,
          comprovante_aprovado_por: registro.comprovante_aprovado_por,
          comprovante_aprovado_em: registro.comprovante_aprovado_em,
          motivo_recusa: registro.motivo_recusa,
        }));

        const { error } = await auth.supabase
          .from("mensalidades")
          .update({
            ...camposComuns,
            situacao: "pago",
            data_pagamento: agora.slice(0, 10),
            tipo_pagamento: "pix",
          })
          .in("id", ids);
        if (error) throw error;

        const socioIds = [
          ...new Set(
            lista
              .filter((registro) => registro.socio_id && !registro.dependente_id)
              .map((registro) => String(registro.socio_id))
          ),
        ];

        if (socioIds.length) {
          const { error: sociosError } = await auth.supabase
            .from("socios")
            .update({
              situacao_financeira: "em_dia",
              data_ultimo_pagamento: agora.slice(0, 10),
            })
            .in("id", socioIds);

          if (sociosError) {
            await Promise.all(
              anterior.map((registro) =>
                auth.supabase
                  .from("mensalidades")
                  .update({
                    situacao: registro.situacao,
                    data_pagamento: registro.data_pagamento,
                    tipo_pagamento: registro.tipo_pagamento,
                    comprovante_status: registro.comprovante_status,
                    comprovante_aprovado_por: registro.comprovante_aprovado_por,
                    comprovante_aprovado_em: registro.comprovante_aprovado_em,
                    motivo_recusa: registro.motivo_recusa,
                  })
                  .eq("id", registro.id)
              )
            );
            throw sociosError;
          }
        }
      } else if (tipo === "convite") {
        const { error } = await auth.supabase
          .from("convites")
          .update({
            ...camposComuns,
            status: "pago",
            forma_pagamento: "pix",
          })
          .in("id", ids);
        if (error) throw error;
      } else {
        const { error } = await auth.supabase
          .from("reservas")
          .update({
            ...camposComuns,
            situacao: "confirmada",
            data_pagamento: agora.slice(0, 10),
            tipo_pagamento: "pix",
          })
          .in("id", ids);
        if (error) throw error;
      }
    } catch (sourceError) {
      await auth.supabase
        .from("movimentacoes_financeiras")
        .delete()
        .eq("id", movimento.id);
      throw sourceError;
    }

    return NextResponse.json({
      ok: true,
      valor_recebido: valor,
      valor_original: originalTotal,
      quantidade: ids.length,
      conta,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar pagamento." },
      { status: 500 }
    );
  }
}
