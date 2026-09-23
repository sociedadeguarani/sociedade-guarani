import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/guaraniAuth";

function isPago(situacao: unknown) {
  return ["pago","paid","quitado","recebido","isento","isenta"].includes(String(situacao || "").toLowerCase());
}

function calcularStatus(mensalidades: any[], socioId: string) {
  const hoje = new Date();
  const pendentes = mensalidades.filter((m) => String(m.socio_id) === String(socioId) && !isPago(m.situacao));
  let maxDias = 0;
  for (const m of pendentes) {
    if (!m.data_vencimento) continue;
    const d = new Date(`${String(m.data_vencimento).slice(0,10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const diff = Math.floor((hoje.getTime() - d.getTime()) / 86400000);
    if (diff > maxDias) maxDias = diff;
  }
  if (maxDias <= 14) return { financeiro_status: "em_dia", dias_atraso: 0 };
  if (maxDias <= 60) return { financeiro_status: "atrasado", dias_atraso: maxDias };
  return { financeiro_status: "muito_atrasado", dias_atraso: maxDias };
}

async function autenticar(request: Request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { response: NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { response: NextResponse.json({ error: "Configuração do servidor incompleta." }, { status: 500 }) };

  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return { response: NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 }) };

  const supabase = getServiceClient();
  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios_sistema")
    .select("id,perfil_id,socio_id,ativo,nome_exibicao")
    .eq("id", user.id)
    .maybeSingle();

  if (usuarioError || !usuario) return { response: NextResponse.json({ error: "Usuário do sistema não encontrado." }, { status: 403 }) };
  if (!usuario.ativo) return { response: NextResponse.json({ error: "Seu acesso não está ativo no sistema." }, { status: 403 }) };

  const { data: perfil } = await supabase
    .from("perfis")
    .select("id,codigo,nome")
    .eq("id", usuario.perfil_id)
    .maybeSingle();

  const raw = String(perfil?.codigo || perfil?.nome || "").trim().toLowerCase();
  const perfilCanonico =
    raw === "administrador" || raw === "admin" ? "administrador_normal" :
    raw === "administrador_master" || raw === "master" ? "administrador_master" :
    raw === "funcionario" || raw === "funcionário" ? "funcionario" :
    raw === "associado" ? "associado" : "";

  if (!perfilCanonico) return { response: NextResponse.json({ error: "Perfil de acesso não configurado." }, { status: 403 }) };

  return { usuario: { id: usuario.id, perfil: perfilCanonico, socio_id: usuario.socio_id, ativo: usuario.ativo, nome_exibicao: usuario.nome_exibicao, email: user.email } };
}

export async function GET(request: Request) {
  try {
    const auth = await autenticar(request);
    if ("response" in auth) return auth.response;

    const supabase = getServiceClient();
    const base = "id,matricula,nome,cpf,categoria,tipo_socio,situacao,data_associacao,foto_url,inicio_temporada,fim_temporada,exame_medico_validade,responsavel_id,parentesco,possui_mensalidade,valor_mensalidade";

    // A família real está em socios.responsavel_id. Não usamos a tabela dependentes para montar a árvore.
    const { data: todosSocios, error } = await supabase.from("socios").select(base).order("nome").limit(1000);
    if (error) throw error;

    const todos = todosSocios || [];
    let socios = todos;

    if (auth.usuario.perfil === "associado") {
      if (!auth.usuario.socio_id) return NextResponse.json({ error: "Seu usuário associado não está vinculado a um sócio." }, { status: 403 });

      const proprio = todos.find((s) => String(s.id) === String(auth.usuario.socio_id));
      if (!proprio) return NextResponse.json({ error: "Seu cadastro de associado não foi encontrado." }, { status: 404 });

      // Mostra o próprio associado e toda a sua descendência familiar.
      const familia = new Set<string>([String(proprio.id)]);
      let mudou = true;
      while (mudou) {
        mudou = false;
        for (const s of todos) {
          if (s.responsavel_id && familia.has(String(s.responsavel_id)) && !familia.has(String(s.id))) {
            familia.add(String(s.id));
            mudou = true;
          }
        }
      }
      socios = todos.filter((s) => familia.has(String(s.id)));
    }

    const ids = socios.map((s) => s.id).filter(Boolean);
    let mensalidades: any[] = [];
    if (ids.length) {
      const { data, error: mensalidadesError } = await supabase
        .from("mensalidades")
        .select("socio_id,data_vencimento,situacao")
        .in("socio_id", ids);
      if (mensalidadesError) throw mensalidadesError;
      mensalidades = data || [];
    }

    const resultado = socios.map((s) => ({ ...s, ...calcularStatus(mensalidades, s.id) }));

    // Dependente da família = possui responsavel_id e não possui mensalidade própria.
    // Quem possui mensalidade continua na lista principal, mas pode ser responsável por outra família.
    const dependentes = resultado
      .filter((s) => Boolean(s.responsavel_id) && !s.possui_mensalidade)
      .map((d) => {
        const titular = resultado.find((s) => String(s.id) === String(d.responsavel_id));
        return {
          id: d.id,
          socio_id: d.responsavel_id,
          nome: d.nome,
          cpf: d.cpf,
          parentesco: d.parentesco,
          ativo: d.situacao !== "inativo",
          foto_url: d.foto_url,
          titular_nome: titular?.nome || null,
          titular_matricula: titular?.matricula || null,
          financeiro_status: titular?.financeiro_status || "em_dia",
          dias_atraso: titular?.dias_atraso || 0,
          situacao: d.situacao || null,
          responsavel_id: d.responsavel_id,
          possui_mensalidade: false
        };
      });

    return NextResponse.json({ socios: resultado, dependentes });
  } catch (error: any) {
    console.error("[API carteirinhas] Erro:", error);
    return NextResponse.json({ error: error?.message || error?.details || error?.hint || "Erro ao carregar carteirinhas.", code: error?.code || null, details: error?.details || null, hint: error?.hint || null }, { status: 500 });
  }
}
