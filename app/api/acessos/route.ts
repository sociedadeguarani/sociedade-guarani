import { NextResponse } from "next/server";
import { getServiceClient, requireRoles } from "@/lib/guaraniAuth";
function calcularExame(data: string | null | undefined) {
  if (!data) return { status:"nao_informado", label:"Não informado", cor:"cinza", validade:null };
  const validade=new Date(`${data}T23:59:59`), hoje=new Date();
  const diffDias=Math.floor((hoje.getTime()-validade.getTime())/86400000);
  if(diffDias<=0) return {status:"em_dia",label:"Em dia",cor:"verde",validade:data};
  if(diffDias<=60) return {status:"atrasado",label:"Atrasado até 2 meses",cor:"amarelo",validade:data};
  return {status:"bem_atrasado",label:"Bem atrasado",cor:"vermelho",validade:data};
}
async function dadosExame(supabase: ReturnType<typeof getServiceClient>, socioId:string){
  const {data}=await supabase.from("acessos_piscina").select("exame_validade,exame_verificado,data_hora_entrada").eq("socio_id",socioId).not("exame_validade","is",null).order("data_hora_entrada",{ascending:false}).limit(1).maybeSingle();
  return calcularExame(data?.exame_validade);
}
async function supsafe<T>(promise: PromiseLike<T>): Promise<T> { return promise; }

export async function GET(request:Request){
  const auth=await requireRoles(request,["administrador","funcionario"]); if("response" in auth)return auth.response;
  try{const supabase=getServiceClient();const {searchParams}=new URL(request.url);const de=searchParams.get("de"),ate=searchParams.get("ate");let query=supabase.from("acessos_sociedade").select("id,socio_id,usuario_id,entrada_em,local,resultado,observacao,socio:socios(matricula,nome,tipo_socio,categoria,situacao),usuario:usuarios_sistema(nome_exibicao)").order("entrada_em",{ascending:false}).limit(500);if(de)query=query.gte("entrada_em",`${de}T00:00:00`);if(ate)query=query.lte("entrada_em",`${ate}T23:59:59`);const {data,error}=await query;if(error)throw error;
    const rows=data||[]; const socioIds=[...new Set(rows.map((a:any)=>a.socio_id).filter(Boolean))]; const usuarioIds=[...new Set(rows.map((a:any)=>a.usuario_id).filter(Boolean))];
    const [{data:socios},{data:usuarios}]=await Promise.all([
      socioIds.length?supsafe(supabase.from("socios").select("id,matricula,nome,tipo_socio,categoria,situacao").in("id",socioIds)):Promise.resolve({data:[]}),
      usuarioIds.length?supsafe(supabase.from("usuarios_sistema").select("id,nome_exibicao").in("id",usuarioIds)):Promise.resolve({data:[]})
    ]);
    const sm=new Map((socios||[]).map((x:any)=>[x.id,x])); const um=new Map((usuarios||[]).map((x:any)=>[x.id,x]));
    return NextResponse.json({acessos:rows.map((a:any)=>({...a,socio:sm.get(a.socio_id)||null,usuario:um.get(a.usuario_id)||null}))});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao carregar acessos."},{status:500});}
}
export async function POST(request:Request){
  const auth=await requireRoles(request,["administrador","funcionario"]); if("response" in auth)return auth.response;
  try{const body=await request.json();const qr=String(body?.qr||"").trim();const socioId=String(body?.socio_id||"").trim();const supabase=getServiceClient();let id=socioId;if(!id&&qr.startsWith("guarani:socio:"))id=qr.replace("guarani:socio:","");const match=qr.match(/\/acessos\/qr\/([0-9a-f-]{20,})/i);if(!id&&match)id=match[1];if(!id)return NextResponse.json({error:"QR Code inválido."},{status:400});
  const {data:socio,error:socioError}=await supabase.from("socios").select("id,matricula,nome,cpf,tipo_socio,categoria,situacao,situacao_financeira,foto_url").eq("id",id).maybeSingle();if(socioError)throw socioError;if(!socio)return NextResponse.json({error:"Associado não encontrado."},{status:404});
  const situacao=String(socio.situacao||"").toLowerCase();const liberado=["ativo","ativa","em_dia"].includes(situacao)||!situacao;const resultado=liberado?"liberado":"bloqueado";const exame=await dadosExame(supabase,socio.id);
  const {data:acesso,error}=await supabase.from("acessos_sociedade").insert({socio_id:socio.id,usuario_id:auth.usuario.id,resultado,local:body?.local||"Portaria",observacao:body?.observacao||null}).select("id,socio_id,usuario_id,entrada_em,local,resultado,observacao").single();if(error)throw error;return NextResponse.json({acesso,socio,liberado,exame});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Erro ao registrar acesso."},{status:500});}
}
