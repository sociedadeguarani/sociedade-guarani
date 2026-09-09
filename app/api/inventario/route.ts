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
    const auth = await requireRoles(request, ["administrador", "funcionario"]);
    if ("response" in auth) return auth.response;
    const perfil = String(auth.usuario.perfil || "").toLowerCase();
    const supabase = admin();
    const [{ data: itens, error: itensError }, { data: socios, error: sociosError }, { data: emprestimos, error: empError }] = await Promise.all([
      supabase.from("inventario_itens").select("*").eq("ativo", true).order("nome"),
      supabase.from("socios").select("id,nome,matricula").order("nome"),
      supabase.from("inventario_emprestimos").select("id,item_id,socio_id,quantidade,data_emprestimo,data_prevista_devolucao,data_devolucao,status,responsavel_emprestimo,responsavel_devolucao,observacoes,item:inventario_itens(nome),socio:socios(nome,matricula)").order("data_emprestimo", { ascending: false }),
    ]);
    if (itensError) throw new Error(itensError.message);
    const itensVisiveis = perfil === "funcionario" ? (itens || []).filter((item: any) => item.acesso_funcionario === true) : (itens || []);
    if (sociosError) throw new Error(sociosError.message);
    if (empError) throw new Error(empError.message);
    return NextResponse.json({ itens: itensVisiveis, socios: socios || [], emprestimos: emprestimos || [], perfil });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao carregar inventário." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const auth = await requireRoles(request, ["administrador", "funcionario"]);
    if ("response" in auth) return auth.response;
    const perfil = String(auth.usuario.perfil || "").toLowerCase();
    const supabase = admin();

    if (body.acao === "criar_item" || body.acao === "editar_item") {
      if (perfil !== "administrador") return NextResponse.json({ error: "Funcionário não pode criar ou editar itens." }, { status: 403 });
      if (!body.nome?.trim()) return NextResponse.json({ error: "Informe o nome do item." }, { status: 400 });
      const quantidade = Math.max(1, Number(body.quantidade_total || 1));
      const payload = {
        nome: body.nome.trim(), categoria: body.categoria || "Geral", quantidade_total: quantidade,
        unidade: body.unidade || "unidade", estado_conservacao: body.estado_conservacao || "Bom", localizacao: body.localizacao || null,
        numero_patrimonio: body.numero_patrimonio || null, emprestimo_permitido: body.emprestimo_permitido !== false,
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
    const auth = await requireRoles(request, ["administrador", "funcionario"]);
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
