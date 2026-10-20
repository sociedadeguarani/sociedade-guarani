import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirAdministrador, requireRoles } from "@/lib/guaraniAuth";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: Request) {
  try {
    const auth = await requireRoles(
      request,
      ["administrador", "administrador_master", "funcionario", "funcionario_inventario"],
      ["menu.inventario", "inventario.consultar"]
    );
    if ("response" in auth) return auth.response;

    const perfil = String(auth.usuario.perfil || "").trim().toLowerCase();
    const perfilAdminMaster = perfil === "administrador_master";
    const perfilFuncionario = perfil === "funcionario" || perfil === "funcionario_inventario";
    const permissoes = Array.isArray(auth.usuario.permissoes) ? auth.usuario.permissoes : [];
    // Vincular um associado ao empréstimo exige apenas nome/matrícula; isso é
    // separado da permissão de consultar o cadastro geral de sócios.
    const podeVincularAssociado = perfilAdminMaster || permissoes.includes("inventario.vincular_associado");

    const supabase = admin();
    const [itensResult, sociosResult, dependentesResult, emprestimosResult, categoriasResult, localizacoesResult] = await Promise.all([
      supabase.from("inventario_itens").select("*").eq("ativo", true).order("nome"),
      supabase.from("socios").select("id,nome,matricula").order("nome"),
      supabase.from("dependentes").select("id,socio_id,nome,matricula,ativo").order("nome"),
      supabase.from("inventario_emprestimos").select("id,item_id,socio_id,dependente_id,quantidade,data_emprestimo,data_prevista_devolucao,data_devolucao,status,responsavel_emprestimo,responsavel_devolucao,observacoes,item:inventario_itens(nome),socio:socios(nome,matricula)").order("data_emprestimo", { ascending: false }),
      supabase.from("inventario_categorias").select("id,nome,codigo,ativo").eq("ativo", true).order("nome"),
      supabase.from("inventario_localizacoes").select("id,nome,ativo").eq("ativo", true).order("nome"),
    ]);

    const { data: itens, error: itensError } = itensResult;
    const { data: socios, error: sociosError } = sociosResult;
    const { data: dependentes, error: dependentesError } = dependentesResult;
    const { data: emprestimos, error: empError } = emprestimosResult;
    const { data: categorias, error: categoriasError } = categoriasResult;
    const { data: localizacoes, error: localizacoesError } = localizacoesResult;
    if (itensError) throw new Error(itensError.message);
    if (sociosError) throw new Error(sociosError.message);
    if (dependentesError) throw new Error(dependentesError.message);
    if (empError) throw new Error(empError.message);
    if (categoriasError) throw new Error(categoriasError.message);
    if (localizacoesError) throw new Error(localizacoesError.message);

    const sociosPorId = new Map<string, any>((socios || []).map((s: any) => [String(s.id), s] as [string, any]));
    const dependentesPorId = new Map<string, any>((dependentes || []).map((d: any) => [String(d.id), d] as [string, any]));

    // A tabela public.socios contém os titulares e também alguns dependentes legados.
    // Os dependentes familiares atuais ficam em public.dependentes e precisam ser
    // apresentados como pessoa que retirou o item, mantendo socio_id apontando ao titular.
    const normalizarNome = (valor: unknown) => String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const matriculasDosDependentesAtivos = new Set((dependentes || [])
      .filter((d: any) => d.ativo !== false && d.socio_id && sociosPorId.has(String(d.socio_id)))
      .map((d: any) => normalizarNome(d.matricula))
      .filter(Boolean));
    // Se um dependente ainda existir também em public.socios com a mesma
    // matrícula, priorizamos o registro de public.dependentes para vinculá-lo
    // ao titular correto e evitar duas opções iguais na busca.
    const sociosParaEmprestimo = (socios || []).filter((s: any) => {
      const matricula = normalizarNome(s.matricula);
      return !matricula || !matriculasDosDependentesAtivos.has(matricula);
    });
    const matriculasJaEmSocios = new Set(sociosParaEmprestimo
      .map((s: any) => normalizarNome(s.matricula))
      .filter(Boolean));
    const associadosParaEmprestimo = [
      ...sociosParaEmprestimo.map((s: any) => ({
        id: String(s.id), socio_id: String(s.id), dependente_id: null,
        nome: s.nome, matricula: s.matricula || null, tipo_pessoa: "socio", titular_nome: null,
      })),
      ...(dependentes || [])
        .filter((d: any) => d.ativo !== false && d.socio_id && sociosPorId.has(String(d.socio_id)))
        .filter((d: any) => {
          const matricula = normalizarNome(d.matricula);
          return !(matricula && matriculasJaEmSocios.has(matricula));
        })
        .map((d: any) => ({
          id: `dependente:${String(d.id)}`,
          socio_id: String(d.socio_id),
          dependente_id: String(d.id),
          nome: d.nome,
          matricula: d.matricula || null,
          tipo_pessoa: "dependente",
          titular_nome: sociosPorId.get(String(d.socio_id))?.nome || null,
        })),
    ].sort((a: any, b: any) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));

    const emprestimosComDependente = (emprestimos || []).map((emprestimo: any) => {
      const dependente = emprestimo.dependente_id
        ? dependentesPorId.get(String(emprestimo.dependente_id))
        : null;
      return {
        ...emprestimo,
        dependente: dependente ? {
          nome: dependente.nome,
          matricula: dependente.matricula || null,
          titular_nome: sociosPorId.get(String(dependente.socio_id))?.nome || emprestimo.socio?.nome || null,
        } : null,
      };
    });

    // A visibilidade aplica-se aos dois perfis operacionais. Empréstimos ainda
    // ativos continuam disponíveis para que a equipe consiga registrar a devolução.
    const itensVisiveis = perfilFuncionario
      ? (itens || []).filter((item: any) => item.acesso_funcionario === true)
      : (itens || []);
    const idsItensVisiveis = new Set(itensVisiveis.map((item: any) => String(item.id)));
    const statusAtivos = new Set(["emprestado", "atrasado"]);
    const emprestimosDoPerfil = perfilFuncionario
      ? emprestimosComDependente.filter((emprestimo: any) =>
          idsItensVisiveis.has(String(emprestimo.item_id)) || statusAtivos.has(String(emprestimo.status || "").toLowerCase())
        )
      : emprestimosComDependente;
    const emprestimosSeguros = podeVincularAssociado
      ? emprestimosDoPerfil
      : emprestimosDoPerfil.map((emprestimo: any) => ({ ...emprestimo, socio: null, socio_id: null, dependente: null, dependente_id: null }));

    return NextResponse.json({
      itens: itensVisiveis,
      socios: podeVincularAssociado ? associadosParaEmprestimo : [],
      emprestimos: emprestimosSeguros,
      categorias: categorias || [],
      localizacoes: localizacoes || [],
      perfil,
      podeVincularAssociado,
      permissoes,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar inventário." }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const permissoesAcao: Record<string, string[]> = {
      criar_item: ["menu.inventario", "inventario.consultar", "inventario.cadastrar"],
      editar_item: ["menu.inventario", "inventario.consultar", "inventario.editar"],
      emprestar: ["menu.inventario", "inventario.consultar", "inventario.emprestar", "inventario.vincular_associado"],
      criar_categoria: ["menu.inventario", "inventario.consultar"],
      criar_localizacao: ["menu.inventario", "inventario.consultar"],
    };
    const obrigatorias = permissoesAcao[String(body.acao || "")] || ["menu.inventario", "inventario.consultar"];
    const auth = await requireRoles(request, ["administrador", "administrador_master", "funcionario", "funcionario_inventario"], obrigatorias);
    if ("response" in auth) return auth.response;
    const perfil = String(auth.usuario.perfil || "").trim().toLowerCase();
    const perfilFuncionario = perfil === "funcionario" || perfil === "funcionario_inventario";
    const perfilAdmin = ["administrador", "administrador_master", "master", "admin"].includes(perfil);
    const supabase = admin();

    if (body.acao === "criar_categoria" || body.acao === "criar_localizacao") {
      if (!["administrador", "administrador_master", "master", "admin"].includes(perfil)) {
        return NextResponse.json({ error: "Sem permissão para cadastrar categorias ou localizações." }, { status: 403 });
      }
      const nome = String(body.nome || "").trim();
      if (!nome) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
      if (body.acao === "criar_categoria") {
        const codigo = String(body.codigo || nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().charAt(0)).toUpperCase();
        if (!/^[A-Z]$/.test(codigo)) return NextResponse.json({ error: "Código da categoria inválido." }, { status: 400 });
        const { data, error } = await supabase.from("inventario_categorias").insert({ nome, codigo, ativo: true }).select("id,nome,codigo,ativo").single();
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, categoria: data });
      }
      const { data, error } = await supabase.from("inventario_localizacoes").insert({ nome, ativo: true }).select("id,nome,ativo").single();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, localizacao: data });
    }

    if (body.acao === "criar_item" || body.acao === "editar_item") {
      if (!body.nome?.trim()) return NextResponse.json({ error: "Informe o nome do item." }, { status: 400 });
      const quantidade = Math.max(1, Number(body.quantidade_total || 1));
      let patrimonio = body.numero_patrimonio || null;
      if (body.acao === "criar_item" && !patrimonio) {
        const { data: categoria } = await supabase
          .from("inventario_categorias")
          .select("codigo")
          .eq("nome", body.categoria || "")
          .eq("ativo", true)
          .maybeSingle();
        const codigo = String(categoria?.codigo || String(body.categoria || "G").trim().charAt(0)).toUpperCase();
        const { data: gerado, error: patrimonioError } = await supabase.rpc("gerar_patrimonio_inventario", { p_codigo: codigo });
        if (patrimonioError) throw new Error(patrimonioError.message);
        patrimonio = gerado;
      }
      const payloadBase = {
        nome: body.nome.trim(), categoria: body.categoria || "Geral", quantidade_total: quantidade,
        unidade: body.unidade || "unidade", estado_conservacao: body.estado_conservacao || "Bom", localizacao: body.localizacao || null,
        numero_patrimonio: patrimonio, emprestimo_permitido: body.emprestimo_permitido !== false,
        foto_url: body.foto_url || null, observacoes: body.observacoes || null,
      };
      if (body.acao === "editar_item") {
        if (!body.id) return NextResponse.json({ error: "Informe o item." }, { status: 400 });
        if (perfilFuncionario) {
          const { data: itemAtual, error: itemAtualError } = await supabase
            .from("inventario_itens")
            .select("id,acesso_funcionario")
            .eq("id", body.id)
            .maybeSingle();
          if (itemAtualError) throw new Error(itemAtualError.message);
          if (!itemAtual) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
          if (itemAtual.acesso_funcionario !== true) {
            return NextResponse.json({ error: "Este item não está liberado para funcionários." }, { status: 403 });
          }
        }
        // Funcionários podem editar campos operacionais, mas não podem alterar
        // a configuração administrativa que libera itens para a equipe.
        const payloadEdicao = perfilAdmin
          ? { ...payloadBase, acesso_funcionario: body.acesso_funcionario === true }
          : payloadBase;
        const { error } = await supabase.from("inventario_itens").update(payloadEdicao).eq("id", body.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: body.id });
      }
      const payloadNovo = { ...payloadBase, acesso_funcionario: perfilAdmin ? body.acesso_funcionario === true : perfilFuncionario };
      const { data, error } = await supabase.from("inventario_itens").insert({ ...payloadNovo, quantidade_disponivel: quantidade }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data?.id });
    }

    if (body.acao === "emprestar") {
      if (!body.item_id || !body.socio_id) return NextResponse.json({ error: "Item e associado são obrigatórios." }, { status: 400 });
      const dependenteId = String(body.dependente_id || "").trim();
      if (dependenteId) {
        const { data: dependente, error: dependenteError } = await supabase
          .from("dependentes")
          .select("id,socio_id,nome,matricula,ativo")
          .eq("id", dependenteId)
          .maybeSingle();
        if (dependenteError) throw new Error(dependenteError.message);
        if (!dependente || dependente.ativo === false) {
          return NextResponse.json({ error: "Dependente não encontrado ou inativo." }, { status: 400 });
        }
        if (String(dependente.socio_id) !== String(body.socio_id)) {
          return NextResponse.json({ error: "O dependente não pertence ao titular selecionado." }, { status: 400 });
        }
      }
      if (perfilFuncionario) {
        const { data: item, error: itemError } = await supabase.from("inventario_itens").select("id,acesso_funcionario,emprestimo_permitido,quantidade_disponivel").eq("id", body.item_id).maybeSingle();
        if (itemError) throw new Error(itemError.message);
        if (!item?.acesso_funcionario) return NextResponse.json({ error: "Este item não está liberado para funcionários." }, { status: 403 });
        if (!item?.emprestimo_permitido || Number(item?.quantidade_disponivel || 0) < Math.max(1, Number(body.quantidade || 1))) return NextResponse.json({ error: "Este item não está disponível para empréstimo." }, { status: 400 });
      }
      const argumentosEmprestimo = {
        p_item_id: body.item_id,
        p_socio_id: body.socio_id,
        p_quantidade: Math.max(1, Number(body.quantidade || 1)),
        p_data_prevista: body.data_prevista_devolucao || null,
        p_responsavel: body.responsavel || "Administração",
        p_observacoes: body.observacoes || null,
      };
      const { data, error } = dependenteId
        ? await supabase.rpc("registrar_emprestimo_inventario_com_dependente", {
            ...argumentosEmprestimo,
            p_dependente_id: dependenteId,
          })
        : await supabase.rpc("registrar_emprestimo_inventario", argumentosEmprestimo);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data });
    }

    return NextResponse.json({ error: "Ação não reconhecida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao salvar inventário." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (body.acao !== "devolver" || !body.id) return NextResponse.json({ error: "Informe o empréstimo a devolver." }, { status: 400 });
    const auth = await requireRoles(request, ["administrador", "administrador_master", "funcionario", "funcionario_inventario"], ["menu.inventario", "inventario.consultar", "inventario.devolver"]);
    if ("response" in auth) return auth.response;
    const supabase = admin();
    const { data, error } = await supabase.rpc("devolver_emprestimo_inventario", { p_emprestimo_id: body.id, p_responsavel: body.responsavel || "Administração", p_observacoes: body.observacoes || null });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao registrar devolução." }, { status: 500 });
  }
}


export async function DELETE(request: Request) {
  try {
    const auth = await exigirAdministrador(request);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Informe o item." }, { status: 400 });
    const { data: ativos, error: emprestimoError } = await auth.supabase.from("inventario_emprestimos").select("id").eq("item_id", body.id).in("status", ["emprestado", "atrasado"]).limit(1);
    if (emprestimoError) return NextResponse.json({ error: emprestimoError.message }, { status: 500 });
    if ((ativos || []).length) return NextResponse.json({ error: "Não é possível excluir um item que está emprestado." }, { status: 409 });
    const { error } = await auth.supabase.from("inventario_itens").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao excluir item." }, { status: 500 });
  }
}
