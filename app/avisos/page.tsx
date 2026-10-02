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
type ReservaPendente = {
  id:string; espaco_id:string; espaco_nome:string; data:string; horario:string;
  nome:string; matricula:string|null; socio_id:string|null; dependente_id:string|null;
  valor:number; status:string; pagamento:string; comprovante_url:string|null; comprovante_nome:string|null;
};
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
  const [carregando,setCarregando]=useState(true);
  const [modal,setModal]=useState(false);
  const [edit,setEdit]=useState<Aviso|null>(null);
  const [erro,setErro]=useState("");
  const [arquivo,setArquivo]=useState<File|null>(null);
  const [enviandoImagem,setEnviandoImagem]=useState(false);
  const [processando,setProcessando]=useState<string|null>(null);
  const [pagamento,setPagamento]=useState<Notificacao|null>(null);
  const [valorPagamento,setValorPagamento]=useState("");
  const [contaPagamento,setContaPagamento]=useState("");
  const [reservasPendentes,setReservasPendentes]=useState<ReservaPendente[]>([]);
  const [reservaSelecionada,setReservaSelecionada]=useState<ReservaPendente|null>(null);
  const [processandoReserva,setProcessandoReserva]=useState<string|null>(null);
  const podeGerenciarAvisos=["administrador","administrador_master","admin","master"].includes(perfil);
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

  async function carregarReservasPendentes(headers: HeadersInit){
    try{
      const r=await fetch("/api/reservas?status=pendente",{headers,cache:"no-store"});
      const j=await r.json().catch(()=>({}));
      if(r.ok) setReservasPendentes(Array.isArray(j.reservas)?j.reservas:[]);
      else setReservasPendentes([]);
    }catch{
      setReservasPendentes([]);
    }
  }

  async function carregar(){
    setErro("");
    setCarregando(true);
    try {
      const t=await getToken();
      if(!t){
        window.location.href="/login";
        return;
      }

      const headers={Authorization:`Bearer ${t}`};
      const r=await fetch("/api/avisos",{headers,cache:"no-store"});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){setErro(j.error||"Erro ao carregar avisos.");return}
      setAvisos(Array.isArray(j.avisos)?j.avisos:[]);
      const perfilAtual=String(j.perfil||"").trim().toLowerCase();
      setPerfil(perfilAtual);

      if(["administrador","administrador_master","admin","master"].includes(perfilAtual)){
        const nr=await fetch("/api/notificacoes/admin?nao_lidas=true&limite=50",{headers,cache:"no-store"});
        const nj=await nr.json().catch(()=>({}));
        if(nr.ok){
          const lista=Array.isArray(nj.notificacoes)?nj.notificacoes:[];
          setNotificacoes(lista);
          const listaContas=Array.isArray(nj.contas_bancarias)?nj.contas_bancarias:[];
          setContas(listaContas);
          if(listaContas.length){
            const sicredi=listaContas.find((c:Conta)=>
              `${c.nome} ${c.banco||""}`.toLowerCase().includes("sicredi")
            );
            setContaPagamento((atual)=>atual || (sicredi||listaContas[0]).id);
          }
        }
      } else {
        setNotificacoes([]);
        setContas([]);
      }

      if(["administrador","administrador_master","admin","master"].includes(perfilAtual)){
        await carregarReservasPendentes(headers);
      } else {
        setReservasPendentes([]);
      }
    } catch(e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar avisos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(()=>{void carregar()},[]);

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

  async function confirmarReservaPix(reserva:ReservaPendente){
    const conta=contas.find(c=>String(c.id)===String(contaPagamento)) || contas.find(c=>`${c.nome} ${c.banco||""}`.toLowerCase().includes("sicredi")) || contas[0];
    if(!conta){ setErro("Cadastre uma conta bancária ativa antes de confirmar o PIX."); return; }
    if(!reserva.comprovante_url){ setErro("Esta reserva não possui comprovante para conferência."); return; }
    if(!confirm(`Confirma que o PIX de ${reserva.nome} foi realmente creditado na conta ${conta.nome}?\n\nO lançamento será criado no Financeiro.`)) return;
    setProcessandoReserva(reserva.id); setErro("");
    try{
      const r=await api("/api/reservas",{method:"PATCH",body:JSON.stringify({id:reserva.id,acao:"confirmar_pix",conta_bancaria_id:conta.id})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){setErro(j.error||"Não foi possível confirmar a reserva.");return;}
      setReservaSelecionada(null);
      await carregar();
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao confirmar reserva.");}
    finally{setProcessandoReserva(null);}
  }

  async function cancelarReservaPix(reserva:ReservaPendente){
    const motivo=window.prompt("Motivo do cancelamento da reserva:","Comprovante não confirmado / pagamento não localizado.");
    if(motivo===null) return;
    setProcessandoReserva(reserva.id); setErro("");
    try{
      const r=await api("/api/reservas",{method:"PATCH",body:JSON.stringify({id:reserva.id,acao:"cancelar",motivo:motivo.trim()||"Pagamento PIX não confirmado."})});
      const j=await r.json().catch(()=>({}));
      if(!r.ok){setErro(j.error||"Não foi possível cancelar a reserva.");return;}
      setReservaSelecionada(null);
      await carregar();
    }catch(e){setErro(e instanceof Error?e.message:"Erro ao cancelar reserva.");}
    finally{setProcessandoReserva(null);}
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
    setModal(false);setArquivo(null);await carregar();
  }

  async function excluir(a:Aviso){
    if(!confirm(`Excluir o aviso “${a.titulo}”?`))return;
    const r=await api("/api/avisos",{method:"DELETE",body:JSON.stringify({id:a.id})});
    const j=await r.json();
    if(!r.ok)return setErro(j.error||"Erro ao excluir.");
    await carregar();
  }

  // Reservas pendentes já têm um bloco próprio acima. Algumas instalações
  // também criam uma notificação para a mesma reserva; ocultamos somente
  // essa cópia para que a mesma pendência não apareça duas vezes.
  const idsReservasPendentes = new Set(reservasPendentes.map((r)=>String(r.id)));
  const notificacoesVisiveis = notificacoes.filter((n)=>{
    const origem = String(n.origem_tipo || "").trim().toLowerCase();
    const ehOrigemReserva = ["reserva","reserva_pagamento","pagamento_reserva"].includes(origem);
    return !(ehOrigemReserva && n.origem_id && idsReservasPendentes.has(String(n.origem_id)));
  });

  return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
    <MenuLateralPadrao/><CabecalhoPadrao/>
    <main className="px-5 py-6 lg:pl-[265px] lg:pr-8">
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-[#005a3c]"><Megaphone className="h-5 w-5"/> Avisos</div>
          <h1 className="mt-1 text-3xl font-black text-[#003d2b]">Avisos e comunicados</h1>
          <p className="mt-1 text-sm text-gray-500">Publique informações para os associados.</p>
        </div>
        {podeGerenciarAvisos&&<button onClick={novo} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-black text-white"><Plus className="h-4 w-4"/> Novo Aviso</button>}
      </div>

      {erro&&<div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}

      {podeGerenciarAvisos&&reservaSelecionada&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#005a3c]">Conferência de reserva PIX</p>
              <h2 className="mt-1 text-2xl font-black text-[#003d2b]">{reservaSelecionada.nome}</h2>
              <p className="text-sm text-gray-500">{reservaSelecionada.matricula ? `Matrícula ${reservaSelecionada.matricula} • ` : ""}{reservaSelecionada.espaco_nome} • {new Date(`${reservaSelecionada.data}T00:00:00`).toLocaleDateString("pt-BR")} • {reservaSelecionada.horario}</p>
            </div>
            <button onClick={()=>setReservaSelecionada(null)} className="rounded-lg border px-3 py-2 font-black">Fechar</button>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-[#f7faf8] p-3"><p className="text-xs text-gray-500">Valor</p><p className="font-black text-[#005a3c]">R$ {Number(reservaSelecionada.valor||0).toFixed(2).replace(".",",")}</p></div>
            <div className="rounded-xl bg-[#f7faf8] p-3"><p className="text-xs text-gray-500">Pagamento</p><p className="font-black">PIX — pendente</p></div>
            <div className="rounded-xl bg-[#f7faf8] p-3"><p className="text-xs text-gray-500">Comprovante</p><p className="font-black">{reservaSelecionada.comprovante_nome||"Anexado"}</p></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {reservaSelecionada.comprovante_url&&<a href={reservaSelecionada.comprovante_url} target="_blank" rel="noreferrer" className="rounded-xl border border-[#cfe3d8] bg-white px-4 py-3 text-sm font-black text-[#005a3c]">Abrir comprovante</a>}
            <button disabled={processandoReserva===reservaSelecionada.id} onClick={()=>confirmarReservaPix(reservaSelecionada)} className="rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-black text-white disabled:opacity-60">{processandoReserva===reservaSelecionada.id?"Processando...":"Confirmar PIX e lançar no Financeiro"}</button>
            <button disabled={processandoReserva===reservaSelecionada.id} onClick={()=>cancelarReservaPix(reservaSelecionada)} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-60">Cancelar reserva</button>
          </div>
          <p className="mt-4 text-xs font-bold text-amber-700">Confira o crédito no banco antes de confirmar. O comprovante sozinho não cria lançamento financeiro.</p>
        </div>
      </div>}

      {podeGerenciarAvisos&&<div className="mb-6 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-[#005a3c]">
              <Bell className="h-4 w-4"/> Pendências que precisam de conferência
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Aqui ficam reservas e pagamentos que precisam ser conferidos antes de considerar tudo concluído.
            </p>
          </div>
          {notificacoesVisiveis.length>0&&
            <button
              disabled={processando==="todas"}
              onClick={marcarTodas}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#cfe3d8] px-3 py-2 text-xs font-black text-[#005a3c] disabled:opacity-60"
            >
              <CheckCheck className="h-4 w-4"/>
              {processando==="todas"?"Marcando...":"Marcar todas como lidas"}
            </button>
          }
        </div>

        {reservasPendentes.length>0&&<div className="mb-5 space-y-3">
          {reservasPendentes.map(r=><div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-amber-200 px-2.5 py-1 text-[10px] font-black uppercase text-amber-900">Reserva / PIX</span><span className="text-xs font-bold text-gray-400">Aguardando conferência</span></div>
                <p className="mt-2 font-black text-[#003d2b]">{r.nome} {r.matricula?`• ${r.matricula}`:""}</p>
                <p className="text-sm text-gray-600">{r.espaco_nome} • {new Date(`${r.data}T00:00:00`).toLocaleDateString("pt-BR")} • {r.horario} • <b>R$ {Number(r.valor||0).toFixed(2).replace(".",",")}</b></p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.comprovante_url&&<a href={r.comprovante_url} target="_blank" rel="noreferrer" className="rounded-lg border bg-white px-3 py-2 text-xs font-black text-[#005a3c]">Ver comprovante</a>}
                <button onClick={()=>setReservaSelecionada(r)} className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-black text-white">Conferir reserva</button>
              </div>
            </div>
          </div>)}
        </div>}

        {notificacoesVisiveis.length===0
          ?<div className="rounded-xl border border-[#dfe7e2] bg-[#f7faf8] px-4 py-4 text-sm text-gray-500">
              {reservasPendentes.length===0?"Nenhuma pendência aguardando conferência.":"Nenhuma outra pendência de pagamento."}
            </div>
          :<div className="space-y-3">
            {notificacoesVisiveis.map(n=>{
              const ehPagamento=n.tipo==="comprovante_pagamento";
              const ehReserva=!ehPagamento && (
                n.titulo.toLowerCase().includes("reserva") ||
                n.mensagem.toLowerCase().includes("reserva")
              );

              return (
                <div
                  key={n.id}
                  className={`rounded-2xl border p-4 ${
                    ehPagamento
                      ? "border-amber-200 bg-amber-50/60"
                      : "border-[#cfe3d8] bg-[#f7faf8]"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                          ehPagamento
                            ? "bg-amber-200 text-amber-900"
                            : "bg-[#dceee6] text-[#005a3c]"
                        }`}>
                          {ehPagamento ? "Pagamento / PIX" : ehReserva ? "Reserva" : "Pendência"}
                        </span>
                        <span className="text-[11px] font-bold text-gray-400">
                          {new Date(n.criado_em).toLocaleString("pt-BR")}
                        </span>
                      </div>

                      <p className="mt-2 text-lg font-black text-[#003d2b]">{n.titulo}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-600">{n.mensagem}</p>

                      {ehPagamento&&(
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div className="rounded-xl bg-white p-3">
                            <p className="text-[11px] font-bold uppercase text-gray-400">Valor informado</p>
                            <p className="mt-1 text-base font-black text-[#005a3c]">
                              {n.valor!=null ? `R$ ${Number(n.valor).toFixed(2).replace(".",",")}` : "Não informado"}
                            </p>
                          </div>
                          <div className="rounded-xl bg-white p-3">
                            <p className="text-[11px] font-bold uppercase text-gray-400">Conferência</p>
                            <p className="mt-1 text-sm font-black text-amber-800">
                              Confira o crédito no banco antes de aprovar.
                            </p>
                          </div>
                        </div>
                      )}

                      {ehPagamento && !n.comprovante_url&&(
                        <p className="mt-3 text-xs font-bold text-red-600">
                          Comprovante não encontrado.
                        </p>
                      )}
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:min-w-[210px] lg:flex-col">
                      {ehPagamento && n.comprovante_url&&
                        <a
                          href={n.comprovante_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#9fc8b5] bg-white px-4 py-3 text-xs font-black text-[#005a3c]"
                        >
                          <ExternalLink className="h-4 w-4"/> Ver comprovante
                        </a>
                      }

                      {ehPagamento && n.origem_tipo && n.origem_id&&
                        <button
                          onClick={()=>abrirPagamento(n)}
                          className="rounded-xl bg-[#005a3c] px-4 py-3 text-xs font-black text-white shadow-sm hover:bg-[#004b32]"
                        >
                          ✓ Conferir e confirmar PIX
                        </button>
                      }

                      {ehReserva&&
                        <a
                          href="/reservas"
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#9fc8b5] bg-white px-4 py-3 text-xs font-black text-[#005a3c]"
                        >
                          📅 Abrir reservas
                        </a>
                      }

                      <button
                        disabled={processando===n.id}
                        onClick={()=>marcarLida(n.id)}
                        className="rounded-xl border bg-white px-4 py-3 text-xs font-bold text-[#005a3c] disabled:opacity-60"
                      >
                        {processando===n.id?"...":"Marcar como lida"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>}
      </div>}

      {carregando ? (
        <div className="rounded-2xl border border-[#dfe7e2] bg-white p-10 text-center text-sm font-semibold text-gray-500 md:col-span-2 xl:col-span-3">
          Carregando avisos...
        </div>
      ) : (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {avisos.map(a=>
          <article key={a.id} className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
            {a.imagem_url&&<img src={a.imagem_url} alt="" className="h-48 w-full object-cover"/>}
            <div className="p-5">
              <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-[#e8f3ee] px-2.5 py-1 text-[10px] font-black uppercase text-[#005a3c]">{a.tipo}</span>{a.fixado&&<Pin className="h-4 w-4 text-amber-600"/>}</div>
              <h2 className="mt-3 text-xl font-black text-[#003d2b]">{a.titulo}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{a.mensagem}</p>
              <div className="mt-4 text-xs font-bold text-gray-400">Publicado em {new Date(a.data_publicacao).toLocaleDateString("pt-BR")}</div>
              {podeGerenciarAvisos&&<div className="mt-4 flex gap-2"><button onClick={()=>editar(a)} className="flex-1 rounded-xl border px-3 py-2 font-black"><Edit3 className="mr-1 inline h-4 w-4"/>Editar</button><button onClick={()=>excluir(a)} className="rounded-xl border border-red-200 px-3 py-2 text-red-600"><Trash2 className="h-4 w-4"/></button></div>}
            </div>
          </article>
        )}
      </div>
      )}

      {!carregando && avisos.length===0&&<div className="rounded-2xl bg-white p-12 text-center text-gray-500">Nenhum aviso publicado.</div>}

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
