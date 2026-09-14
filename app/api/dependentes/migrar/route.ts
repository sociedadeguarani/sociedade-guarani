import { NextRequest, NextResponse } from "next/server";
import { exigirAdministrador, getServiceClient } from "@/lib/guaraniAuth";

export async function POST(request: NextRequest) {
  const auth = await exigirAdministrador(request);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getServiceClient();
  const { data: antigos, error: antigosError } = await db.from("dependentes").select("*").order("nome");
  if (antigosError) return NextResponse.json({ error: antigosError.message }, { status: 500 });

  if (!antigos?.length) return NextResponse.json({ migrados: 0, ignorados: 0, mensagem: "Nenhum dependente legado para migrar." });

  const { data: socios, error: sociosError } = await db.from("socios").select("id,nome,tipo_socio,matricula,responsavel_id");
  if (sociosError) return NextResponse.json({ error: sociosError.message }, { status: 500 });

  const porNome = new Map((socios || []).map((s: any) => [String(s.nome || "").trim().toLowerCase(), s]));
  let migrados = 0;
  let ignorados = 0;
  const erros: string[] = [];

  for (const antigo of antigos) {
    const nome = String(antigo.nome || "").trim();
    if (!nome || !antigo.socio_id) { ignorados++; continue; }

    const responsavel = (socios || []).find((s: any) => s.id === antigo.socio_id);
    if (!responsavel) { ignorados++; erros.push(`${nome}: responsável não encontrado`); continue; }

    const candidato = porNome.get(nome.toLowerCase());
    const cpfAntigo = String(antigo.cpf || "").replace(/\D/g, "");
    const existente = candidato && (candidato.responsavel_id === antigo.socio_id || (!candidato.responsavel_id && cpfAntigo && String((candidato as any).cpf || "").replace(/\D/g, "") === cpfAntigo)) ? candidato : null;
    if (existente?.responsavel_id === antigo.socio_id) {
      ignorados++;
      continue;
    }

    if (existente && !existente.responsavel_id) {
      const { error } = await db.from("socios").update({
        responsavel_id: antigo.socio_id,
        parentesco: antigo.parentesco || null,
        tipo_socio: responsavel.tipo_socio?.includes("contribuinte") ? "dependente_contribuinte_familiar_mensalidade" : "dependente_patrimonial_familiar_mensalidade",
        categoria: "Dependente",
        possui_mensalidade: Boolean(antigo.possui_mensalidade),
        valor_mensalidade: Number(antigo.valor_mensalidade || 0),
        dia_vencimento: Number(antigo.dia_vencimento || 10),
        tipo_pagamento: antigo.tipo_pagamento || "pix",
        situacao_financeira: antigo.situacao_financeira || (antigo.possui_mensalidade ? "em_dia" : "isento"),
        data_ultimo_pagamento: antigo.data_ultimo_pagamento || null,
        situacao: antigo.ativo === false ? "inativo" : "ativo",
      }).eq("id", existente.id);
      if (error) { erros.push(`${nome}: ${error.message}`); continue; }
      migrados++;
      continue;
    }

    const { data: novo, error } = await db.from("socios").insert({
      nome,
      cpf: antigo.cpf || null,
      data_nascimento: antigo.data_nascimento || null,
      telefone: antigo.telefone || null,
      data_associacao: new Date().toISOString().slice(0, 10),
      categoria: "Dependente",
      situacao: antigo.ativo === false ? "inativo" : "ativo",
      tipo_socio: responsavel.tipo_socio?.includes("contribuinte") ? "dependente_contribuinte_familiar_mensalidade" : "dependente_patrimonial_familiar_mensalidade",
      responsavel_id: antigo.socio_id,
      parentesco: antigo.parentesco || null,
      possui_mensalidade: Boolean(antigo.possui_mensalidade),
      valor_mensalidade: Number(antigo.valor_mensalidade || 0),
      dia_vencimento: Number(antigo.dia_vencimento || 10),
      tipo_pagamento: antigo.tipo_pagamento || "pix",
      situacao_financeira: antigo.situacao_financeira || (antigo.possui_mensalidade ? "em_dia" : "isento"),
      data_ultimo_pagamento: antigo.data_ultimo_pagamento || null,
    }).select("id,nome,responsavel_id").single();
    if (error) { erros.push(`${nome}: ${error.message}`); continue; }
    if (novo) porNome.set(nome.toLowerCase(), novo as any);
    migrados++;
  }

  return NextResponse.json({ migrados, ignorados, erros });
}
