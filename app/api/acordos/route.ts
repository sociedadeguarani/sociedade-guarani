import { NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const FORMAS = new Set(["pix", "debito_em_conta", "boleto", "dinheiro", "transferencia", "cartao", "outro"]);
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const erro = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

type ParcelaInput = { valor: number; data_vencimento: string };

export async function GET(request: Request) {
  const auth = await exigirAdministrador(request);
  if ("error" in auth) return erro(String(auth.error || "Acesso não autorizado."), auth.status ?? 401);
  try {
    const db = getServiceClient();
    const [socios, mensalidades, contas, acordos] = await Promise.all([
      db.from("socios").select("id,nome,matricula,cpf,ativo,possui_mensalidade,valor_mensalidade").eq("ativo", true).order("nome"),
      db.from("mensalidades").select("id,socio_id,dependente_id,competencia,valor,total_cobrado,data_vencimento,situacao").in("situacao", ["em_aberto", "em_atraso"]).lt("data_vencimento", hojeBrasil()).order("data_vencimento"),
      db.from("contas_bancarias").select("id,nome,banco,ativo").eq("ativo", true).order("nome"),
      db.from("acordos_mensalidades").select("id,socio_id,situacao,valor_total,valor_entrada,quantidade_parcelas,data_acordo").eq("situacao", "ativo").order("created_at", { ascending: false }),
    ]);
    const falha = socios.error || mensalidades.error || contas.error || acordos.error;
    if (falha) throw falha;
    const ativos = new Set((acordos.data || []).map((a) => String(a.id)));
    const itens = await db.from("acordos_mensalidades_itens").select("mensalidade_id,acordo_id").eq("ativo", true);
    if (itens.error) throw itens.error;
    const vinculadas = new Set((itens.data || []).map((i) => String(i.mensalidade_id)));
    const socioPorId = new Map((socios.data || []).map((s) => [String(s.id), s]));
    const emAcordo = new Set((itens.data || []).filter((i) => ativos.has(String(i.acordo_id))).map((i) => String(i.mensalidade_id)));
    const pendencias = (mensalidades.data || []).filter((m) => !emAcordo.has(String(m.id))).map((m) => ({
      ...m, socio: socioPorId.get(String(m.socio_id)) || null,
      valor: Number(m.total_cobrado ?? m.valor ?? 0),
    }));
    return NextResponse.json({ socios: socios.data || [], mensalidades: pendencias, contas: contas.data || [], acordos: acordos.data || [] });
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
    const entrada = Number(body.valor_entrada || 0);
    const total = Number(body.valor_total || 0);
    const parcelas = Array.isArray(body.parcelas) ? body.parcelas as ParcelaInput[] : [];
    const formaEntrada = String(body.forma_entrada || "");
    const contaEntrada = String(body.conta_entrada_id || "");
    const entradaRecebida = body.entrada_recebida === true;
    const dataEntrada = String(body.data_entrada || hojeBrasil());
    const dataValida = (v: string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
    if (!socioId || ids.length === 0 || !Number.isFinite(total) || total <= 0 || !Number.isFinite(entrada) || entrada < 0 || entrada > total) return erro("Informe o sócio, as mensalidades e os valores válidos.");
    if (Math.abs(parcelas.reduce((s, p) => s + Number(p.valor || 0), 0) - (total - entrada)) > 0.01 || parcelas.some(p => !Number.isFinite(Number(p.valor)) || Number(p.valor) <= 0 || !dataValida(String(p.data_vencimento)))) return erro("As parcelas devem somar o saldo do acordo e ter vencimentos válidos.");
    if (entradaRecebida && (!contaEntrada || !FORMAS.has(formaEntrada) || !dataValida(dataEntrada))) return erro("Informe conta, forma e data válidas para registrar a entrada.");
    const { data: socio, error: socioErr } = await db.from("socios").select("id,nome,ativo").eq("id", socioId).maybeSingle();
    if (socioErr) throw socioErr;
    if (!socio || socio.ativo === false) return erro("Sócio não encontrado ou inativo.", 404);
    const { data: selecionadas, error: mensalErr } = await db.from("mensalidades").select("id,socio_id,dependente_id,competencia,valor,total_cobrado,data_vencimento,situacao").in("id", ids);
    if (mensalErr) throw mensalErr;
    if ((selecionadas || []).length !== ids.length || (selecionadas || []).some(m => m.socio_id !== socioId || !["em_aberto", "em_atraso"].includes(String(m.situacao)) || String(m.data_vencimento || "") >= hojeBrasil())) return erro("Uma ou mais mensalidades não estão disponíveis para acordo. Atualize a tela.", 409);
    const { data: vinculos, error: vincErr } = await db.from("acordos_mensalidades_itens").select("mensalidade_id").eq("ativo", true).in("mensalidade_id", ids);
    if (vincErr) throw vincErr;
    if ((vinculos || []).length) return erro("Uma ou mais mensalidades já pertencem a um acordo ativo.", 409);
    const { data: acordo, error: acordoErr } = await db.from("acordos_mensalidades").insert({
      socio_id: socioId, valor_total: total, valor_entrada: entrada,
      quantidade_parcelas: parcelas.length, observacoes: String(body.observacoes || "").trim() || null,
      situacao: "ativo", created_by: auth.usuario.id,
    }).select("*").single();
    if (acordoErr) throw acordoErr;
    try {
      const vinculosInsert = (selecionadas || []).map(m => ({
        acordo_id: acordo.id, mensalidade_id: m.id,
        valor_original: Number(m.total_cobrado ?? m.valor ?? 0), ativo: true,
      }));
      const { error: linkErr } = await db.from("acordos_mensalidades_itens").insert(vinculosInsert);
      if (linkErr) throw linkErr;
      if (parcelas.length) {
        const { error: parcErr } = await db.from("acordos_mensalidades_parcelas").insert(parcelas.map((p, i) => ({
          acordo_id: acordo.id, numero: i + 1, descricao: `Parcela ${i + 1}`,
          valor: Number(p.valor), data_vencimento: p.data_vencimento, situacao: "em_aberto",
        })));
        if (parcErr) throw parcErr;
      }
      if (entradaRecebida) {
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
      await db.from("acordos_mensalidades_parcelas").delete().eq("acordo_id", acordo.id);
      await db.from("acordos_mensalidades_itens").delete().eq("acordo_id", acordo.id);
      await db.from("acordos_mensalidades").delete().eq("id", acordo.id);
      throw e;
    }
  } catch (e) {
    console.error("[api/acordos][POST]", e);
    return erro(e instanceof Error ? e.message : "Não foi possível cadastrar o acordo.", 500);
  }
}
