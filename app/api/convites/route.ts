import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/guaraniAuth";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const BUCKET = "comprovantes-financeiro";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const dataHoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type SocioBuscaRow = {
  id: string;
  nome: string;
  matricula: string | number | null;
  responsavel_id: string | null;
  parentesco: string | null;
  situacao: string | null;
  tipo_socio: string | null;
  categoria: string | null;
  cpf: string | null;
};

type DependenteBuscaRow = {
  id: string;
  socio_id: string;
  nome: string | null;
  matricula: string | number | null;
  parentesco: string | null;
  ativo: boolean | null;
  migrado_para_socio_id?: string | null;
};

function normalizar(valor: unknown) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function chavePessoa(nome: unknown, matricula: unknown) {
  const nomeNormalizado = normalizar(nome);
  const matriculaNormalizada = String(matricula ?? "").trim().toUpperCase();
  if (!nomeNormalizado) return "";
  return matriculaNormalizada ? `${nomeNormalizado}|${matriculaNormalizada}` : nomeNormalizado;
}

function calcularValorDiario(cidade: string, banho: string) {
  return normalizar(cidade) === "augusto pestana" ? 25 : banho === "com_banho" ? 25 : 15;
}

async function garantirBucket(db: SupabaseClient) {
  const atual = await db.storage.getBucket(BUCKET);
  if (!atual.error) return;
  const cr = await db.storage.createBucket(BUCKET, { public: true, fileSizeLimit: "8MB", allowedMimeTypes: TIPOS });
  if (cr.error && !/already exists/i.test(cr.error.message)) throw new Error(cr.error.message);
}

export async function GET(request: Request) {
  try {
    const auth = await requireRoles(
      request,
      ["funcionario", "administrador", "administrador_master"],
      ["menu.convites", "convites.comprar"],
    );
    if ("response" in auth) return auth.response;

    const db = auth.supabase;
    const ehFuncionario = auth.usuario.perfil === "funcionario";
    const consultaConvites = ehFuncionario
      ? db.from("convites").select("id,socio_id,dependente_id,nome_convidado,cidade_convidado,data_inicio,data_fim,tipo,banho_incluido,status,created_at").order("created_at", { ascending: false })
      : db.from("convites").select("*").order("created_at", { ascending: false });

    const [{ data: convites, error: ce }, { data: sociosBrutos, error: se }] = await Promise.all([
      consultaConvites,
      db.from("socios").select("id,nome,matricula,responsavel_id,parentesco,situacao,tipo_socio,categoria,cpf").order("nome", { ascending: true }),
    ]);
    if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
    if (se) return NextResponse.json({ error: se.message }, { status: 500 });

    // Usa a mesma regra da tela Carteirinhas: dependentes podem estar na tabela
    // dependentes ou como Sócio Dependente na tabela socios. Não filtra ativo=NULL.
    const dependentesComMigracao = await db.from("dependentes")
      .select("id,socio_id,nome,matricula,parentesco,ativo,migrado_para_socio_id")
      .order("nome", { ascending: true });

    // Algumas instalações ainda não possuem a coluna de migração. Mantemos
    // os dois formatos em variáveis separadas para o TypeScript não tentar
    // atribuir respostas PostgREST com formatos de linha diferentes.
    let dependentesRows: DependenteBuscaRow[] = [];
    if (dependentesComMigracao.error && /migrado_para_socio_id/i.test(dependentesComMigracao.error.message)) {
      const dependentesSemMigracao = await db.from("dependentes")
        .select("id,socio_id,nome,matricula,parentesco,ativo")
        .order("nome", { ascending: true });
      if (dependentesSemMigracao.error) {
        return NextResponse.json({ error: dependentesSemMigracao.error.message }, { status: 500 });
      }
      dependentesRows = (dependentesSemMigracao.data || []) as DependenteBuscaRow[];
    } else {
      if (dependentesComMigracao.error) {
        return NextResponse.json({ error: dependentesComMigracao.error.message }, { status: 500 });
      }
      dependentesRows = (dependentesComMigracao.data || []) as DependenteBuscaRow[];
    }

    const socios = (sociosBrutos || []) as SocioBuscaRow[];
    // Quando a mesma pessoa aparece em socios como titular e como dependente antigo,
    // a opção duplicada é ocultada na busca (nenhuma linha é apagada do banco).
    const socioTitularPorChave = new Map<string, SocioBuscaRow>();
    const sociosPorId = new Map<string, SocioBuscaRow>();
    for (const socio of socios) {
      sociosPorId.set(socio.id, socio);
      if (!socio.responsavel_id) {
        const chave = chavePessoa(socio.nome, socio.matricula);
        if (chave) socioTitularPorChave.set(chave, socio);
      }
    }
    const chavesTitulares = new Set(socioTitularPorChave.keys());
    const socioIdPrincipal = (socioId: unknown) => {
      const id = String(socioId || "");
      const socio = sociosPorId.get(id);
      if (!socio?.responsavel_id) return id;
      const chave = chavePessoa(socio.nome, socio.matricula);
      return socioTitularPorChave.get(chave)?.id || id;
    };
    const dependentesTabela = dependentesRows
      .filter((d) => d.ativo !== false && Boolean(d.socio_id) && !d.migrado_para_socio_id)
      .filter((d) => !chavesTitulares.has(chavePessoa(d.nome, d.matricula)));
    const chavesDependentesTabela = new Set(
      dependentesTabela.map((d) => `${socioIdPrincipal(d.socio_id)}|${chavePessoa(d.nome, d.matricula)}`),
    );

    // Só titulares aparecem na lista principal; qualquer cadastro de família ligado
    // por responsavel_id aparece uma única vez no bloco de dependentes.
    const sociosBusca = socios.filter((s) => !s.responsavel_id);

    // Sócio Dependente também pode ser o responsável pelo próprio convite (esposa,
    // filho adulto etc.). Usa o id próprio do cadastro socio, não o id do titular pai.
    const dependentesSocios = socios
      .filter((s) => Boolean(s.responsavel_id) && String(s.situacao || "").toLowerCase() !== "inativo")
      .filter((s) => !chavesTitulares.has(chavePessoa(s.nome, s.matricula)))
      .filter((s) => !chavesDependentesTabela.has(`${socioIdPrincipal(s.responsavel_id)}|${chavePessoa(s.nome, s.matricula)}`))
      .map((s) => ({
        id: `socio:${s.id}`, socio_id: socioIdPrincipal(s.responsavel_id), nome: s.nome, matricula: s.matricula,
        parentesco: s.parentesco || null, ativo: String(s.situacao || "").toLowerCase() !== "inativo",
        source: "socios", source_socio_id: String(s.id),
      }));
    const dependentes = [
      ...dependentesTabela.map((d) => ({
        id: String(d.id), socio_id: socioIdPrincipal(d.socio_id), nome: String(d.nome || ""),
        matricula: d.matricula ?? null, parentesco: d.parentesco || null,
        ativo: d.ativo !== false, source: "dependentes", source_socio_id: null,
      })),
      ...dependentesSocios,
    ].filter((d) => d.ativo !== false);

    // Funcionários da portaria precisam identificar o associado responsável,
    // mas não devem consultar contas bancárias nem valores/comprovantes.
    let contas: Array<{ id: string; nome: string; banco: string | null }> = [];
    if (!ehFuncionario) {
      const { data, error } = await db.from("contas_bancarias").select("id,nome,banco").eq("ativo", true).order("nome", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      contas = data || [];
    }

    return NextResponse.json({
      convites: convites || [],
      socios,
      socios_busca: sociosBusca,
      dependentes,
      contas,
      perfil: auth.usuario.perfil,
      podeGerenciarFinanceiro: !ehFuncionario,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao carregar convites." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireRoles(
      request,
      ["funcionario", "administrador", "administrador_master"],
      ["menu.convites", "convites.comprar"],
    );
    if ("response" in auth) return auth.response;

    const db = auth.supabase;
    const ehFuncionario = auth.usuario.perfil === "funcionario";
    const form = await request.formData();
    const socio_id = String(form.get("socio_id") || "").trim() || null;
    const dependente_id = String(form.get("dependente_id") || "").trim() || null;
    const nome = String(form.get("nome") || "").trim();
    const documento = String(form.get("documento") || "").trim() || null;
    const cidade = String(form.get("cidade") || "").trim();
    const tipo = String(form.get("tipo") || "diario").trim();
    const inicio = String(form.get("inicio") || dataHoje()).trim();
    const fimRaw = String(form.get("fim") || "").trim();
    const fim = tipo === "diario" ? inicio : (fimRaw || null);
    const pagamento = String(form.get("pagamento") || "pix").trim().toLowerCase();
    const conta_id = String(form.get("conta_id") || "").trim();
    const arquivo = form.get("arquivo");
    const banhoInformado = String(form.get("banho") || "com_banho").trim();
    const cidadeNormalizada = normalizar(cidade);
    const banhoIncluido = cidadeNormalizada === "augusto pestana"
      ? false
      : tipo === "diario"
        ? banhoInformado === "com_banho"
        : tipo === "semanal" ? true : null;
    // Preço diário é definido no servidor: Augusto Pestana paga R$ 25 sem banho;
    // outras cidades pagam R$ 25 com banho ou R$ 15 sem banho.
    const valor = tipo === "diario"
      ? calcularValorDiario(cidade, banhoInformado)
      : ehFuncionario
        ? (cidadeNormalizada === "augusto pestana" ? 30 : 120)
        : Number(String(form.get("valor") || "0").replace(",", "."));

    if (!nome) return NextResponse.json({ error: "Informe o nome do convidado." }, { status: 400 });
    if (!cidade) return NextResponse.json({ error: "Informe a cidade do convidado." }, { status: 400 });
    if (!["diario", "semanal", "mensal"].includes(tipo)) return NextResponse.json({ error: "Tipo de convite inválido." }, { status: 400 });
    if (ehFuncionario && !["diario", "semanal"].includes(tipo)) return NextResponse.json({ error: "A portaria pode cadastrar convites diários ou de 7 dias." }, { status: 403 });
    if (!["pix", "dinheiro"].includes(pagamento)) return NextResponse.json({ error: "Forma de pagamento inválida." }, { status: 400 });
    if (ehFuncionario && pagamento !== "pix") return NextResponse.json({ error: "A portaria deve encaminhar o comprovante PIX para aprovação da administração. Recebimentos em dinheiro são restritos à administração." }, { status: 403 });
    if (tipo === "diario" && !["com_banho", "sem_banho"].includes(banhoInformado)) return NextResponse.json({ error: "Selecione se o convite inclui banho." }, { status: 400 });
    if (tipo === "diario" && cidadeNormalizada === "augusto pestana" && banhoInformado !== "sem_banho") return NextResponse.json({ error: "Convites de Augusto Pestana permitem somente parque, sem banho." }, { status: 400 });
    if (!Number.isFinite(valor) || valor < 0) return NextResponse.json({ error: "Valor inválido." }, { status: 400 });
    if (pagamento === "dinheiro" && !conta_id) return NextResponse.json({ error: "Selecione a conta de recebimento." }, { status: 400 });
    if (arquivo && !(arquivo instanceof File)) return NextResponse.json({ error: "Comprovante inválido." }, { status: 400 });
    if (arquivo instanceof File && (!TIPOS.includes(arquivo.type) || arquivo.size > 8 * 1024 * 1024)) return NextResponse.json({ error: "Comprovante inválido. Use JPG, PNG, WEBP ou PDF até 8 MB." }, { status: 400 });
    if (pagamento === "dinheiro" && arquivo instanceof File && !["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) return NextResponse.json({ error: "Para pagamento em dinheiro, anexe uma foto JPG, PNG ou WEBP do recibo." }, { status: 400 });
    if (!(arquivo instanceof File)) return NextResponse.json({ error: pagamento === "pix" ? "Anexe o comprovante do PIX antes de cadastrar o convite." : "Anexe a foto do recibo em dinheiro antes de cadastrar o convite." }, { status: 400 });

    let socioSelecionadoDb: SocioBuscaRow | null = null;
    if (socio_id) {
      const { data: socio, error } = await db.from("socios")
        .select("id,nome,matricula,responsavel_id,parentesco,situacao,tipo_socio,categoria,cpf")
        .eq("id", socio_id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!socio) return NextResponse.json({ error: "Associado responsável não encontrado." }, { status: 404 });
      socioSelecionadoDb = socio as SocioBuscaRow;
    }
    if (dependente_id) {
      if (!socio_id) return NextResponse.json({ error: "Selecione o titular responsável pelo dependente." }, { status: 400 });
      const { data: dependente, error } = await db.from("dependentes")
        .select("id,socio_id,ativo").eq("id", dependente_id).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      let vinculoValido = Boolean(dependente && dependente.socio_id === socio_id);
      if (dependente && !vinculoValido && socioSelecionadoDb) {
        // Dados antigos podem ter os dependentes ligados à linha duplicada do
        // associado (dependente do pai). Aceita somente quando nome e matrícula
        // comprovam que a linha antiga e a titular selecionada são a mesma pessoa.
        const { data: titularAntigo, error: erroTitularAntigo } = await db.from("socios")
          .select("id,nome,matricula,responsavel_id")
          .eq("id", dependente.socio_id).maybeSingle();
        if (erroTitularAntigo) return NextResponse.json({ error: erroTitularAntigo.message }, { status: 500 });
        vinculoValido = Boolean(
          titularAntigo?.responsavel_id &&
          chavePessoa(titularAntigo.nome, titularAntigo.matricula) === chavePessoa(socioSelecionadoDb.nome, socioSelecionadoDb.matricula) &&
          !socioSelecionadoDb.responsavel_id
        );
      }
      if (!dependente || !vinculoValido || dependente.ativo === false) {
        return NextResponse.json({ error: "Dependente não encontrado ou não vinculado ao associado selecionado." }, { status: 404 });
      }
    }

    if (pagamento === "dinheiro") {
      const { data: conta, error } = await db.from("contas_bancarias")
        .select("id").eq("id", conta_id).eq("ativo", true).maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!conta) return NextResponse.json({ error: "Conta de recebimento não encontrada ou inativa." }, { status: 409 });
    }

    await garantirBucket(db);

    const { data: convite, error: erroConvite } = await db.from("convites").insert({
      socio_id,
      dependente_id,
      nome_convidado: nome,
      documento_convidado: documento,
      cidade_convidado: cidade,
      data_inicio: inicio,
      data_fim: fim,
      tipo,
      valor,
      banho_incluido: banhoIncluido,
      status: pagamento === "pix" ? "pendente" : "pago",
      forma_pagamento: pagamento,
      comprovante_url: null,
      comprovante_enviado_em: null,
      comprovante_status: pagamento === "pix" ? "pendente" : "aprovado",
      motivo_recusa: null,
    }).select("*").single();
    if (erroConvite || !convite) {
      return NextResponse.json({ error: erroConvite?.message || "Não foi possível criar o convite." }, { status: 500 });
    }

    const arquivoComprovante = arquivo as File;
    const ext = arquivoComprovante.name.split(".").pop()?.toLowerCase() || "bin";
    const caminho = `pagamentos/convite/${convite.id}-${Date.now()}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(caminho, new Uint8Array(await arquivoComprovante.arrayBuffer()), { contentType: arquivoComprovante.type, upsert: false });
    if (up.error) {
      await db.from("convites").delete().eq("id", convite.id);
      return NextResponse.json({ error: `Não foi possível salvar o comprovante: ${up.error.message}` }, { status: 500 });
    }
    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(caminho);
    const comprovanteStatus = pagamento === "pix" ? "pendente" : "aprovado";
    const agora = new Date().toISOString();
    const { data: atualizado, error: ue } = await db.from("convites")
      .update({ comprovante_url: pub.publicUrl, comprovante_enviado_em: agora, comprovante_status: comprovanteStatus })
      .eq("id", convite.id).select("*").single();
    if (ue) {
      await db.storage.from(BUCKET).remove([caminho]);
      await db.from("convites").delete().eq("id", convite.id);
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }

    if (pagamento === "dinheiro") {
      const { error: me } = await db.from("movimentacoes_financeiras").insert({
        conta_bancaria_id: conta_id, conta_destino_id: null, grupo_transferencia: null,
        tipo: "entrada", categoria: "Convite", descricao: `Convite - ${nome}`, valor,
        data_movimentacao: dataHoje(), forma_pagamento: "dinheiro", origem_tipo: "convite",
        origem_id: convite.id, socio_id, dependente_id, comprovante_url: pub.publicUrl,
        conciliado: false, data_conciliacao: null, observacoes: "Pagamento em dinheiro registrado pela administração. Foto do recibo anexada.",
      });
      if (me) {
        await db.storage.from(BUCKET).remove([caminho]);
        await db.from("convites").delete().eq("id", convite.id);
        return NextResponse.json({ error: `Não foi possível lançar o pagamento no financeiro: ${me.message}` }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id: convite.id, convite: atualizado });
    }

    const { error: ne } = await db.from("notificacoes_admin").insert({
      tipo: "comprovante_pagamento", titulo: "Novo comprovante de convite aguardando aprovação",
      mensagem: `Convite de ${nome} no valor de R$ ${valor.toFixed(2).replace(".", ",")} foi enviado para conferência.`,
      origem_tipo: "convite", origem_id: convite.id, lida: false,
    });
    const conviteResposta = ehFuncionario
      ? {
          id: convite.id, socio_id: convite.socio_id, dependente_id: convite.dependente_id,
          nome_convidado: convite.nome_convidado, cidade_convidado: convite.cidade_convidado,
          data_inicio: convite.data_inicio, data_fim: convite.data_fim, tipo: convite.tipo,
          status: convite.status, banho_incluido: convite.banho_incluido, created_at: convite.created_at,
        }
      : (atualizado || convite);
    return NextResponse.json({ ok: true, id: convite.id, convite: conviteResposta, aviso: ne ? `Convite salvo, mas a notificação não foi criada: ${ne.message}` : undefined });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao registrar convite." }, { status: 500 });
  }
}
