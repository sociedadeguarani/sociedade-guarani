import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";
const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const dataHoje = () => new Date().toISOString().slice(0, 10);

async function garantirBucket(db: any) {
  const atual = await db.storage.getBucket(BUCKET);
  if (!atual.error) return;
  const cr = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "8MB", allowedMimeTypes: TIPOS });
  if (cr.error && !/already exists/i.test(cr.error.message)) throw new Error(cr.error.message);
}

export async function GET(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const db = auth.supabase;
    const [{ data: convites, error: ce }, { data: socios, error: se }, { data: contas, error: be }] = await Promise.all([
      db.from("convites").select("*").order("created_at", { ascending: false }),
      db.from("socios").select("id,nome,matricula").order("nome", { ascending: true }),
      db.from("contas_bancarias").select("id,nome,banco").eq("ativo", true).order("nome", { ascending: true }),
    ]);
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
    if (se) return NextResponse.json({ error: se.message }, { status: 500 });
    if (be) return NextResponse.json({ error: be.message }, { status: 500 });
    return NextResponse.json({ convites: convites || [], socios: socios || [], contas: contas || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao carregar convites." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const db = auth.supabase;
    const form = await request.formData();
    const socio_id = String(form.get("socio_id") || "").trim() || null;
    const nome = String(form.get("nome") || "").trim();
    const documento = String(form.get("documento") || "").trim() || null;
    const cidade = String(form.get("cidade") || "").trim();
    const tipo = String(form.get("tipo") || "diario").trim();
    const inicio = String(form.get("inicio") || dataHoje()).trim();
    const fimRaw = String(form.get("fim") || "").trim();
    const fim = tipo === "diario" ? inicio : (fimRaw || null);
    const valor = Number(String(form.get("valor") || "0").replace(",", "."));
    const pagamento = String(form.get("pagamento") || "pix").trim().toLowerCase();
    const conta_id = String(form.get("conta_id") || "").trim();
    const arquivo = form.get("arquivo");

    if (!nome) return NextResponse.json({ error: "Informe o nome do convidado." }, { status: 400 });
    if (!cidade) return NextResponse.json({ error: "Informe a cidade do convidado." }, { status: 400 });
    if (!["diario", "semanal", "mensal"].includes(tipo)) return NextResponse.json({ error: "Tipo de convite inválido." }, { status: 400 });
    if (!["pix", "dinheiro"].includes(pagamento)) return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
    if (pagamento === "dinheiro" && !conta_id) return NextResponse.json({ error: "Selecione a conta de recebimento." }, { status: 400 });
    if (arquivo && !(arquivo instanceof File)) return NextResponse.json({ error: "Comprovante inválido." }, { status: 400 });
    if (arquivo instanceof File && (!TIPOS.includes(arquivo.type) || arquivo.size > 8 * 1024 * 1024)) return NextResponse.json({ error: "Comprovante inválido. Use JPG, PNG, WEBP ou PDF até 8 MB." }, { status: 400 });
    if (pagamento === "pix" && !(arquivo instanceof File)) return NextResponse.json({ error: "Para pagamento PIX, anexe o comprovante antes de cadastrar o convite." }, { status: 400 });

    if (socio_id) {
      const { data: socio, error } = await db.from("socios").select("id").eq("id", socio_id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!socio) return NextResponse.json({ error: "Associado responsável não encontrado." }, { status: 404 });
    }

    if (pagamento === "dinheiro") {
      const { data: conta, error } = await db.from("contas_bancarias").select("id").eq("id", conta_id).eq("ativo", true).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!conta) return NextResponse.json({ error: "Conta de recebimento não encontrada ou inativa." }, { status: 409 });
    }

    const { data: convite, error: ce } = await db.from("convites").insert({
      socio_id, nome_convidado: nome, documento_convidado: documento, cidade_convidado: cidade,
      data_inicio: inicio, data_fim: fim, tipo, valor,
      status: pagamento === "pix" ? "pendente" : "pago", forma_pagamento: pagamento,
      comprovante_url: null, comprovante_enviado_em: null,
      comprovante_status: pagamento === "pix" ? "pendente" : "aprovado", motivo_recusa: null,
    }).select("*").single();
    if (ce || !convite) return NextResponse.json({ error: ce?.message || "Não foi possível criar o convite." }, { status: 500 });

    if (pagamento === "dinheiro") {
      const { error: me } = await db.from("movimentacoes_financeiras").insert({
        conta_bancaria_id: conta_id, conta_destino_id: null, grupo_transferencia: null,
        tipo: "entrada", categoria: "Convite", descricao: `Convite - ${nome}`, valor,
        data_movimentacao: dataHoje(), forma_pagamento: "dinheiro", origem_tipo: "convite",
        origem_id: convite.id, socio_id, dependente_id: null, comprovante_url: null,
        conciliado: false, data_conciliacao: null, observacoes: "Pagamento em dinheiro registrado pela administração.",
      });
      if (me) {
        await db.from("convites").delete().eq("id", convite.id);
        return NextResponse.json({ error: `Não foi possível lançar o pagamento no financeiro: ${me.message}` }, { status: 500 });
      }
      return NextResponse.json({ ok: true, convite });
    }

    await garantirBucket(db);
    const arquivoPix = arquivo as File;
    const ext = arquivoPix.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/convite/${convite.id}-${Date.now()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(caminho, new Uint8Array(await arquivoPix.arrayBuffer()), { contentType: arquivoPix.type, upsert: false });
    if (up.error) {
      await db.from("convites").delete().eq("id", convite.id);
      return NextResponse.json({ error: `Não foi possível salvar o comprovante: ${up.error.message}` }, { status: 500 });
    }
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);
    const agora = new Date().toISOString();
    const { data: atualizado, error: ue } = await db.from("convites").update({ comprovante_url: pub.publicUrl, comprovante_enviado_em: agora, comprovante_status: "pendente" }).eq("id", convite.id).select("*").single();
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
    const { error: ne } = await db.from("notificacoes_admin").insert({
      tipo: "comprovante_pagamento", titulo: "Novo comprovante de convite aguardando aprovação",
      mensagem: `Convite de ${nome} no valor de R$ ${valor.toFixed(2).replace(".", ",")} foi enviado para conferência.`,
      origem_tipo: "convite", origem_id: convite.id, lida: false,
    });
    return NextResponse.json({ ok: true, convite: atualizado || convite, url: pub.publicUrl, aviso: ne ? `Convite salvo, mas a notificação não foi criada: ${ne.message}` : undefined });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao registrar convite." }, { status: 500 });
  }
}
