import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function contarAtrasos(itens: { situacao: string | null; data_vencimento: string | null }[]) {
  const hoje = new Date().toISOString().slice(0, 10);
  return itens.filter((m) => m.situacao !== "pago" && m.situacao !== "isento" && (m.situacao === "em_atraso" || Boolean(m.data_vencimento && m.data_vencimento.slice(0, 10) < hoje))).length;
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;
  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");

    let query = supabase.from("acessos_sociedade")
      .select("id,socio_id,dependente_id,data_hora_entrada,data_hora_saida,autorizado,motivo_negacao,registrado_por,observacoes")
      .order("data_hora_entrada", { ascending: false }).limit(1000);
    if (de) query = query.gte("data_hora_entrada", `${de}T00:00:00`);
    if (ate) query = query.lte("data_hora_entrada", `${ate}T23:59:59`);
    const { data, error } = await query;
    if (error) throw error;

    const acessos = data || [];
    const socioIds = [...new Set(acessos.map((a) => a.socio_id).filter(Boolean))];
    const depIds = [...new Set(acessos.map((a) => a.dependente_id).filter(Boolean))];
    const [{ data: socios }, { data: deps }] = await Promise.all([
      socioIds.length ? supabase.from("socios").select("id,nome,matricula,foto_url").in("id", socioIds) : Promise.resolve({ data: [] as any[] }),
      depIds.length ? supabase.from("dependentes").select("id,nome").in("id", depIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const socioMap = new Map((socios || []).map((s) => [s.id, s]));
    const depMap = new Map((deps || []).map((d) => [d.id, d]));
    return NextResponse.json({ acessos: acessos.map((a) => ({ ...a, socio: socioMap.get(a.socio_id) || null, dependente: a.dependente_id ? depMap.get(a.dependente_id) || null : null })) });
  } catch (error) {
    return NextResponse.json({ error: `Erro ao carregar acessos: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "funcionario"]);
  if ("response" in auth) return auth.response;
  let etapa = "iniciando";
  try {
    const body = await request.json().catch(() => ({}));
    const qr = String(body?.qr || "").trim();
    let socioId = String(body?.socio_id || "").trim();
    const matricula = String(body?.matricula || "").trim();
    let dependenteId = String(body?.dependente_id || "").trim();
    const supabase = getServiceClient();

    if (!socioId && qr.startsWith("guarani:socio:")) socioId = qr.replace("guarani:socio:", "");
    if (!dependenteId && qr.startsWith("guarani:dependente:")) dependenteId = qr.replace("guarani:dependente:", "");
    // QR pode conter a URL da própria página de validação com os parâmetros.
    if (!socioId && !dependenteId && qr.startsWith("http")) {
      try {
        const u = new URL(qr);
        socioId = u.searchParams.get("socio_id") || "";
        dependenteId = u.searchParams.get("dependente_id") || "";
        if (!socioId && !dependenteId) {
          const m = u.searchParams.get("matricula");
          if (m) {
            const { data: socioPorMatricula, error: matriculaError } = await supabase.from("socios").select("id").eq("matricula", m).maybeSingle();
            if (matriculaError) throw new Error(`Falha ao buscar pela matrícula: ${matriculaError.message}`);
            if (socioPorMatricula) socioId = socioPorMatricula.id;
          }
        }
      } catch {}
    }
    if (!socioId && !dependenteId && matricula) {
      etapa = "buscando sócio pela matrícula";
      const { data: socioPorMatricula, error: matriculaError } = await supabase
        .from("socios").select("id").eq("matricula", matricula).maybeSingle();
      if (matriculaError) throw new Error(`Falha ao buscar pela matrícula: ${matriculaError.message}`);
      if (!socioPorMatricula) return NextResponse.json({ error: `Nenhum associado encontrado com a matrícula ${matricula}.` }, { status: 404 });
      socioId = socioPorMatricula.id;
    }
    if (!socioId && !dependenteId) return NextResponse.json({ error: "QR Code inválido ou sem identificação do associado." }, { status: 400 });

    let dependente: any = null;
    if (dependenteId) {
      etapa = "buscando dependente";
      const { data, error } = await supabase.from("dependentes").select("id,socio_id,nome,situacao_financeira,ativo").eq("id", dependenteId).maybeSingle();
      if (error) throw new Error(`Falha ao buscar dependente: ${error.message}`);
      if (!data || data.ativo === false) return NextResponse.json({ error: "Dependente não encontrado ou inativo." }, { status: 404 });
      dependente = data;
      socioId = String(data.socio_id);
    }

    etapa = "buscando sócio";
    const { data: socio, error: socioError } = await supabase.from("socios").select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira,foto_url").eq("id", socioId).maybeSingle();
    if (socioError) throw new Error(`Falha ao buscar associado: ${socioError.message}`);
    if (!socio) return NextResponse.json({ error: "Associado não encontrado." }, { status: 404 });

    const situacao = String(socio.situacao || "").toLowerCase();
    const autorizado = ["ativo", "ativa", "em_dia"].includes(situacao) || !situacao;
    const motivoNegacao = autorizado ? null : `Situação do sócio: ${socio.situacao || "não informada"}`;

    etapa = "registrando acesso";
    const { data: acesso, error: acessoError } = await supabase.from("acessos_sociedade").insert({
      socio_id: socio.id,
      dependente_id: dependenteId || null,
      registrado_por: auth.usuario.id,
      autorizado,
      motivo_negacao: motivoNegacao,
    }).select("id,socio_id,dependente_id,data_hora_entrada,data_hora_saida,autorizado,motivo_negacao,registrado_por,observacoes").single();
    if (acessoError) throw new Error(`Falha ao registrar a entrada: ${acessoError.message}`);

    const { data: mensalidades, error: mensalidadesError } = await supabase.from("mensalidades").select("id,situacao,data_vencimento,valor").eq("socio_id", socio.id);
    if (mensalidadesError) throw new Error(`Falha ao verificar mensalidades: ${mensalidadesError.message}`);
    const atrasos = contarAtrasos(mensalidades || []);
    const valorTotal = (mensalidades || []).filter((m) => m.situacao !== "pago" && m.situacao !== "isento" && (m.situacao === "em_atraso" || Boolean(m.data_vencimento && m.data_vencimento.slice(0, 10) < new Date().toISOString().slice(0, 10)))).reduce((s, m) => s + Number(m.valor || 0), 0);

    if (atrasos >= 3) {
      await supabase.from("avisos").insert({
        titulo: "🔴 Sócio com 3+ meses de atraso acessou a sociedade",
        mensagem: `${socio.nome} (matrícula ${socio.matricula || "—"}) entrou na sociedade com ${atrasos} mensalidade(s) em atraso, totalizando ${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
        tipo: "urgente", prioridade: "alta", fixado: false, ativo: true, publico: "administradores", criado_por: auth.usuario.id,
      });
    }

    return NextResponse.json({ acesso, socio, dependente, liberado: autorizado, mensalidade: { texto: atrasos ? "Em atraso" : "Em dia", cor: atrasos ? "vermelho" : "verde" }, inadimplencia: { atrasado: atrasos > 0, quantidade: atrasos, criticoTresMesesOuMais: atrasos >= 3, valorTotal } });
  } catch (error) {
    console.error(`Erro ao registrar acesso (etapa: ${etapa}):`, error);
    return NextResponse.json({ error: `Erro ao registrar acesso (${etapa}): ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}

