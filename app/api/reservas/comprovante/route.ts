import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";
export const dynamic="force-dynamic";
const BUCKET="comprovantes-financeiro";
const TIPOS=["image/jpeg","image/png","image/webp","application/pdf"];
export async function POST(request:Request){
 const auth=await exigirAdministrador(request); if("error" in auth)return NextResponse.json({error:auth.error},{status:auth.status});
 const form=await request.formData(); const id=String(form.get("origem_id")||""); const arquivo=form.get("arquivo");
 if(!id||!(arquivo instanceof File))return NextResponse.json({error:"Selecione o comprovante."},{status:400});
 if(!TIPOS.includes(arquivo.type))return NextResponse.json({error:"Use JPG, PNG, WEBP ou PDF."},{status:400}); if(arquivo.size>8*1024*1024)return NextResponse.json({error:"Máximo de 8 MB."},{status:400});
 const {data:r,error:e}=await auth.supabase.from("reservas").select("id,nome,valor,socio_id").eq("id",id).single(); if(e||!r)return NextResponse.json({error:"Reserva não encontrada."},{status:404});
 const atual=await auth.supabase.storage.getBucket(BUCKET); if(atual.error){const cr=await auth.supabase.storage.createBucket(BUCKET,{public:true});if(cr.error&&!/already exists/i.test(cr.error.message))return NextResponse.json({error:cr.error.message},{status:500});}
 const ext=arquivo.name.split(".").pop()?.toLowerCase()||"bin"; const caminho=`pagamentos/reserva/${id}-${Date.now()}.${ext}`;
 const up=await auth.supabase.storage.from(BUCKET).upload(caminho,new Uint8Array(await arquivo.arrayBuffer()),{contentType:arquivo.type,upsert:false}); if(up.error)return NextResponse.json({error:up.error.message},{status:500});
 const {data:url}=auth.supabase.storage.from(BUCKET).getPublicUrl(caminho); const agora=new Date().toISOString();
 const {data,error}=await auth.supabase.from("reservas").update({comprovante_url:url.publicUrl,comprovante_enviado_em:agora,comprovante_status:"pendente",motivo_recusa:null}).eq("id",id).select("*").single(); if(error)return NextResponse.json({error:error.message},{status:500});
 const n=await auth.supabase.from("notificacoes_admin").insert({tipo:"comprovante_pagamento",titulo:"Novo comprovante de reserva aguardando aprovação",mensagem:`Reserva de ${r.nome} no valor de R$ ${Number(r.valor||0).toFixed(2).replace(".",",")} foi enviada para conferência.`,origem_tipo:"reserva",origem_id:id,lida:false});
 if(n.error)return NextResponse.json({error:`Comprovante enviado, mas a notificação não foi criada: ${n.error.message}`,url:url.publicUrl},{status:500});
 return NextResponse.json({ok:true,url:url.publicUrl,reserva:data});
}

