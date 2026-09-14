import { NextResponse } from "next/server";
import { normalizarPerfil, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const ESPACO_POR_CODIGO: Record<string, string[]> = {
  fut: ["Quadra de Futebol", "Futebol"],
  volei: ["Quadra de Vôlei", "Quadra de Volei", "Vôlei", "Volei"],
  areia: ["Quadra de Areia", "Areia"],
  q48: ["Quadra 48", "Quadra 48"],
  q1: ["Quiosque 1", "Quiosque 01"],
  q2: ["Quiosque 2", "Quiosque 02"],
  q3: ["Quiosque 3", "Quiosque 03"],
  salao_p: ["Salão Pequeno de Vidro", "Salao Pequeno de Vidro", "Salão Pequeno", "Salao Pequeno"],
  salao_g: ["Salão Social Grande", "Salao Social Grande", "Salão Grande", "Salao Grande"],
  ctg: ["Salão CTG", "Salao CTG", "CTG"],
};

function normalizarTexto(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function compacto(value: unknown) {
  return normalizarTexto(value).replace(/[^a-z0-9]/g, "");
}
function uuidValido(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value ?? ""));
}
function parseHorario(value: unknown) {
  const texto = String(value ?? "").replace(/\s+—\s+ocupado$/i, "").trim();
  const match = texto.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
  if (!match) return null;
  return { inicio: match[1], fim: match[2] };
}
function horarioFormatado(inicio: string | null, fim: string | null) {
  if (!inicio || !fim) return "";
  return `${String(inicio).slice(0, 5)} - ${String(fim).slice(0, 5)}`;
}
function codigoEspaco(nome: string, id: string) {
  const alvo = normalizarTexto(nome);
  for (const [codigo, aliases] of Object.entries(ESPACO_POR_CODIGO)) {
    if (aliases.some(a => normalizarTexto(a) === alvo)) return codigo;
  }
  return id;
}
function encontrarEspaco(lista: any[], codigoOuId: string) {
  if (uuidValido(codigoOuId)) return lista.find(item => item.id === codigoOuId) || null;
  const aliases = ESPACO_POR_CODIGO[codigoOuId] || [codigoOuId];
  const normAliases = aliases.map(normalizarTexto);
  const compactAliases = aliases.map(compacto);
  return lista.find((item: any) => {
    const nome = normalizarTexto(item.nome);
    const nomeCompacto = compacto(item.nome);
    if (normAliases.includes(nome) || compactAliases.includes(nomeCompacto)) return true;
    return compactAliases.some(alias =>
      alias.length >= 5 && (nomeCompacto.includes(alias) || alias.includes(nomeCompacto))
    );
  }) || null;
}

async function autenticar(request: Request) {
  const auth = await usuarioAutenticado(request);
  if ("error" in auth) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const perfil = normalizarPerfil(auth.perfil);
  if (!["administrador", "funcionario", "associado"].includes(perfil)) {
    return { error: NextResponse.json({ error: "Sem permissão para acessar reservas." }, { status: 403 }) };
  }
  return { auth, perfil };
}

function mapReserva(row: any) {
  const espaco = Array.isArray(row.espacos) ? row.espacos[0] : row.espacos;
  const status = String(row.situacao || "") === "cancelada" ? "cancelada" : "confirmada";
  const socio = Array.isArray(row.socios) ? row.socios[0] : row.socios;
  return {
    id: row.id,
    espacoId: codigoEspaco(String(espaco?.nome || ""), String(row.espaco_id || "")),
    socioId: row.socio_id || null,
    data: row.data_reserva,
    horario: horarioFormatado(row.hora_inicio, row.hora_fim),
    nome: row.responsavel_nome || socio?.nome || "",
    tipoPessoa: row.socio_id ? "socio" : "nao_socio",
    valor: Number(row.valor || 0),
    status,
    pagamento: "pix",
    comprovante_url: row.comprovante_url || null,
    comprovante_status: row.comprovante_status || "nenhum",
    motivo_recusa: row.motivo_recusa || null,
    situacao: row.situacao || null,
    tipo_pagamento: row.tipo_pagamento || null,
    espaco_nome: espaco?.nome || null,
  };
}

export async function GET(request: Request) {
  try {
    const resultado = await autenticar(request);
    if (resultado.error) return resultado.error;
    const { auth, perfil } = resultado;
    let query = auth.supabase
      .from("reservas")
      .select("*, espacos:espaco_id(id,nome), socios:socio_id(id,nome,matricula)")
      .order("data_reserva", { ascending: false })
      .order("created_at", { ascending: false });
    if (perfil === "associado") {
      if (!auth.usuario.socio_id) return NextResponse.json({ reservas: [] });
      query = query.eq("socio_id", auth.usuario.socio_id);
    }
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reservas: (data || []).map(mapReserva) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar reservas." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const resultado = await autenticar(request);
    if (resultado.error) return resultado.error;
    const { auth, perfil } = resultado;
    const body = await request.json();

    const tipoPessoa = String(body.tipo_pessoa || "socio").trim().toLowerCase() === "nao_socio" ? "nao_socio" : "socio";
    const codigoOuId = String(body.espaco_id || body.espaco_nome || "").trim();

    const { data: espacos, error: espacoError } = await auth.supabase
      .from("espacos")
      .select("id,nome,ativo,permite_reserva")
      .eq("ativo", true);
    if (espacoError) return NextResponse.json({ error: espacoError.message }, { status: 500 });

    const espaco = encontrarEspaco(espacos || [], codigoOuId);
    if (!espaco) {
      const disponiveis = (espacos || []).map((item: any) => item.nome).filter(Boolean).join(", ");
      return NextResponse.json({ error: `Espaço não encontrado no cadastro da Sociedade. Cadastros encontrados: ${disponiveis || "nenhum"}.` }, { status: 400 });
    }
    if (espaco.permite_reserva === false) return NextResponse.json({ error: "Este espaço não está liberado para reservas." }, { status: 400 });

    let socioId: string | null = body.socio_id || null;
    let responsavelNome = String(body.nome || "").trim();

    if (perfil === "associado") {
      if (!auth.usuario.socio_id) return NextResponse.json({ error: "Seu usuário não está vinculado a um sócio." }, { status: 403 });
      if (tipoPessoa !== "socio") return NextResponse.json({ error: "Associado deve realizar a reserva em seu próprio cadastro." }, { status: 403 });
      socioId = auth.usuario.socio_id;
      const { data: socio } = await auth.supabase.from("socios").select("id,nome").eq("id", socioId).maybeSingle();
      if (!socio) return NextResponse.json({ error: "Sócio vinculado ao usuário não foi encontrado." }, { status: 404 });
      responsavelNome = socio.nome;
    } else if (tipoPessoa === "socio") {
      if (!socioId || !uuidValido(socioId)) return NextResponse.json({ error: "Selecione um sócio válido como responsável." }, { status: 400 });
      const { data: socio, error: socioError } = await auth.supabase.from("socios").select("id,nome").eq("id", socioId).maybeSingle();
      if (socioError) return NextResponse.json({ error: socioError.message }, { status: 500 });
      if (!socio) return NextResponse.json({ error: "Sócio não encontrado." }, { status: 404 });
      responsavelNome = socio.nome;
    } else {
      if (!["administrador", "funcionario"].includes(perfil)) return NextResponse.json({ error: "Somente administração ou funcionário pode registrar reserva de não sócio." }, { status: 403 });
      socioId = null;
      if (!responsavelNome) return NextResponse.json({ error: "Informe o responsável não sócio." }, { status: 400 });
    }

    const dataReserva = String(body.data || body.data_reserva || "").trim();
    const horario = parseHorario(body.horario);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataReserva)) return NextResponse.json({ error: "Informe uma data válida." }, { status: 400 });
    if (!horario) return NextResponse.json({ error: "Informe um horário válido." }, { status: 400 });

    const { data: existentes, error: conflitoError } = await auth.supabase
      .from("reservas")
      .select("id,hora_inicio,hora_fim,situacao")
      .eq("espaco_id", espaco.id)
      .eq("data_reserva", dataReserva)
      .neq("situacao", "cancelada");
    if (conflitoError) return NextResponse.json({ error: conflitoError.message }, { status: 500 });

    const conflito = (existentes || []).some((item: any) =>
      String(item.hora_inicio).slice(0, 5) < horario.fim && String(item.hora_fim).slice(0, 5) > horario.inicio
    );
    if (conflito) return NextResponse.json({ error: "Este espaço já está reservado para o horário selecionado." }, { status: 409 });

    const valor = Number(body.valor || 0);
    if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: "Valor da reserva inválido." }, { status: 400 });

    const { data, error } = await auth.supabase
      .from("reservas")
      .insert({
        espaco_id: espaco.id,
        socio_id: socioId,
        dependente_id: null,
        responsavel_nome: responsavelNome,
        responsavel_telefone: null,
        responsavel_whatsapp: null,
        data_reserva: dataReserva,
        hora_inicio: horario.inicio,
        hora_fim: horario.fim,
        finalidade: "Reserva de espaço",
        quantidade_pessoas: null,
        valor,
        situacao: "solicitada",
        tipo_pagamento: "pix",
        data_pagamento: null,
        codigo_transacao: null,
        comprovante_url: null,
        prazo_pagamento: null,
        observacoes: null,
        comprovante_status: "nenhum",
        motivo_recusa: null,
      })
      .select("*, espacos:espaco_id(id,nome), socios:socio_id(id,nome,matricula)")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reserva: mapReserva(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar reserva." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const resultado = await autenticar(request);
    if (resultado.error) return resultado.error;
    const { auth, perfil } = resultado;
    if (perfil === "associado") return NextResponse.json({ error: "Somente administração pode alterar o status da reserva." }, { status: 403 });
    const body = await request.json();
    const id = String(body.id || "").trim();
    if (!id) return NextResponse.json({ error: "Reserva não informada." }, { status: 400 });
    const acao = String(body.status || body.situacao || "").trim().toLowerCase();
    const situacao = acao === "cancelada" || acao === "cancelar" ? "cancelada" : acao || "confirmada";
    const { data, error } = await auth.supabase
      .from("reservas")
      .update({
        situacao,
        cancelada_em: situacao === "cancelada" ? new Date().toISOString() : null,
        cancelada_por: situacao === "cancelada" ? auth.usuario.id : null,
      })
      .eq("id", id)
      .select("*, espacos:espaco_id(id,nome), socios:socio_id(id,nome,matricula)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, reserva: mapReserva(data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao atualizar reserva." }, { status: 500 });
  }
}
