"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Edit3, ImagePlus, MapPin, PartyPopper, Plus, ReceiptText, ShoppingCart, Trash2, X, Upload, XCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Evento = {
  id: string; titulo: string; descricao: string | null; tipo: string; local: string | null;
  data_inicio: string; data_fim: string | null; imagem_url: string | null; link_externo: string | null;
  publicado: boolean; destaque: boolean;
  valor_ingresso: number | null; quantidade_disponivel: number | null;
  conta_bancaria_id: string | null; pix_copia_e_cola: string | null;
};
type Venda = {
  id: string; evento_id: string; socio_id: string | null; tipo_venda: string; prefixo: string | null;
  numero: number | null; codigo: string | null; valor: number; quantidade: number; valor_total: number;
  status: string; forma_pagamento: string | null; comprovante_url: string | null; codigo_qr: string | null;
  motivo_recusa: string | null; data_compra: string; aprovado_em?: string | null; comprovante_enviado_em?: string | null;
  eventos?: { id?: string; titulo: string; data_inicio: string; local: string | null; imagem_url: string | null; conta_bancaria_id?: string | null; pix_copia_e_cola?: string | null };
  socios?: { nome: string; matricula: string | number | null };
};

const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (v: string) => new Date(v).toLocaleDateString("pt-BR", { dateStyle: "short" });
const datetimeLocal = (v?: string | null) => v ? new Date(v).toISOString().slice(0, 16) : "";

export default function EventosPage() {
  const [perfil, setPerfil] = useState("");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [pix, setPix] = useState<{ copia_e_cola?: string; chave_pix?: string; nome_recebedor?: string; cidade?: string } | null>(null);
  const [contasBancarias, setContasBancarias] = useState<{ id: string; nome: string; banco: string | null; agencia?: string | null; conta?: string | null }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(false);
  const [compra, setCompra] = useState<Evento | null>(null);
  const [detalhe, setDetalhe] = useState<Venda | null>(null);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [form, setForm] = useState<any>({ titulo: "", descricao: "", tipo: "evento", local: "Sociedade Recreativa Guarani", data_inicio: "", data_fim: "", imagem_url: "", link_externo: "", valor_ingresso: "", quantidade_disponivel: "", conta_bancaria_id: "", pix_copia_e_cola: "", publicado: true, destaque: false });
  const [quantidade, setQuantidade] = useState(1);
  const [valorCompra, setValorCompra] = useState(0);
  const [comprovante, setComprovante] = useState("");
  const [arquivoComprovante, setArquivoComprovante] = useState<File | null>(null);
  const [enviandoComprovante, setEnviandoComprovante] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);

  async function token() { const { data } = await supabase.auth.getSession(); return data.session?.access_token || ""; }
  async function api(url: string, init?: RequestInit) { const t = await token(); return fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}`, ...(init?.headers || {}) }, cache: "no-store" }); }

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await api("/api/eventos"); const j = await r.json(); if (!r.ok) throw new Error(j.error || "Erro ao carregar eventos.");
      setPerfil(j.perfil || ""); setEventos(j.eventos || []); setContasBancarias(j.contasBancarias || []);
      const rv = await api("/api/eventos/vendas"); const jv = await rv.json(); if (rv.ok) setVendas(jv.vendas || []);
      if ((j.perfil || "") === "associado") { const rp = await fetch("/api/configuracao-pix", { cache: "no-store" }); const jp = await rp.json(); if (rp.ok) setPix(jp.config || null); }
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); } finally { setCarregando(false); }
  }
  useEffect(() => { carregar(); }, []);

  const pendentes = useMemo(() => vendas.filter(v => v.status === "pendente"), [vendas]);

  function abrirNovo() { setArquivoImagem(null); setEditando(null); setForm({ titulo: "", descricao: "", tipo: "evento", local: "Sociedade Recreativa Guarani", data_inicio: "", data_fim: "", imagem_url: "", link_externo: "", valor_ingresso: "", quantidade_disponivel: "", conta_bancaria_id: "", pix_copia_e_cola: "", publicado: true, destaque: false }); setModal(true); }
  function abrirEdicao(e: Evento) { setArquivoImagem(null); setEditando(e); setForm({ titulo: e.titulo, descricao: e.descricao || "", tipo: e.tipo || "evento", local: e.local || "", data_inicio: datetimeLocal(e.data_inicio), data_fim: datetimeLocal(e.data_fim), imagem_url: e.imagem_url || "", link_externo: e.link_externo || "", valor_ingresso: e.valor_ingresso ?? "", quantidade_disponivel: e.quantidade_disponivel ?? "", conta_bancaria_id: e.conta_bancaria_id || "", pix_copia_e_cola: e.pix_copia_e_cola || "", publicado: e.publicado, destaque: e.destaque }); setModal(true); }
  async function salvarEvento(e: React.FormEvent) {
    e.preventDefault();
    setProcessando(true);
    setErro("");
    try {
      let imagemUrl = form.imagem_url || "";
      if (arquivoImagem) {
        setEnviandoImagem(true);
        const t = await token();
        const fd = new FormData();
        fd.append("arquivo", arquivoImagem);
        const ur = await fetch("/api/eventos/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd, cache: "no-store" });
        const uj = await ur.json();
        if (!ur.ok) throw new Error(uj.error || "Não foi possível enviar a imagem.");
        imagemUrl = uj.url || "";
      }
      const payload = { ...form, imagem_url: imagemUrl };
      const r = await api("/api/eventos", { method: editando ? "PATCH" : "POST", body: JSON.stringify(editando ? { id: editando.id, ...payload } : payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setModal(false);
      setArquivoImagem(null);
      await carregar();
    } catch(e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar evento.");
    } finally {
      setEnviandoImagem(false);
      setProcessando(false);
    }
  }
  async function excluirEvento(e: Evento) { if (!confirm(`Excluir o evento “${e.titulo}”?`)) return; const r = await api("/api/eventos", { method: "DELETE", body: JSON.stringify({ id: e.id }) }); const j = await r.json(); if (!r.ok) return setErro(j.error); await carregar(); }
  async function comprar(e: React.FormEvent) { e.preventDefault(); if (!compra) return; setProcessando(true); try { const r = await api("/api/eventos/vendas", { method: "POST", body: JSON.stringify({ evento_id: compra.id, quantidade, valor: valorCompra, forma_pagamento: "pix" }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setDetalhe(j.venda); setCompra(null); await carregar(); } catch(e) { setErro(e instanceof Error ? e.message : "Erro na compra."); } finally { setProcessando(false); } }
  async function enviarComprovante(v: Venda) {
    if (!comprovante.trim() && !arquivoComprovante) return;
    setProcessando(true); setEnviandoComprovante(Boolean(arquivoComprovante));
    try {
      let url = comprovante.trim();
      if (arquivoComprovante) {
        const t = await token();
        const fd = new FormData(); fd.append("venda_id", v.id); fd.append("arquivo", arquivoComprovante);
        const ur = await fetch("/api/eventos/vendas/comprovante/upload", { method: "POST", headers: { Authorization: `Bearer ${t}` }, body: fd, cache: "no-store" });
        const uj = await ur.json(); if (!ur.ok) throw new Error(uj.error || "Não foi possível enviar o comprovante.");
        url = uj.url || "";
      }
      if (url) {
        const r = await api("/api/eventos/vendas/comprovante", { method: "PATCH", body: JSON.stringify({ id: v.id, comprovante_url: url }) });
        const j = await r.json(); if (!r.ok) throw new Error(j.error);
        setDetalhe(j.venda || v);
      }
      setComprovante(""); setArquivoComprovante(null); await carregar();
    } catch(e) { setErro(e instanceof Error ? e.message : "Erro ao enviar comprovante."); } finally { setEnviandoComprovante(false); setProcessando(false); }
  }
  async function aprovar(v: Venda, acao: "aprovar" | "recusar") { const motivo = acao === "recusar" ? prompt("Motivo da recusa:", "Comprovante não confirmado.") || "Compra recusada." : ""; setProcessando(true); try { const r = await api("/api/eventos/vendas", { method: "PATCH", body: JSON.stringify({ id: v.id, acao, motivo_recusa: motivo }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setDetalhe(j.venda); await carregar(); } catch(e) { setErro(e instanceof Error ? e.message : "Erro ao processar."); } finally { setProcessando(false); } }

  return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]"><MenuLateralPadrao /><CabecalhoPadrao /><main className="px-5 py-6 lg:pl-[265px] lg:pr-8">
    <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-sm font-bold text-[#005a3c]"><PartyPopper className="h-5 w-5" /> Eventos</div><h1 className="mt-1 text-3xl font-black text-[#003d2b]">Eventos e ingressos</h1><p className="mt-1 text-sm text-gray-500">{perfil === "associado" ? "Veja os eventos publicados e compre seus ingressos." : "Cadastre eventos, acompanhe vendas e aprove os pagamentos."}</p></div>{perfil === "administrador" && <button onClick={abrirNovo} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-extrabold text-white shadow-sm"><Plus className="h-4 w-4" /> Novo evento</button>}</div>
    {erro && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{erro}</div>}
    {perfil === "administrador" && pendentes.length > 0 && <section className="mb-7 rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="mb-3 flex items-center justify-between"><h2 className="font-black text-amber-900">Compras aguardando análise</h2><span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-amber-900">{pendentes.length}</span></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pendentes.map(v => <div key={v.id} className="rounded-xl bg-white p-4 shadow-sm"><div className="text-xs font-bold uppercase text-gray-400">{v.eventos?.titulo || "Evento"}</div><div className="mt-1 font-black">{v.socios?.nome || "Associado"}</div><div className="text-sm text-gray-500">{v.quantidade} × {money(Number(v.valor))} = <b>{money(Number(v.valor_total))}</b></div><div className="mt-3 flex gap-2"><button onClick={() => setDetalhe(v)} className="flex-1 rounded-lg border px-3 py-2 text-xs font-black">Ver</button><button onClick={() => aprovar(v,"aprovar")} className="rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-black text-white">Aprovar</button><button onClick={() => aprovar(v,"recusar")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white">Recusar</button></div></div>)}</div></section>}
    {carregando ? <div className="rounded-2xl bg-white p-12 text-center font-bold text-gray-500">Carregando eventos...</div> : eventos.length === 0 ? <div className="rounded-2xl bg-white p-12 text-center"><PartyPopper className="mx-auto h-10 w-10 text-[#005a3c]"/><h2 className="mt-3 font-black">Nenhum evento disponível</h2></div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{eventos.map(e => <article key={e.id} className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">{e.imagem_url ? <img src={e.imagem_url} alt={e.titulo} className="h-52 w-full object-cover" /> : <div className="flex h-52 items-center justify-center bg-[#eaf3ee]"><ImagePlus className="h-12 w-12 text-[#8bb6a4]"/></div>}<div className="p-5"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full bg-[#e8f3ee] px-2.5 py-1 text-[10px] font-black uppercase text-[#005a3c]">{e.tipo}</span><h2 className="mt-2 text-xl font-black text-[#003d2b]">{e.titulo}</h2></div>{e.destaque && <span className="text-xs font-black text-amber-600">DESTAQUE</span>}</div><p className="mt-2 line-clamp-3 text-sm text-gray-600">{e.descricao || "Confira os detalhes deste evento."}</p><div className="mt-4 space-y-2 text-sm text-gray-600"><div className="flex gap-2"><Clock3 className="h-4 w-4 text-[#005a3c]"/> {date(e.data_inicio)} às {new Date(e.data_inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>{e.local && <div className="flex gap-2"><MapPin className="h-4 w-4 text-[#005a3c]"/> {e.local}</div>}</div><div className="mt-4 flex items-end justify-between gap-3"><div><div className="text-xs font-bold uppercase text-gray-400">Ingresso / ficha</div><div className="text-2xl font-black text-[#005a3c]">{e.valor_ingresso == null ? "Consultar" : money(Number(e.valor_ingresso))}</div>{e.conta_bancaria_id && <div className="mt-1 text-xs font-bold text-gray-500">🏦 {contasBancarias.find(c=>c.id===e.conta_bancaria_id)?.nome || "Conta bancária definida"}</div>}</div>{e.quantidade_disponivel != null && <div className="text-right text-xs font-bold text-gray-500">{e.quantidade_disponivel} disponível(is)</div>}</div>{perfil === "administrador" ? <div className="mt-5 flex gap-2"><button onClick={() => abrirEdicao(e)} className="flex-1 rounded-xl border px-3 py-2.5 text-sm font-black"><Edit3 className="mr-1 inline h-4 w-4"/> Editar</button><button onClick={() => excluirEvento(e)} className="rounded-xl border border-red-200 px-3 py-2.5 text-sm font-black text-red-600"><Trash2 className="h-4 w-4"/></button></div> : <button onClick={() => { setCompra(e); setQuantidade(1); setValorCompra(Number(e.valor_ingresso || 0)); }} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-4 py-3 font-black text-white"><ShoppingCart className="h-4 w-4"/> Comprar ingresso</button>}</div></article>)}</div>}

    {perfil === "associado" && vendas.length > 0 && <section className="mt-8"><h2 className="mb-3 text-xl font-black text-[#003d2b]">Meus ingressos</h2><div className="grid gap-3 md:grid-cols-2">{vendas.map(v => <button key={v.id} onClick={() => setDetalhe(v)} className="rounded-2xl border border-[#dfe7e2] bg-white p-4 text-left shadow-sm"><div className="flex items-center justify-between"><b>{v.eventos?.titulo || "Evento"}</b><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${v.status === "aprovado" ? "bg-green-100 text-green-700" : v.status === "recusado" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{v.status}</span></div><div className="mt-2 text-sm text-gray-500">{v.quantidade} ingresso(s) · {money(Number(v.valor_total))}</div>{v.codigo && <div className="mt-2 font-black text-[#005a3c]">{v.codigo}</div>}</button>)}</div></section>}

    {modal && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><form onSubmit={salvarEvento} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black">{editando ? "Editar evento" : "Novo evento"}</h2><button type="button" onClick={() => setModal(false)} className="text-gray-500">✕</button></div><div className="grid gap-4 md:grid-cols-2"><label className="md:col-span-2"><span className="label">Título</span><input required value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} className="input" placeholder="Festa de Abertura"/></label><label><span className="label">Tipo</span><select value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value})} className="input"><option value="evento">Evento</option><option value="festa">Festa</option><option value="bocha">Torneio de bocha</option><option value="ingresso">Ingresso</option><option value="ficha">Ficha</option></select></label><label><span className="label">Local</span><input value={form.local} onChange={e=>setForm({...form,local:e.target.value})} className="input"/></label><label><span className="label">Valor do ingresso/ficha (R$)</span><input required type="number" min="0" step="0.01" value={(form as any).valor_ingresso || ""} onChange={e=>setForm({...form,valor_ingresso:e.target.value as any})} className="input" placeholder="50,00"/></label><label><span className="label">Quantidade disponível (opcional)</span><input type="number" min="0" step="1" value={(form as any).quantidade_disponivel || ""} onChange={e=>setForm({...form,quantidade_disponivel:e.target.value as any})} className="input" placeholder="Deixe vazio para ilimitado"/></label><label><span className="label">🏦 Conta bancária de recebimento</span><select required={Number(form.valor_ingresso || 0) > 0} value={form.conta_bancaria_id} onChange={e=>setForm({...form,conta_bancaria_id:e.target.value})} className="input"><option value="">Selecione a conta</option>{contasBancarias.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco ? ` · ${c.banco}` : ""}{c.conta ? ` · Conta ${c.conta}` : ""}</option>)}</select></label><label><span className="label">PIX copia e cola do evento (opcional)</span><input value={form.pix_copia_e_cola} onChange={e=>setForm({...form,pix_copia_e_cola:e.target.value})} className="input" placeholder="Cole o PIX desta conta/evento"/></label><label><span className="label">Data e hora</span><input required type="datetime-local" value={form.data_inicio} onChange={e=>setForm({...form,data_inicio:e.target.value})} className="input"/></label><label><span className="label">Data/hora final</span><input type="datetime-local" value={form.data_fim} onChange={e=>setForm({...form,data_fim:e.target.value})} className="input"/></label><div className="md:col-span-2 rounded-xl border border-[#dfe7e2] bg-[#f8faf9] p-4"><div className="mb-3 flex items-center justify-between"><span className="label">Imagem do ingresso/ficha</span>{(form.imagem_url || arquivoImagem) && <button type="button" onClick={()=>{setForm({...form,imagem_url:""});setArquivoImagem(null)}} className="text-xs font-bold text-red-600"><X className="mr-1 inline h-3 w-3"/>Remover</button>}</div><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-black text-white"><Upload className="h-4 w-4"/> Escolher imagem do computador<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e=>setArquivoImagem(e.target.files?.[0] || null)}/></label><p className="mt-2 text-xs text-gray-500">Você pode enviar do computador ou usar uma URL.</p><input value={form.imagem_url} onChange={e=>setForm({...form,imagem_url:e.target.value})} className="input mt-3" placeholder="Ou cole a URL da imagem"/>{arquivoImagem && <p className="mt-2 text-xs font-bold text-[#005a3c]">Arquivo selecionado: {arquivoImagem.name}</p>}{form.imagem_url && <img src={form.imagem_url} alt="Prévia" className="mt-3 h-36 w-full rounded-xl object-cover"/>}{arquivoImagem && <img src={URL.createObjectURL(arquivoImagem)} alt="Prévia do arquivo" className="mt-3 h-36 w-full rounded-xl object-cover"/>}</div><label className="md:col-span-2"><span className="label">Descrição</span><textarea value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})} className="input min-h-24"/></label><label className="md:col-span-2"><span className="label">Link externo (opcional)</span><input value={form.link_externo} onChange={e=>setForm({...form,link_externo:e.target.value})} className="input"/></label><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.publicado} onChange={e=>setForm({...form,publicado:e.target.checked})}/> Publicar evento</label><label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={form.destaque} onChange={e=>setForm({...form,destaque:e.target.checked})}/> Destaque</label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setModal(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={processando} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white">{enviandoImagem ? "Enviando imagem..." : processando ? "Salvando..." : "Salvar evento"}</button></div></form></div>}

    {compra && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><form onSubmit={comprar} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><div className="text-xs font-black uppercase text-[#005a3c]">Compra de ingresso</div><h2 className="mt-1 text-2xl font-black">{compra.titulo}</h2></div><button type="button" onClick={()=>setCompra(null)}>✕</button></div><div className="rounded-xl bg-[#f3f7f4] p-4"><div className="text-xs font-bold uppercase text-gray-400">Valor por ingresso/ficha</div><div className="text-2xl font-black text-[#005a3c]">{money(valorCompra)}</div></div><label className="mt-4 block"><span className="label">Quantidade</span><input required type="number" min="1" step="1" value={quantidade} onChange={e=>setQuantidade(Math.max(1,Number(e.target.value)))} className="input"/></label><div className="mt-4 rounded-xl bg-[#f3f7f4] p-4"><div className="text-sm text-gray-500">Total</div><div className="text-2xl font-black text-[#005a3c]">{money(valorCompra*quantidade)}</div></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setCompra(null)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={processando || valorCompra <= 0} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white">{processando ? "Registrando..." : "Gerar compra PIX"}</button></div></form></div>}

    {detalhe && <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-xs font-black uppercase text-[#005a3c]">{detalhe.status}</div><h2 className="mt-1 text-2xl font-black">{detalhe.eventos?.titulo || "Ingresso"}</h2></div><button onClick={()=>setDetalhe(null)}>✕</button></div>{detalhe.status === "aprovado" && detalhe.codigo_qr ? <div className="my-5 grid place-items-center rounded-2xl bg-[#f6f9f7] p-5"><QRCodeSVG value={detalhe.codigo_qr} size={190}/><div className="mt-3 text-2xl font-black text-[#005a3c]">{detalhe.codigo || detalhe.codigo_qr}</div><div className="text-sm text-gray-500">Apresente este QR na entrada.</div></div> : <div className="my-5 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">{detalhe.status === "pendente" ? "Aguardando análise do comprovante pela administração." : detalhe.motivo_recusa || "Compra recusada."}</div>}{perfil === "associado" && detalhe.status === "pendente" && <div className="rounded-xl border p-4"><div className="flex items-center gap-2 font-black"><ReceiptText className="h-4 w-4"/> Pagamento via PIX</div><div className="mt-2 text-sm text-gray-500">Valor: <b className="text-[#005a3c]">{money(Number(detalhe.valor_total))}</b></div>{detalhe.eventos?.conta_bancaria_id && <div className="mt-2 text-sm text-gray-500">🏦 Recebimento: <b>{(contasBancarias.find(c=>c.id===detalhe.eventos?.conta_bancaria_id)?.nome || "Conta cadastrada")}</b></div>}{(() => { const eventoPix = detalhe.eventos?.pix_copia_e_cola || ""; const codigoPix = eventoPix || pix?.copia_e_cola || ""; return codigoPix ? <><div className="mt-4 grid place-items-center rounded-xl bg-white p-3"><QRCodeSVG value={codigoPix} size={180}/></div><div className="mt-3 break-all rounded-lg bg-gray-100 p-3 text-xs">{codigoPix}</div><button type="button" onClick={()=>navigator.clipboard?.writeText(codigoPix)} className="mt-2 w-full rounded-lg bg-[#005a3c] px-3 py-2 text-xs font-black text-white">📋 Copiar PIX copia e cola</button></> : <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-800">PIX ainda não configurado para este evento.</div>; })()}<div className="mt-4 rounded-xl bg-[#f8faf9] p-4"><div className="font-bold text-[#17382c]">Enviar comprovante</div><label className="mt-3 block"><span className="label">Arquivo (JPG, PNG, WEBP ou PDF)</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setArquivoComprovante(e.target.files?.[0] || null)} className="input"/></label><div className="mt-2 text-center text-xs text-gray-400">ou</div><input value={comprovante} onChange={e=>setComprovante(e.target.value)} className="input mt-2" placeholder="Cole a URL do comprovante"/><button type="button" onClick={()=>enviarComprovante(detalhe)} disabled={processando || (!comprovante.trim() && !arquivoComprovante)} className="mt-3 w-full rounded-xl bg-[#005a3c] px-4 py-3 font-black text-white">{enviandoComprovante ? "Enviando..." : "Enviar comprovante"}</button></div></div>}{perfil === "administrador" && detalhe.comprovante_url && <a href={detalhe.comprovante_url} target="_blank" rel="noreferrer" className="mt-4 block rounded-xl bg-[#f3f7f4] p-3 text-sm font-bold text-[#005a3c]">📎 Ver comprovante enviado</a>}{perfil === "administrador" && detalhe.status === "pendente" && <div className="mt-4 flex gap-2"><button onClick={()=>aprovar(detalhe,"aprovar")} className="flex-1 rounded-xl bg-[#005a3c] px-4 py-3 font-black text-white"><CheckCircle2 className="mr-1 inline h-4 w-4"/> Aprovar</button><button onClick={()=>aprovar(detalhe,"recusar")} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-black text-white"><XCircle className="mr-1 inline h-4 w-4"/> Recusar</button></div>}</div></div>}
  </main></div>;
}
