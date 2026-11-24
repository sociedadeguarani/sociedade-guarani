"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "@/app/components/MenuLateralPadrao";
import CabecalhoPadrao from "@/app/components/CabecalhoPadrao";
import { Handshake, RefreshCw, Search, Save } from "lucide-react";

type Socio = { id: string; nome: string; matricula: string | null; cpf: string | null };
type Mensalidade = { id: string; socio_id: string; competencia: string; valor: number; data_vencimento: string; situacao: string; socio: Socio | null };
type Conta = { id: string; nome: string; banco: string | null };
type ParcelaInput = { valor: string; data_vencimento: string };
type OutraDividaInput = { descricao: string; valor: string };

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (v: string) => v ? v.slice(0, 10).split("-").reverse().join("/") : "—";

export default function AcordosPage() {
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [entrada, setEntrada] = useState("0");
  const [quantidade, setQuantidade] = useState("1");
  const [parcelas, setParcelas] = useState<ParcelaInput[]>([{ valor: "0", data_vencimento: hoje() }]);
  const [outrasDividas, setOutrasDividas] = useState<OutraDividaInput[]>([]);
  const [formaEntrada, setFormaEntrada] = useState("pix");
  const [contaEntrada, setContaEntrada] = useState("");
  const [contaParcelas, setContaParcelas] = useState("");
  const [dataEntrada, setDataEntrada] = useState(hoje());
  const [observacoes, setObservacoes] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  const api = useCallback(async (method = "GET", body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no sistema.");
    const response = await fetch("/api/acordos", {
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Não foi possível concluir a operação.");
    return result;
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro("");
    try {
      const result = await api();
      setMensalidades(result.mensalidades || []);
      setContas(result.contas || []);
      setContaEntrada(atual => atual || result.contas?.[0]?.id || "");
      setContaParcelas(atual => atual || result.contas?.[0]?.id || "");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar acordos."); }
    finally { setCarregando(false); }
  }, [api]);

  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => mensalidades.filter(m => {
    const s = m.socio;
    return `${s?.nome || ""} ${s?.matricula || ""} ${s?.cpf || ""}`.toLowerCase().includes(busca.toLowerCase());
  }), [mensalidades, busca]);
  const escolhidas = mensalidades.filter(m => selecionadas.includes(m.id));
  const totalOriginal = escolhidas.reduce((s, m) => s + Number(m.valor || 0), 0);
  const totalOutrasDividas = outrasDividas.reduce((s, d) => s + Number(d.valor || 0), 0);
  const totalSelecionado = totalOriginal + totalOutrasDividas;
  const socioSelecionadoId = escolhidas[0]?.socio_id || "";

  function alternar(id: string) {
    setSelecionadas(atual => atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]);
  }
  function atualizarQuantidade(valor: string) {
    const n = Math.min(24, Math.max(1, Number(valor) || 1));
    setQuantidade(String(n));
    const saldo = Math.max(0, Number(valorTotal || totalSelecionado) - Number(entrada || 0));
    const base = Math.floor((saldo / n) * 100) / 100;
    setParcelas(Array.from({ length: n }, (_, i) => ({
      valor: (i === n - 1 ? saldo - base * (n - 1) : base).toFixed(2),
      data_vencimento: (() => { const d = new Date(`${hoje()}T12:00:00`); d.setMonth(d.getMonth() + i + 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })(),
    })));
  }
  function atualizarEntrada(valor: string) {
    setEntrada(valor);
    const saldo = Math.max(0, Number(valorTotal || totalSelecionado) - Number(valor || 0));
    const n = parcelas.length || 1;
    const base = Math.floor((saldo / n) * 100) / 100;
    setParcelas(atual => atual.map((p, i) => ({ ...p, valor: (i === n - 1 ? saldo - base * (n - 1) : base).toFixed(2) })));
  }

  async function salvar() {
    setErro(""); setMensagem("");
    const total = Number(valorTotal || totalOriginal);
    if (!selecionadas.length && !outrasDividas.some(d => d.descricao.trim() && Number(d.valor) > 0)) { setErro("Selecione mensalidades ou informe ao menos outra dívida."); return; }
    if (!Number.isInteger(Number(entrada)) || total <= 0 || Number(entrada) > total) { setErro("Confira o valor total e a entrada."); return; }
    if (Number(entrada) > 0 && (!contaEntrada || !["pix","cheque","debito_em_conta","dinheiro"].includes(formaEntrada))) { setErro("Selecione a conta que receberá a entrada."); return; }
    if (parcelas.some(p => Number(p.valor) > 0) && !contaParcelas) { setErro("Selecione a conta que receberá as parcelas."); return; }
    setSalvando(true);
    try {
      const result = await api("POST", {
        socio_id: escolhidas[0]?.socio_id,
        mensalidade_ids: selecionadas,
        outras_dividas: outrasDividas.filter(d => d.descricao.trim() && Number(d.valor) > 0).map(d => ({ descricao: d.descricao.trim(), valor: Number(d.valor) })),
        valor_total: total,
        valor_entrada: Number(entrada || 0),
        parcelas: parcelas.map(p => ({ valor: Number(p.valor), data_vencimento: p.data_vencimento })),

        forma_entrada: formaEntrada,
        conta_entrada_id: contaEntrada,
        conta_parcelas_id: contaParcelas,
        data_entrada: dataEntrada,
        observacoes,
      });
      setMensagem(result.message || "Acordo cadastrado com sucesso.");
      setSelecionadas([]); setValorTotal(""); setEntrada("0"); setQuantidade("1");
      setParcelas([{ valor: "0", data_vencimento: hoje() }]); setOutrasDividas([]); setObservacoes("");
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível salvar o acordo."); }
    finally { setSalvando(false); }
  }

  return <div className="min-h-screen bg-slate-50">
    <MenuLateralPadrao />
    <div className="lg:pl-[220px]"><CabecalhoPadrao />
      <main className="mx-auto max-w-7xl space-y-6 p-4 pt-20 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Financeiro • Administração</p><h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-slate-900"><Handshake className="h-7 w-7" /> Acordos de mensalidades</h1><p className="mt-1 text-sm text-slate-600">Selecione as mensalidades vencidas e organize a renegociação.</p></div>
          <button onClick={() => void carregar()} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-semibold"><RefreshCw className="h-4 w-4" /> Atualizar</button>
        </div>
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
        {mensagem && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensagem}</div>}
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold text-slate-800">1. Mensalidades vencidas</h2><div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar sócio..." className="rounded-lg border py-2 pl-9 pr-3 text-sm"/></div></div>
          {carregando ? <p className="py-8 text-center text-sm text-slate-500">Carregando mensalidades...</p> : visiveis.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Nenhuma mensalidade vencida disponível para acordo.</p> :
          <div className="max-h-[360px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3"></th><th className="p-3">Sócio</th><th className="p-3">Competência</th><th className="p-3">Vencimento</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{visiveis.map(m=><tr key={m.id} className="border-t hover:bg-slate-50"><td className="p-3"><input type="checkbox" checked={selecionadas.includes(m.id)} disabled={Boolean(socioSelecionadoId && socioSelecionadoId !== m.socio_id)} onChange={()=>alternar(m.id)}/></td><td className="p-3 font-medium">{m.socio?.nome || "Sócio não encontrado"}<div className="text-xs text-slate-500">{m.socio?.matricula || ""}</div></td><td className="p-3">{dataBr(m.competencia).slice(3)}</td><td className="p-3">{dataBr(m.data_vencimento)}</td><td className="p-3 text-right">{moeda(m.valor)}</td></tr>)}</tbody></table></div>}
          <div className="mt-3 text-sm text-slate-600">Mensalidades: <b>{escolhidas.length}</b> • Total selecionado: <b>{moeda(totalSelecionado)}</b></div>
        </section>
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-800">2. Condições do acordo</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">Valor negociado total<input type="number" min="0.01" step="0.01" value={valorTotal || (totalSelecionado ? totalSelecionado.toFixed(2) : "")} onChange={e=>setValorTotal(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
            <label className="text-sm font-medium">Entrada<input type="number" min="0" step="0.01" value={entrada} onChange={e=>atualizarEntrada(String(Math.max(0, Math.trunc(Number(e.target.value || 0)))))} step="1" inputMode="numeric" className="mt-1 w-full rounded-lg border p-2"/></label>
            <label className="text-sm font-medium">Quantidade de parcelas<input type="number" min="1" max="24" value={quantidade} onChange={e=>atualizarQuantidade(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
          </div>
          <div className="mt-4 rounded-lg border border-dashed p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">Outras dívidas (além das mensalidades)</h3><button type="button" onClick={()=>setOutrasDividas(a=>[...a,{descricao:"",valor:""}])} className="rounded border px-3 py-1 text-xs font-semibold">+ Adicionar dívida</button></div>{outrasDividas.length===0?<p className="text-xs text-slate-500">Nenhuma outra dívida adicionada.</p>:outrasDividas.map((d,i)=><div key={i} className="mb-2 grid gap-2 md:grid-cols-[1fr_180px_auto]"><input value={d.descricao} onChange={e=>setOutrasDividas(a=>a.map((x,j)=>j===i?{...x,descricao:e.target.value}:x))} placeholder="Descrição da dívida" className="rounded border p-2 text-sm"/><input type="number" min="0.01" step="0.01" value={d.valor} onChange={e=>setOutrasDividas(a=>a.map((x,j)=>j===i?{...x,valor:e.target.value}:x))} placeholder="Valor (R$)" className="rounded border p-2 text-sm"/><button type="button" onClick={()=>setOutrasDividas(a=>a.filter((_,j)=>j!==i))} className="rounded border px-3 text-sm text-red-600">Remover</button></div>)}</div><div className="mt-4 space-y-2">{parcelas.map((p,i)=><div key={i} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-3"><div className="text-sm font-semibold">Parcela {i+1}</div><label className="text-xs font-semibold text-slate-600">Valor<input type="number" min="0.01" step="0.01" value={p.valor} onChange={e=>setParcelas(a=>a.map((x,j)=>j===i?{...x,valor:e.target.value}:x))} className="mt-1 w-full rounded border bg-white p-2 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Vencimento<input type="date" value={p.data_vencimento} onChange={e=>setParcelas(a=>a.map((x,j)=>j===i?{...x,data_vencimento:e.target.value}:x))} className="mt-1 w-full rounded border bg-white p-2 text-sm"/></label></div>)}</div>
          <div className="mt-3 text-right text-sm text-slate-600">Saldo parcelado: <b>{moeda(parcelas.reduce((s,p)=>s+Number(p.valor||0),0))}</b></div>
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2"><div className="text-sm"><span className="block text-xs font-semibold text-slate-500">Forma de pagamento das parcelas</span><span className="mt-1 block rounded border bg-slate-50 p-2 font-semibold">Boleto</span></div><label className="text-xs font-semibold">Conta de destino das parcelas<select value={contaParcelas} onChange={e=>setContaParcelas(e.target.value)} className="mt-1 w-full rounded border bg-white p-2 text-sm"><option value="">Selecione a conta</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:""}</option>)}</select></label></div>
          <div className="mt-5 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={entradaRecebida} disabled={Number(entrada) <= 0} onChange={e=>setEntradaRecebida(e.target.checked)}/> Registrar a entrada como já recebida</label>
            {Number(entrada) > 0 && <label className="mt-3 block max-w-xs text-xs font-semibold">{entradaRecebida ? "Data do recebimento" : "Vencimento da entrada"}<input type="date" value={dataEntrada} onChange={e=>setDataEntrada(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm"/></label>}{Number(entrada) > 0 && <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold">Conta de recebimento<select value={contaEntrada} onChange={e=>setContaEntrada(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm"><option value="">Selecione</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco? ` — ${c.banco}`:""}</option>)}</select></label><label className="text-xs font-semibold">Forma de pagamento<select value={formaEntrada} onChange={e=>setFormaEntrada(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm">{[["pix","PIX"],["cheque","Cheque"],["boleto","Boleto"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>}
          </div>
          <label className="mt-4 block text-sm font-medium">Observações<textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2"/></label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-600">Valor total: <b>{moeda(Number(valorTotal || totalSelecionado))}</b> • Entrada: <b>{moeda(Number(entrada || 0))}</b></div><button disabled={salvando || carregando || !selecionadas.length} onClick={()=>void salvar()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{salvando?"Salvando...":"Cadastrar acordo"}</button></div>
        </section>
      </main>
    </div>
  </div>;
}
