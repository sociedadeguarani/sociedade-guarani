"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";
import { FileText, Plus, RefreshCw, CheckCircle2, Search, X } from "lucide-react";

type Socio = { id: string; nome: string; matricula: string | number | null; cpf: string | null; possui_mensalidade: boolean | null; valor_mensalidade: number | null };
type Conta = { id: string; nome: string; banco?: string | null };
type Parcela = { id: string; numero: number; descricao: string; valor: number; data_vencimento: string; situacao: string; data_pagamento?: string | null; movimentacao_id?: string | null };
type Contrato = { id: string; codigo: string; comprador_nome: string; socio_id: string; valor_total: number; situacao: string; data_contratacao: string; parcelas: Parcela[] };
type Entrada = { id: string; descricao: string; valor: number; data_movimentacao: string; forma_pagamento: string | null };

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v?: string | null) => v ? v.slice(0,10).split("-").reverse().join("/") : "—";
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export default function VendaTitulosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [socioId, setSocioId] = useState("");
  const [buscaSocio, setBuscaSocio] = useState("");
  const [valorTotal, setValorTotal] = useState("1500");
  const [valorEntrada, setValorEntrada] = useState("500");
  const [quantidade, setQuantidade] = useState("3");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hoje);
  const [entradaPaga, setEntradaPaga] = useState(true);
  const [movimentoEntradaId, setMovimentoEntradaId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [modalNovo, setModalNovo] = useState(false);
  const [parcelaBaixa, setParcelaBaixa] = useState<Parcela | null>(null);
  const [contaBaixa, setContaBaixa] = useState("");
  const [formaBaixa, setFormaBaixa] = useState("pix");
  const [dataBaixa, setDataBaixa] = useState(hoje);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const requisicao = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Entre novamente no sistema.");
    const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) }, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const data = await requisicao("/api/venda-titulos");
      setContratos(data.contratos || []); setSocios(data.socios || []); setContas(data.contas || []);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar vendas."); }
    finally { setCarregando(false); }
  }, [requisicao]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    let ativo = true;
    async function carregarEntradas() {
      if (!socioId) { setEntradas([]); setMovimentoEntradaId(""); return; }
      try {
        const data = await requisicao(`/api/venda-titulos?socio_id=${encodeURIComponent(socioId)}`);
        if (ativo) setEntradas(data.entradas || []);
      } catch { if (ativo) setEntradas([]); }
    }
    void carregarEntradas();
    return () => { ativo = false; };
  }, [socioId, requisicao]);

  const socioSelecionado = socios.find(s => s.id === socioId);
  const sociosFiltrados = useMemo(() => socios.filter(s => `${s.nome} ${s.matricula || ""} ${s.cpf || ""}`.toLowerCase().includes(buscaSocio.toLowerCase())).slice(0, 12), [socios, buscaSocio]);
  const totais = useMemo(() => {
    const parcelas = contratos.flatMap(c => c.parcelas || []);
    return { contratado: contratos.reduce((s,c) => s + Number(c.valor_total || 0),0), recebido: parcelas.filter(p => p.situacao === "pago").reduce((s,p) => s + Number(p.valor || 0),0), aberto: parcelas.filter(p => p.situacao !== "pago").reduce((s,p) => s + Number(p.valor || 0),0) };
  }, [contratos]);

  function gerarValores() {
    const total = Number(valorTotal.replace(",", "."));
    const entrada = Number(valorEntrada.replace(",", "."));
    const qtd = Math.max(1, Math.min(24, Number(quantidade)));
    const restante = total - entrada;
    if (total <= 0 || entrada <= 0 || entrada > total || qtd < 1 || (qtd === 1 && Math.abs(restante) > 0.009)) throw new Error("Confira o valor total, a entrada e a quantidade de parcelas.");
    const valores = [entrada];
    if (qtd > 1) {
      const base = Math.floor((restante / (qtd - 1)) * 100) / 100;
      for (let i=1;i<qtd;i++) valores.push(i === qtd - 1 ? Number((restante - base * (qtd - 2)).toFixed(2)) : base);
    }
    return valores;
  }

  async function criarVenda(event: React.FormEvent) {
    event.preventDefault(); setErro(""); setSucesso("");
    try {
      if (!socioId) throw new Error("Selecione o associado comprador.");
      const valores = gerarValores();
      if (entradaPaga && valores[0] > 0 && !movimentoEntradaId) throw new Error("Selecione o lançamento financeiro que já recebeu a entrada. Isso evita duplicar a receita.");
      const parcelas = valores.map((valor, i) => {
        const d = new Date(`${primeiroVencimento}T12:00:00`);
        d.setDate(d.getDate() + (30 * i));
        return { valor, data_vencimento: d.toISOString().slice(0,10) };
      });
      setSalvando(true);
      await requisicao("/api/venda-titulos", { method: "POST", body: JSON.stringify({ acao: "criar", socio_id: socioId, valor_total: Number(valorTotal.replace(",", ".")), quantidade_parcelas: valores.length, primeiro_vencimento: primeiroVencimento, parcelas, entrada_paga: entradaPaga, movimentacao_entrada_id: entradaPaga ? movimentoEntradaId : null, observacoes }) });
      setSucesso("Venda de título cadastrada. A mensalidade da competência vigente foi verificada e permanece em aberto se ainda não paga.");
      setModalNovo(false); setSocioId(""); setBuscaSocio(""); setMovimentoEntradaId(""); setObservacoes("");
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao cadastrar venda."); }
    finally { setSalvando(false); }
  }

  async function baixarParcela(event: React.FormEvent) {
    event.preventDefault(); if (!parcelaBaixa) return;
    setErro(""); setSucesso(""); setSalvando(true);
    try {
      await requisicao("/api/venda-titulos", { method: "POST", body: JSON.stringify({ acao: "baixar_parcela", parcela_id: parcelaBaixa.id, conta_bancaria_id: contaBaixa, forma_pagamento: formaBaixa, data_pagamento: dataBaixa }) });
      setSucesso("Pagamento registrado no Financeiro."); setParcelaBaixa(null); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao baixar parcela."); }
    finally { setSalvando(false); }
  }

  return <div className="min-h-screen bg-[#f4f8f6]"><MenuLateralPadrao /><main className="min-h-screen lg:pl-64">
    <CabecalhoPadrao />
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Sociedade Recreativa Guarani</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-800"><FileText className="h-6 w-6"/> Venda de Títulos</h1><p className="text-sm text-slate-500">Contratos, parcelas, recebimentos e integração com o Financeiro.</p></div><button onClick={()=>setModalNovo(true)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white"><Plus size={17}/> Nova venda</button></div>
      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {sucesso && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{sucesso}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[["Total contratado",moeda(totais.contratado)],["Total recebido",moeda(totais.recebido)],["A receber",moeda(totais.aberto)]].map(([l,v])=><div key={l} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{l}</p><p className="mt-1 text-xl font-black text-slate-800">{v}</p></div>)}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-800">Contratos cadastrados</h2><button onClick={carregar} className="rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15} className="mr-2 inline"/>Atualizar</button></div>
        {carregando ? <p className="p-8 text-center text-slate-500">Carregando...</p> : contratos.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhuma venda de título cadastrada.</p> : <div className="space-y-4">{contratos.map(c=><div key={c.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-emerald-700">{c.codigo}</p><h3 className="font-bold text-slate-800">{c.comprador_nome}</h3><p className="text-xs text-slate-500">Contrato em {dataBr(c.data_contratacao)} · {c.parcelas?.length || 0} parcelas</p></div><p className="text-lg font-black text-slate-800">{moeda(c.valor_total)}</p></div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">{(c.parcelas || []).sort((a,b)=>a.numero-b.numero).map(p=><div key={p.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-2"><b className="text-sm">{p.descricao}</b><b className="text-sm">{moeda(p.valor)}</b></div><p className="mt-1 text-xs text-slate-500">Vencimento: {dataBr(p.data_vencimento)}</p><div className="mt-2 flex items-center justify-between"><span className={`rounded-full px-2 py-1 text-xs font-bold ${p.situacao==="pago"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>{p.situacao==="pago"?"Pago":"Em aberto"}</span>{p.situacao!=="pago" && <button onClick={()=>{setParcelaBaixa(p);setContaBaixa(contas[0]?.id || "");}} className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white">Receber</button>}</div></div>)}</div>
        </div>)}</div>}
      </div>
    </div>
  </main>
  {modalNovo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3"><form onSubmit={criarVenda} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
    <div className="flex items-center justify-between"><h2 className="text-lg font-black">Nova venda de título</h2><button type="button" onClick={()=>setModalNovo(false)}><X/></button></div>
    <div><label className="mb-1 block text-xs font-bold">Buscar associado comprador</label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={buscaSocio} onChange={e=>{setBuscaSocio(e.target.value);setSocioId("");}} placeholder="Digite nome, matrícula ou CPF..." className="w-full rounded-xl border p-3 pl-9 text-sm"/></div>{buscaSocio && <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border">{sociosFiltrados.map(s=><button type="button" key={s.id} onClick={()=>{setSocioId(s.id);setBuscaSocio(`${s.nome}${s.matricula?` — ${s.matricula}`:""}`);}} className="block w-full border-b p-3 text-left text-sm hover:bg-emerald-50"><b>{s.nome}</b><span className="ml-2 text-xs text-slate-500">Matrícula {s.matricula || "—"}</span></button>)}</div>}{socioSelecionado && <p className="mt-1 text-xs text-emerald-700">Associado selecionado · Mensalidade: {socioSelecionado.possui_mensalidade ? moeda(Number(socioSelecionado.valor_mensalidade||0)) : "Não configurada no cadastro"}</p>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><div><label className="mb-1 block text-xs font-bold">Valor total do título (R$)</label><input type="number" min="0.01" step="0.01" value={valorTotal} onChange={e=>setValorTotal(e.target.value)} className="w-full rounded-xl border p-3"/></div><div><label className="mb-1 block text-xs font-bold">Entrada (R$)</label><input type="number" min="0" step="0.01" value={valorEntrada} onChange={e=>setValorEntrada(e.target.value)} className="w-full rounded-xl border p-3"/></div><div><label className="mb-1 block text-xs font-bold">Quantidade de parcelas</label><input type="number" min="1" max="24" value={quantidade} onChange={e=>setQuantidade(e.target.value)} className="w-full rounded-xl border p-3"/></div></div>
    <div><label className="mb-1 block text-xs font-bold">Vencimento da entrada / primeira parcela</label><input type="date" value={primeiroVencimento} onChange={e=>setPrimeiroVencimento(e.target.value)} className="w-full rounded-xl border p-3"/></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={entradaPaga} onChange={e=>setEntradaPaga(e.target.checked)}/> Entrada já recebida (vincular lançamento existente, sem duplicar receita)</label>
    {entradaPaga && Number(valorEntrada)>0 && <div><label className="mb-1 block text-xs font-bold">Lançamento financeiro correspondente à entrada</label><select value={movimentoEntradaId} onChange={e=>setMovimentoEntradaId(e.target.value)} className="w-full rounded-xl border p-3"><option value="">Selecione o lançamento</option>{entradas.filter(e=>Math.abs(Number(e.valor)-Number(valorEntrada))<0.01).map(e=><option key={e.id} value={e.id}>{dataBr(e.data_movimentacao)} · {e.descricao} · {moeda(Number(e.valor))}</option>)}</select><p className="mt-1 text-xs text-slate-500">Mostrando lançamentos de entrada do associado com o mesmo valor da entrada.</p></div>}
    <div><label className="mb-1 block text-xs font-bold">Observações</label><textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} className="w-full rounded-xl border p-3" rows={2}/></div>
    <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4"/> A mensalidade será verificada na competência vigente e ficará em aberto se ainda não houver pagamento. As parcelas do título ficam separadas das mensalidades.</p>
    <div className="flex justify-end gap-2"><button type="button" onClick={()=>setModalNovo(false)} className="rounded-xl border px-4 py-2">Cancelar</button><button disabled={salvando} className="rounded-xl bg-emerald-800 px-5 py-2 font-bold text-white disabled:opacity-50">{salvando?"Salvando...":"Cadastrar venda"}</button></div>
  </form></div>}
  {parcelaBaixa && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3"><form onSubmit={baixarParcela} className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-black">Receber parcela</h2><button type="button" onClick={()=>setParcelaBaixa(null)}><X/></button></div><p className="text-sm">Valor: <b>{moeda(parcelaBaixa.valor)}</b></p><div><label className="mb-1 block text-xs font-bold">Conta de recebimento</label><select required value={contaBaixa} onChange={e=>setContaBaixa(e.target.value)} className="w-full rounded-xl border p-3"><option value="">Selecione</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:""}</option>)}</select></div><div><label className="mb-1 block text-xs font-bold">Forma de pagamento</label><select value={formaBaixa} onChange={e=>setFormaBaixa(e.target.value)} className="w-full rounded-xl border p-3">{["pix","dinheiro","transferencia","boleto","cartao","cheque","outro"].map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}</select></div><div><label className="mb-1 block text-xs font-bold">Data do recebimento</label><input required type="date" value={dataBaixa} onChange={e=>setDataBaixa(e.target.value)} className="w-full rounded-xl border p-3"/></div><div className="flex justify-end gap-2"><button type="button" onClick={()=>setParcelaBaixa(null)} className="rounded-xl border px-4 py-2">Cancelar</button><button disabled={salvando} className="rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white">Confirmar recebimento</button></div></form></div>}
  </div>;
}
