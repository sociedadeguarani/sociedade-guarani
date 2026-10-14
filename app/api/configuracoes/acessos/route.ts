import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
import {
  normalizarPoliticaInadimplencia,
  POLITICA_INADIMPLENCIA_PADRAO,
} from "@/lib/politicaInadimplencia";

export const dynamic = "force-dynamic";

function erroConfiguracao(error: { code?: string; message?: string } | null) {
  if (error?.code === "42P01" || error?.message?.includes("configuracoes_acessos")) {
    return "A tabela de política de acesso ainda não foi instalada. Execute docs/sql_politica_inadimplencia.sql no SQL Editor do Supabase e tente novamente.";
  }
  return error?.message || "Não foi possível carregar a política de inadimplência.";
}

export async function GET(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const { data, error } = await getServiceClient()
      .from("configuracoes_acessos")
      .select("id,meses_atencao,meses_bloqueio,atualizado_por,atualizado_em")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: erroConfiguracao(error) }, { status: 500 });
    }

    return NextResponse.json({
      politica: normalizarPoliticaInadimplencia(data || POLITICA_INADIMPLENCIA_PADRAO),
      atualizado_em: data?.atualizado_em || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? erroConfiguracao(error) : "Erro ao consultar configuração." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireRoles(request, ["administrador"]);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json().catch(() => ({}));
    const mesesAtencao = Number(body?.meses_atencao);
    const mesesBloqueio = Number(body?.meses_bloqueio);

    if (
      !Number.isInteger(mesesAtencao) ||
      !Number.isInteger(mesesBloqueio) ||
      mesesAtencao < 1 || mesesAtencao > 11 ||
      mesesBloqueio < 2 || mesesBloqueio > 12 ||
      mesesAtencao >= mesesBloqueio
    ) {
      return NextResponse.json(
        { error: "Configuração inválida. O limite amarelo deve ser de 1 a 11 competências e o bloqueio deve ser maior que o limite amarelo, até 12." },
        { status: 400 }
      );
    }

    const politica = normalizarPoliticaInadimplencia({
      meses_atencao: mesesAtencao,
      meses_bloqueio: mesesBloqueio,
    });

    const { data, error } = await getServiceClient()
      .from("configuracoes_acessos")
      .upsert({
        id: 1,
        meses_atencao: politica.meses_atencao,
        meses_bloqueio: politica.meses_bloqueio,
        atualizado_por: auth.usuario.id,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "id" })
      .select("id,meses_atencao,meses_bloqueio,atualizado_por,atualizado_em")
      .single();

    if (error) {
      return NextResponse.json({ error: erroConfiguracao(error) }, { status: 500 });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Política de inadimplência atualizada.",
      politica: normalizarPoliticaInadimplencia(data),
      atualizado_em: data.atualizado_em,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível salvar a política." },
      { status: 500 }
    );
  }
}

