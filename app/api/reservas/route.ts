import { NextResponse } from "next/server";
import { normalizarPerfil, usuarioAutenticado } from "@/lib/guaraniAuth";

export const dynamic = "force-dynamic";

const ALIASES: Record<string,string[]> = {
  fut: ["Quadra de Futebol", "Quadra Futebol 7", "Futebol", "Futebol 7"],
  volei: ["Quadra de Vôlei", "Quadra de Volei", "Quadra Vôlei", "Quadra Volei", "Vôlei", "Volei"],
  areia: ["Quadra de Areia", "Areia"],
  q48: ["Quadra 48", "Cancha 48", "Cancha48"],
  q1: ["Quiosque 1", "Quiosque 01", "Quiosque A"],
  q2: ["Quiosque 2", "Quiosque 02", "Quiosque B"],
  q3: ["Quiosque 3", "Quiosque 03", "Quiosque C"],
  salao_p: ["Salão Pequeno de Vidro", "Salao Pequeno de Vidro", "Salão Social Pequeno", "Salao Social Pequeno", "Salão Pequeno", "Salao Pequeno"],
  salao_g: ["Salão Social Grande", "Salao Social Grande", "Salão Grande", "Salao Grande"],
  ctg: ["Salão CTG", "Salao CTG", "CTG"],
};
function norm(v: unknown){return String(v??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
function compact(v: unknown){return norm(v).replace(/[^a-z0-9]/g,"");}
function uuid(v: unknown){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v??""));}
function findSpace(list:any[], value:string){
  if(uuid(value)) return list.find(x=>x.id===value)||null;
  const aliases=ALIASES[value]||[value]; const a=aliases.map(norm), c=aliases.map(compact);
  return list.find(x=>{const n=norm(x.nome), nc=compact(x.nome); return a.includes(n)||c.includes(nc)||c.some(z=>z.length>=5&&(nc.includes(z)||z.includes(nc)));})||null;
}
function parseHorario(v:unknown){const m=String(v??"").replace(/\s+—\s+ocupado$/i,"").trim().match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/); return m?{inicio:m[1],fim:m[2]}:null;}
function mapReserva(row:any){
  const e=Array.isArray(row.espacos)?row.espacos[0]:row.espacos; const s=Array.isArray(row.socios)?row.socios[0]:row.socios;
  return {id:row.id,espacoId:row.espaco_id,socioId:row.socio_id||null,data:row.data_reserva,horario:`${String(row.hora_inicio||"").slice(0,5)} - ${String(row.hora_fim||"").slice(0,5)}`,nome:row.responsavel_nome||s?.nome||"",tipoPessoa:row.socio_id?"socio":"nao_socio",valor:Number(row.valor||0),status:row.situacao==="cancelada"?"cancelada":"confirmada",pagamento:row.tipo_pagamento||"pix",comprovante_url:row.comprovante_url||null,comprovante_status:row.comprovante_status||"nenhum",motivo_recusa:row.motivo_recusa||null,situacao:row.situacao||null,espaco_nome:e?.nome||null};
}
async function authz(request:Request){const a=await usuarioAutenticado(request); if("error" in a)return {error:NextResponse.json({error:a.error},{status:a.status})}; const p=normalizarPerfil(a.perfil); if(!["administrador","funcionario","associado"].includes(p))return {error:NextResponse.json({error:"Sem permissão para acessar reservas."},{status:403})}; return {auth:a,perfil:p};}
export async function GET(request:Request){try{const r=await authz(request);if(r.error)return r.error;const {auth,perfil}=r;let q=auth.supabase.from("reservas").select("*,espacos:espaco_id(id,nome),socios:socio_id(id,nome,matricula)").order("data_reserva",{ascending:false}).order("created_at",{ascending:false});if(perfil==="associado"){if(!auth.usuario.socio_id)return NextResponse.json({reservas:[]});q=q.eq("socio_id",auth.usuario.socio_id);}const {data,error}=await q;if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({reservas:(data||[]).map(mapReserva)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Erro ao carregar reservas."},{status:500});}}
export async function POST(request:Request){try{const r=await authz(request);if(r.error)return r.error;const {auth,perfil}=r;const b=await request.json();const espacoInput=String(b.espaco_id||b.espaco_nome||"").trim();const {data:espacos,error:ee}=await auth.supabase.from("espacos").select("id,nome,ativo,permite_reserva,preco_hora,preco_diaria").eq("ativo",true);if(ee)return NextResponse.json({error:ee.message},{status:500});const e=findSpace(espacos||[],espacoInput);if(!e)return NextResponse.json({error:`Espaço não encontrado no cadastro da Sociedade. Cadastros encontrados: ${(espacos||[]).map((x:any)=>x.nome).join(", ")||"nenhum"}.`},{status:400});if(e.permite_reserva===false)return NextResponse.json({error:"Este espaço não está liberado para reservas."},{status:400});
 let socioId=b.socio_id||null,nome=String(b.nome||"").trim();const tipo=String(b.tipo_pessoa||"socio")==="nao_socio"?"nao_socio":"socio";
 if(perfil==="associado"){if(!auth.usuario.socio_id)return NextResponse.json({error:"Seu usuário não está vinculado a um sócio."},{status:403});socioId=auth.usuario.socio_id;const {data:s}=await auth.supabase.from("socios").select("id,nome").eq("id",socioId).maybeSingle();if(!s)return NextResponse.json({error:"Sócio vinculado não encontrado."},{status:404});nome=s.nome;}
 else if(tipo==="socio"){if(!socioId||!uuid(socioId))return NextResponse.json({error:"Selecione um sócio válido como responsável."},{status:400});const {data:s,error:se}=await auth.supabase.from("socios").select("id,nome").eq("id",socioId).maybeSingle();if(se)return NextResponse.json({error:se.message},{status:500});if(!s)return NextResponse.json({error:"Sócio não encontrado."},{status:404});nome=s.nome;}
 else {if(!["administrador","funcionario"].includes(perfil))return NextResponse.json({error:"Somente administração ou funcionário pode registrar reserva de não sócio."},{status:403});socioId=null;if(!nome)return NextResponse.json({error:"Informe o responsável não sócio."},{status:400});}
 const data=String(b.data||b.data_reserva||"");const h=parseHorario(b.horario);if(!/^\d{4}-\d{2}-\d{2}$/.test(data)||!h)return NextResponse.json({error:"Informe data e horário válidos."},{status:400});
 const {data:exist,error:ce}=await auth.supabase.from("reservas").select("id,hora_inicio,hora_fim,situacao").eq("espaco_id",e.id).eq("data_reserva",data).neq("situacao","cancelada");if(ce)return NextResponse.json({error:ce.message},{status:500});if((exist||[]).some((x:any)=>String(x.hora_inicio).slice(0,5)<h.fim&&String(x.hora_fim).slice(0,5)>h.inicio))return NextResponse.json({error:"Este espaço já está reservado para o horário selecionado."},{status:409});
 const valor=Number(b.valor||0);if(!Number.isFinite(valor)||valor<0)return NextResponse.json({error:"Valor da reserva inválido."},{status:400});
 const {data:row,error}=await auth.supabase.from("reservas").insert({espaco_id:e.id,socio_id:socioId,dependente_id:null,responsavel_nome:nome,responsavel_telefone:null,responsavel_whatsapp:null,data_reserva:data,hora_inicio:h.inicio,hora_fim:h.fim,finalidade:"Reserva de espaço",quantidade_pessoas:null,valor,situacao:"solicitada",tipo_pagamento:"pix",data_pagamento:null,codigo_transacao:null,comprovante_url:null,prazo_pagamento:null,observacoes:null,comprovante_status:"nenhum",motivo_recusa:null}).select("*,espacos:espaco_id(id,nome),socios:socio_id(id,nome,matricula)").single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({ok:true,reserva:mapReserva(row)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Erro ao registrar reserva."},{status:500});}}
export async function PATCH(request:Request){try{const r=await authz(request);if(r.error)return r.error;const {auth,perfil}=r;if(perfil==="associado")return NextResponse.json({error:"Somente administração pode alterar o status da reserva."},{status:403});const b=await request.json();const id=String(b.id||"");if(!id)return NextResponse.json({error:"Reserva não informada."},{status:400});const s=String(b.status||b.situacao||"confirmada").toLowerCase();const situacao=s==="cancelada"||s==="cancelar"?"cancelada":s;const {data,error}=await auth.supabase.from("reservas").update({situacao,cancelada_em:situacao==="cancelada"?new Date().toISOString():null,cancelada_por:situacao==="cancelada"?auth.usuario.id:null}).eq("id",id).select("*,espacos:espaco_id(id,nome),socios:socio_id(id,nome,matricula)").single();if(error)return NextResponse.json({error:error.message},{status:500});return NextResponse.json({ok:true,reserva:mapReserva(data)});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Erro ao atualizar reserva."},{status:500});}}
