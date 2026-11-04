import { NextResponse } from "next/server";
import { getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

type PessoaFamilia = {
  id: string;
  nome: string;
  matricula: string | null;
  responsavel_id: string | null;
  parentesco: string | null;
  possui_mensalidade: boolean | null;
};

type MensalidadeMinha = {
  id: string;
  socio_id: string;
  competencia: string;
  valor: number;
  data_vencimento: string | null;
  situacao: string | null;
  data_pagamento: string | null;
  tipo_pagamento: string | null;
  numero_recibo: string | null;
  comprovante_url: string | null;
  comprovante_enviado_em: string | null;
  comprovante_status: string | null;
  motivo_recusa: string | null;
  observacoes: string | null;
  motivo: string | null;
};

export async function GET(request: Request) {
  const auth = await usuarioAutenticado(request);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const socioId = auth.usuario.socio_id;
    if (!socioId) {
      return NextResponse.json(
        { error: "Seu login não está vinculado a um cadastro de sócio." },
        { status: 403 },
      );
    }

    const db = getServiceClient();
    const { data: pessoa, error: pessoaError } = await db
      .from("socios")
      .select("id,nome,matricula,situacao_financeira,responsavel_id,possui_mensalidade")
      .eq("id", socioId)
      .maybeSingle();

    if (pessoaError) throw pessoaError;
    if (!pessoa) {
      return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
    }

    const titularId = pessoa.responsavel_id || pessoa.id;
    const { data: familia, error: familiaError } = await db
      .from("socios")
      .select("id,nome,matricula,responsavel_id,parentesco,possui_mensalidade")
      .or(`id.eq.${titularId},responsavel_id.eq.${titularId}`)
      .order("nome");

    if (familiaError) throw familiaError;

    const familiaRegistros = (familia ?? []) as unknown as PessoaFamilia[];
    const cobraveis = familiaRegistros
      .filter((membro) => {
        if (membro.possui_mensalidade !== true) return false;
        if (!membro.responsavel_id) return true;
        return /^SD\d{1,6}A$/i.test(String(membro.matricula || "").trim());
      })
      .map((membro) => membro.id);

    let mensalidades: MensalidadeMinha[] = [];
    if (cobraveis.length > 0) {
      const { data, error } = await db
        .from("mensalidades")
        .select("id,socio_id,competencia,valor,data_vencimento,situacao,data_pagamento,tipo_pagamento,numero_recibo,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,observacoes,motivo")
        .in("socio_id", cobraveis)
        .order("competencia", { ascending: false })
        .limit(60);

      if (error) throw error;
      mensalidades = (data ?? []) as unknown as MensalidadeMinha[];
    }

    const socioTitular = familiaRegistros.find((membro) => membro.id === titularId) || pessoa;
    const dependentes = familiaRegistros.filter((membro) => membro.responsavel_id === titularId);

    return NextResponse.json({
      socio: socioTitular,
      dependentes,
      mensalidades,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Erro ao carregar mensalidades: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
