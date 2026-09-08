"use client";
import { useEffect, useState } from "react";
import { Megaphone, Plus, Edit3, Trash2, Pin, Upload, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Aviso={id:string;titulo:string;mensagem:string;imagem_url:string|null;tipo:string;prioridade:string;fixado:boolean;ativo:boolean;publico:string;data_publicacao:string;data_inicio:string|null;data_fim:string|null};
async function getToken(){const {data}=await supabase.auth.getSession();return data.session?.access_token||""}
export default function AvisosPage(){
 const [avisos,setAvisos]=useState<Aviso[]>([]); const [perfil,setPerfil]=useState(""); const [modal,setModal]=useState(false); const [edit,setEdit]=useState<Aviso|null>(null); const [erro,setErro]=useState(""); const [arquivo,setArquivo]=useState<File|null>(null); const [enviandoImagem,setEnviandoImagem]=useState(false); const [form,setForm]=useState<any>({titulo:"",mensagem:"",imagem_url:"",tipo:"informativo",prioridade:"normal",fixado:false,ativo:true,publico:"todos",data_inicio:"",data_fim:""});
 async function api(url:string,init?:RequestInit){const t=await getToken();return fetch(url,{...init,headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},cache:"no-store"})}
 async function carregar(){setErro("");const r=await api("/api/avisos");const j=await r.json();if(!r.ok)return setErro(j.error||"Erro ao carregar avisos.");setAvisos(j.avisos||[]);setPerfil(j.perfil||"")}
 useEffect(()=>{carregar()},[]);
 function novo(){setErro("");setArquivo(null);setEdit(null);setForm({titulo:"",mensagem:"",imagem_url:"",tipo:"informativo",prioridade:"normal",fixado:false,ativo:true,publico:"todos",data_inicio:"",data_fim:""});setModal(true)}
 function editar(a:Aviso){setErro("");setArquivo(null);setEdit(a);setForm({...a,data_inicio:a.data_inicio?new Date(a.data_inicio).toISOString().slice(0,16):"",data_fim:a.data_fim?new Date(a.data_fim).toISOString().slice(0,16):""});setModal(true)}
 async function salvar(e:React.FormEvent){
  e.preventDefault(); setErro("");
  let imagemUrl=form.imagem_url||"";
  if(arquivo){
    setEnviandoImagem(true);
    try{
      const fd=new FormData(); fd.append("arquivo",arquivo);
      const t=await getToken();
      const ur=await fetch("/api/avisos/upload",{method:"POST",headers:{Authorization:`Bearer ${t}`},body:fd,cache:"no-store"});
      const uj=await ur.json();
      if(!ur.ok) return setErro(uj.error||"Não foi possível enviar a imagem.");
      imagemUrl=uj.url||"";
    }finally{setEnviandoImagem(false)}
  }
  const payload={...form,imagem_url:imagemUrl};
  const r=await api("/api/avisos",{method:edit?"PATCH":"POST",body:JSON.stringify(edit?{id:edit.id,...payload}:payload)});
  const j=await r.json(); if(!r.ok)return setErro(j.error||"Erro ao salvar aviso.");
  setModal(false); setArquivo(null); carregar()
 }
 async function excluir(a:Aviso){if(!confirm(`Excluir o aviso “${a.titulo}”?`))return;const r=await api("/api/avisos",{method:"DELETE",body:JSON.stringify({id:a.id})});const j=await r.json();if(!r.ok)return setErro(j.error||"Erro ao excluir.");carregar()}
 return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]"><MenuLateralPadrao/><CabecalhoPadrao/><main className="px-5 py-6 lg:pl-[265px] lg:pr-8"><div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-sm font-bold text-[#005a3c]"><Megaphone className="h-5 w-5"/> Avisos</div><h1 className="mt-1 text-3xl font-black text-[#003d2b]">Avisos e comunicados</h1><p className="mt-1 text-sm text-gray-500">Publique informações para os associados.</p></div>{perfil==="administrador"&&<button onClick={novo} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4"/> Novo Aviso</button>}</div>{erro&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{avisos.map(a=><article key={a.id} className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">{a.imagem_url&&<img src={a.imagem_url} alt="" className="h-48 w-full object-cover"/>}<div className="p-5"><div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#e8f3ee] px-2.5 py-1 text-[10px] font-black uppercase text-[#005a3c]">{a.tipo}</span>{a.fixado&&<Pin className="h-4 w-4 text-amber-600"/>}</div><h2 className="mt-3 text-xl font-black text-[#003d2b]">{a.titulo}</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{a.mensagem}</p><div className="mt-4 text-xs font-bold text-gray-400">Publicado em {new Date(a.data_publicacao).toLocaleDateString("pt-BR")}</div>{perfil==="administrador"&&<div className="mt-4 flex gap-2"><button onClick={()=>editar(a)} className="flex-1 rounded-xl border px-3 py-2 font-black"><Edit3 className="mr-1 inline h-4 w-4"/>Editar</button><button onClick={()=>excluir(a)} className="rounded-xl border border-red-200 px-3 py-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div>}</div></article>)}</div>{avisos.length===0&&<div className="rounded-2xl bg-white p-12 text-center text-gray-500">Nenhum aviso publicado.</div>}{modal&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><form onSubmit={salvar} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{edit?"Editar aviso":"Novo aviso"}</h2><button type="button" onClick={()=>setModal(false)}>✕</button></div><div className="grid gap-4 md:grid-cols-2"><label className="md:col-span-2"><span className="label">Título</span><input required value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} className="input"/></label><label className="md:col-span-2"><span className="label">Mensagem</span><textarea required value={form.mensagem} onChange={e=>setForm({...form,mensagem:e.target.value})} className="input min-h-32"/></label><label><span className="label">Tipo</span><select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} className="input"><option>informativo</option><option>importante</option><option>evento</option><option>urgente</option></select></label><label><span className="label">Prioridade</span><select value={form.prioridade} onChange={e=>setForm({...form,prioridade:e.target.value})} className="input"><option>normal</option><option>alta</option><option>urgente</option></select></label><div className="md:col-span-2 rounded-xl border border-[#dfe7e2] bg-[#f8faf9] p-4">
 <div className="mb-3 flex items-center justify-between"><span className="label">Imagem do aviso</span>{form.imagem_url&&<button type="button" onClick={()=>setForm({...form,imagem_url:""})} className="text-xs font-bold text-red-600"><X className="mr-1 inline h-3 w-3"/>Remover</button>}</div>
 <div className="grid gap-3 md:grid-cols-2">
  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#9fc8b5] bg-white px-4 py-4 text-sm font-black text-[#005a3c] hover:bg-[#eef7f2]">
   <Upload className="h-5 w-5"/> Escolher imagem do computador
   <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e=>setArquivo(e.target.files?.[0]||null)}/>
  </label>
  <input value={form.imagem_url||""} onChange={e=>setForm({...form,imagem_url:e.target.value})} className="input" placeholder="Ou cole a URL da imagem"/>
 </div>
 {arquivo&&<p className="mt-2 text-xs font-bold text-[#005a3c]">Arquivo selecionado: {arquivo.name}</p>}
 {form.imagem_url&&<img src={form.imagem_url} alt="Prévia" className="mt-3 h-36 w-full rounded-xl object-cover"/>}
 <p className="mt-2 text-xs text-gray-500">Você pode usar os dois: enviar do PC ou informar uma URL.</p>
</div><label><span className="label">Público</span><select value={form.publico} onChange={e=>setForm({...form,publico:e.target.value})} className="input"><option value="todos">Todos</option><option value="associados">Associados</option><option value="funcionarios">Funcionários</option></select></label><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.fixado} onChange={e=>setForm({...form,fixado:e.target.checked})}/> Fixar aviso</label><label className="md:col-span-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/> Publicado / ativo</label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={enviandoImagem} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:opacity-60">{enviandoImagem?"Enviando imagem...":"Salvar aviso"}</button></div></form></div>}</main></div>
}
