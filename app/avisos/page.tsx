"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus, Edit3, Trash2, Pin, Upload, X, Bell, CheckCheck, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Notificacao = {
  id:string; tipo:string; titulo:string; mensagem:string;
  origem_tipo:string|null; origem_id:string|null; lida:boolean; criado_em:string;
  valor?:number; comprovante_url?:string|null; comprovante_status?:string|null;
};
type Conta = {id:string; nome:string; banco:string|null; ativo:boolean};
type Aviso = {
  id:string; titulo:string; mensagem:string; imagem_url:string|null; tipo:string;
  prioridade:string; fixado:boolean; ativo:boolean; publico:string;
  data_publicacao:string; data_inicio:string|null; data_fim:string|null;
};

async function getToken(){
  const {data}=await supabase.auth.getSession();
  return data.session?.access_token||"";
}

export default function AvisosPage(){
  const [avisos,setAvisos]=useState<Aviso[]>([]);
  const [notificacoes,setNotificacoes]=useState<Notificacao[]>([]);
  const [contas,setContas]=useState<Conta[]>([]);
  const [perfil,setPerfil]=useState("");
  const [modal,setModal]=useState(false);
  const [edit,setEdit]=useState<Aviso|null>(null);
  const [erro,setErro]=useState("");
  const [arquivo,setArquivo]=useState<File|null>(null);
  const [enviandoImagem,setEnviandoImagem]=useState(false);
  const [processando,setProcessando]=useState<string|null>(null);
  const [pagamento,setPagamento]=useState<Notificacao|null>(null);
  const [valorPagamento,setValorPagamento]=useState("");
  const [contaPagamento,setContaPagamento]=useState("");
  const [form,setForm]=useState<any>({
    titulo:"",mensagem:"",imagem_url:"",tipo:"informativo",prioridade:"normal",
    fixado:false,ativo:true,publico:"todos",data_inicio:"",data_fim:""
  });

  async function api(url:string,init?:RequestInit){
    const t=await getToken();
    return fetch(url,{
      ...init,
      headers:{"Content-Type":"application/json",Authorization:`Bearer ${t}`},
      cache:"no-store"
    });
  }

  async function carregar(){
    setErro("");
    const r=await api("/api/avisos");
    const j=await r.json();
    if(!r.ok){setErro(j.error||"Erro ao carregar avisos.");return}
    setAvisos(j.avisos||[]);
    setPerfil(j.perfil||"");

    if((j.perfil||"")==="administrador"){
      const nr=await api("/api/notificacoes/admin?nao_lidas=true&limite=50");
      const nj=await nr.json();
      if(nr.ok){
        const lista=nj.notificacoes||[];
        setNotificacoes(lista);
        const listaContas=nj.contas_bancarias||[];
        setContas(listaContas);
        if(!contaPagamento && listaContas.length){
          const sicredi=listaContas.find((c:Conta)=>
            `${c.nome} ${c.banco||""}`.toLowerCase().includes("sicredi")
          );
          setContaPagamento((sicredi||listaContas[0]).id);
        }
      }
    }
  }

  useEffect(()=>{carregar()},[]);

  function abrirPagamento(n:Notificacao){
    setErro("");
    setPagamento(n);
    setValorPagamento(String(Number(n.valor||0).toFixed(2)).replace(".",","));
    const sicredi=contas.find(c=>
      `${c.nome} ${c.banco||""}`.toLowerCase().includes("sicredi")
    );
    setContaPagamento((sicredi||contas[0])?.id||"");
  }

  async function confirmarPagamento(){
    if(!pagamento) return;
    if(!pagamento.comprovante_url){
      setErro("Este lançamento não possui comprovante disponível para conferência.");
      return;
    }
    if(!contaPagamento){
      setErro("Selecione a conta bancária que recebeu o PIX.");
      return;
    }

    const valor=Number(String(valorPagamento).replace(",","."));
    if(!Number.isFinite(valor)||valor<0){
      setErro("Informe um valor válido.");
      return;
    }

    setProcessando(pagamento.id);
    setErro("");

    try{
      const r=await api("/api/comprovantes/pagamentos",{
        method:"PATCH",
        body:JSON.stringify({
          origem_tipo:pagamento.origem_tipo,
          origem_id:pagamento.origem_id,
          acao:"aprovar",
          conta_bancaria_id:contaPagamento,
          valor
        })
      });
      const j=await r.json();

      if(!r.ok){
        setErro(j.error||"Não foi possível confirmar o pagamento.");
        return;
      }

      // Só depois da confirmação financeira a notificação é marcada como lida.
      const lr=await api("/api/notificacoes/admin",{
        method:"PATCH",
        body:JSON.stringify({ids:[pagamento.id]})
      });

      if(!lr.ok){
        setErro("Pagamento confirmado, mas não foi possível marcar a notificação como lida.");
        return;
      }

      setPagamento(null);
      await carregar();
    }catch(e){
      setErro(e instanceof Error?e.message:"Erro ao confirmar pagamento.");
    }finally{
      setProcessando(null);
    }
  }

  async function marcarLida(id:string){
    setProcessando(id);
    setErro("");
    try{
      const r=await api("/api/notificacoes/admin",{
        method:"PATCH",
        body:JSON.stringify({ids:[id]})
      });
      const j=await r.json();
      if(!r.ok){setErro(j.error||"Não foi possível marcar como lida.");return}
      setNotificacoes(lista=>lista.filter(x=>x.id!==id));
    }finally{
      setProcessando(null);
    }
  }

  async function marcarTodas(){
    setProcessando("todas");
    setErro("");
    try{
      const r=await api("/api/notificacoes/admin",{
        method:"PATCH",
        body:JSON.stringify({todas:true})
      });
      const j=await r.json();
      if(!r.ok){setErro(j.error||"Não foi possível marcar como lidas.");return}
      setNotificacoes([]);
    }finally{
      setProcessando(null);
    }
  }

  function novo(){
    setErro("");setArquivo(null);setEdit(null);
    setForm({
      titulo:"",mensagem:"",imagem_url:"",tipo:"informativo",prioridade:"normal",
      fixado:false,ativo:true,publico:"todos",data_inicio:"",data_fim:""
    });
    setModal(true);
  }

  function editar(a:Aviso){
    setErro("");setArquivo(null);setEdit(a);
    setForm({
      ...a,
      data_inicio:a.data_inicio?new Date(a.data_inicio).toISOString().slice(0,16):"",
      data_fim:a.data_fim?new Date(a.data_fim).toISOString().slice(0,16):""
    });
    setModal(true);
  }

  async function salvar(e:React.FormEvent){
    e.preventDefault();setErro("");
    let imagemUrl=form.imagem_url||"";

    if(arquivo){
      setEnviandoImagem(true);
      try{
        const fd=new FormData();fd.append("arquivo",arquivo);
        const t=await getToken();
        const ur=await fetch("/api/avisos/upload",{
          method:"POST",headers:{Authorization:`Bearer ${t}`},body:fd,cache:"no-store"
        });
        const uj=await ur.json();
        if(!ur.ok)return setErro(uj.error||"Não foi possível enviar a imagem.");
        imagemUrl=uj.url||"";
      }finally{setEnviandoImagem(false)}
    }

    const payload={...form,imagem_url:imagemUrl};
    const r=await api("/api/avisos",{
      method:edit?"PATCH":"POST",
      body:JSON.stringify(edit?{id:edit.id,...payload}:payload)
    });
    const j=await r.json();
    if(!r.ok)return setErro(j.error||"Erro ao salvar aviso.");
    setModal(false);setArquivo(null);carregar();
  }

  async function excluir(a:Aviso){
    if(!confirm(`Excluir o aviso “${a.titulo}”?`))return;
    const r=await api("/api/avisos",{method:"DELETE",body:JSON.stringify({id:a.id})});
    const j=await r.json();
    if(!r.ok)return setErro(j.error||"Erro ao excluir.");
    carregar();
  }

  return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
    <MenuLateralPadrao/><CabecalhoPadrao/>
    <main className="px-5 py-6 lg:pl-[265px] lg:pr-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#005a3c]"><Megaphone className="h-5 w-5"/> Avisos</div>
          <h1 className="mt-1 text-3xl font-black text-[#003d2b]">Avisos e comunicados</h1>
          <p className="mt-1 text-sm text-gray-500">Publique informações para os associados.</p>
        </div>
        {perfil==="administrador"&&<button onClick={novo} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4"/> Novo Aviso</button>}
      </div>

      {erro&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}

      {perfil==="administrador"&&<div className="mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-[#005a3c]"><Bell className="h-4 w-4"/> Notificações internas</div>
            <p className="mt-1 text-xs text-gray-500">Confira o comprovante antes de confirmar qualquer PIX.</p>
          </div>
          {notificacoes.length>0&&<button disabled={processando==="todas"} onClick={marcarTodas} className="inline-flex items-center gap-2 rounded-xl border border-[#cfe3d8] px-3 py-2 text-xs font-black text-[#005a3c] disabled:opacity-60"><CheckCheck className="h-4 w-4"/> {processando==="todas"?"Marcando...":"Marcar todas como lidas"}</button>}
        </div>

        {notificacoes.length===0
          ?<div className="rounded-xl bg-[#f7faf8] px-4 py-4 text-sm text-gray-500">Nenhuma notificação pendente.</div>
          :<div className="space-y-2">
            {notificacoes.map(n=>
              <div key={n.id} className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-[#003d2b]">{n.titulo}</p>
                    <p className="mt-1 text-sm text-gray-600">{n.mensagem}</p>
                    {n.tipo==="comprovante_pagamento"&&<div className="mt-3 flex flex-wrap items-center gap-2">
                      {n.comprovante_url
                        ?<a href={n.comprovante_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-2 text-xs font-black text-[#005a3c]"><ExternalLink className="h-3.5 w-3.5"/> Ver comprovante</a>
                        :<span className="text-xs font-bold text-red-600">Comprovante não encontrado</span>}
                      {n.valor!=null&&<span className="rounded-lg bg-white px-3 py-2 text-xs font-black text-[#005a3c]">Valor informado: R$ {Number(n.valor).toFixed(2).replace(".",",")}</span>}
                    </div>}
                    <p className="mt-2 text-[11px] font-bold text-gray-400">{new Date(n.criado_em).toLocaleString("pt-BR")}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {n.tipo==="comprovante_pagamento"&&n.origem_tipo&&n.origem_id&&
                      <button onClick={()=>abrirPagamento(n)} className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-black text-white">Confirmar pagamento</button>}
                    <button disabled={processando===n.id} onClick={()=>marcarLida(n.id)} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-bold text-[#005a3c] disabled:opacity-60">{processando===n.id?"...":"Lida"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>}
      </div>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {avisos.map(a=>
          <article key={a.id} className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
            {a.imagem_url&&<img src={a.imagem_url} alt="" className="h-48 w-full object-cover"/>}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#e8f3ee] px-2.5 py-1 text-[10px] font-black uppercase text-[#005a3c]">{a.tipo}</span>{a.fixado&&<Pin className="h-4 w-4 text-amber-600"/>}</div>
              <h2 className="mt-3 text-xl font-black text-[#003d2b]">{a.titulo}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{a.mensagem}</p>
              <div className="mt-4 text-xs font-bold text-gray-400">Publicado em {new Date(a.data_publicacao).toLocaleDateString("pt-BR")}</div>
              {perfil==="administrador"&&<div className="mt-4 flex gap-2"><button onClick={()=>editar(a)} className="flex-1 rounded-xl border px-3 py-2 font-black"><Edit3 className="mr-1 inline h-4 w-4"/>Editar</button><button onClick={()=>excluir(a)} className="rounded-xl border border-red-200 px-3 py-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div>}
            </div>
          </article>
        )}
      </div>

      {avisos.length===0&&<div className="rounded-2xl bg-white p-12 text-center text-gray-500">Nenhum aviso publicado.</div>}

      {pagamento&&<div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#003d2b]">Confirmar pagamento</h2>
              <p className="mt-1 text-sm text-gray-500">Confirme somente depois de verificar no extrato do Sicredi.</p>
            </div>
            <button onClick={()=>setPagamento(null)} className="rounded-lg border px-2 py-1">✕</button>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="font-black text-[#003d2b]">⚠️ Atenção: comprovante pode ser falso.</p>
            <p className="mt-1 text-sm text-gray-600">O comprovante enviado pelo associado não é prova suficiente. Confira o crédito real no Sicredi antes de confirmar.</p>
          </div>

          {pagamento.comprovante_url&&<a href={pagamento.comprovante_url} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#9fc8b5] bg-[#f7faf8] px-4 py-3 font-black text-[#005a3c]"><ExternalLink className="h-4 w-4"/> Abrir comprovante para conferir</a>}

          <div className="mt-4 rounded-xl bg-[#f7faf8] p-4">
            <p className="text-sm font-bold text-gray-500">Lançamento</p>
            <p className="mt-1 text-sm">{pagamento.mensagem}</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm font-black text-[#005a3c]">Valor realmente recebido no Sicredi</span>
              <input value={valorPagamento} onChange={e=>setValorPagamento(e.target.value)} placeholder="Ex.: 100,00" inputMode="decimal" className="w-full rounded-xl border px-3 py-3"/>
            </label>
            <label>
              <span className="mb-1 block text-sm font-black text-[#005a3c]">Conta de recebimento</span>
              <select value={contaPagamento} onChange={e=>setContaPagamento(e.target.value)} className="w-full rounded-xl border px-3 py-3">
                <option value="">Selecione...</option>
                {contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:""}</option>)}
              </select>
            </label>
          </div>

          <p className="mt-3 text-xs text-gray-500">Somente este botão confirma o recebimento e gera a entrada no Financeiro. “Lida” apenas fecha a notificação.</p>

          <div className="mt-6 flex justify-end gap-2">
            <button onClick={()=>setPagamento(null)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button>
            <button disabled={!!processando} onClick={confirmarPagamento} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:opacity-60">{processando?"Confirmando...":"CONFIRMAR PAGAMENTO RECEBIDO"}</button>
          </div>
        </div>
      </div>}

      {modal&&<div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
        <form onSubmit={salvar} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
          <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{edit?"Editar aviso":"Novo aviso"}</h2><button type="button" onClick={()=>setModal(false)}>✕</button></div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2"><span className="label">Título</span><input required value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} className="input"/></label>
            <label className="md:col-span-2"><span className="label">Mensagem</span><textarea required value={form.mensagem} onChange={e=>setForm({...form,mensagem:e.target.value})} className="input min-h-32"/></label>
            <label><span className="label">Tipo</span><select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} className="input"><option>informativo</option><option>importante</option><option>evento</option><option>urgente</option></select></label>
            <label><span className="label">Prioridade</span><select value={form.prioridade} onChange={e=>setForm({...form,prioridade:e.target.value})} className="input"><option>normal</option><option>alta</option><option>urgente</option></select></label>
            <div className="md:col-span-2 rounded-xl border border-[#dfe7e2] bg-[#f8faf9] p-4">
              <div className="mb-3 flex items-center justify-between"><span className="label">Imagem do aviso</span>{form.imagem_url&&<button type="button" onClick={()=>setForm({...form,imagem_url:""})} className="text-xs font-bold text-red-600"><X className="mr-1 inline h-3 w-3"/>Remover</button>}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#9fc8b5] bg-white px-4 py-4 text-sm font-black text-[#005a3c] hover:bg-[#eef7f2]"><Upload className="h-5 w-5"/> Escolher imagem do computador<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e=>setArquivo(e.target.files?.[0]||null)}/></label>
                <input value={form.imagem_url||""} onChange={e=>setForm({...form,imagem_url:e.target.value})} className="input" placeholder="Ou cole a URL da imagem"/>
              </div>
              {arquivo&&<p className="mt-2 text-xs font-bold text-[#005a3c]">Arquivo selecionado: {arquivo.name}</p>}
              {form.imagem_url&&<img src={form.imagem_url} alt="Prévia" className="mt-3 h-36 w-full rounded-xl object-cover"/>}
              <p className="mt-2 text-xs text-gray-500">Você pode usar os dois: enviar do PC ou informar uma URL.</p>
            </div>
            <label><span className="label">Público</span><select value={form.publico} onChange={e=>setForm({...form,publico:e.target.value})} className="input"><option value="todos">Todos</option><option value="associados">Associados</option><option value="funcionarios">Funcionários</option></select></label>
            <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.fixado} onChange={e=>setForm({...form,fixado:e.target.checked})}/> Fixar aviso</label>
            <label className="md:col-span-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={form.ativo} onChange={e=>setForm({...form,ativo:e.target.checked})}/> Publicado / ativo</label>
          </div>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={enviandoImagem} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:opacity-60">{enviandoImagem?"Enviando imagem...":"Salvar aviso"}</button></div>
        </form>
      </div>}
    </main>
  </div>
}
