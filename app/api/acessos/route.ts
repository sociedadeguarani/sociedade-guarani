import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

function mensagemErro(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: unknown }).message;
    if (msg) return String(msg);
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador", "administrador_master", "funcionario"]);
  if ("response" in auth) return auth.response;
  try {
    const supabase = getServiceClient();
    const { searchParams } = new URL(request.url);
    const de = searchParams.get("de");
    const ate = searchParams.get("ate");

    // Evitamos o embedding automático do Supabase (socio:socios(...), etc.)
    // porque ele depende do nome exato da chave estrangeira no banco — se
    // essa constraint tiver outro nome (ou nunca tiver sido criada com esse
    // nome específico), a consulta inteira falha. Buscamos os acessos
    // primeiro e os dados de sócio/dependente/usuário depois, separadamente.
    let query = supabase
      .from("acessos_sociedade")
      .select("id,socio_id,dependente_id,temporada_id,temporada_participante_id,data_hora_entrada,data_hora_saida,autorizado,motivo_negacao,registrado_por")
      .order("data_hora_entrada", { ascending: false })
      .limit(1000);
    if (de) query = query.gte("data_hora_entrada", `${de}T00:00:00`);
    if (ate) query = query.lte("data_hora_entrada", `${ate}T23:59:59`);

    const { data: acessos, error } = await query;
    if (error) throw error;

    const lista = acessos || [];
    const socioIds = [...new Set(lista.map((a) => a.socio_id).filter(Boolean))];
    const dependenteIds = [...new Set(lista.map((a) => a.dependente_id).filter(Boolean))];
    const usuarioIds = [...new Set(lista.map((a) => a.registrado_por).filter(Boolean))];
    const temporadaIds = [...new Set(lista.map((a) => a.temporada_id).filter(Boolean))];
    const temporadaParticipanteIds = [...new Set(lista.map((a) => a.temporada_participante_id).filter(Boolean))];

    const [sociosResult, dependentesResult, usuariosResult, temporadasResult, temporadaParticipantesResult] = await Promise.all([
      socioIds.length
        ? supabase.from("socios").select("id,nome,matricula,foto_url").in("id", socioIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      dependenteIds.length
        ? supabase.from("dependentes").select("id,nome").in("id", dependenteIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      usuarioIds.length
        ? supabase.from("usuarios_sistema").select("id,nome_exibicao").in("id", usuarioIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      temporadaIds.length
        ? supabase
            .from("temporadas")
            .select("id,codigo,matricula,tipo,modalidade,inicio,fim,situacao,responsavel_nome")
            .in("id", temporadaIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      temporadaParticipanteIds.length
        ? supabase.from("temporadas_participantes").select("id,nome,matricula,foto_url,papel,parentesco").in("id", temporadaParticipanteIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;
    if (usuariosResult.error) throw usuariosResult.error;
    if (temporadasResult.error) throw temporadasResult.error;
    if (temporadaParticipantesResult.error) throw temporadaParticipantesResult.error;

    const mapaSocios = new Map((sociosResult.data || []).map((s: any) => [s.id, s]));
    const mapaDependentes = new Map((dependentesResult.data || []).map((d: any) => [d.id, d]));
    const mapaUsuarios = new Map((usuariosResult.data || []).map((u: any) => [u.id, u]));
    const mapaTemporadas = new Map((temporadasResult.data || []).map((t: any) => [t.id, t]));
    const mapaTemporadaParticipantes = new Map((temporadaParticipantesResult.data || []).map((p: any) => [p.id, p]));

    const resultado = lista.map((a) => ({
      ...a,
      socio: a.socio_id ? mapaSocios.get(a.socio_id) || null : null,
      dependente: a.dependente_id ? mapaDependentes.get(a.dependente_id) || null : null,
      usuario: a.registrado_por ? mapaUsuarios.get(a.registrado_por) || null : null,
      temporada: a.temporada_id ? mapaTemporadas.get(a.temporada_id) || null : null,
      temporada_participante: a.temporada_participante_id ? mapaTemporadaParticipantes.get(a.temporada_participante_id) || null : null,
    }));

    return NextResponse.json({ acessos: resultado });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar acessos: ${mensagemErro(error, "erro desconhecido")}` },
      { status: 500 }
    );
  }
}

function situacaoMensalidadePorQuantidade(quantidade: number) {
  if (quantidade <= 1) return { texto: "Em dia", cor: "verde" };
  if (quantidade === 2) return { texto: "Atenção", cor: "amarelo" };
  return { texto: "Crítico", cor: "vermelho" };
}

async function verificarMensalidadesAtrasadas(
  supabase: ReturnType<typeof getServiceClient>,
  socioId: string
) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("mensalidades")
    .select("id,valor,data_vencimento,situacao")
    .eq("socio_id", socioId)
    .lt("data_vencimento", hoje);

  if (error) throw error;

  const itens = (data || []).filter((m: any) =>
    !["pago", "isento", "isenta", "quitado", "recebido"].includes(
      String(m.situacao || "").toLowerCase()
    )
  );

  const valorTotal = itens.reduce((soma, m) => soma + Number(m.valor || 0), 0);
  const quantidade = itens.length;

  return {
    atrasado: quantidade > 0,
    criticoTresMesesOuMais: quantidade >= 3,
    quantidade,
    valorTotal,
    status: situacaoMensalidadePorQuantidade(quantidade),
  };
}
async function avisarAdministradoresInadimplencia(
  supabase: ReturnType<typeof getServiceClient>,
  socio: { nome: string; matricula: number | string | null },
  quantidade: number,
  valorTotal: number,
  criadoPor: string
) {
  try {
    await supabase.from("avisos").insert({
      titulo: "🔴 Sócio com 3+ meses de atraso acessou a sociedade",
      mensagem: `${socio.nome} (matrícula ${socio.matricula || "—"}) entrou na sociedade com ${quantidade} mensalidade(s) em atraso (3 meses ou mais), totalizando ${valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      tipo: "urgente",
      prioridade: "alta",
      fixado: false,
      ativo: true,
      publico: "administradores",
      criado_por: criadoPor,
    });
  } catch (e) {
    console.error("Falha ao gerar aviso de inadimplência:", e);
  }
}

type TemporadaAcesso = {
  id: string;
  codigo: string | null;
  matricula: string | null;
  tipo: string;
  modalidade: string;
  inicio: string;
  fim: string;
  situacao: string;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  responsavel_telefone: string | null;
};

function dataHojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function temporadaEstaValida(temporada: TemporadaAcesso) {
  const hoje = dataHojeBrasil();
  const situacao = String(temporada.situacao || "").toLowerCase();
  if (situacao !== "ativa") return false;
  if (temporada.inicio && temporada.inicio > hoje) return false;
  if (temporada.fim && temporada.fim < hoje) return false;
  return true;
}

async function verificarParcelasTemporadaAtrasadas(
  supabase: ReturnType<typeof getServiceClient>,
  temporadaId: string
) {
  const hoje = dataHojeBrasil();
  const { data, error } = await supabase
    .from("temporadas_parcelas")
    .select("id,numero,descricao,valor,data_vencimento,situacao")
    .eq("temporada_id", temporadaId)
    .lt("data_vencimento", hoje)
    .order("data_vencimento", { ascending: true });

  if (error) throw error;

  const pendentes = (data || []).filter((p: any) =>
    !["pago", "paid", "quitado", "recebido", "cancelado", "cancelada", "isento", "isenta"].includes(
      String(p.situacao || "").toLowerCase()
    )
  );

  return {
    atrasado: pendentes.length > 0,
    quantidade: pendentes.length,
    valorTotal: pendentes.reduce((total: number, p: any) => total + Number(p.valor || 0), 0),
    parcelas: pendentes,
  };
}

function matriculaTemporadaNormalizada(valor: unknown) {
  return String(valor || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "administrador_master", "funcionario"]);
  if ("response" in auth) return auth.response;

  let etapa = "iniciando";

  try {
    const body = await request.json().catch(() => ({}));
    const qr = String(body?.qr || "").trim();
    const socioId = String(body?.socio_id || "").trim();
    const matricula = matriculaTemporadaNormalizada(body?.matricula);
    let dependenteId = String(body?.dependente_id || "").trim();
    const supabase = getServiceClient();

    let id = socioId;
    let temporadaId = "";
    let temporadaParticipanteId = "";

    if (!id && qr.startsWith("guarani:socio:")) {
      id = qr.replace("guarani:socio:", "");
    }

    if (!dependenteId && qr.startsWith("guarani:dependente:")) {
      dependenteId = qr.replace("guarani:dependente:", "");
    }

    if (!temporadaId && qr.startsWith("guarani:temporada:")) {
      temporadaId = qr.replace("guarani:temporada:", "");
    }

    if (!temporadaParticipanteId && qr.startsWith("guarani:temporada-participante:")) {
      temporadaParticipanteId = qr.replace("guarani:temporada-participante:", "");
    }

    // QR antigo/novo pode apontar diretamente para a matrícula da temporada.
    // Isso permite que a carteirinha TE funcione sem transformar o responsável
    // em sócio no cadastro principal.
    if (!temporadaId && !temporadaParticipanteId && !id && !dependenteId && matricula.startsWith("TE")) {
      etapa = "buscando temporada pela matrícula";

      const { data: temporadaPorMatricula, error: temporadaMatriculaError } =
        await supabase
          .from("temporadas")
          .select("id")
          .eq("matricula", matricula)
          .maybeSingle();

      if (temporadaMatriculaError) throw temporadaMatriculaError;

      if (temporadaPorMatricula) {
        temporadaId = String(temporadaPorMatricula.id);
      } else {
        const { data: participantePorMatricula, error: participanteMatriculaError } =
          await supabase
            .from("temporadas_participantes")
            .select("id,temporada_id")
            .eq("matricula", matricula)
            .maybeSingle();

        if (participanteMatriculaError) throw participanteMatriculaError;

        if (participantePorMatricula) {
          temporadaParticipanteId = String(participantePorMatricula.id);
          temporadaId = String(participantePorMatricula.temporada_id);
        }
      }
    }

    // QR de participante de temporada.
    if (temporadaParticipanteId && !temporadaId) {
      const { data: participante, error: participanteError } = await supabase
        .from("temporadas_participantes")
        .select("id,temporada_id")
        .eq("id", temporadaParticipanteId)
        .maybeSingle();

      if (participanteError) throw participanteError;
      if (!participante) {
        return NextResponse.json(
          { error: "Participante da temporada não encontrado." },
          { status: 404 }
        );
      }

      temporadaId = String(participante.temporada_id);
    }

    // Se for uma temporada, ela é validada antes do fluxo normal de sócios.
    if (temporadaId) {
      etapa = "buscando temporada";

      const { data: temporada, error: temporadaError } = await supabase
        .from("temporadas")
        .select(
          "id,codigo,matricula,tipo,modalidade,inicio,fim,situacao,responsavel_nome,responsavel_cpf,responsavel_telefone"
        )
        .eq("id", temporadaId)
        .maybeSingle();

      if (temporadaError) throw temporadaError;

      if (!temporada) {
        return NextResponse.json(
          { error: "Temporada não encontrada." },
          { status: 404 }
        );
      }

      const temporadaNormalizada: TemporadaAcesso = {
        id: String(temporada.id),
        codigo: temporada.codigo || null,
        matricula: temporada.matricula || null,
        tipo: temporada.tipo,
        modalidade: temporada.modalidade,
        inicio: String(temporada.inicio || "").slice(0, 10),
        fim: String(temporada.fim || "").slice(0, 10),
        situacao: temporada.situacao || "pendente",
        responsavel_nome: temporada.responsavel_nome || null,
        responsavel_cpf: temporada.responsavel_cpf || null,
        responsavel_telefone: temporada.responsavel_telefone || null,
      };

      // Descobre o participante. Se não existir participante cadastrado,
      // usamos o responsável da própria temporada como titular TE0001A.
      let participante: any = null;

      if (temporadaParticipanteId) {
        const { data, error } = await supabase
          .from("temporadas_participantes")
          .select(
            "id,temporada_id,papel,matricula,nome,cpf,telefone,parentesco,foto_url,exame_medico_validade"
          )
          .eq("id", temporadaParticipanteId)
          .maybeSingle();

        if (error) throw error;
        participante = data || null;
      }

      if (!participante && matricula) {
        const { data, error } = await supabase
          .from("temporadas_participantes")
          .select(
            "id,temporada_id,papel,matricula,nome,cpf,telefone,parentesco,foto_url,exame_medico_validade"
          )
          .eq("temporada_id", temporadaId)
          .eq("matricula", matricula)
          .maybeSingle();

        if (error) throw error;
        participante = data || null;
      }

      const matriculaResponsavel =
        temporadaNormalizada.matricula ||
        `${temporadaNormalizada.codigo || "TE0001"}A`;

      if (!participante) {
        participante = {
          id: `temporada:${temporadaId}`,
          temporada_id: temporadaId,
          papel: "titular",
          matricula: matriculaResponsavel,
          nome: temporadaNormalizada.responsavel_nome || "Responsável da temporada",
          cpf: temporadaNormalizada.responsavel_cpf || null,
          telefone: temporadaNormalizada.responsavel_telefone || null,
          parentesco: null,
          foto_url: null,
          exame_medico_validade: null,
        };
      }

      const parcelasAtrasadas = await verificarParcelasTemporadaAtrasadas(supabase, temporadaId);
      const temporadaValida = temporadaEstaValida(temporadaNormalizada);
      const hoje = dataHojeBrasil();
      const validadeExame = String(participante.exame_medico_validade || "").slice(0, 10) || null;
      const exameValido = Boolean(validadeExame && validadeExame >= hoje);
      const exame = {
        status: {
          texto: !validadeExame ? "Exame médico não cadastrado" : exameValido ? "Exame médico em dia" : "Exame médico vencido",
          cor: exameValido ? "verde" : "vermelho",
        },
        validade: validadeExame,
        verificado: true,
      };
      const autorizado = temporadaValida && !parcelasAtrasadas.atrasado && exameValido;
      const motivoNegacao = !temporadaValida
        ? `Temporada não está ativa ou está fora da validade (${temporadaNormalizada.inicio || "?"} a ${temporadaNormalizada.fim || "?"}).`
        : parcelasAtrasadas.atrasado
          ? `Acesso bloqueado: ${parcelasAtrasadas.quantidade} parcela(s) vencida(s) e não paga(s), total de ${parcelasAtrasadas.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
          : !validadeExame
            ? "Acesso bloqueado: exame médico não cadastrado para este participante."
            : !exameValido
              ? `Acesso bloqueado: exame médico vencido em ${validadeExame.split("-").reverse().join("/")}.`
              : null;

      etapa = "registrando acesso de temporada";

      // O acesso de temporada usa a nova coluna temporada_id. A coluna
      // socio_id permanece nula, pois temporada não cria sócio.
      const { data: acesso, error: acessoError } = await supabase
        .from("acessos_sociedade")
        .insert({
          socio_id: null,
          dependente_id: null,
          temporada_id: temporadaId,
          temporada_participante_id: participante?.id && !String(participante.id).startsWith("temporada:") ? participante.id : null,
          registrado_por: auth.usuario.id,
          autorizado,
          motivo_negacao: motivoNegacao,
        })
        .select(
          "id,socio_id,dependente_id,temporada_id,temporada_participante_id,data_hora_entrada,data_hora_saida,autorizado,motivo_negacao"
        )
        .single();

      if (acessoError) throw acessoError;

      return NextResponse.json({
        acesso,
        temporada: temporadaNormalizada,
        participante,
        socio: {
          id: temporadaNormalizada.id,
          matricula: participante.matricula || matriculaResponsavel,
          nome: participante.nome,
          situacao: autorizado ? "ativa" : temporadaNormalizada.situacao,
          categoria: "Temporada",
          foto_url: participante.foto_url || null,
        },
        dependente: null,
        liberado: autorizado,
        status_temporada: autorizado ? "ativa" : parcelasAtrasadas.atrasado || !exameValido ? "bloqueada" : "inativa",
        parcelas_atrasadas: parcelasAtrasadas,
        exame,
        mensalidade: {
          texto: parcelasAtrasadas.atrasado
            ? `BLOQUEADA — ${parcelasAtrasadas.quantidade} parcela(s) vencida(s)`
            : "Temporada — parcelas sem atraso",
          cor: parcelasAtrasadas.atrasado ? "vermelho" : "verde",
        },
        inadimplencia: {
          atrasado: parcelasAtrasadas.atrasado,
          criticoTresMesesOuMais: parcelasAtrasadas.quantidade >= 3,
          quantidade: parcelasAtrasadas.quantidade,
          valorTotal: parcelasAtrasadas.valorTotal,
          status: { texto: parcelasAtrasadas.atrasado ? "Bloqueada por atraso" : "Em dia", cor: parcelasAtrasadas.atrasado ? "vermelho" : "verde" },
        },
      });
    }

    if (!id && !dependenteId && matricula) {
      etapa = "buscando sócio pela matrícula";
      const { data: socioPorMatricula, error: matriculaError } = await supabase
        .from("socios")
        .select("id")
        .eq("matricula", matricula)
        .maybeSingle();
      if (matriculaError) throw matriculaError;
      if (!socioPorMatricula) {
        return NextResponse.json(
          { error: `Nenhum associado encontrado com a matrícula ${matricula}.` },
          { status: 404 }
        );
      }
      id = socioPorMatricula.id;
    }

    let dependente: { id: string; socio_id: string; nome: string; situacao_financeira?: string | null; ativo: boolean | null } | null = null;

    if (dependenteId) {
      etapa = "buscando dependente";
      const { data: dep, error: depError } = await supabase
        .from("dependentes").select("id,socio_id,nome,situacao_financeira,ativo").eq("id", dependenteId).maybeSingle();
      if (depError) throw depError;
      if (!dep || dep.ativo === false) return NextResponse.json({ error: "Dependente não encontrado ou inativo." }, { status: 404 });
      dependente = dep;
      id = String(dep.socio_id);
    }

    if (!id) return NextResponse.json({ error: "QR Code inválido ou sem identificação do associado." }, { status: 400 });

    etapa = "buscando sócio";
    const { data: socio, error: socioError } = await supabase
      .from("socios")
      .select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira,foto_url")
      .eq("id", id).maybeSingle();
    if (socioError) throw socioError;
    if (!socio) return NextResponse.json({ error: "Associado não encontrado." }, { status: 404 });

    const situacao = String(socio.situacao || "").toLowerCase();
    const autorizado = ["ativo", "ativa", "em_dia"].includes(situacao) || !situacao;
    const motivoNegacao = autorizado ? null : `Situação do sócio: ${socio.situacao || "não informada"}`;

    etapa = "registrando acesso";
    const { data: acesso, error: acessoError } = await supabase
      .from("acessos_sociedade")
      .insert({
        socio_id: socio.id,
        dependente_id: dependenteId || null,
        registrado_por: auth.usuario.id,
        autorizado,
        motivo_negacao: motivoNegacao,
      })
      .select("id,socio_id,dependente_id,data_hora_entrada,autorizado,motivo_negacao")
      .single();
    if (acessoError) throw acessoError;

    etapa = "verificando mensalidades";
    const inadimplenciaSocio = await verificarMensalidadesAtrasadas(supabase, socio.id);
    const statusMensalidadeSocio = inadimplenciaSocio.status;
    const statusMensalidadeDependente = dependente ? inadimplenciaSocio.status : null;
    if (inadimplenciaSocio.criticoTresMesesOuMais) {
      etapa = "gerando aviso de inadimplência";
      await avisarAdministradoresInadimplencia(supabase, socio, inadimplenciaSocio.quantidade, inadimplenciaSocio.valorTotal, auth.usuario.id);
    }

    const exame = {
      status: { texto: "Controle de exame médico ainda não configurado", cor: "cinza" },
      validade: null,
      verificado: false,
    };

    return NextResponse.json({
      acesso,
      socio,
      dependente,
      liberado: autorizado,
      exame,
      mensalidade: dependente ? statusMensalidadeDependente : statusMensalidadeSocio,
      inadimplencia: inadimplenciaSocio,
    });
  } catch (error) {
    console.error(`Erro ao registrar acesso (etapa: ${etapa}):`, error);
    return NextResponse.json(
      { error: `Erro ao registrar acesso (${etapa}): ${mensagemErro(error, "erro desconhecido")}` },
      { status: 500 }
    );
  }
}
