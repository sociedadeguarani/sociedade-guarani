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
  const [socios, setSocios] = useState<Socio[]>([]);
  const [socioManualId, setSocioManualId] = useState("");
  const [contas, setContas] = useState<Conta[]>([]);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [dezembro2026, setDezembro2026] = useState<{ valor: number; data_vencimento: string } | null>(null);
  const [dezembroSelecionado, setDezembroSelecionado] = useState(false);
  const [carregandoDezembro, setCarregandoDezembro] = useState(false);
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
      setDezembroSelecionado(false);
      setDezembro2026(null);
      setSocios(result.socios || []);
      setContas(result.contas || []);
      setContaEntrada(atual => atual || result.contas?.[0]?.id || "");
      setContaParcelas(atual => atual || result.contas?.[0]?.id || "");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar acordos."); }
    finally { setCarregando(false); }
  }, [api]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    let ativo = true;
    async function carregarDezembro() {
      setDezembro2026(null);
      setDezembroSelecionado(false);
      if (!socioManualId) return;
      if (mensalidades.some(m => m.socio_id === socioManualId && m.competencia.slice(0, 7) === "2026-12")) return;
      setCarregandoDezembro(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Sessão expirada.");
        const response = await fetch("/api/mensalidades/admin", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "previsualizar", ano: 2026, mes: 12, socio_ids: [socioManualId] }),
          cache: "no-store",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Não foi possível calcular dezembro/2026.");
        const item = (result.itens || []).find((x: { id: string }) => x.id === socioManualId);
        if (ativo && item) setDezembro2026({ valor: Number(item.total_cobrado ?? item.valor_base ?? 0), data_vencimento: item.data_vencimento });
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : "Falha ao calcular dezembro/2026.");
      } finally {
        if (ativo) setCarregandoDezembro(false);
      }
    }
    void carregarDezembro();
    return () => { ativo = false; };
  }, [socioManualId, mensalidades]);

  const sociosEncontrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return socios.slice(0, 30);
    return socios.filter(s => `${s.nome} ${s.matricula || ""} ${s.cpf || ""}`.toLowerCase().includes(termo)).slice(0, 30);
  }, [socios, busca]);
  const visiveis = useMemo(() => mensalidades.filter(m =>
    socioManualId ? m.socio_id === socioManualId : false
  ), [mensalidades, socioManualId]);
  const escolhidas = mensalidades.filter(m => selecionadas.includes(m.id));
  const totalOriginal = escolhidas.reduce((s, m) => s + Number(m.valor || 0), 0);
  const totalOutrasDividas = outrasDividas.reduce((s, d) => s + Number(d.valor || 0), 0);
  const totalSelecionado = totalOriginal + totalOutrasDividas;
  const socioSelecionadoId = escolhidas[0]?.socio_id || socioManualId;

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
    const totalComDezembro = totalSelecionado + (dezembroSelecionado && dezembro2026 ? dezembro2026.valor : 0);
    const total = Number(valorTotal || totalComDezembro);
    if (!socioSelecionadoId) { setErro("Selecione o sócio do acordo."); return; }
    if (!selecionadas.length && !dezembroSelecionado && !outrasDividas.some(d => d.descricao.trim() && Number(d.valor) > 0)) { setErro("Selecione mensalidades, dezembro/2026 ou informe ao menos outra dívida."); return; }
    if (!Number.isInteger(Number(entrada)) || total <= 0 || Number(entrada) > total) { setErro("Confira o valor total e a entrada."); return; }
    if (Number(entrada) > 0 && (!contaEntrada || !["pix","cheque","debito_em_conta","dinheiro"].includes(formaEntrada))) { setErro("Selecione a conta que receberá a entrada."); return; }
    if (parcelas.some(p => Number(p.valor) > 0) && !contaParcelas) { setErro("Selecione a conta que receberá as parcelas."); return; }
    setSalvando(true);
    try {
      const result = await api("POST", {
        socio_id: escolhidas[0]?.socio_id || socioManualId,
        mensalidade_ids: selecionadas,
        competencias_futuras: dezembroSelecionado && dezembro2026 ? [{ competencia: "2026-12-01", valor: dezembro2026.valor, data_vencimento: dezembro2026.data_vencimento }] : [],
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
      setSelecionadas([]); setSocioManualId(""); setBusca(""); setDezembroSelecionado(false); setDezembro2026(null); setValorTotal(""); setEntrada("0"); setQuantidade("1");
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
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <div className="relative">
              <label className="text-sm font-semibold">Buscar sócio por nome, matrícula ou CPF</label>
              <div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/><input value={busca} onChange={e=>{setBusca(e.target.value);setSocioManualId("");setSelecionadas([]);}} placeholder="Digite o nome ou matrícula do sócio..." className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"/></div>
              {busca.trim() && !socioManualId && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-white shadow-lg">{sociosEncontrados.length ? sociosEncontrados.map(s=><button type="button" key={s.id} onClick={()=>{setSocioManualId(s.id);setBusca(`${s.nome} — ${s.matricula || "Sem matrícula"}`);setSelecionadas([]);}} className="block w-full border-b px-3 py-2 text-left text-sm hover:bg-slate-50">{s.nome}<span className="block text-xs text-slate-500">Matrícula: {s.matricula || "Sem matrícula"}{s.cpf ? ` • CPF: ${s.cpf}` : ""}</span></button>) : <p className="p-3 text-sm text-slate-500">Nenhum sócio encontrado.</p>}</div>}
            </div>
            <div className="flex items-end justify-between gap-2"><p className="text-sm text-slate-600">{socioManualId ? "Mensalidades disponíveis do sócio selecionado" : "Selecione um sócio para visualizar as mensalidades."}</p>{socioManualId && <button type="button" onClick={()=>{setSocioManualId("");setBusca("");setSelecionadas([]);}} className="text-xs font-semibold text-emerald-700">Trocar sócio</button>}</div>
          </div>
          {carregando ? <p className="py-8 text-center text-sm text-slate-500">Carregando mensalidades...</p> : !socioManualId ? <p className="py-8 text-center text-sm text-slate-500">Pesquise e selecione um sócio para ver as mensalidades dele.</p> : visiveis.length === 0 && !dezembro2026 ? <p className="py-8 text-center text-sm text-slate-500">Nenhuma mensalidade em aberto disponível para acordo.</p> :
          <div className="max-h-[360px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-100 text-xs uppercase text-slate-600"><tr><th className="p-3"></th><th className="p-3">Sócio</th><th className="p-3">Competência</th><th className="p-3">Vencimento</th><th className="p-3 text-right">Valor</th></tr></thead><tbody>{visiveis.map(m=><tr key={m.id} className="border-t hover:bg-slate-50"><td className="p-3"><input type="checkbox" checked={selecionadas.includes(m.id)} disabled={Boolean(socioSelecionadoId && socioSelecionadoId !== m.socio_id)} onChange={()=>alternar(m.id)}/></td><td className="p-3 font-medium">{m.socio?.nome || "Sócio não encontrado"}<div className="text-xs text-slate-500">{m.socio?.matricula || ""}</div></td><td className="p-3">{dataBr(m.competencia).slice(3)}</td><td className="p-3">{dataBr(m.data_vencimento)}</td><td className="p-3 text-right">{moeda(m.valor)}</td></tr>)}</tbody></table></div>}
          {socioManualId && (carregandoDezembro ? <p className="mt-3 text-sm text-slate-500">Calculando competência de dezembro/2026...</p> : dezembro2026 ? <label className="mt-3 flex items-center gap-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-3 text-sm"><input type="checkbox" checked={dezembroSelecionado} onChange={e=>setDezembroSelecionado(e.target.checked)}/><span className="flex-1"><b>Dezembro/2026</b><span className="block text-xs text-slate-600">Competência ainda não gerada • Vencimento {dataBr(dezembro2026.data_vencimento)}</span></span><b>{moeda(dezembro2026.valor)}</b></label> : null)}
          <div className="mt-3 text-sm text-slate-600">Mensalidades: <b>{escolhidas.length + (dezembroSelecionado ? 1 : 0)}</b> • Total selecionado: <b>{moeda(totalSelecionado + (dezembroSelecionado && dezembro2026 ? dezembro2026.valor : 0))}</b></div>
        </section>
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 font-bold text-slate-800">2. Condições do acordo</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium">Valor negociado total<input type="number" min="0.01" step="0.01" value={valorTotal || (totalSelecionado ? totalSelecionado.toFixed(2) : "")} onChange={e=>setValorTotal(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
            <label className="text-sm font-medium">Entrada<input type="number" min="0" step="1" value={entrada} onChange={e=>atualizarEntrada(String(Math.max(0, Math.trunc(Number(e.target.value || 0)))))} inputMode="numeric" className="mt-1 w-full rounded-lg border p-2"/></label>
            <label className="text-sm font-medium">Quantidade de parcelas<input type="number" min="1" max="24" value={quantidade} onChange={e=>atualizarQuantidade(e.target.value)} className="mt-1 w-full rounded-lg border p-2"/></label>
          </div>
          <div className="mt-4 rounded-lg border border-dashed p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">Outras dívidas (além das mensalidades)</h3><button type="button" onClick={()=>setOutrasDividas(a=>[...a,{descricao:"",valor:""}])} className="rounded border px-3 py-1 text-xs font-semibold">+ Adicionar dívida</button></div>{outrasDividas.length===0?<p className="text-xs text-slate-500">Nenhuma outra dívida adicionada.</p>:outrasDividas.map((d,i)=><div key={i} className="mb-2 grid gap-2 md:grid-cols-[1fr_180px_auto]"><input value={d.descricao} onChange={e=>setOutrasDividas(a=>a.map((x,j)=>j===i?{...x,descricao:e.target.value}:x))} placeholder="Descrição da dívida" className="rounded border p-2 text-sm"/><input type="number" min="0.01" step="0.01" value={d.valor} onChange={e=>setOutrasDividas(a=>a.map((x,j)=>j===i?{...x,valor:e.target.value}:x))} placeholder="Valor (R$)" className="rounded border p-2 text-sm"/><button type="button" onClick={()=>setOutrasDividas(a=>a.filter((_,j)=>j!==i))} className="rounded border px-3 text-sm text-red-600">Remover</button></div>)}</div><div className="mt-4 space-y-2">{parcelas.map((p,i)=><div key={i} className="grid items-end gap-3 rounded-lg bg-slate-50 p-3 md:grid-cols-3"><div className="text-sm font-semibold">Parcela {i+1}</div><label className="text-xs font-semibold text-slate-600">Valor<input type="number" min="0.01" step="0.01" value={p.valor} onChange={e=>setParcelas(a=>a.map((x,j)=>j===i?{...x,valor:e.target.value}:x))} className="mt-1 w-full rounded border bg-white p-2 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Vencimento<input type="date" value={p.data_vencimento} onChange={e=>setParcelas(a=>a.map((x,j)=>j===i?{...x,data_vencimento:e.target.value}:x))} className="mt-1 w-full rounded border bg-white p-2 text-sm"/></label></div>)}</div>
          <div className="mt-3 text-right text-sm text-slate-600">Saldo parcelado: <b>{moeda(parcelas.reduce((s,p)=>s+Number(p.valor||0),0))}</b></div>
          <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2"><div className="text-sm"><span className="block text-xs font-semibold text-slate-500">Forma de pagamento das parcelas</span><span className="mt-1 block rounded border bg-slate-50 p-2 font-semibold">Boleto</span></div><label className="text-xs font-semibold">Conta de destino das parcelas<select value={contaParcelas} onChange={e=>setContaParcelas(e.target.value)} className="mt-1 w-full rounded border bg-white p-2 text-sm"><option value="">Selecione a conta</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco?` — ${c.banco}`:""}</option>)}</select></label></div>
          <div className="mt-5 rounded-lg border p-3">
            {Number(entrada) > 0 && <p className="text-sm font-semibold text-emerald-700">Entrada recebida à vista</p>}
            {Number(entrada) > 0 && <label className="mt-3 block max-w-xs text-xs font-semibold">Data do recebimento<input type="date" value={dataEntrada} onChange={e=>setDataEntrada(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm"/></label>}{Number(entrada) > 0 && <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold">Conta de recebimento<select value={contaEntrada} onChange={e=>setContaEntrada(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm"><option value="">Selecione</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco? ` — ${c.banco}`:""}</option>)}</select></label><label className="text-xs font-semibold">Forma de pagamento<select value={formaEntrada} onChange={e=>setFormaEntrada(e.target.value)} className="mt-1 w-full rounded border p-2 text-sm">{[["pix","PIX"],["cheque","Cheque"],["debito_em_conta","Débito"],["dinheiro","Dinheiro"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>}
          </div>
          <label className="mt-4 block text-sm font-medium">Observações<textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border p-2"/></label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-600">Valor total: <b>{moeda(Number(valorTotal || totalSelecionado))}</b> • Entrada: <b>{moeda(Number(entrada || 0))}</b></div><button disabled={salvando || carregando || !socioSelecionadoId || (!selecionadas.length && !dezembroSelecionado && !outrasDividas.some(d=>d.descricao.trim() && Number(d.valor)>0))} onClick={()=>void salvar()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4"/>{salvando?"Salvando...":"Cadastrar acordo"}</button></div>
        </section>
      </main>
    </div>
  </div>;
}
