"use client";

import { useEffect, useMemo, useState } from "react";
import { IdCard, Printer, Search, ShieldCheck, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Socio = { id:string; matricula:number|string|null; nome:string; categoria:string|null; tipo_socio:string|null; situacao:string|null; data_associacao:string|null; foto_url:string|null; inicio_temporada:string|null; fim_temporada:string|null };

function visual(tipo:string|null) {
  const t = String(tipo || "").toLowerCase();
  if (t.startsWith("patrimonial")) return { nome:"Patrimonial", bg:"#1769aa", text:"#ffffff" };
  if (t.startsWith("contribuinte")) return { nome:"Contribuinte", bg:"#18864b", text:"#ffffff" };
  if (t.startsWith("temporada")) return { nome:"Temporada", bg:"#e87511", text:"#ffffff" };
  if (t.includes("transitorio")) return { nome:"Temporário", bg:"#eab308", text:"#17382c" };
  if (t.startsWith("convite")) return { nome:"Convite", bg:"#6b7280", text:"#ffffff" };
  return { nome:"Associado", bg:"#005a3c", text:"#ffffff" };
}

export default function CarteirinhasPage(){
  const [socios,setSocios]=useState<Socio[]>([]); const [busca,setBusca]=useState(""); const [selecionado,setSelecionado]=useState<Socio|null>(null); const [erro,setErro]=useState("");
  useEffect(()=>{ (async()=>{ const {data:{session}}=await import("@/lib/supabaseClient").then(m=>m.supabase.auth.getSession()); if(!session){location.replace("/login");return;} const r=await fetch("/api/carteirinhas",{headers:{Authorization:`Bearer ${session.access_token}`},cache:"no-store"}); const d=await r.json(); if(!r.ok){setErro(d.error||"Erro");return;} setSocios(d.socios||[]); if(d.socios?.length===1)setSelecionado(d.socios[0]); })(); },[]);
  const lista=useMemo(()=>socios.filter(s=>{const q=busca.toLowerCase().trim(); return !q || s.nome.toLowerCase().includes(q) || String(s.matricula||"").includes(q)}),[socios,busca]);
  const v=selecionado?visual(selecionado.tipo_socio):visual(null);
  return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]"><CabecalhoPadrao/><MenuLateralPadrao/><main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8"><div className="mx-auto max-w-7xl space-y-6"><div><p className="text-sm text-gray-500">Identificação</p><h1 className="text-3xl font-extrabold text-[#005a3c]">Carteirinhas</h1><p className="mt-1 text-sm text-gray-500">Carteirinha física, carteira digital e QR Code de acesso.</p></div>{erro&&<div className="rounded-xl bg-red-50 p-4 font-semibold text-red-700">{erro}</div>}<div className="grid gap-6 lg:grid-cols-[1fr_430px]"><section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4 text-gray-400"/><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome ou matrícula..." className="w-full py-3 outline-none"/></div><div className="mt-4 space-y-2">{lista.map(s=><button key={s.id} onClick={()=>setSelecionado(s)} className={`w-full rounded-xl border p-4 text-left ${selecionado?.id===s.id?"border-[#005a3c] bg-[#e8f3ee]":"hover:bg-gray-50"}`}><b>{s.nome}</b><div className="text-xs text-gray-500">Matrícula: {s.matricula||"—"} · {visual(s.tipo_socio).nome}</div></button>)}</div></section>{selecionado&&<section className="space-y-4"><div id="carteirinha" className="overflow-hidden rounded-3xl border-4 bg-white shadow-xl"><div className="p-5" style={{background:v.bg,color:v.text}}><div className="flex items-center justify-between"><div><div className="text-xs font-bold tracking-widest">SOCIEDADE RECREATIVA GUARANI</div><div className="mt-1 text-lg font-black">CARTEIRA DE ASSOCIADO</div></div><IdCard/></div></div><div className="p-6"><div className="flex gap-4"><div className="h-24 w-20 overflow-hidden rounded-xl bg-gray-100">{selecionado.foto_url?<img src={selecionado.foto_url} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-3xl">👤</div>}</div><div><h2 className="text-xl font-black">{selecionado.nome}</h2><p className="text-sm text-gray-500">Matrícula <b>{selecionado.matricula||"—"}</b></p><span className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-black" style={{background:v.bg,color:v.text}}>{v.nome}</span></div></div><div className="mt-6 flex items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase text-gray-400">Situação</div><div className="font-black text-[#005a3c]">{selecionado.situacao||"Não informada"}</div></div><QRCodeSVG value={`guarani:socio:${selecionado.id}`} size={112}/></div></div></div><div className="grid grid-cols-2 gap-2"><button onClick={()=>window.print()} className="flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white"><Printer className="h-4 w-4"/> Imprimir</button><div className="flex items-center justify-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-bold"><Smartphone className="h-4 w-4"/> Carteira digital</div></div><div className="rounded-xl bg-[#e8f3ee] p-4 text-sm"><ShieldCheck className="mr-2 inline h-4 w-4 text-[#005a3c]"/><b>QR Code exclusivo.</b> O funcionário pode escanear este código para registrar a entrada.</div></section>}</div></div></main></div>;
}

