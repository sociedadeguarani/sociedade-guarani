import { NextResponse } from "next/server";
import { getServiceClient, usuarioAutenticado } from "@/lib/guaraniAuth";

export async function GET(request: Request) {
  const auth = await usuarioAutenticado(request);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const socioId = auth.usuario.socio_id;
    if (!socioId) return NextResponse.json({ error: "Seu login não está vinculado a um cadastro de sócio." }, { status: 403 });
    const db = getServiceClient();
    const { data: pessoa, error: pe } = await db.from("socios").select("id,nome,matricula,situacao_financeira,responsavel_id,possui_mensalidade").eq("id", socioId).maybeSingle();
    if (pe) throw pe;
    if (!pessoa) return NextResponse.json({ error: "Cadastro não encontrado." }, { status: 404 });
    const titularId = pessoa.responsavel_id || pessoa.id;
    const { data: familia, error: fe } = await db.from("socios").select("id,nome,matricula,responsavel_id,parentesco,possui_mensalidade").or(`id.eq.${titularId},responsavel_id.eq.${titularId}`).order("nome");
    if (fe) throw fe;
    const cobraveis = (familia || []).filter((x:any)=>x.possui_mensalidade === true).map((x:any)=>x.id);
    const { data: mensalidades, error: me } = cobraveis.length
      ? await db.from("mensalidades").select("id,socio_id,competencia,valor,data_vencimento,situacao,data_pagamento,tipo_pagamento,numero_recibo,comprovante_url,comprovante_enviado_em,comprovante_status,motivo_recusa,observacoes,motivo").in("socio_id", cobraveis).order("competencia",{ascending:false}).limit(60)
      : {data:[],error:null} as any;
    if (me) throw me;
    return NextResponse.json({ socio:(familia||[]).find((x:any)=>x.id===titularId)||pessoa, dependentes:(familia||[]).filter((x:any)=>x.responsavel_id===titularId), mensalidades:mensalidades||[] });
  } catch(e) { return NextResponse.json({error:`Erro ao carregar mensalidades: ${e instanceof Error ? e.message : String(e)}`},{status:500}); }
}
