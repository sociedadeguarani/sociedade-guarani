import { NextResponse } from "next/server";
import { exigirAdministrador } from "@/lib/guaraniAuth";
export const dynamic = "force-dynamic";
export async function GET(request: Request){
  const auth=await exigirAdministrador(request); if("error" in auth)return NextResponse.json({error:auth.error},{status:auth.status});
  const {data,error}=await auth.supabase.from("reservas").select("*").order("data",{ascending:false}).order("created_at",{ascending:false});
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({reservas:data||[]});
}
export async function POST(request: Request){
  const auth=await exigirAdministrador(request); if("error" in auth)return NextResponse.json({error:auth.error},{status:auth.status});
  const b=await request.json();
  const {data,error}=await auth.supabase.from("reservas").insert({espaco_id:String(b.espaco_id||""),socio_id:b.socio_id||null,data:String(b.data||""),horario:String(b.horario||""),nome:String(b.nome||"").trim(),tipo_pessoa:b.tipo_pessoa||"socio",valor:Number(b.valor||0),status:"confirmada",pagamento:"pix",comprovante_url:null,comprovante_status:"nenhum"}).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({ok:true,reserva:data});
}
export async function PATCH(request: Request){
  const auth=await exigirAdministrador(request); if("error" in auth)return NextResponse.json({error:auth.error},{status:auth.status});
  const b=await request.json(); const id=String(b.id||""); if(!id)return NextResponse.json({error:"Reserva não informada."},{status:400});
  const {data,error}=await auth.supabase.from("reservas").update({status:b.status||"confirmada"}).eq("id",id).select("*").single();
  if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({ok:true,reserva:data});
}

