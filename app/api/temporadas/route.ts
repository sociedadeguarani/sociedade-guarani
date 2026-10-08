/* app/api/temporadas/route.ts */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ParcelaEntrada = {
  descricao?: string;
  valor: number;
  data_vencimento: string;
  forma_pagamento: string;
  confirmar?: boolean;
  conta_bancaria_id?: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function autenticar(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: jsonError("Sessão não encontrada.", 401) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) {
    return { error: jsonError("Configuração do servidor incompleta.", 500) };
  }

  const authClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return { error: jsonError("Sessão inválida ou expirada.", 401) };

  const db = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usuario, error: usuarioError } = await db
    .from("usuarios_sistema")
    .select("id,perfil_id,ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (usuarioError || !usuario || usuario.ativo !== true) {
    return { error: jsonError("Usuário sem acesso ao módulo.", 403) };
  }

  const { data: perfil, error: perfilError } = await db
    .from("perfis")
    .select("codigo,nome")
    .eq("id", usuario.perfil_id)
    .maybeSingle();

  if (perfilError || !perfil) return { error: jsonError("Perfil não configurado.", 403) };

  const perfilTexto = `${perfil.codigo || ""} ${perfil.nome || ""}`.toLowerCase();
  const permitido =
    perfilTexto.includes("administrador") ||
    perfilTexto.includes("master") ||
    perfilTexto.includes("admin");

  if (!permitido) return { error: jsonError("Acesso restrito aos administradores.", 403) };

  return { db, user };
}

async function proximoCodigo(db: any) {
  const { data, error } = await db
    .from("temporadas")
    .select("codigo")
    .like("codigo", "TE%");

  if (error) throw error;

  let maior = 0;
  for (const row of data || []) {
    const match = String(row.codigo || "").match(/^TE(\d{4,})A$/i);
    if (match) maior = Math.max(maior, Number(match[1]));
  }
  return `TE${String(maior + 1).padStart(4, "0")}A`;
}

async function criarMovimentacao(
  db: any,
  temporadaId: string,
  parcelaId: string,
  socioId: string | null,
  valor: number,
  formaPagamento: string,
  contaId: string,
  dataPagamento: string
) {
  const { data: existente, error: erroBusca } = await db
    .from("movimentacoes_financeiras")
    .select("id")
    .eq("origem_tipo", "temporada_parcela")
    .eq("origem_id", parcelaId)
    .limit(1)
    .maybeSingle();

  if (erroBusca) throw erroBusca;
  if (existente?.id) return String(existente.id);

  const { data, error } = await db
    .from("movimentacoes_financeiras")
    .insert({
      conta_bancaria_id: contaId,
      conta_destino_id: null,
      grupo_transferencia: null,
      tipo: "entrada",
      categoria: "Temporada",
      descricao: `Temporada - parcela ${parcelaId}`,
      valor,
      data_movimentacao: dataPagamento,
      forma_pagamento: formaPagamento,
      origem_tipo: "temporada_parcela",
      origem_id: parcelaId,
      socio_id: socioId || null,
      dependente_id: null,
      comprovante_url: null,
      conciliado: false,
      data_conciliacao: null,
      observacoes: `Entrada financeira referente à parcela da temporada ${temporadaId}.`,
    })
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

export async function GET(request: NextRequest) {
  const auth = await autenticar(request);
  if ("error" in auth) return auth.error;

  try {
    const { data: temporadas, error } = await auth.db
      .from("temporadas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const ids = (temporadas || []).map((t: any) => String(t.id));
    const [{ data: parcelas, error: erroParcelas }, { data: participantes, error: erroParticipantes }] =
      await Promise.all([
        ids.length
          ? auth.db.from("temporadas_parcelas").select("*").in("temporada_id", ids).order("numero", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? auth.db.from("temporadas_participantes").select("*").in("temporada_id", ids)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (erroParcelas) throw erroParcelas;
    if (erroParticipantes) throw erroParticipantes;

    const mapaParcelas = new Map<string, any[]>();
    const mapaParticipantes = new Map<string, any[]>();

    for (const p of parcelas || []) {
      const chave = String((p as any).temporada_id);
      if (!mapaParcelas.has(chave)) mapaParcelas.set(chave, []);
      mapaParcelas.get(chave)!.push(p);
    }

    for (const p of participantes || []) {
      const chave = String((p as any).temporada_id);
      if (!mapaParticipantes.has(chave)) mapaParticipantes.set(chave, []);
      mapaParticipantes.get(chave)!.push(p);
    }

    return NextResponse.json({
      temporadas: (temporadas || []).map((t: any) => ({
        ...t,
        parcelas: mapaParcelas.get(String(t.id)) || [],
        participantes: mapaParticipantes.get(String(t.id)) || [],
      })),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erro ao carregar temporadas.", 500);
  }
}

export async function POST(request: NextRequest) {
  const auth = await autenticar(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const acao = String(body?.acao || "criar");

    if (acao === "criar") {
      const responsavelNome = String(body.responsavel_nome || "").trim();
      const responsavelCpf = body.responsavel_cpf ? String(body.responsavel_cpf).replace(/\D/g, "").slice(0, 11) : null;
      const responsavelTelefone = body.responsavel_telefone ? String(body.responsavel_telefone).trim() : null;
      const responsavelEmail = body.responsavel_email ? String(body.responsavel_email).trim() : null;
      const tipo = String(body.tipo || "");
      const inicio = String(body.inicio || "");
      const fim = String(body.fim || "");
      const valorTotal = Number(body.valor_total || 0);
      const parcelas = Array.isArray(body.parcelas) ? body.parcelas as ParcelaEntrada[] : [];

      if (!responsavelNome || !inicio || !fim) return jsonError("Responsável e período são obrigatórios.");
      if (!["temporada_individual", "temporada_familiar"].includes(tipo)) return jsonError("Tipo de temporada inválido.");
      if (fim < inicio) return jsonError("A data final não pode ser anterior à inicial.");
      if (valorTotal <= 0) return jsonError("O valor total deve ser maior que zero.");
      if (!parcelas.length) return jsonError("Informe pelo menos uma parcela.");

      const somaParcelas = parcelas.reduce((s, p) => s + Number(p.valor || 0), 0);
      if (Math.abs(somaParcelas - valorTotal) > 0.02) {
        return jsonError(`A soma das parcelas (${somaParcelas.toFixed(2)}) não confere com o total (${valorTotal.toFixed(2)}).`);
      }

      const codigo = await proximoCodigo(auth.db);
      const formas = [...new Set(parcelas.map((p) => String(p.forma_pagamento || "").trim()).filter(Boolean))];

      const { data: temporada, error: erroTemporada } = await auth.db
        .from("temporadas")
        .insert({
          socio_id: null,
          responsavel_nome: responsavelNome,
          responsavel_cpf: responsavelCpf,
          responsavel_telefone: responsavelTelefone,
          responsavel_email: responsavelEmail,
          tipo,
          modalidade: tipo === "temporada_familiar" ? "familiar" : "individual",
          codigo: null,
          matricula: null,
          inicio,
          fim,
          valor_total: valorTotal,
          situacao: parcelas[0]?.confirmar ? "ativa" : "pendente",
          forma_pagamento: formas.length === 1 ? formas[0] : "misto",
          conta_bancaria_id: body.conta_bancaria_id || null,
          data_contratacao: new Date().toISOString().slice(0, 10),
          data_pagamento: parcelas[0]?.confirmar ? new Date().toISOString().slice(0, 10) : null,
          observacoes: body.observacoes || null,
          created_by: auth.user.id,
        })
        .select("*")
        .single();

      if (erroTemporada || !temporada) throw erroTemporada || new Error("Não foi possível criar a temporada.");

      try {
        // A temporada não depende da tabela de Sócios.
        // Os participantes familiares serão cadastrados na própria temporada.

        const { data: parcelasCriadas, error: erroParcelas } = await auth.db
          .from("temporadas_parcelas")
          .insert(
            parcelas.map((p, index) => ({
              temporada_id: temporada.id,
              numero: index + 1,
              descricao: p.descricao || (index === 0 ? "Entrada" : `Parcela ${index}`),
              valor: Number(p.valor || 0),
              data_vencimento: p.data_vencimento,
              forma_pagamento: p.forma_pagamento,
              situacao:
                p.confirmar && String(p.forma_pagamento).toLowerCase() === "cheque"
                  ? "em_compensacao"
                  : p.confirmar
                    ? "pago"
                    : "pendente",
              data_pagamento: p.confirmar ? new Date().toISOString().slice(0, 10) : null,
              conta_bancaria_id: p.confirmar ? p.conta_bancaria_id || null : null,
              cheque_numero: null,
              boleto_status:
                p.forma_pagamento === "boleto" && !p.confirmar
                  ? "aguardando_integracao"
                  : null,
            }))
          )
          .select("*");

        if (erroParcelas) throw erroParcelas;

        const primeiraConfirmada = (parcelasCriadas || []).find((p: any) => p.situacao === "pago");
        if (primeiraConfirmada) {
          if (!primeiraConfirmada.conta_bancaria_id) {
            throw new Error("A parcela confirmada precisa de uma conta de recebimento.");
          }

          await criarMovimentacao(
            auth.db,
            temporada.id,
            String(primeiraConfirmada.id),
            null,
            Number(primeiraConfirmada.valor),
            String(primeiraConfirmada.forma_pagamento),
            String(primeiraConfirmada.conta_bancaria_id),
            String(primeiraConfirmada.data_pagamento)
          );

          const { error: atualiza } = await auth.db
            .from("temporadas")
            .update({
              codigo,
              matricula: codigo,
              situacao: "ativa",
              data_pagamento: primeiraConfirmada.data_pagamento,
            })
            .eq("id", temporada.id);

          if (atualiza) throw atualiza;
        } else {
          const { error: atualiza } = await auth.db
            .from("temporadas")
            .update({ codigo, matricula: null, situacao: "pendente" })
            .eq("id", temporada.id);

          if (atualiza) throw atualiza;
        }

        return NextResponse.json({
          ok: true,
          temporada_id: temporada.id,
          codigo: primeiraConfirmada ? codigo : null,
          message: primeiraConfirmada
            ? "Temporada criada e primeira parcela lançada no Financeiro."
            : "Temporada criada. A matrícula TE será gerada na confirmação do pagamento.",
        });
      } catch (innerError) {
        await auth.db.from("temporadas").delete().eq("id", temporada.id);
        throw innerError;
      }
    }

    if (acao === "registrar_pagamento") {
      const temporadaId = String(body.temporada_id || "").trim();
      const parcelaId = String(body.parcela_id || "").trim();
      const dataPagamento = String(body.data_pagamento || new Date().toISOString().slice(0, 10));
      const formaPagamento = String(body.forma_pagamento || "").trim();
      const contaId = body.conta_bancaria_id ? String(body.conta_bancaria_id) : null;
      const chequeNumero = body.cheque_numero ? String(body.cheque_numero) : null;

      if (!temporadaId || !parcelaId || !formaPagamento) return jsonError("Temporada, parcela e forma de pagamento são obrigatórios.");

      const { data: parcela, error: erroParcela } = await auth.db
        .from("temporadas_parcelas")
        .select("*")
        .eq("id", parcelaId)
        .eq("temporada_id", temporadaId)
        .maybeSingle();

      if (erroParcela) throw erroParcela;
      if (!parcela) return jsonError("Parcela não encontrada.", 404);
      if (parcela.situacao === "pago") return jsonError("Esta parcela já está paga.", 409);
      if (parcela.situacao === "cancelado") return jsonError("Esta parcela está cancelada.", 400);

      const situacao = formaPagamento === "cheque" ? "em_compensacao" : "pago";

      if (situacao === "pago" && !contaId) {
        return jsonError("Selecione a conta que receberá o pagamento.");
      }

      const { data: atualizada, error: erroAtualizacao } = await auth.db
        .from("temporadas_parcelas")
        .update({
          situacao,
          data_pagamento: dataPagamento,
          forma_pagamento: formaPagamento,
          conta_bancaria_id: contaId,
          cheque_numero: chequeNumero,
        })
        .eq("id", parcelaId)
        .select("*")
        .single();

      if (erroAtualizacao) throw erroAtualizacao;

      let movimentacaoId: string | null = null;
      if (situacao === "pago") {
        movimentacaoId = await criarMovimentacao(
          auth.db,
          temporadaId,
          parcelaId,
          ((await auth.db.from("temporadas").select("socio_id").eq("id", temporadaId).single()).data?.socio_id || null),
          Number(atualizada.valor),
          formaPagamento,
          contaId!,
          dataPagamento
        );

        await auth.db
          .from("temporadas_parcelas")
          .update({ movimentacao_id: movimentacaoId })
          .eq("id", parcelaId);
      }

      const { data: temporada } = await auth.db
        .from("temporadas")
        .select("id,socio_id,codigo,matricula,situacao,data_pagamento")
        .eq("id", temporadaId)
        .single();

      if (temporada && !temporada.codigo && situacao === "pago") {
        const codigo = await proximoCodigo(auth.db);
        await auth.db
          .from("temporadas")
          .update({
            codigo,
            matricula: codigo,
            situacao: "ativa",
            data_pagamento: dataPagamento,
          })
          .eq("id", temporadaId);

        await auth.db
          .from("temporadas_participantes")
          .update({ matricula: codigo })
          .eq("temporada_id", temporadaId)
          .eq("papel", "titular");
      } else if (temporada && situacao === "pago" && temporada.situacao === "pendente") {
        await auth.db
          .from("temporadas")
          .update({ situacao: "ativa", data_pagamento: dataPagamento })
          .eq("id", temporadaId);
      }

      return NextResponse.json({
        ok: true,
        movimentacao_id: movimentacaoId,
        situacao,
        message: movimentacaoId
          ? "Pagamento confirmado e lançado no Financeiro."
          : "Pagamento registrado em compensação.",
      });
    }

    return jsonError("Ação não reconhecida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erro interno no módulo de temporadas.", 500);
  }
}
