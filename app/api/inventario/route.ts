import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirAdministrador, requireRoles } from "@/lib/guaraniAuth";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configuração do Supabase incompleta.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function ehAdministrador(perfil: string) {
  return ["administrador", "administrador_normal", "administrador_master", "admin", "master"].includes(perfil);
}

function normalizarCodigoCategoria(nome: string) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

export async function GET(request: Request) {
  try {
    const auth = await requireRoles(request, ["administrador", "administrador_normal", "administrador_master", "funcionario"]);
    if ("response" in auth) return auth.response;
    const perfil = String(auth.usuario.perfil || "").toLowerCase();
    const supabase = admin();
    const [{ data: itens, error: itensError }, { data: socios, error: sociosError }, { data: emprestimos, error: empError }, { data: categorias, error: categoriasError }] = await Promise.all([
      supabase.from("inventario_itens").select("*").eq("ativo", true).order("nome"),
      supabase.from("socios").select("id,nome,matricula").order("nome"),
      supabase.from("inventario_emprestimos").select("id,item_id,socio_id,quantidade,data_emprestimo,data_prevista_devolucao,data_devolucao,status,responsavel_emprestimo,responsavel_devolucao,observacoes,item:inventario_itens(nome),socio:socios(nome,matricula)").order("data_emprestimo", { ascending: false }),
      supabase.from("inventario_categorias").select("nome,codigo").eq("ativo", true).order("nome"),
    ]);
    if (itensError) throw new Error(itensError.message);
    const itensVisiveis = perfil === "funcionario" ? (itens || []).filter((item: any) => item.acesso_funcionario === true) : (itens || []);
    if (sociosError) throw new Error(sociosError.message);
    if (empError) throw new Error(empError.message);
    if (categoriasError) throw new Error(categoriasError.message);
    return NextResponse.json({ itens: itensVisiveis, socios: socios || [], emprestimos: emprestimos || [], categorias: (categorias || []).map((c: any) => c.nome), perfil });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar inventário." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const auth = await requireRoles(request, ["administrador", "administrador_normal", "administrador_master", "funcionario"]);
    if ("response" in auth) return auth.response;
    const perfil = String(auth.usuario.perfil || "").toLowerCase();
    const supabase = admin();

    if (body.acao === "criar_categoria") {
      if (!ehAdministrador(perfil)) return NextResponse.json({ error: "Somente administradores podem cadastrar categorias." }, { status: 403 });
      const nome = String(body.nome || "").trim();
      if (!nome) return NextResponse.json({ error: "Informe o nome da categoria." }, { status: 400 });
      const normalizado = nome.toLowerCase();
      const { data: existentes, error: existentesError } = await supabase.from("inventario_categorias").select("nome,codigo").eq("ativo", true);
      if (existentesError) throw new Error(existentesError.message);
      if ((existentes || []).some((c: any) => String(c.nome).trim().toLowerCase() === normalizado)) return NextResponse.json({ error: "Esta categoria já está cadastrada." }, { status: 409 });
      const usados = new Set((existentes || []).map((c: any) => String(c.codigo || "").toUpperCase()));
      const letras = normalizarCodigoCategoria(nome);
      let codigo = Array.from(letras).find((l) => !usados.has(l)) || Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ").find((l) => !usados.has(l));
      if (!codigo) return NextResponse.json({ error: "Não há mais códigos de letras disponíveis para novas categorias." }, { status: 409 });
      const { data: categoria, error } = await supabase.from("inventario_categorias").insert({ nome, codigo }).select("id,nome,codigo").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, categoria });
    }

    if (body.acao === "criar_item" || body.acao === "editar_item") {
      if (!ehAdministrador(perfil)) return NextResponse.json({ error: "Funcionário não pode criar ou editar itens." }, { status: 403 });
      if (!body.nome?.trim()) return NextResponse.json({ error: "Informe o nome do item." }, { status: 400 });
      const quantidade = Math.max(1, Number(body.quantidade_total || 1));
      const categoriaNome = String(body.categoria || "Esportes").trim();
      const { data: categoria, error: categoriaError } = await supabase.from("inventario_categorias").select("nome,codigo").eq("nome", categoriaNome).eq("ativo", true).maybeSingle();
      if (categoriaError) throw new Error(categoriaError.message);
      if (!categoria) return NextResponse.json({ error: "Categoria de inventário inválida. Cadastre ou selecione uma categoria existente." }, { status: 400 });
      const patrimonioExistente = String(body.numero_patrimonio || "").trim();
      let numeroPatrimonio = patrimonioExistente || null;
      if (!numeroPatrimonio) {
        const { data: patrimonio, error: patrimonioError } = await supabase.rpc("gerar_patrimonio_inventario", { p_codigo: categoria.codigo });
        if (patrimonioError) throw new Error(patrimonioError.message);
        numeroPatrimonio = patrimonio;
      }
      const payload = {
        nome: body.nome.trim(), categoria: categoriaNome, quantidade_total: quantidade,
        unidade: "unidade", estado_conservacao: body.estado_conservacao || "Bom", localizacao: body.localizacao || null,
        numero_patrimonio: numeroPatrimonio, emprestimo_permitido: body.emprestimo_permitido !== false,
        foto_url: body.foto_url || null,
        acesso_funcionario: body.acesso_funcionario === true, observacoes: body.observacoes || null,
      };
      if (body.acao === "editar_item") {
        if (!body.id) return NextResponse.json({ error: "Informe o item." }, { status: 400 });
        const { error } = await supabase.from("inventario_itens").update(payload).eq("id", body.id);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, id: body.id });
      }
      const { data, error } = await supabase.from("inventario_itens").insert({ ...payload, quantidade_disponivel: quantidade }).select("id").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, id: data?.id });
    }

    if (body.acao === "emprestar") {
      if (!body.item_id || !body.socio_id) return NextResponse.json({ error: "Item e associado são obrigatórios." }, { status: 400 });
      if (perfil === "funcionario") {
        const { data: item, error: itemError } = await supabase.from("inventario_itens").select("acesso_funcionario,emprestimo_permitido,quantidade_disponivel").eq("id", body.item_id).maybeSingle();
        if (itemError) throw new Error(itemError.message);
        if (!item?.acesso_funcionario) return NextResponse.json({ error: "Este item não está liberado para funcionários." }, { status: 403 });
        if (!item?.emprestimo_permitido || Number(item?.quantidade_disponivel || 0) < Math.max(1, Number(body.quantidade || 1))) return NextResponse.json({ error: "Este item não está disponível para empréstimo." }, { status: 400 });
      }
      const { data, error } = await supabase.rpc("registrar_emprestimo_inventario", {
        p_item_id: body.item_id, p_socio_id: body.socio_id, p_quantidade: Math.max(1, Number(body.quantidade || 1)),
        p_data_prevista: body.data_prevista_devolucao || null, p_responsavel: body.responsavel || "Administração", p_observacoes: body.observacoes || null,
      });
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
    const auth = await requireRoles(request, ["administrador", "administrador_normal", "administrador_master", "funcionario"]);
    if ("response" in auth) return auth.response;
    if (body.acao !== "devolver" || !body.id) return NextResponse.json({ error: "Informe o empréstimo a devolver." }, { status: 400 });
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
