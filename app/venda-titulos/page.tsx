"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "@/app/components/MenuLateralPadrao";
import CabecalhoPadrao from "@/app/components/CabecalhoPadrao";
import { FileText, Plus, RefreshCw, CheckCircle2, Search, X } from "lucide-react";

type Socio = { id: string; nome: string; matricula: string | number | null; cpf: string | null; possui_mensalidade: boolean | null; valor_mensalidade: number | null };
type Conta = { id: string; nome: string; banco?: string | null };
type Parcela = { id: string; numero: number; descricao: string; valor: number; data_vencimento: string; situacao: string; data_pagamento?: string | null; forma_pagamento?: string | null; conta_bancaria_id?: string | null; movimentacao_id?: string | null };
type Contrato = { id: string; codigo: string; comprador_nome: string; socio_id: string; valor_total: number; situacao: string; data_contratacao: string; parcelas: Parcela[] };

const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v?: string | null) => v ? v.slice(0,10).split("-").reverse().join("/") : "—";
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function somarMeses(data: string, meses: number) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

export default function VendaTitulosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [socioId, setSocioId] = useState("");
  const [buscaSocio, setBuscaSocio] = useState("");
  const [valorTotal, setValorTotal] = useState("1500");
  const [valorEntrada, setValorEntrada] = useState("500");
  // Quantidade de parcelas restantes, além da entrada. O limite de 6 mantém
  // o total de registros (entrada + parcelas) dentro do limite aceito pela API.
  const [quantidade, setQuantidade] = useState("2");
  const [datasVencimento, setDatasVencimento] = useState<string[]>([hoje, somarMeses(hoje, 1), somarMeses(hoje, 2)]);
  const [registrarEntrada, setRegistrarEntrada] = useState(true);
  const [formaEntrada, setFormaEntrada] = useState("pix");
  const [contaEntrada, setContaEntrada] = useState("");
  const [dataEntrada, setDataEntrada] = useState(hoje);
  const [comprovanteEntrada, setComprovanteEntrada] = useState<File | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [modalNovo, setModalNovo] = useState(false);
  const [parcelaBaixa, setParcelaBaixa] = useState<Parcela | null>(null);
  const [contaBaixa, setContaBaixa] = useState("");
  const [formaBaixa, setFormaBaixa] = useState("pix");
  const [dataBaixa, setDataBaixa] = useState(hoje);
  const [comprovanteBaixa, setComprovanteBaixa] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const requisicao = useCallback(async (url: string, init?: RequestInit) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Entre novamente no sistema.");
    const headers = new Headers(init?.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (init?.body instanceof FormData) headers.delete("Content-Type");
    else if (init?.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
    return payload;
  }, []);

  const carregar = useCallback(async () => {
    try {
      const data = await requisicao("/api/venda-titulos");
      setErro("");
      setContratos(data.contratos || []); setSocios(data.socios || []); setContas(data.contas || []);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar vendas."); }
    finally { setCarregando(false); }
  }, [requisicao]);

  useEffect(() => {
    let ativo = true;

    const inicializar = async () => {
      try {
        const data = await requisicao("/api/venda-titulos");
        if (!ativo) return;
        setErro("");
        setContratos(data.contratos || []);
        setSocios(data.socios || []);
        setContas(data.contas || []);
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Erro ao carregar vendas.");
      } finally {
        if (ativo) setCarregando(false);
      }
    };

    void inicializar();
    return () => {
      ativo = false;
    };
  }, [requisicao]);



  const socioSelecionado = socios.find(s => s.id === socioId);
  const sociosFiltrados = useMemo(() => socios.filter(s => `${s.nome} ${s.matricula || ""} ${s.cpf || ""}`.toLowerCase().includes(buscaSocio.toLowerCase())).slice(0, 12), [socios, buscaSocio]);
  const totais = useMemo(() => {
    const parcelas = contratos.flatMap(c => c.parcelas || []);
    return { contratado: contratos.reduce((s,c) => s + Number(c.valor_total || 0),0), recebido: parcelas.filter(p => p.situacao === "pago").reduce((s,p) => s + Number(p.valor || 0),0), aberto: parcelas.filter(p => p.situacao !== "pago").reduce((s,p) => s + Number(p.valor || 0),0) };
  }, [contratos]);

  function gerarValores() {
    const total = Number(valorTotal.replace(",", "."));
    const entrada = Number(valorEntrada.replace(",", "."));
    const qtd = Math.max(0, Math.min(6, Number(quantidade)));
    const restante = Number((total - entrada).toFixed(2));
    if (total <= 0 || entrada <= 0 || entrada > total || !Number.isInteger(Number(quantidade)) || qtd !== Number(quantidade) || (restante > 0.009 && qtd < 1)) {
      throw new Error("Confira o valor total, a entrada e a quantidade de parcelas restantes.");
    }
    const valores = [entrada];
    if (restante > 0.009) {
      const base = Math.floor((restante / qtd) * 100) / 100;
      for (let i = 0; i < qtd; i++) {
        valores.push(i === qtd - 1 ? Number((restante - base * (qtd - 1)).toFixed(2)) : base);
      }
    }
    return valores;
  }

  function alterarQuantidade(valor: string) {
    setQuantidade(valor);
    const qtd = Math.max(0, Math.min(6, Number(valor) || 0));
    const totalDatas = qtd + 1;
    setDatasVencimento((atuais) => {
      const proximas = atuais.slice(0, totalDatas);
      while (proximas.length < totalDatas) {
        proximas.push(somarMeses(proximas[proximas.length - 1] || hoje, 1));
      }
      return proximas;
    });
  }

  async function criarVenda(event: React.FormEvent) {
    event.preventDefault(); setErro(""); setSucesso("");
    try {
      if (!socioId) throw new Error("Selecione o associado comprador.");
      const valores = gerarValores();
      if (registrarEntrada && !contaEntrada) throw new Error("Selecione o banco ou caixa que recebeu a entrada.");
      if (comprovanteEntrada && comprovanteEntrada.size > 8 * 1024 * 1024) throw new Error("O comprovante deve ter até 8 MB.");
      if (datasVencimento.length < valores.length || datasVencimento.slice(0, valores.length).some((data) => !/^\d{4}-\d{2}-\d{2}$/.test(data))) {
        throw new Error("Informe o vencimento de cada parcela.");
      }
      const parcelas = valores.map((valor, i) => ({
        valor,
        data_vencimento: datasVencimento[i],
        // Parcelas futuras ficam inicialmente como boleto em aberto; a forma
        // efetiva será registrada quando cada recebimento for baixado.
        forma_pagamento: i === 0 ? formaEntrada : "boleto",
        recebido: i === 0 && registrarEntrada,
        data_pagamento: i === 0 && registrarEntrada ? dataEntrada : null,
        conta_bancaria_id: i === 0 && registrarEntrada ? contaEntrada : null,
      }));
      setSalvando(true);
      const formData = new FormData();
      formData.append("dados", JSON.stringify({
        acao: "criar", socio_id: socioId,
        valor_total: Number(valorTotal.replace(",", ".")),
        quantidade_parcelas: valores.length, primeiro_vencimento: datasVencimento[0],
        parcelas, registrar_entrada: registrarEntrada,
        forma_entrada: formaEntrada, conta_entrada_id: registrarEntrada ? contaEntrada : null,
        data_entrada: dataEntrada, observacoes,
      }));
      if (comprovanteEntrada) formData.append("comprovante", comprovanteEntrada);
      const resultado = await requisicao("/api/venda-titulos", { method: "POST", body: formData });
      setSucesso(resultado.message || "Venda de título cadastrada com sucesso.");
      setModalNovo(false); setSocioId(""); setBuscaSocio(""); setObservacoes(""); setComprovanteEntrada(null);
      setContaEntrada(""); setRegistrarEntrada(true); setFormaEntrada("pix"); setDataEntrada(hoje);
      setQuantidade("2"); setDatasVencimento([hoje, somarMeses(hoje, 1), somarMeses(hoje, 2)]);
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao cadastrar venda."); }
    finally { setSalvando(false); }
  }

  async function baixarParcela(event: React.FormEvent) {
    event.preventDefault(); if (!parcelaBaixa) return;
    setErro(""); setSucesso(""); setSalvando(true);
    try {
      const formData = new FormData();
      formData.append("dados", JSON.stringify({ acao: "baixar_parcela", parcela_id: parcelaBaixa.id, conta_bancaria_id: contaBaixa, forma_pagamento: formaBaixa, data_pagamento: dataBaixa }));
      if (comprovanteBaixa) formData.append("comprovante", comprovanteBaixa);
      await requisicao("/api/venda-titulos", { method: "POST", body: formData });
      setSucesso("Pagamento registrado no Financeiro."); setParcelaBaixa(null); setComprovanteBaixa(null); await carregar();
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
        <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-800">Contratos cadastrados</h2><button onClick={() => { setCarregando(true); void carregar(); }} className="rounded-lg border px-3 py-2 text-sm"><RefreshCw size={15} className="mr-2 inline"/>Atualizar</button></div>
        {carregando ? <p className="p-8 text-center text-slate-500">Carregando...</p> : contratos.length === 0 ? <p className="p-8 text-center text-slate-500">Nenhuma venda de título cadastrada.</p> : <div className="space-y-4">{contratos.map(c=><div key={c.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-emerald-700">{c.codigo}</p><h3 className="font-bold text-slate-800">{c.comprador_nome}</h3><p className="text-xs text-slate-500">Contrato em {dataBr(c.data_contratacao)} · {c.parcelas?.length || 0} parcelas</p></div><p className="text-lg font-black text-slate-800">{moeda(c.valor_total)}</p></div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">{(c.parcelas || []).sort((a,b)=>a.numero-b.numero).map(p=><div key={p.id} className="rounded-lg bg-slate-50 p-3"><div className="flex justify-between gap-2"><b className="text-sm">{p.descricao}</b><b className="text-sm">{moeda(p.valor)}</b></div><p className="mt-1 text-xs text-slate-500">Vencimento: {dataBr(p.data_vencimento)}</p>{p.situacao==="pago" && <p className="mt-1 text-[11px] text-slate-500">Recebido em {dataBr(p.data_pagamento)}{p.forma_pagamento?` · ${p.forma_pagamento.toUpperCase()}`:""}{p.conta_bancaria_id?` · ${contas.find(c=>c.id===p.conta_bancaria_id)?.nome || "Conta"}`:""}</p>}<div className="mt-2 flex items-center justify-between"><span className={`rounded-full px-2 py-1 text-xs font-bold ${p.situacao==="pago"?"bg-emerald-100 text-emerald-700":"bg-amber-100 text-amber-700"}`}>{p.situacao==="pago"?"Pago":"Em aberto"}</span>{p.situacao!=="pago" && <button onClick={()=>{setParcelaBaixa(p);setContaBaixa("");setFormaBaixa("pix");setDataBaixa(hoje);setComprovanteBaixa(null);}} className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white">Receber</button>}</div></div>)}</div>
        </div>)}</div>}
      </div>
    </div>
  </main>
  {modalNovo && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3"><form onSubmit={criarVenda} className="max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
    <div className="flex items-center justify-between"><h2 className="text-lg font-black">Nova venda de título</h2><button type="button" onClick={()=>setModalNovo(false)}><X/></button></div>
    <div><label className="mb-1 block text-xs font-bold">Buscar associado comprador</label><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={buscaSocio} onChange={e=>{setBuscaSocio(e.target.value);setSocioId("");}} placeholder="Digite nome, matrícula ou CPF..." className="w-full rounded-xl border p-3 pl-9 text-sm"/></div>{buscaSocio && <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border">{sociosFiltrados.map(s=><button type="button" key={s.id} onClick={()=>{setSocioId(s.id);setBuscaSocio(`${s.nome}${s.matricula?` — ${s.matricula}`:""}`);}} className="block w-full border-b p-3 text-left text-sm hover:bg-emerald-50"><b>{s.nome}</b><span className="ml-2 text-xs text-slate-500">Matrícula {s.matricula || "—"}</span></button>)}</div>}{socioSelecionado && <p className="mt-1 text-xs text-emerald-700">Associado selecionado · Mensalidade: {socioSelecionado.possui_mensalidade ? moeda(Number(socioSelecionado.valor_mensalidade||0)) : "Não configurada no cadastro"}</p>}</div>
    <div className="grid gap-3 sm:grid-cols-3"><div><label className="mb-1 block text-xs font-bold">Valor total do título (R$)</label><input type="number" min="0.01" step="0.01" value={valorTotal} onChange={e=>setValorTotal(e.target.value)} className="w-full rounded-xl border p-3"/></div><div><label className="mb-1 block text-xs font-bold">Entrada (R$)</label><input type="number" min="0.01" step="0.01" value={valorEntrada} onChange={e=>setValorEntrada(e.target.value)} className="w-full rounded-xl border p-3"/></div><div><label className="mb-1 block text-xs font-bold">Parcelas após a entrada</label><input type="number" min="0" max="6" value={quantidade} onChange={e=>alterarQuantidade(e.target.value)} className="w-full rounded-xl border p-3"/><p className="mt-1 text-[11px] text-slate-500">Além da entrada, até 6 parcelas.</p></div></div>
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div><h3 className="text-sm font-bold text-slate-800">Vencimentos</h3><p className="text-xs text-slate-500">Defina a data de cada parcela. As datas sugeridas podem ser alteradas individualmente.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: Number(quantidade) + 1 }, (_, i) => i).map((i) => (
          <div key={i}><label className="mb-1 block text-xs font-bold">{i === 0 ? "Vencimento da entrada" : `Vencimento da parcela ${i}`}</label><input required type="date" value={datasVencimento[i] || ""} onChange={e=>setDatasVencimento(atual=>atual.map((data,index)=>index===i?e.target.value:data))} className="w-full rounded-xl border bg-white p-3"/></div>
        ))}
      </div>
    </div>
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <label className="flex items-start gap-2 text-sm font-semibold text-slate-800">
        <input type="checkbox" className="mt-0.5" checked={registrarEntrada} onChange={e=>setRegistrarEntrada(e.target.checked)}/>
        <span>Registrar a entrada agora no Financeiro <span className="block text-xs font-normal text-slate-500">A entrada será criada como uma nova receita nesta venda. Não precisa existir lançamento anterior.</span></span>
      </label>
      {registrarEntrada && Number(valorEntrada)>0 && <div className="space-y-3 border-t border-emerald-200 pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-bold">Forma de pagamento da entrada</label><select required value={formaEntrada} onChange={e=>setFormaEntrada(e.target.value)} className="w-full rounded-xl border bg-white p-3">{[["pix","PIX"],["dinheiro","Dinheiro"],["transferencia","Transferência"],["boleto","Boleto"],["debito_em_conta","Débito em conta"],["cheque","Cheque"],["outro","Outro"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
          <div><label className="mb-1 block text-xs font-bold">{formaEntrada==="pix"?"Banco/conta que recebeu o PIX":formaEntrada==="dinheiro"?"Caixa/conta que recebeu o dinheiro":"Banco/conta que recebeu"}</label><select required value={contaEntrada} onChange={e=>setContaEntrada(e.target.value)} className="w-full rounded-xl border bg-white p-3"><option value="">Selecione o banco ou caixa</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:""}</option>)}</select></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-bold">Data em que recebeu a entrada</label><input required type="date" value={dataEntrada} onChange={e=>setDataEntrada(e.target.value)} className="w-full rounded-xl border bg-white p-3"/></div>
          <div><label className="mb-1 block text-xs font-bold">Comprovante (opcional)</label><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setComprovanteEntrada(e.target.files?.[0] || null)} className="w-full rounded-xl border bg-white p-2 text-xs"/><p className="mt-1 text-[11px] text-slate-500">JPG, PNG, WEBP ou PDF · até 8 MB{comprovanteEntrada?` · ${comprovanteEntrada.name}`:""}</p></div>
        </div>
        <p className="rounded-lg bg-white p-2 text-xs text-emerald-800">Ao cadastrar, será lançada uma entrada de {moeda(Number(valorEntrada||0))} na conta selecionada, identificada como Venda de título e vinculada à primeira parcela.</p>
      </div>}
      {!registrarEntrada && <p className="text-xs text-amber-800">A entrada ficará em aberto e não será criada receita no Financeiro até o recebimento.</p>}
    </div>
    <div><label className="mb-1 block text-xs font-bold">Observações</label><textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} className="w-full rounded-xl border p-3" rows={2}/></div>
    <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4"/> A mensalidade será verificada na competência vigente e ficará em aberto se ainda não houver pagamento. As parcelas do título ficam separadas das mensalidades.</p>
    <div className="flex justify-end gap-2"><button type="button" onClick={()=>setModalNovo(false)} className="rounded-xl border px-4 py-2">Cancelar</button><button disabled={salvando} className="rounded-xl bg-emerald-800 px-5 py-2 font-bold text-white disabled:opacity-50">{salvando?"Salvando...":"Cadastrar venda"}</button></div>
  </form></div>}
  {parcelaBaixa && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3"><form onSubmit={baixarParcela} className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="font-black">Receber parcela</h2><button type="button" onClick={()=>{setParcelaBaixa(null);setComprovanteBaixa(null);}}><X/></button></div><p className="text-sm">{parcelaBaixa.descricao}: <b>{moeda(parcelaBaixa.valor)}</b></p><div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-xs font-bold">Forma de pagamento</label><select value={formaBaixa} onChange={e=>setFormaBaixa(e.target.value)} className="w-full rounded-xl border p-3">{[["pix","PIX"],["dinheiro","Dinheiro"],["transferencia","Transferência"],["boleto","Boleto"],["debito_em_conta","Débito em conta"],["cheque","Cheque"],["outro","Outro"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div><div><label className="mb-1 block text-xs font-bold">{formaBaixa==="pix"?"Banco/conta que recebeu o PIX":formaBaixa==="dinheiro"?"Caixa/conta que recebeu o dinheiro":"Banco/conta que recebeu"}</label><select required value={contaBaixa} onChange={e=>setContaBaixa(e.target.value)} className="w-full rounded-xl border p-3"><option value="">Selecione</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:""}</option>)}</select></div></div><div><label className="mb-1 block text-xs font-bold">Data do recebimento</label><input required type="date" value={dataBaixa} onChange={e=>setDataBaixa(e.target.value)} className="w-full rounded-xl border p-3"/></div><div><label className="mb-1 block text-xs font-bold">Comprovante (opcional)</label><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setComprovanteBaixa(e.target.files?.[0] || null)} className="w-full rounded-xl border p-2 text-xs"/><p className="mt-1 text-[11px] text-slate-500">JPG, PNG, WEBP ou PDF · até 8 MB{comprovanteBaixa?` · ${comprovanteBaixa.name}`:""}</p></div><div className="flex justify-end gap-2"><button type="button" onClick={()=>{setParcelaBaixa(null);setComprovanteBaixa(null);}} className="rounded-xl border px-4 py-2">Cancelar</button><button disabled={salvando} className="rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white disabled:opacity-50">{salvando?"Salvando...":"Confirmar recebimento"}</button></div></form></div>}
  </div>;
}
