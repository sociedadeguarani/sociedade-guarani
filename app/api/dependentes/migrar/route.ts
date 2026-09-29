import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";

const ROLES = [
  "administrador",
  "administrador_normal",
  "administrador_master",
  "funcionario",
];

function erroBanco(error: any) {
  return [error?.message, error?.details, error?.hint, error?.code]
    .filter(Boolean)
    .join(" — ");
}

function baseFamiliar(matricula: string | null | undefined) {
  const valor = String(matricula || "").trim().toUpperCase();
  return valor && /[A-Z]$/.test(valor) ? valor.slice(0, -1) : valor;
}

function proximaMatriculaFamiliar(responsavelMatricula: string | null | undefined, usadas: Set<string>) {
  const base = baseFamiliar(responsavelMatricula);
  if (!base) return null;
  for (let codigo = "B".charCodeAt(0); codigo <= "Z".charCodeAt(0); codigo += 1) {
    const candidata = `${base}${String.fromCharCode(codigo)}`;
    if (!usadas.has(candidata)) return candidata;
  }
  return null;
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ROLES);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();

    const [sociosResult, dependentesResult] = await Promise.all([
      supabase
        .from("socios")
        .select("id,matricula,nome,situacao,situacao_financeira")
        .order("nome"),
      supabase
        .from("dependentes")
        .select("id,socio_id,matricula,nome,cpf,data_nascimento,parentesco,telefone,whatsapp,ativo,created_at,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao_financeira,data_ultimo_pagamento")
        .order("nome"),
    ]);

    if (sociosResult.error) throw sociosResult.error;
    if (dependentesResult.error) throw dependentesResult.error;

    const socios = sociosResult.data || [];
    const dependentes = dependentesResult.data || [];

    const ids = socios.map((s: any) => String(s.id)).filter(Boolean);
    const statusResponsaveis: Record<string, string> = {};
    const hoje = new Date();
    const inicioMesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const { data: mensalidades, error } = await supabase
        .from("mensalidades")
        .select("socio_id,competencia,data_vencimento,situacao")
        .in("socio_id", lote);

      if (error) throw error;

      for (const id of lote) {
        const itens = (mensalidades || []).filter((m: any) => String(m.socio_id) === id);
        const pendencias = new Set<string>();

        for (const m of itens) {
          const situacao = String(m.situacao || "").trim().toLowerCase();
          if (["pago", "paid", "quitado", "recebido", "isento", "isenta"].includes(situacao)) continue;

          const base = m.competencia || m.data_vencimento;
          if (!base) continue;
          const texto = String(base).slice(0, 10);
          const partes = texto.split("-").map(Number);
          if (partes.length < 2 || !partes[0] || !partes[1]) continue;

          const mes = new Date(partes[0], partes[1] - 1, 1);
          if (mes < inicioMesAtual) {
            pendencias.add(`${partes[0]}-${String(partes[1]).padStart(2, "0")}`);
          }
        }

        const atraso = pendencias.size;
        statusResponsaveis[id] = atraso <= 2 ? "em_dia" : atraso <= 4 ? "atrasado" : "muito_atrasado";
      }
    }

    return NextResponse.json({
      socios,
      dependentes,
      statusResponsaveis,
    });
  } catch (error) {
    console.error("GET /api/dependentes:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar dependentes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRoles(request, ["administrador", "administrador_normal", "administrador_master"]);
  if ("response" in auth) return auth.response;

  try {
    const supabase = getServiceClient();
    const body = await request.json().catch(() => ({}));
    const acao = String(body?.acao || "migrar_legados");

    if (acao !== "migrar_legados") {
      return NextResponse.json({ error: "Ação de migração inválida." }, { status: 400 });
    }

    const { data: legados, error: buscaError } = await supabase
      .from("socios")
      .select("id,matricula,nome,cpf,data_nascimento,parentesco,telefone,whatsapp,email,responsavel_id,situacao,possui_mensalidade,valor_mensalidade,dia_vencimento,tipo_pagamento,situacao_financeira,data_ultimo_pagamento,foto_url,observacoes,tipo_socio")
      .like("tipo_socio", "dependente_%")
      .eq("possui_mensalidade", false);

    if (buscaError) throw buscaError;

    const candidatos = legados || [];
    const semResponsavel = candidatos.filter((d: any) => !d.responsavel_id);
    const migraveis = candidatos.filter((d: any) => d.responsavel_id);

    const { data: todosSocios, error: todosSociosError } = await supabase
      .from("socios")
      .select("id,matricula");
    if (todosSociosError) throw todosSociosError;

    const { data: todosDependentes, error: todosDependentesError } = await supabase
      .from("dependentes")
      .select("id,socio_id,nome,matricula");
    if (todosDependentesError) throw todosDependentesError;

    const socioPorId = new Map((todosSocios || []).map((s: any) => [String(s.id), s]));
    const usadas = new Set<string>();
    for (const s of todosSocios || []) if (s.matricula) usadas.add(String(s.matricula).toUpperCase());
    for (const d of todosDependentes || []) if (d.matricula) usadas.add(String(d.matricula).toUpperCase());

    let migrados = 0;
    let matriculasAtribuidas = 0;
    const erros: Array<{ nome: string; erro: string }> = [];

    for (const d of migraveis) {
      try {
        const responsavel = socioPorId.get(String(d.responsavel_id));
        if (!responsavel) throw new Error("Responsável não encontrado.");

        let matricula = String(d.matricula || "").trim().toUpperCase() || null;
        if (!matricula) {
          matricula = proximaMatriculaFamiliar(responsavel.matricula, usadas);
          if (!matricula) throw new Error(`Não foi possível gerar matrícula familiar para ${d.nome}.`);
          matriculasAtribuidas += 1;
          usadas.add(matricula);
        }

        const dados = {
          socio_id: d.responsavel_id,
          matricula,
          nome: d.nome,
          cpf: d.cpf || null,
          data_nascimento: d.data_nascimento || null,
          parentesco: d.parentesco || null,
          telefone: d.telefone || null,
          whatsapp: d.whatsapp || null,
          email: d.email || null,
          ativo: String(d.situacao || "ativo").toLowerCase() !== "inativo",
          possui_mensalidade: false,
          valor_mensalidade: 0,
          dia_vencimento: Number(d.dia_vencimento || 10),
          tipo_pagamento: "pix",
          situacao_financeira: "isento",
          data_ultimo_pagamento: d.data_ultimo_pagamento || null,
          foto_url: d.foto_url || null,
          observacoes: d.observacoes || null,
        };

        // Evita duplicação quando a migração for executada novamente.
        const { data: existente, error: existenteError } = await supabase
          .from("dependentes")
          .select("id,matricula")
          .eq("socio_id", d.responsavel_id)
          .eq("nome", d.nome)
          .maybeSingle();

        if (existenteError) throw existenteError;

        if (!existente) {
          const { error: insertError } = await supabase.from("dependentes").insert(dados);
          if (insertError) throw insertError;
        } else if (!existente.matricula) {
          const { error: updateError } = await supabase
            .from("dependentes")
            .update({ matricula })
            .eq("id", existente.id);
          if (updateError) throw updateError;
        }

        const { error: deleteError } = await supabase.from("socios").delete().eq("id", d.id);
        if (deleteError) throw deleteError;

        migrados += 1;
      } catch (error) {
        erros.push({ nome: d.nome, erro: erroBanco(error) || "Erro desconhecido." });
      }
    }

    return NextResponse.json({
      ok: true,
      encontrados: candidatos.length,
      migrados,
      matriculas_atribuidas: matriculasAtribuidas,
      sem_responsavel: semResponsavel.map((d: any) => ({ id: d.id, nome: d.nome })),
      erros,
      message:
        semResponsavel.length > 0
          ? `${migrados} dependente(s) migrado(s). ${semResponsavel.length} dependente(s) ainda precisam de responsável.`
          : `${migrados} dependente(s) antigo(s) migrado(s) para Dependentes.`,
    });
  } catch (error) {
    console.error("POST /api/dependentes/migrar:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao migrar dependentes antigos." },
      { status: 500 }
    );
  }
}
