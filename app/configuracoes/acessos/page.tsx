"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, Save, Settings2, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";
import {
  normalizarPoliticaInadimplencia,
  POLITICA_INADIMPLENCIA_PADRAO,
  type PoliticaInadimplencia,
} from "@/lib/politicaInadimplencia";

export default function PoliticaAcessoPage() {
  const [politica, setPolitica] = useState<PoliticaInadimplencia>(POLITICA_INADIMPLENCIA_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  async function requisicao(url: string, init: RequestInit = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      window.location.href = "/login";
      throw new Error("Sua sessão expirou. Entre novamente.");
    }

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    return fetch(url, { ...init, headers, cache: "no-store" });
  }

  async function carregar() {
    setCarregando(true);
    setErro("");
    try {
      const response = await requisicao("/api/configuracoes/acessos");
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Não foi possível carregar a configuração.");
      setPolitica(normalizarPoliticaInadimplencia(result?.politica));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar a política.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    const agendamento = window.setTimeout(() => {
      void carregar();
    }, 0);
    return () => window.clearTimeout(agendamento);
  }, []);

  async function salvar() {
    setSalvando(true);
    setErro("");
    setSucesso("");
    try {
      const response = await requisicao("/api/configuracoes/acessos", {
        method: "PATCH",
        body: JSON.stringify(politica),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Não foi possível salvar a política.");
      setPolitica(normalizarPoliticaInadimplencia(result?.politica));
      setSucesso("Política salva. A nova regra já será usada nas próximas validações da portaria e nas carteirinhas.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar a política.");
    } finally {
      setSalvando(false);
    }
  }

  const faixaVerde = `0 a ${politica.meses_atencao - 1} competência(s) vencida(s)`;
  const faixaAmarela = `${politica.meses_atencao} a ${politica.meses_bloqueio - 1} competência(s) vencida(s)`;
  const faixaVermelha = `${politica.meses_bloqueio} ou mais competências vencidas`;

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#18362b]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <main className="min-h-screen px-4 pb-10 pt-24 lg:ml-[220px] lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-500">Configurações</p>
              <h1 className="text-3xl font-black text-[#005a3c]">Política de acesso por inadimplência</h1>
              <p className="mt-1 text-sm text-gray-600">Defina a tolerância de mensalidades vencidas para a entrada no parque.</p>
            </div>
            <button onClick={() => void carregar()} disabled={carregando || salvando} className="rounded-xl border border-[#d5e0da] bg-white px-4 py-3 text-sm font-bold text-[#005a3c] disabled:opacity-50">
              Atualizar
            </button>
          </header>

          {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{erro}</div>}
          {sucesso && <div role="status" className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />{sucesso}</div>}

          <section className="rounded-2xl border border-[#dfe9e3] bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="rounded-xl bg-[#e8f3ee] p-3 text-[#005a3c]"><Settings2 className="h-6 w-6" /></div>
              <div>
                <h2 className="text-xl font-extrabold">Limites de atraso</h2>
                <p className="mt-1 text-sm text-gray-500">O padrão é 2 competências verdes, 3 em atenção e bloqueio a partir de 4.</p>
              </div>
            </div>

            {carregando ? (
              <div className="rounded-xl bg-[#f7faf8] p-8 text-center text-sm font-semibold text-gray-500">Carregando configuração…</div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="meses-atencao" className="mb-2 block text-sm font-bold">Marcar amarelo a partir de</label>
                  <select id="meses-atencao" value={politica.meses_atencao} onChange={(event) => setPolitica((current) => normalizarPoliticaInadimplencia({ ...current, meses_atencao: Number(event.target.value) }))} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c]">
                    {Array.from({ length: Math.max(1, politica.meses_bloqueio - 1) }, (_, index) => index + 1).map((months) => (
                      <option key={months} value={months}>{months} {months === 1 ? "competência vencida" : "competências vencidas"}</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">A entrada continua liberada até atingir o limite de bloqueio.</p>
                </div>
                <div>
                  <label htmlFor="meses-bloqueio" className="mb-2 block text-sm font-bold">Bloquear entrada a partir de</label>
                  <select id="meses-bloqueio" value={politica.meses_bloqueio} onChange={(event) => {
                    const next = Number(event.target.value);
                    setPolitica((current) => normalizarPoliticaInadimplencia({
                      meses_atencao: Math.min(current.meses_atencao, next - 1),
                      meses_bloqueio: next,
                    }));
                  }} className="w-full rounded-xl border border-[#d5e0da] bg-white px-4 py-3 outline-none focus:border-[#005a3c]">
                    {Array.from({ length: 11 }, (_, index) => index + 2).map((months) => (
                      <option key={months} value={months}>{months} ou mais competências vencidas</option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">Selecione 4 para bloquear quando houver quatro meses/competências vencidas ou mais.</p>
                </div>
              </div>
            )}

            <div className="mt-7 rounded-2xl border border-[#dfe9e3] bg-[#f7faf8] p-4 sm:p-5">
              <h3 className="mb-3 font-extrabold">Prévia da política</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-4 ring-1 ring-green-200">
                  <p className="text-sm font-extrabold text-green-700">🟢 Verde — em dia</p>
                  <p className="mt-1 text-sm text-gray-600">{faixaVerde}</p>
                  <p className="mt-2 text-xs font-bold text-green-700">Entrada liberada</p>
                </div>
                <div className="rounded-xl bg-white p-4 ring-1 ring-amber-200">
                  <p className="text-sm font-extrabold text-amber-700">🟡 Amarelo — atenção</p>
                  <p className="mt-1 text-sm text-gray-600">{faixaAmarela}</p>
                  <p className="mt-2 text-xs font-bold text-amber-700">Entrada liberada</p>
                </div>
                <div className="rounded-xl bg-white p-4 ring-1 ring-red-200">
                  <p className="text-sm font-extrabold text-red-700">🔴 Vermelho — crítico</p>
                  <p className="mt-1 text-sm text-gray-600">{faixaVermelha}</p>
                  <p className="mt-2 text-xs font-bold text-red-700">Entrada bloqueada</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <p>A contagem considera competências mensais distintas que venceram e ainda não foram pagas, isentas ou canceladas. O mês vigente só conta como vencido depois do vencimento cadastrado. Esta regra trata mensalidades de sócios; as parcelas de Temporada continuam seguindo sua regra própria.</p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPolitica(POLITICA_INADIMPLENCIA_PADRAO)} disabled={salvando || carregando} className="rounded-xl border border-[#d5e0da] bg-white px-5 py-3 font-bold text-[#005a3c] disabled:opacity-50">Restaurar padrão</button>
              <button type="button" onClick={() => void salvar()} disabled={salvando || carregando || Boolean(erro)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#005a3c] px-5 py-3 font-extrabold text-white disabled:opacity-50"><Save className="h-4 w-4" />{salvando ? "Salvando…" : "Salvar política"}</button>
            </div>
          </section>

          <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Alterar esta política afeta as próximas validações de sócios e dependentes na portaria e os status financeiros nas carteirinhas e relatórios. A mudança não cria, quita nem altera mensalidades existentes.</p>
          </section>
        </div>
      </main>
    </div>
  );
}

