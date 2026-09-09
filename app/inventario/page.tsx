"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Box, Camera, CheckCircle2, ClipboardList, PackagePlus, RotateCcw, Search, Users } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

type Item = { id: string; nome: string; categoria: string; quantidade_total: number; quantidade_disponivel: number; unidade: string; estado_conservacao: string; localizacao: string | null; numero_patrimonio: string | null; emprestimo_permitido: boolean; ativo: boolean; observacoes: string | null; foto_url?: string | null };
type Socio = { id: string; nome: string; matricula: string | null };
type Emprestimo = { id: string; item_id: string; socio_id: string; quantidade: number; data_emprestimo: string; data_prevista_devolucao: string | null; data_devolucao: string | null; status: string; responsavel_emprestimo: string | null; responsavel_devolucao: string | null; observacoes: string | null; item?: { nome: string } | null; socio?: { nome: string; matricula: string | null } | null };

const estadoOpcoes = ["Novo", "Excelente", "Bom", "Regular", "Danificado"];

export default function InventarioPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [aba, setAba] = useState<"itens" | "emprestimos">("itens");
  const [busca, setBusca] = useState("");
  const [modalItem, setModalItem] = useState(false);
  const [modalEmprestimo, setModalEmprestimo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [itemForm, setItemForm] = useState({ nome: "", categoria: "Esporte", quantidade_total: 1, unidade: "unidade", estado_conservacao: "Bom", localizacao: "", numero_patrimonio: "", emprestimo_permitido: true, observacoes: "" });
  const [fotoItem, setFotoItem] = useState<File | null>(null);
  const [previaFoto, setPreviaFoto] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [empForm, setEmpForm] = useState({ item_id: "", socio_id: "", quantidade: 1, data_prevista_devolucao: "", observacoes: "" });

  async function carregar() {
    setCarregando(true); setErro("");
    try {
      const r = await fetch("/api/inventario", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || "Erro ao carregar inventário.");
      setItens(data.itens || []); setSocios(data.socios || []); setEmprestimos(data.emprestimos || []);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); }
    finally { setCarregando(false); }
  }
  useEffect(() => { void carregar(); }, []);

  const itensFiltrados = useMemo(() => itens.filter((i) => `${i.nome} ${i.categoria} ${i.numero_patrimonio || ""}`.toLowerCase().includes(busca.toLowerCase())), [itens, busca]);
  const emprestimosAtivos = emprestimos.filter((e) => e.status === "emprestado" || e.status === "atrasado");

  function abrirItem() { setErro(""); setItemForm({ nome: "", categoria: "Esporte", quantidade_total: 1, unidade: "unidade", estado_conservacao: "Bom", localizacao: "", numero_patrimonio: "", emprestimo_permitido: true, observacoes: "" }); setFotoItem(null); setPreviaFoto(""); setModalItem(true); }
  function abrirEmprestimo() { setErro(""); setEmpForm({ item_id: itens.find((i) => i.emprestimo_permitido && i.quantidade_disponivel > 0)?.id || "", socio_id: "", quantidade: 1, data_prevista_devolucao: "", observacoes: "" }); setModalEmprestimo(true); }

  function selecionarFotoItem(file: File | null) {
    setFotoItem(file);
    setPreviaFoto(file ? URL.createObjectURL(file) : "");
  }

  async function salvarItem(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro("");
    try {
      let foto_url: string | null = null;

      if (fotoItem) {
        setEnviandoFoto(true);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Sessão expirada. Entre novamente no sistema.");
        const formData = new FormData();
        formData.append("file", fotoItem);
        const uploadResponse = await fetch("/api/inventario/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: formData,
        });
        const uploadData = await uploadResponse.json();
        setEnviandoFoto(false);
        if (!uploadResponse.ok) throw new Error(uploadData?.error || "Não foi possível enviar a foto.");
        foto_url = uploadData.url || null;
      }

      const r = await fetch("/api/inventario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "criar_item", ...itemForm, quantidade_disponivel: itemForm.quantidade_total, foto_url }) });
      const data = await r.json(); if (!r.ok) throw new Error(data?.error || "Não foi possível cadastrar o item.");
      setMensagem("Item cadastrado com sucesso."); setModalItem(false); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao salvar item."); }
    finally { setSalvando(false); }
  }

  async function salvarEmprestimo(e: React.FormEvent) {
    e.preventDefault(); setSalvando(true); setErro("");
    try {
      if (!empForm.item_id || !empForm.socio_id) throw new Error("Selecione o item e o associado.");
      const r = await fetch("/api/inventario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "emprestar", ...empForm, responsavel: "Administração" }) });
      const data = await r.json(); if (!r.ok) throw new Error(data?.error || "Não foi possível registrar o empréstimo.");
      setMensagem("Empréstimo registrado e vinculado ao associado."); setModalEmprestimo(false); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao registrar empréstimo."); }
    finally { setSalvando(false); }
  }

  async function devolver(id: string) {
    if (!confirm("Confirmar a devolução deste item?")) return;
    const r = await fetch("/api/inventario", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "devolver", id, responsavel: "Administração" }) });
    const data = await r.json(); if (!r.ok) setErro(data?.error || "Não foi possível registrar a devolução."); else { setMensagem("Devolução registrada."); await carregar(); }
  }

  return <div className="min-h-screen bg-[#f8faf9] text-[#17382c]"><CabecalhoPadrao /><MenuLateralPadrao /><main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8"><div className="mx-auto max-w-[1400px] space-y-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-sm text-gray-500">Administração</p><h1 className="text-3xl font-extrabold text-[#005a3c]">Inventário</h1><p className="mt-1 text-sm text-gray-500">Controle de materiais, equipamentos e empréstimos aos associados.</p></div><div className="flex gap-2"><button onClick={abrirItem} className="rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white"><PackagePlus className="mr-2 inline h-4 w-4" />Novo item</button><button onClick={abrirEmprestimo} className="rounded-xl bg-[#064b9b] px-4 py-3 font-extrabold text-white"><ArrowLeftRight className="mr-2 inline h-4 w-4" />Novo empréstimo</button></div></div>
    {mensagem && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-700">{mensagem}</div>}{erro && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-700">{erro}</div>}
    <div className="grid gap-4 md:grid-cols-3"><div className="rounded-2xl border bg-white p-5 shadow-sm"><Box className="text-[#005a3c]"/><div className="mt-2 text-3xl font-extrabold">{itens.length}</div><div className="text-sm text-gray-500">Tipos de itens</div></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><ClipboardList className="text-[#064b9b]"/><div className="mt-2 text-3xl font-extrabold">{itens.reduce((s,i)=>s+i.quantidade_disponivel,0)}</div><div className="text-sm text-gray-500">Unidades disponíveis</div></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><Users className="text-[#8a6700]"/><div className="mt-2 text-3xl font-extrabold">{emprestimosAtivos.length}</div><div className="text-sm text-gray-500">Empréstimos ativos</div></div></div>
    <div className="flex gap-2"><button onClick={()=>setAba("itens")} className={`rounded-xl px-4 py-2.5 font-bold ${aba==="itens"?"bg-[#005a3c] text-white":"bg-white shadow-sm"}`}>Itens</button><button onClick={()=>setAba("emprestimos")} className={`rounded-xl px-4 py-2.5 font-bold ${aba==="emprestimos"?"bg-[#005a3c] text-white":"bg-white shadow-sm"}`}>Empréstimos</button></div>
    {aba==="itens" && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center gap-2 rounded-xl border px-3"><Search className="h-4 w-4 text-gray-400"/><input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar item, categoria ou patrimônio..." className="w-full py-3 outline-none"/></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase"><tr><th className="p-3">Foto</th><th className="p-3">Item</th><th className="p-3">Categoria</th><th className="p-3">Total</th><th className="p-3">Disponível</th><th className="p-3">Estado</th><th className="p-3">Empréstimo</th></tr></thead><tbody className="divide-y">{itensFiltrados.map(i=><tr key={i.id}><td className="p-3">{i.foto_url ? <img src={i.foto_url} alt={i.nome} className="h-12 w-12 rounded-lg object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#e8f3ee]"><Box className="h-5 w-5 text-[#005a3c]" /></div>}</td><td className="p-3"><b>{i.nome}</b>{i.numero_patrimonio&&<div className="text-xs text-gray-500">Patrimônio: {i.numero_patrimonio}</div>}</td><td className="p-3">{i.categoria}</td><td className="p-3">{i.quantidade_total} {i.unidade}</td><td className="p-3 font-extrabold text-[#005a3c]">{i.quantidade_disponivel}</td><td className="p-3">{i.estado_conservacao}</td><td className="p-3">{i.emprestimo_permitido?<span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">Permitido</span>:<span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">Bloqueado</span>}</td></tr>)}</tbody></table>{!itensFiltrados.length&&!carregando&&<div className="py-10 text-center text-gray-500">Nenhum item cadastrado.</div>}</div></section>}
    {aba==="emprestimos" && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-extrabold text-[#005a3c]">Histórico de empréstimos</h2><p className="text-sm text-gray-500">Cada empréstimo fica vinculado ao associado que retirou o item.</p></div></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-[#e8f3ee] text-xs font-extrabold uppercase"><tr><th className="p-3">Item</th><th className="p-3">Associado</th><th className="p-3">Qtd.</th><th className="p-3">Retirada</th><th className="p-3">Devolução prevista</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead><tbody className="divide-y">{emprestimos.map(e=><tr key={e.id}><td className="p-3 font-bold">{e.item?.nome||"—"}</td><td className="p-3">{e.socio?.matricula?`${e.socio.matricula} · `:""}{e.socio?.nome||"—"}</td><td className="p-3">{e.quantidade}</td><td className="p-3">{new Date(e.data_emprestimo).toLocaleDateString("pt-BR")}</td><td className="p-3">{e.data_prevista_devolucao?new Date(e.data_prevista_devolucao+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td><td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-bold ${e.status==="devolvido"?"bg-green-100 text-green-700":e.status==="atrasado"?"bg-red-100 text-red-700":"bg-yellow-100 text-yellow-700"}`}>{e.status}</span></td><td className="p-3">{(e.status==="emprestado"||e.status==="atrasado")&&<button onClick={()=>devolver(e.id)} className="rounded-lg border px-3 py-2 font-bold"><RotateCcw className="mr-1 inline h-4 w-4"/>Devolver</button>}</td></tr>)}</tbody></table>{!emprestimos.length&&!carregando&&<div className="py-10 text-center text-gray-500">Nenhum empréstimo registrado.</div>}</div></section>}
    <div className="rounded-2xl bg-[#003d2b] p-5 text-white"><b>Exemplo: bola de futebol</b><div className="mt-1 text-sm text-white/80">Cadastre a bola no inventário, informe a quantidade e, quando um associado retirar, registre o empréstimo selecionando o associado. Na devolução, a disponibilidade volta automaticamente.</div></div>
  </div></main>

  {modalItem&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><form onSubmit={salvarItem} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-2xl font-extrabold text-[#005a3c]">Cadastrar item</h2><div className="mt-4 grid gap-4 md:grid-cols-2">
    <label className="md:col-span-2">
      <span className="text-xs font-bold uppercase text-gray-500">Foto do item</span>
      <div className="mt-1 flex flex-col items-center gap-4 rounded-xl border border-dashed border-gray-300 bg-[#fafcfb] p-4 sm:flex-row">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white">
          {previaFoto ? <img src={previaFoto} alt="Prévia do item" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-gray-300" />}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <label className="cursor-pointer rounded-xl bg-[#005a3c] px-4 py-2.5 text-sm font-bold text-white">
            <Camera className="mr-2 inline h-4 w-4" />Tirar foto / escolher
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => selecionarFotoItem(e.target.files?.[0] || null)} />
          </label>
          {previaFoto && <button type="button" onClick={() => selecionarFotoItem(null)} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600">Remover foto</button>}
        </div>
      </div>
    </label>
    <label><span className="text-xs font-bold uppercase text-gray-500">Nome do item</span><input required value={itemForm.nome} onChange={e=>setItemForm({...itemForm,nome:e.target.value})} className="mt-1 w-full rounded-xl border p-3" placeholder="Ex.: Bola de futebol"/></label><label><span className="text-xs font-bold uppercase text-gray-500">Categoria</span><input value={itemForm.categoria} onChange={e=>setItemForm({...itemForm,categoria:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label><span className="text-xs font-bold uppercase text-gray-500">Quantidade</span><input type="number" min="1" required value={itemForm.quantidade_total} onChange={e=>setItemForm({...itemForm,quantidade_total:Math.max(1,Number(e.target.value))})} className="mt-1 w-full rounded-xl border p-3"/></label><label><span className="text-xs font-bold uppercase text-gray-500">Unidade</span><input value={itemForm.unidade} onChange={e=>setItemForm({...itemForm,unidade:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label><span className="text-xs font-bold uppercase text-gray-500">Estado</span><select value={itemForm.estado_conservacao} onChange={e=>setItemForm({...itemForm,estado_conservacao:e.target.value})} className="mt-1 w-full rounded-xl border bg-white p-3">{estadoOpcoes.map(x=><option key={x}>{x}</option>)}</select></label><label><span className="text-xs font-bold uppercase text-gray-500">Número de patrimônio</span><input value={itemForm.numero_patrimonio} onChange={e=>setItemForm({...itemForm,numero_patrimonio:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label><label className="md:col-span-2"><span className="text-xs font-bold uppercase text-gray-500">Localização</span><input value={itemForm.localizacao} onChange={e=>setItemForm({...itemForm,localizacao:e.target.value})} className="mt-1 w-full rounded-xl border p-3" placeholder="Ex.: Depósito do clube"/></label><label className="md:col-span-2"><span className="text-xs font-bold uppercase text-gray-500">Observações</span><textarea value={itemForm.observacoes} onChange={e=>setItemForm({...itemForm,observacoes:e.target.value})} className="mt-1 w-full rounded-xl border p-3" rows={3}/></label><label className="md:col-span-2 flex items-center gap-2 font-bold"><input type="checkbox" checked={itemForm.emprestimo_permitido} onChange={e=>setItemForm({...itemForm,emprestimo_permitido:e.target.checked})}/>Pode ser emprestado</label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setModalItem(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={salvando} className="rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white">{salvando?(enviandoFoto?"Enviando foto...":"Salvando..."):"Cadastrar item"}</button></div></form></div>}
  {modalEmprestimo&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><form onSubmit={salvarEmprestimo} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><h2 className="text-2xl font-extrabold text-[#005a3c]">Novo empréstimo</h2><p className="mt-1 text-sm text-gray-500">Vincule o item ao associado que retirou.</p><label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Item disponível</span><select required value={empForm.item_id} onChange={e=>setEmpForm({...empForm,item_id:e.target.value})} className="mt-1 w-full rounded-xl border bg-white p-3"><option value="">Selecione</option>{itens.filter(i=>i.emprestimo_permitido&&i.quantidade_disponivel>0).map(i=><option key={i.id} value={i.id}>{i.nome} · disponível: {i.quantidade_disponivel}</option>)}</select></label><label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Associado</span><select required value={empForm.socio_id} onChange={e=>setEmpForm({...empForm,socio_id:e.target.value})} className="mt-1 w-full rounded-xl border bg-white p-3"><option value="">Selecione o associado</option>{socios.map(s=><option key={s.id} value={s.id}>{s.matricula?`${s.matricula} · `:""}{s.nome}</option>)}</select></label><div className="mt-4 grid gap-4 md:grid-cols-2"><label><span className="text-xs font-bold uppercase text-gray-500">Quantidade</span><input type="number" min="1" required value={empForm.quantidade} onChange={e=>setEmpForm({...empForm,quantidade:Math.max(1,Number(e.target.value))})} className="mt-1 w-full rounded-xl border p-3"/></label><label><span className="text-xs font-bold uppercase text-gray-500">Devolução prevista</span><input type="date" value={empForm.data_prevista_devolucao} onChange={e=>setEmpForm({...empForm,data_prevista_devolucao:e.target.value})} className="mt-1 w-full rounded-xl border p-3"/></label></div><label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Observações</span><textarea value={empForm.observacoes} onChange={e=>setEmpForm({...empForm,observacoes:e.target.value})} className="mt-1 w-full rounded-xl border p-3" rows={3}/></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setModalEmprestimo(false)} className="rounded-xl border px-4 py-3 font-bold">Cancelar</button><button disabled={salvando} className="rounded-xl bg-[#064b9b] px-5 py-3 font-extrabold text-white">{salvando?"Registrando...":"Registrar empréstimo"}</button></div></form></div>}
  </div>;
}

