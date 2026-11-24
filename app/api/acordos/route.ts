import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const FORMAS = new Set(["pix", "cheque", "debito_em_conta", "boleto", "dinheiro", "transferencia", "cartao", "outro"]);
const FORMAS_ENTRADA = new Set(["pix", "cheque", "debito_em_conta", "dinheiro"]);
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const erro = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

type ParcelaInput = { valor: number; data_vencimento: string };
type OutraDividaInput = { descricao: string; valor: number };

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  try {
    const db = getServiceClient();
    const [socios, mensalidades, contas, acordos] = await Promise.all([
      db.from("socios").select("id,nome,matricula,cpf,ativo,possui_mensalidade,valor_mensalidade").eq("ativo", true).order("nome"),
      db.from("mensalidades").select("id,socio_id,dependente_id,competencia,valor,total_cobrado,data_vencimento,situacao").in("situacao", ["em_aberto", "em_atraso"]).order("data_vencimento"),
      db.from("contas_bancarias").select("id,nome,banco,ativo").eq("ativo", true).order("nome"),
      db.from("acordos_mensalidades").select("id,socio_id,situacao,valor_total,valor_entrada,quantidade_parcelas,data_acordo").in("situacao", ["ativo", "concluido"]).order("created_at", { ascending: false }),
    ]);
    const falha = socios.error || mensalidades.error || contas.error || acordos.error;
    if (falha) throw falha;
    const ativos = new Set((acordos.data || []).map((a) => String(a.id)));
    const [itens, competenciasFuturas] = await Promise.all([
      db.from("acordos_mensalidades_itens").select("mensalidade_id,acordo_id").eq("ativo", true),
      db.from("acordos_mensalidades_competencias").select("socio_id,competencia,acordo_id").eq("ativo", true),
    ]);
    if (itens.error) throw itens.error;
    if (competenciasFuturas.error) throw competenciasFuturas.error;
    const socioPorId = new Map((socios.data || []).map((s) => [String(s.id), s]));
    const emAcordo = new Set((itens.data || []).filter((i) => ativos.has(String(i.acordo_id))).map((i) => String(i.mensalidade_id)));
    const pendencias = (mensalidades.data || []).filter((m) => !emAcordo.has(String(m.id))).map((m) => ({
      ...m, socio: socioPorId.get(String(m.socio_id)) || null,
      valor: Number(m.total_cobrado ?? m.valor ?? 0),
    }));
    return NextResponse.json({ socios: socios.data || [], mensalidades: pendencias, contas: contas.data || [], acordos: acordos.data || [], competencias_futuras: competenciasFuturas.data || [] });
  } catch (e) {
    console.error("[api/acordos][GET]", e);
    return erro("Não foi possível carregar os dados dos acordos.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  const db = getServiceClient();
  try {
    const body = await request.json();
    const socioId = String(body.socio_id || "");
    const ids = Array.isArray(body.mensalidade_ids) ? [...new Set(body.mensalidade_ids.map(String))] : [];
    const competenciasFuturas = Array.isArray(body.competencias_futuras) ? body.competencias_futuras : [];
    const outrasDividas = Array.isArray(body.outras_dividas) ? (body.outras_dividas as OutraDividaInput[]).filter(d => String(d.descricao || "").trim() && Number(d.valor) > 0) : [];
    const entrada = Number(body.valor_entrada || 0);
    const total = Number(body.valor_total || 0);
    const parcelas = Array.isArray(body.parcelas) ? (body.parcelas as ParcelaInput[]).filter(p => Number(p.valor) > 0) : [];
    const formaEntrada = String(body.forma_entrada || "");
    const contaEntrada = String(body.conta_entrada_id || "");
    const formaParcelas = "boleto";
    const contaParcelas = String(body.conta_parcelas_id || "");
    const entradaRecebida = entrada > 0;
    const dataEntrada = String(body.data_entrada || hojeBrasil());
    const dataValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
    if (!socioId || (ids.length === 0 && competenciasFuturas.length === 0 && outrasDividas.length === 0) || !Number.isFinite(total) || total <= 0 || !Number.isFinite(entrada) || !Number.isInteger(entrada) || entrada < 0 || entrada > total) return erro("Informe o sócio, as dívidas e os valores válidos.");
    if (Math.abs(parcelas.reduce((s, p) => s + Number(p.valor || 0), 0) - (total - entrada)) > 0.01 || parcelas.some(p => !Number.isFinite(Number(p.valor)) || Number(p.valor) <= 0 || !dataValida(String(p.data_vencimento)))) return erro("As parcelas devem somar o saldo do acordo e ter vencimentos válidos.");
    if (competenciasFuturas.some((c: any) => String(c.competencia) !== "2026-12-01" || !Number.isFinite(Number(c.valor)) || Number(c.valor) <= 0 || !dataValida(String(c.data_vencimento)))) return erro("A competência futura deve ser dezembro/2026, com valor e vencimento válidos.");
    if (competenciasFuturas.length > 1) return erro("Dezembro/2026 pode ser incluído somente uma vez no acordo.");
    if (entrada > 0 && !dataValida(dataEntrada)) return erro("Informe uma data válida para vencimento ou recebimento da entrada.");
    if (entrada > 0 && (!contaEntrada || !FORMAS_ENTRADA.has(formaEntrada))) return erro("Informe a conta e a forma de pagamento da entrada.");
    if (parcelas.length > 0 && (!contaParcelas || formaParcelas !== "boleto")) return erro("Informe a conta e a forma de pagamento das parcelas.");
    const contasNecessarias = [...new Set([...(entrada > 0 ? [contaEntrada] : []), ...(parcelas.length ? [contaParcelas] : [])])];
    if (contasNecessarias.length) {
      const { data: contasValidas, error: contasErr } = await db.from("contas_bancarias").select("id,ativo").in("id", contasNecessarias);
      if (contasErr) throw contasErr;
      if ((contasValidas || []).length !== contasNecessarias.length || (contasValidas || []).some(c => c.ativo === false)) return erro("Uma das contas selecionadas está inválida ou inativa.");
    }
    const { data: socio, error: socioErr } = await db.from("socios").select("id,nome,ativo").eq("id", socioId).maybeSingle();
    if (socioErr) throw socioErr;
    if (!socio || socio.ativo === false) return erro("Sócio não encontrado ou inativo.", 404);
    let selecionadas: Array<{id:string;socio_id:string;dependente_id:string|null;competencia:string;valor:number;total_cobrado:number|null;data_vencimento:string;situacao:string}> = [];
    if (ids.length) {
      const { data, error: mensalErr } = await db.from("mensalidades").select("id,socio_id,dependente_id,competencia,valor,total_cobrado,data_vencimento,situacao").in("id", ids);
      if (mensalErr) throw mensalErr;
      selecionadas = data || [];
      if (selecionadas.length !== ids.length || selecionadas.some(m => m.socio_id !== socioId || !["em_aberto", "em_atraso"].includes(String(m.situacao)))) return erro("Uma ou mais mensalidades não estão disponíveis para acordo. Atualize a tela.", 409);
      const { data: vinculos, error: vincErr } = await db.from("acordos_mensalidades_itens").select("mensalidade_id").eq("ativo", true).in("mensalidade_id", ids);
      if (vincErr) throw vincErr;
      if ((vinculos || []).length) return erro("Uma ou mais mensalidades já pertencem a um acordo ativo.", 409);
    }
    if (competenciasFuturas.length) {
      const { data: existentesFuturos, error: futurosErr } = await db.from("acordos_mensalidades_competencias").select("id").eq("socio_id", socioId).eq("competencia", "2026-12-01").eq("ativo", true);
      if (futurosErr) throw futurosErr;
      const { data: mensalidadeDezembro, error: mensalidadeDezembroErr } = await db.from("mensalidades").select("id").eq("socio_id", socioId).eq("competencia", "2026-12-01").limit(1);
      if (mensalidadeDezembroErr) throw mensalidadeDezembroErr;
      if ((existentesFuturos || []).length || (mensalidadeDezembro || []).length) return erro("Dezembro/2026 já foi gerado ou já está vinculado a outro acordo.", 409);
    }
    const { data: acordo, error: acordoErr } = await db.from("acordos_mensalidades").insert({
      socio_id: socioId, valor_total: total, valor_entrada: entrada,
      quantidade_parcelas: parcelas.length, observacoes: String(body.observacoes || "").trim() || null,
      situacao: entrada >= total ? "concluido" : "ativo", created_by: auth.usuario.id,
    }).select("*").single();
    if (acordoErr) throw acordoErr;
    try {
      const vinculosInsert = (selecionadas || []).map(m => ({
        acordo_id: acordo.id, mensalidade_id: m.id,
        valor_original: Number(m.total_cobrado ?? m.valor ?? 0), ativo: true,
      }));
      if (vinculosInsert.length) {
        const { error: linkErr } = await db.from("acordos_mensalidades_itens").insert(vinculosInsert);
        if (linkErr) throw linkErr;
      }
      if (competenciasFuturas.length) {
        const { error: competenciaErr } = await db.from("acordos_mensalidades_competencias").insert(competenciasFuturas.map((c: any) => ({
          acordo_id: acordo.id, socio_id: socioId, competencia: "2026-12-01",
          valor_original: Number(c.valor), data_vencimento: String(c.data_vencimento), ativo: true,
        })));
        if (competenciaErr) throw competenciaErr;
      }
      if (outrasDividas.length) {
        const { error: outrasErr } = await db.from("acordos_mensalidades_outros_itens").insert(outrasDividas.map(d => ({ acordo_id: acordo.id, descricao: String(d.descricao).trim(), valor: Number(d.valor) })));
        if (outrasErr) throw outrasErr;
      }
      const parcelasParaCriar = parcelas.map((p, i) => ({
        acordo_id: acordo.id, numero: i + 1,
        descricao: "Parcela " + (i + 1), valor: Number(p.valor),
        data_vencimento: p.data_vencimento, situacao: "em_aberto",
        forma_pagamento: formaParcelas, conta_bancaria_id: contaParcelas,
      }));
      if (parcelasParaCriar.length) {
        const { error: parcErr } = await db.from("acordos_mensalidades_parcelas").insert(parcelasParaCriar);
        if (parcErr) throw parcErr;
      }
      if (entrada > 0) {
        const { data: conta, error: contaErr } = await db.from("contas_bancarias").select("id,ativo").eq("id", contaEntrada).maybeSingle();
        if (contaErr) throw contaErr;
        if (!conta || conta.ativo === false) throw new Error("Conta de recebimento inválida ou inativa.");
        const { data: movimento, error: movErr } = await db.from("movimentacoes_financeiras").insert({
          conta_bancaria_id: contaEntrada, conta_destino_id: null, tipo: "entrada",
          categoria: "Acordo de mensalidades", descricao: `Entrada de acordo — ${socio.nome}`,
          valor: entrada, data_movimentacao: dataEntrada, forma_pagamento: formaEntrada,
          origem_tipo: "acordo_mensalidades_entrada", origem_id: acordo.id,
          socio_id: socioId, dependente_id: null, created_by: auth.usuario.id,
          conciliado: false, observacoes: `Entrada do acordo ${acordo.numero || acordo.id}.`,
        }).select("id").single();
        if (movErr) throw movErr;
        const { error: updateErr } = await db.from("acordos_mensalidades").update({
          entrada_recebida: true, data_entrada: dataEntrada,
          forma_entrada: formaEntrada, conta_entrada_id: contaEntrada,
          movimentacao_entrada_id: movimento.id,
        }).eq("id", acordo.id);
        if (updateErr) throw updateErr;
      }
      return NextResponse.json({ ok: true, acordo, message: "Acordo cadastrado." });
    } catch (e) {
      await db.from("movimentacoes_financeiras").delete().eq("origem_tipo", "acordo_mensalidades_entrada").eq("origem_id", acordo.id);
      await db.from("acordos_mensalidades_parcelas").delete().eq("acordo_id", acordo.id);
      await db.from("acordos_mensalidades_outros_itens").delete().eq("acordo_id", acordo.id);
      await db.from("acordos_mensalidades_itens").delete().eq("acordo_id", acordo.id);
      await db.from("acordos_mensalidades_competencias").delete().eq("acordo_id", acordo.id);
      await db.from("acordos_mensalidades").delete().eq("id", acordo.id);
      throw e;
    }
  } catch (e) {
    console.error("[api/acordos][POST]", e);
    return erro(e instanceof Error ? e.message : "Não foi possível cadastrar o acordo.", 500);
  }
}


export async function PATCH(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  const db = getServiceClient();
  try {
    const body = await request.json();
    const parcelaId = String(body.parcela_id || "");
    const contaId = String(body.conta_bancaria_id || "");
    const forma = String(body.forma_pagamento || "");
    const data = String(body.data_pagamento || hojeBrasil());
    if (!parcelaId || !contaId || !FORMAS.has(forma) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return erro("Informe parcela, conta, forma e data válidas.");
    const { data: conta, error: contaErr } = await db.from("contas_bancarias").select("id,ativo").eq("id", contaId).maybeSingle();
    if (contaErr) throw contaErr;
    if (!conta || conta.ativo === false) return erro("Conta de recebimento inválida ou inativa.");
    const { data: parcela, error: parcelaErr } = await db.from("acordos_mensalidades_parcelas").select("*").eq("id", parcelaId).maybeSingle();
    if (parcelaErr) throw parcelaErr;
    if (!parcela) return erro("Parcela não encontrada.", 404);
    if (parcela.situacao === "pago" || parcela.situacao === "cancelado") return erro("Esta parcela já foi baixada ou cancelada.", 409);
    const { data: acordo, error: acordoErr } = await db.from("acordos_mensalidades").select("id,socio_id,numero,situacao").eq("id", parcela.acordo_id).maybeSingle();
    if (acordoErr) throw acordoErr;
    if (!acordo || acordo.situacao !== "ativo") return erro("Acordo não está ativo.", 409);
    const { data: socio, error: socioErr } = await db.from("socios").select("nome").eq("id", acordo.socio_id).maybeSingle();
    if (socioErr) throw socioErr;
    const { data: atualizada, error: updateErr } = await db.from("acordos_mensalidades_parcelas")
      .update({ situacao: "pago", data_pagamento: data, forma_pagamento: forma, conta_bancaria_id: contaId })
      .eq("id", parcelaId).neq("situacao", "pago").select("*").maybeSingle();
    if (updateErr) throw updateErr;
    if (!atualizada) return erro("Esta parcela já foi recebida. Atualize a tela.", 409);
    try {
      const { data: movimento, error: movErr } = await db.from("movimentacoes_financeiras").insert({
        conta_bancaria_id: contaId, conta_destino_id: null, tipo: "entrada",
        categoria: "Acordo de mensalidades",
        descricao: `Acordo de mensalidades — ${socio?.nome || "Sócio"} — Parcela ${parcela.numero}`,
        valor: Number(parcela.valor), data_movimentacao: data, forma_pagamento: forma,
        origem_tipo: "acordo_mensalidades_parcela", origem_id: parcelaId,
        socio_id: acordo.socio_id, dependente_id: null, created_by: auth.usuario.id,
        conciliado: false, observacoes: `Recebimento da parcela ${parcela.numero} do acordo ${acordo.numero || acordo.id}.`,
      }).select("id").single();
      if (movErr) throw movErr;
      const { error: vinculoErr } = await db.from("acordos_mensalidades_parcelas").update({ movimentacao_id: movimento.id }).eq("id", parcelaId);
      if (vinculoErr) throw vinculoErr;
      const { count, error: abertasErr } = await db.from("acordos_mensalidades_parcelas").select("id", { count: "exact", head: true }).eq("acordo_id", acordo.id).neq("situacao", "pago").neq("situacao", "cancelado");
      if (abertasErr) throw abertasErr;
      if ((count || 0) === 0) {
        const { error: quitarErr } = await db.from("acordos_mensalidades").update({ situacao: "concluido" }).eq("id", acordo.id);
        if (quitarErr) throw quitarErr;
      }
      return NextResponse.json({ ok: true, message: "Parcela recebida e lançada no Financeiro." });
    } catch (e) {
      await db.from("movimentacoes_financeiras").delete().eq("origem_tipo", "acordo_mensalidades_parcela").eq("origem_id", parcelaId);
      await db.from("acordos_mensalidades_parcelas").update({ situacao: "em_aberto", data_pagamento: null, forma_pagamento: null, conta_bancaria_id: null, movimentacao_id: null }).eq("id", parcelaId);
      throw e;
    }
  } catch (e) {
    console.error("[api/acordos][PATCH]", e);
    return erro(e instanceof Error ? e.message : "Não foi possível registrar o recebimento.", 500);
  }
}
