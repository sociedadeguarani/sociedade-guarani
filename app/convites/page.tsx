"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Convite = {
  id: string;
  socio_id: string | null;
  nome_convidado: string;
  documento_convidado: string | null;
  cidade_convidado: string | null;
  data_inicio: string;
  data_fim: string | null;
  tipo: "diario" | "semanal" | "mensal";
  valor: number;
  status: "pendente" | "pago" | "utilizado" | "cancelado";
  forma_pagamento: string | null;
  comprovante_url: string | null;
  created_at: string;
};

type Socio = { id: string; nome: string; matricula: number | null };
type Conta = { id: string; nome: string; banco: string | null };

const hoje = () => new Date().toISOString().slice(0, 10);
const moeda = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (v: string | null) => v ? v.slice(0, 10).split("-").reverse().join("/") : "—";

export default function ConvitesPage() {
  const [convites, setConvites] = useState<Convite[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [busca, setBusca] = useState("");
  const [abrir, setAbrir] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({ socio_id: "", nome: "", documento: "", cidade: "", inicio: hoje(), fim: "", tipo: "diario", valor: "30", pagamento: "dinheiro", conta_id: "" });

  const ehAugusto = form.cidade.trim().toLowerCase() === "augusto pestana";
  const acessoAgua = !ehAugusto;

  useEffect(() => {
    async function carregar() {
      const [{ data: c }, { data: s }, { data: b }] = await Promise.all([
        supabase.from("convites").select("*").order("created_at", { ascending: false }),
        supabase.from("socios").select("id,nome,matricula").order("nome", { ascending: true }),
        supabase.from("contas_bancarias").select("id,nome,banco").eq("ativo", true).order("nome", { ascending: true }),
      ]);
      setConvites((c || []) as Convite[]); setSocios((s || []) as Socio[]); setContas((b || []) as Conta[]);
    }
    void carregar();
  }, []);

  function atualizarCidade(v: string) {
    const valor = form.tipo === "semanal" ? (v.trim().toLowerCase() === "augusto pestana" ? "30" : "120") : "30";
    setForm((f) => ({ ...f, cidade: v, valor }));
  }

  function atualizarTipo(tipo: string) {
    setForm((f) => ({ ...f, tipo, fim: tipo === "diario" ? "" : f.fim, valor: tipo === "semanal" ? (f.cidade.trim().toLowerCase() === "augusto pestana" ? "30" : "120") : "30" }));
  }

  async function salvar() {
    if (!form.nome.trim()) return setMensagem("Informe o nome do convidado.");
    if (!form.cidade.trim()) return setMensagem("Informe a cidade do convidado.");
    setSalvando(true); setMensagem("");
    try {
      const inicio = form.inicio || hoje();
      const fim = form.tipo === "diario" ? inicio : form.fim || (form.tipo === "semanal" ? new Date(new Date(inicio).getTime() + 6 * 86400000).toISOString().slice(0,10) : null);
      const { data, error } = await supabase.from("convites").insert({
        socio_id: form.socio_id || null,
        nome_convidado: form.nome.trim(), documento_convidado: form.documento || null,
        cidade_convidado: form.cidade.trim(), data_inicio: inicio, data_fim: fim,
        tipo: form.tipo, valor: Number(form.valor || 0), status: form.pagamento === "pix" ? "pendente" : "pago",
        forma_pagamento: form.pagamento, comprovante_url: null,
      }).select("*").single();
      if (error) throw error;
      if (form.pagamento !== "pix" && form.conta_id) {
        const { error: movError } = await supabase.from("movimentacoes_financeiras").insert({
          conta_bancaria_id: form.conta_id, tipo: "entrada", categoria: "Convite",
          descricao: `Convite - ${form.nome.trim()}`, valor: Number(form.valor || 0),
          data_movimentacao: hoje(), forma_pagamento: form.pagamento,
          origem_tipo: "convite", origem_id: data.id, socio_id: form.socio_id || null,
          dependente_id: null, comprovante_url: null, conciliado: false,
          data_conciliacao: null, conta_destino_id: null, grupo_transferencia: null, observacoes: null,
        });
        if (movError) throw movError;
      }
      setConvites((lista) => [data as Convite, ...lista]);
      setAbrir(false); setMensagem("Convite registrado com sucesso.");
      setForm({ socio_id: "", nome: "", documento: "", cidade: "", inicio: hoje(), fim: "", tipo: "diario", valor: "30", pagamento: "dinheiro", conta_id: "" });
    } catch (e) { setMensagem(`Não foi possível registrar o convite. ${e instanceof Error ? e.message : ""}`); }
    finally { setSalvando(false); }
  }

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return convites.filter((c) => !t || c.nome_convidado.toLowerCase().includes(t) || String(c.documento_convidado || "").toLowerCase().includes(t) || String(c.cidade_convidado || "").toLowerCase().includes(t));
  }, [convites, busca]);

  return <main className="min-h-screen bg-[#f8faf9] text-[#173d2e]">
    <CabecalhoPadrao />
    <MenuLateralPadrao />
      <section className="min-w-0 p-5 sm:p-7 lg:ml-[220px] lg:p-8"><div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-sm font-medium text-gray-500">Administração</p><h2 className="mt-1 text-3xl font-bold text-[#005a3c]">Convites</h2><p className="mt-1 text-gray-500">Controle de convidados, pagamentos e acesso à Sociedade.</p></div><button onClick={() => { setAbrir(true); setMensagem(""); }} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white">＋ Novo convite</button></div>
        {mensagem && <div className="mb-5 rounded-xl border border-[#cfe3d8] bg-[#eef7f2] px-4 py-3 text-sm font-semibold text-[#005a3c]">{mensagem}</div>}
        <div className="mb-5 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Convites</p><p className="mt-1 text-2xl font-extrabold text-[#005a3c]">{convites.length}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Pagos</p><p className="mt-1 text-2xl font-extrabold text-[#005a3c]">{convites.filter(c=>c.status==="pago").length}</p></div><div className="rounded-2xl border bg-white p-5"><p className="text-sm text-gray-500">Pendentes</p><p className="mt-1 text-2xl font-extrabold text-[#b65308]">{convites.filter(c=>c.status==="pendente").length}</p></div></div>
        <div className="rounded-2xl border border-[#dfe7e2] bg-white shadow-sm"><div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-xl font-extrabold text-[#003d2b]">Convidados registrados</h3><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar convidado..." className="rounded-xl border border-[#d5e0da] px-4 py-2 outline-none focus:border-[#005a3c]"/></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase text-[#275044]"><tr><th className="p-4">Convidado</th><th className="p-4">Cidade</th><th className="p-4">Período</th><th className="p-4">Valor</th><th className="p-4">Acesso à água</th><th className="p-4">Status</th><th className="p-4">QR</th></tr></thead><tbody className="divide-y divide-[#e5ece8]">{filtrados.map(c=><tr key={c.id}><td className="p-4 font-bold">{c.nome_convidado}</td><td className="p-4">{c.cidade_convidado || "—"}</td><td className="p-4">{dataBR(c.data_inicio)}{c.data_fim && ` a ${dataBR(c.data_fim)}`}</td><td className="p-4 font-bold text-[#005a3c]">{moeda(c.valor)}</td><td className="p-4">{String(c.cidade_convidado||"").toLowerCase()==="augusto pestana" ? <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-700">Parque • sem piscina</span> : <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Liberado</span>}</td><td className="p-4"><span className={`rounded-full px-3 py-1 text-xs font-bold ${c.status==="pago"?"bg-green-100 text-green-700":c.status==="pendente"?"bg-yellow-100 text-yellow-700":"bg-gray-100 text-gray-600"}`}>{c.status}</span></td><td className="p-4"><a className="font-bold text-[#005a3c] underline" href={`/acessos?qr=guarani:convite:${c.id}`}>Abrir validação</a></td></tr>)}</tbody></table></div></div>
      </section>
    {abrir && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001f16]/60 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-6 py-5"><h2 className="text-2xl font-bold text-[#005a3c]">Novo convite</h2><button onClick={()=>setAbrir(false)} className="rounded-full bg-gray-100 px-3 py-2">✕</button></div><div className="grid gap-4 p-6 md:grid-cols-2"><div className="md:col-span-2"><label className="mb-1 block text-sm font-bold">Associado responsável</label><select value={form.socio_id} onChange={e=>setForm({...form,socio_id:e.target.value})} className="w-full rounded-xl border px-4 py-3"><option value="">Não informado / portaria</option>{socios.map(s=><option key={s.id} value={s.id}>{s.nome} — matrícula {s.matricula||"—"}</option>)}</select></div><div><label className="mb-1 block text-sm font-bold">Nome do convidado</label><input value={form.nome} onChange={e=>setForm({...form,nome:e.target.value})} className="w-full rounded-xl border px-4 py-3"/></div><div><label className="mb-1 block text-sm font-bold">Documento</label><input value={form.documento} onChange={e=>setForm({...form,documento:e.target.value})} className="w-full rounded-xl border px-4 py-3"/></div><div><label className="mb-1 block text-sm font-bold">Cidade</label><input value={form.cidade} onChange={e=>atualizarCidade(e.target.value)} placeholder="Augusto Pestana" className="w-full rounded-xl border px-4 py-3"/></div><div><label className="mb-1 block text-sm font-bold">Tipo</label><select value={form.tipo} onChange={e=>atualizarTipo(e.target.value)} className="w-full rounded-xl border px-4 py-3"><option value="diario">Diário</option><option value="semanal">7 dias</option></select></div><div><label className="mb-1 block text-sm font-bold">Início</label><input type="date" value={form.inicio} onChange={e=>setForm({...form,inicio:e.target.value})} className="w-full rounded-xl border px-4 py-3"/></div><div><label className="mb-1 block text-sm font-bold">Fim</label><input type="date" disabled={form.tipo==="diario"} value={form.fim} onChange={e=>setForm({...form,fim:e.target.value})} className="w-full rounded-xl border px-4 py-3 disabled:bg-gray-100"/></div><div><label className="mb-1 block text-sm font-bold">Valor</label><input type="number" step="0.01" value={form.valor} onChange={e=>setForm({...form,valor:e.target.value})} className="w-full rounded-xl border px-4 py-3"/></div><div><label className="mb-1 block text-sm font-bold">Pagamento</label><select value={form.pagamento} onChange={e=>setForm({...form,pagamento:e.target.value})} className="w-full rounded-xl border px-4 py-3"><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option></select></div>{form.pagamento !== "pix" && <div className="md:col-span-2"><label className="mb-1 block text-sm font-bold">Conta para receber</label><select value={form.conta_id} onChange={e=>setForm({...form,conta_id:e.target.value})} className="w-full rounded-xl border px-4 py-3"><option value="">Selecione a conta</option>{contas.map(c=><option key={c.id} value={c.id}>{c.nome}{c.banco ? ` — ${c.banco}` : ""}</option>)}</select></div>}<div className="md:col-span-2 rounded-2xl bg-[#f0f7f3] p-4"><p className="font-extrabold text-[#005a3c]">Regra de acesso</p><p className="mt-1 text-sm text-gray-600">{acessoAgua ? "Convidado de outra cidade: acesso liberado à água conforme as regras do clube." : "Convidado de Augusto Pestana: acesso somente ao parque, sem piscina."}</p></div><div className="md:col-span-2 flex justify-end gap-2"><button onClick={()=>setAbrir(false)} className="rounded-xl border px-5 py-3 font-bold">Cancelar</button><button disabled={salvando} onClick={()=>void salvar()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-bold text-white disabled:opacity-60">{salvando?"Salvando...":"Cadastrar convite"}</button></div></div></div></div>}
  </main>;
}

