"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { ArrowLeft, Download, FileText, Loader2, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import MenuLateralPadrao from "../../components/MenuLateralPadrao";
import CabecalhoPadrao from "../../components/CabecalhoPadrao";

type Socio = {
  id: string;
  matricula?: number | string | null;
  nome: string;
  cpf?: string | null;
  categoria?: string | null;
  tipo_socio?: string | null;
  situacao?: string | null;
  responsavel_id?: string | null;
  parentesco?: string | null;
  foto_url?: string | null;
};

type Dependente = {
  id: string;
  socio_id: string;
  matricula?: number | string | null;
  nome: string;
  cpf?: string | null;
  parentesco?: string | null;
  ativo?: boolean | null;
  foto_url?: string | null;
  situacao?: string | null;
};

type PessoaCarteira = {
  id: string;
  nome: string;
  matricula: string;
  cpf: string;
  fotoUrl: string;
  tipo: string;
  detalhe: string;
  qrValue: string;
};

type Familia = {
  id: string;
  titular: Socio;
  membrosSocios: Socio[];
  dependentes: Dependente[];
  categoria: string;
  sobrenome: string;
  letra: string;
};

function normalizar(valor: unknown) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function ativo(socio: Socio) {
  // Mantém a mesma regra da tela de consulta: apenas a situação explicitamente
  // INATIVO impede a emissão. Bloqueio financeiro não transforma o associado em inativo.
  return normalizar(socio.situacao) !== "inativo";
}

function categoriaSocio(socio: Socio) {
  return String(socio.tipo_socio || socio.categoria || "Associado").trim() || "Associado";
}

function ultimoSobrenome(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return partes.length > 1 ? partes[partes.length - 1] : (partes[0] || "#");
}

function chaveFamilia(socio: Socio, sociosPorId: Map<string, Socio>, sociosPorMatricula: Map<string, Socio>) {
  let atual = socio;
  const visitados = new Set<string>();
  while (atual.responsavel_id && !visitados.has(String(atual.id))) {
    visitados.add(String(atual.id));
    const responsavel = sociosPorId.get(String(atual.responsavel_id));
    if (!responsavel || !ativo(responsavel)) return null;
    atual = responsavel;
  }

  if (atual === socio) {
    const matricula = String(socio.matricula || "").trim().toUpperCase();
    const sufixo = matricula.slice(-1);
    if (/^[B-Z]$/.test(sufixo)) {
      const titular = sociosPorMatricula.get(`${matricula.slice(0, -1)}A`);
      if (titular && ativo(titular)) atual = titular;
    }
  }
  return String(atual.id);
}

function formatarCpf(valor?: string | null) {
  if (!valor) return "";
  const digitos = String(valor).replace(/\D/g, "");
  return digitos.length === 11
    ? `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`
    : valor;
}

function corTipo(tipo: string) {
  const texto = normalizar(tipo);
  if (texto.includes("patrimonial")) return "#1769aa";
  if (texto.includes("contribuinte")) return "#18864b";
  if (texto.includes("transitorio") || texto.includes("temporario")) return "#d39a08";
  return "#005a3c";
}

function xml(valor: string) {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function ImprimirCarteirinhasPage() {
  const [socios, setSocios] = useState<Socio[]>([]);
  const [dependentes, setDependentes] = useState<Dependente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [categoriaSelecionada, setCategoriaSelecionada] = useState("__todos__");
  const [modo, setModo] = useState<"cartoes" | "lista">("cartoes");
  const [preparandoImpressao, setPreparandoImpressao] = useState(false);
  const [exportacaoId, setExportacaoId] = useState("");
  const [origem, setOrigem] = useState("");

  useEffect(() => {
    let ativoComponente = true;
    (async () => {
      try {
        setOrigem(window.location.origin);
        const { supabase } = await import("@/lib/supabaseClient");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const destino = "/carteirinhas/imprimir";
          window.location.replace(`/login?redirect=${encodeURIComponent(destino)}`);
          return;
        }
        const resposta = await fetch("/api/carteirinhas", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || "Não foi possível carregar as carteirinhas.");
        if (ativoComponente) {
          setSocios(Array.isArray(dados.socios) ? dados.socios : []);
          setDependentes(Array.isArray(dados.dependentes) ? dados.dependentes : []);
        }
      } catch (e) {
        if (ativoComponente) setErro(e instanceof Error ? e.message : "Falha ao carregar carteirinhas.");
      } finally {
        if (ativoComponente) setCarregando(false);
      }
    })();
    return () => { ativoComponente = false; };
  }, []);

  const familias = useMemo<Familia[]>(() => {
    const sociosAtivos = socios.filter(ativo);
    const sociosPorId = new Map(sociosAtivos.map((s) => [String(s.id), s]));
    const sociosPorMatricula = new Map(sociosAtivos.map((s) => [String(s.matricula || "").trim().toUpperCase(), s]));
    const grupos = new Map<string, Socio[]>();

    for (const socio of sociosAtivos) {
      const raiz = chaveFamilia(socio, sociosPorId, sociosPorMatricula);
      if (!raiz || !sociosPorId.has(raiz)) continue;
      const membros = grupos.get(raiz) || [];
      membros.push(socio);
      grupos.set(raiz, membros);
    }

    const resultado: Familia[] = [];
    for (const [raizId, membros] of grupos) {
      const titular = sociosPorId.get(raizId);
      if (!titular || !ativo(titular)) continue;
      const idsFamilia = new Set(membros.map((m) => String(m.id)));
      idsFamilia.add(raizId);
      const dependentesFamilia = dependentes.filter((d) => d.ativo !== false && idsFamilia.has(String(d.socio_id)));
      const sobrenome = ultimoSobrenome(titular.nome);
      resultado.push({
        id: raizId,
        titular,
        membrosSocios: membros.filter((m) => String(m.id) !== raizId).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        dependentes: dependentesFamilia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        categoria: categoriaSocio(titular),
        sobrenome,
        letra: normalizar(sobrenome).charAt(0).toUpperCase() || "#",
      });
    }

    return resultado.sort((a, b) => a.sobrenome.localeCompare(b.sobrenome, "pt-BR") || a.titular.nome.localeCompare(b.titular.nome, "pt-BR"));
  }, [socios, dependentes]);

  const categorias = useMemo(() => Array.from(new Set(socios.filter(ativo).map(categoriaSocio))).sort((a, b) => a.localeCompare(b, "pt-BR")), [socios]);

  const familiasFiltradas = useMemo(() => categoriaSelecionada === "__todos__"
    ? familias
    : familias.filter((familia) => [familia.titular, ...familia.membrosSocios].some((socio) => categoriaSocio(socio) === categoriaSelecionada)), [familias, categoriaSelecionada]);

  const pessoas = useMemo<PessoaCarteira[]>(() => {
    const baseUrl = origem;
    const itens: PessoaCarteira[] = [];
    for (const familia of familiasFiltradas) {
      const raiz = familia.titular;
      itens.push({
        id: String(raiz.id), nome: raiz.nome, matricula: String(raiz.matricula || "—"), cpf: formatarCpf(raiz.cpf),
        fotoUrl: raiz.foto_url || "", tipo: categoriaSocio(raiz), detalhe: "Titular",
        qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(raiz.id)}`,
      });
      for (const membro of familia.membrosSocios) {
        itens.push({
          id: String(membro.id), nome: membro.nome, matricula: String(membro.matricula || "—"), cpf: formatarCpf(membro.cpf),
          fotoUrl: membro.foto_url || "", tipo: categoriaSocio(membro), detalhe: membro.parentesco || "Familiar",
          qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(membro.id)}`,
        });
      }
      for (const dependente of familia.dependentes) {
        itens.push({
          id: String(dependente.id), nome: dependente.nome, matricula: String(dependente.matricula || "—"), cpf: formatarCpf(dependente.cpf),
          fotoUrl: dependente.foto_url || "", tipo: "Dependente", detalhe: dependente.parentesco || "Familiar",
          qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(dependente.id)}`,
        });
      }
    }
    return itens;
  }, [familiasFiltradas, origem]);

  const paginasCartoes = useMemo(() => {
    const paginas: PessoaCarteira[][] = [];
    for (let i = 0; i < pessoas.length; i += 10) paginas.push(pessoas.slice(i, i + 10));
    return paginas;
  }, [pessoas]);

  useEffect(() => {
    if (!pessoas.length) {
      setExportacaoId("");
      return;
    }
    if (!pessoas.some((pessoa) => pessoa.id === exportacaoId)) setExportacaoId(pessoas[0].id);
  }, [pessoas, exportacaoId]);

  const imprimir = useCallback((destino: "cartoes" | "lista") => {
    setModo(destino);
    setPreparandoImpressao(true);
  }, []);

  useEffect(() => {
    if (!preparandoImpressao) return;
    let cancelado = false;
    const timer = window.setTimeout(async () => {
      const imagens = Array.from(document.querySelectorAll<HTMLImageElement>("#print-area img"));
      await Promise.all(imagens.map((imagem) => {
        if (imagem.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const concluir = () => resolve();
          imagem.addEventListener("load", concluir, { once: true });
          imagem.addEventListener("error", concluir, { once: true });
          window.setTimeout(concluir, 5000);
        });
      }));
      if (cancelado) return;
      window.print();
      setPreparandoImpressao(false);
    }, 400);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [preparandoImpressao, modo, categoriaSelecionada]);

  const exportarSvg = useCallback(async (pessoa: PessoaCarteira) => {
    const elemento = Array.from(document.querySelectorAll<HTMLElement>("[data-print-card]"))
      .find((item) => item.getAttribute("data-print-card") === pessoa.id);
    const qr = elemento?.querySelector(".qr-export svg") as SVGSVGElement | null;
    if (!qr) {
      setErro("Não foi possível preparar o QR Code desta carteirinha. Tente novamente.");
      return;
    }
    const imagemParaDataUri = async (url: string) => {
      try {
        const resposta = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!resposta.ok) return url;
        const blob = await resposta.blob();
        return await new Promise<string>((resolve) => {
          const leitor = new FileReader();
          leitor.onload = () => resolve(typeof leitor.result === "string" ? leitor.result : url);
          leitor.onerror = () => resolve(url);
          leitor.readAsDataURL(blob);
        });
      } catch {
        return url;
      }
    };
    const [logoHref, fotoHref] = await Promise.all([
      imagemParaDataUri(`${window.location.origin}/logo-guarani.png`),
      pessoa.fotoUrl ? imagemParaDataUri(pessoa.fotoUrl) : Promise.resolve(""),
    ]);
    const cor = corTipo(pessoa.tipo);
    const qrSvg = qr.outerHTML.replace(/<svg\b([^>]*)>/, (_tag, atributos: string) => `<svg${atributos.replace(/\s(width|height)="[^"]*"/g, "")} x="690" y="360" width="135" height="135">`);
    const foto = fotoHref
      ? `<image href="${xml(fotoHref)}" x="55" y="175" width="155" height="190" preserveAspectRatio="xMidYMid slice" />`
      : `<rect x="55" y="175" width="155" height="190" rx="12" fill="#edf2ef"/><text x="132" y="278" text-anchor="middle" font-size="54">👤</text>`;
    const documento = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="856" height="540" viewBox="0 0 856 540"><rect width="856" height="540" rx="30" fill="#ffffff" stroke="#17382c" stroke-width="10"/><path d="M25 35 Q25 25 40 25 H816 Q831 25 831 40 V145 H25 Z" fill="${cor}"/><image href="${xml(logoHref)}" x="52" y="48" width="72" height="72" preserveAspectRatio="xMidYMid meet"/><text x="145" y="76" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#ffffff">SOCIEDADE RECREATIVA GUARANI</text><text x="145" y="116" font-family="Arial,sans-serif" font-size="26" font-weight="900" fill="#ffffff">CARTEIRA DE ASSOCIADO</text>${foto}<text x="245" y="210" font-family="Arial,sans-serif" font-size="28" font-weight="900" fill="#17382c">${xml(pessoa.nome)}</text><text x="245" y="265" font-family="Arial,sans-serif" font-size="20" fill="#555">Matrícula: ${xml(pessoa.matricula)}</text><text x="245" y="305" font-family="Arial,sans-serif" font-size="18" fill="#555">CPF: ${xml(pessoa.cpf || "—")}</text><rect x="245" y="335" width="240" height="40" rx="12" fill="${cor}"/><text x="365" y="362" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#ffffff">${xml(pessoa.detalhe)} · ${xml(pessoa.tipo)}</text>${qrSvg}</svg>`;
    const blob = new Blob([documento], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `carteirinha-${pessoa.matricula.replace(/[^a-zA-Z0-9_-]/g, "") || pessoa.id}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  const familiasPorSobrenome = useMemo(() => {
    const mapa = new Map<string, { sobrenome: string; letra: string; familias: Familia[] }>();
    for (const familia of familiasFiltradas) {
      const chave = normalizar(familia.sobrenome);
      const atual = mapa.get(chave) || { sobrenome: familia.sobrenome, letra: familia.letra, familias: [] };
      atual.familias.push(familia);
      mapa.set(chave, atual);
    }
    return Array.from(mapa.values()).sort((a, b) => a.letra.localeCompare(b.letra, "pt-BR") || a.sobrenome.localeCompare(b.sobrenome, "pt-BR"));
  }, [familiasFiltradas]);

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <style jsx global>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute !important; inset: 0 auto auto 0 !important; width: 190mm !important; margin: 0 !important; padding: 0 !important; }
          .print-hide { display: none !important; }
          .print-page { width: 190mm !important; height: 270mm !important; display: grid !important; grid-template-columns: repeat(2, 85.6mm) !important; grid-template-rows: repeat(5, 53.98mm) !important; column-gap: 5mm !important; row-gap: 0 !important; page-break-after: always !important; break-after: page !important; overflow: hidden !important; }
          .print-page:last-child { page-break-after: auto !important; break-after: auto !important; }
          .print-card { width: 85.6mm !important; height: 53.98mm !important; border: .5mm solid #17382c !important; border-radius: 3mm !important; box-shadow: none !important; overflow: hidden !important; break-inside: avoid !important; page-break-inside: avoid !important; }
          .print-card-header { height: 13mm !important; padding: 2mm 3mm !important; }
          .print-card-logo { width: 7mm !important; height: 7mm !important; }
          .print-card-title { font-size: 6.5pt !important; }
          .print-card-subtitle { font-size: 4.5pt !important; }
          .print-card-content { height: 40.98mm !important; padding: 2.5mm !important; }
          .print-card-photo { width: 16mm !important; height: 21mm !important; }
          .print-card-name { font-size: 8pt !important; line-height: 1.1 !important; }
          .print-card-info { font-size: 5.5pt !important; line-height: 1.3 !important; }
          .print-card-qr { width: 20mm !important; height: 20mm !important; }
          .print-list-page { width: 190mm !important; color: #111 !important; background: white !important; }
          .print-list-page h2 { font-size: 15pt !important; }
          .print-list-page .list-family { break-inside: avoid !important; page-break-inside: avoid !important; }
        }
      `}</style>

      <div className="print-hide"><CabecalhoPadrao /><MenuLateralPadrao /></div>
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="print-hide flex flex-wrap items-center justify-between gap-3">
            <div>
              <a href="/carteirinhas" className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-[#005a3c] hover:underline"><ArrowLeft className="h-4 w-4" /> Voltar à consulta</a>
              <p className="text-sm text-gray-500">Carteirinhas · Impressão e relatórios</p>
              <h1 className="text-3xl font-extrabold text-[#005a3c]">Impressão e listas</h1>
              <p className="mt-1 max-w-3xl text-sm text-gray-500">Esta área separada carrega somente quando aberta. Os associados inativos e seus dependentes não entram nos cartões nem na lista.</p>
            </div>
          </div>

          {erro && <div className="print-hide rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{erro}</div>}

          <section className="print-hide rounded-2xl border bg-white p-5 shadow-sm">
            {carregando ? (
              <div className="flex items-center gap-2 py-5 text-sm font-semibold text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Carregando associados ativos...</div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(250px,360px)]">
                  <div>
                    <label htmlFor="tipo-impressao" className="mb-2 block text-sm font-black text-[#005a3c]">Tipo de associado</label>
                    <select id="tipo-impressao" value={categoriaSelecionada} onChange={(e: ChangeEvent<HTMLSelectElement>) => setCategoriaSelecionada(e.target.value)} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-sm font-semibold">
                      <option value="__todos__">Todos os tipos ativos</option>
                      {categorias.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
                    </select>
                    <p className="mt-2 text-xs text-gray-500">Ao escolher um tipo, o titular aparece junto com os sócios familiares e dependentes ativos vinculados a ele.</p>
                  </div>
                  <div className="rounded-xl bg-[#f1f7f4] p-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Resultado do filtro</div>
                    <div className="mt-1 text-2xl font-black text-[#005a3c]">{pessoas.length} carteirinha(s)</div>
                    <div className="text-sm text-gray-600">{familiasFiltradas.length} grupo(s) familiar(es) ativo(s)</div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => imprimir("cartoes")} disabled={!pessoas.length || preparandoImpressao} className="inline-flex items-center gap-2 rounded-xl bg-[#005a3c] px-5 py-3 text-sm font-black text-white hover:bg-[#00442f] disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" /> Imprimir carteirinhas</button>
                  <button type="button" onClick={() => imprimir("lista")} disabled={!familiasFiltradas.length || preparandoImpressao} className="inline-flex items-center gap-2 rounded-xl border border-[#005a3c] px-5 py-3 text-sm font-black text-[#005a3c] hover:bg-[#f1f7f4] disabled:cursor-not-allowed disabled:opacity-50"><FileText className="h-4 w-4" /> Imprimir lista alfabética</button>
                </div>
                {preparandoImpressao && <p className="mt-3 text-xs font-semibold text-emerald-700">Preparando a impressão com fotos e QR Codes...</p>}
                {exportacaoId && <div className="mt-4 rounded-xl border p-3">
                  <label htmlFor="exportar-carteira" className="mb-1 block text-xs font-black text-[#005a3c]">Exportar carteirinha digital individual</label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select id="exportar-carteira" value={exportacaoId} onChange={(e: ChangeEvent<HTMLSelectElement>) => setExportacaoId(e.target.value)} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm">
                      {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome} · {p.matricula}</option>)}
                    </select>
                    <button type="button" onClick={() => { const p = pessoas.find((pessoa) => pessoa.id === exportacaoId); if (p) exportarSvg(p); }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-bold text-white"><Download className="h-4 w-4" /> Baixar carteirinha SVG</button>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">O arquivo digital inclui a foto vinculada ao cadastro e o QR Code individual.</p>
                </div>}
              </>
            )}
          </section>

          {exportacaoId && !preparandoImpressao && (() => {
            const pessoa = pessoas.find((item) => item.id === exportacaoId);
            return pessoa ? <div className="print-hide fixed -left-[99999px] top-0" aria-hidden="true"><div data-print-card={pessoa.id}><div className="qr-export"><QRCodeSVG value={pessoa.qrValue} size={100} includeMargin /></div></div></div> : null;
          })()}

          <div id="print-area">
            {modo === "cartoes" && preparandoImpressao && paginasCartoes.map((pagina, indice) => (
              <section className="print-page" key={`pagina-${indice}`}>
                {pagina.map((pessoa) => {
                  const cor = corTipo(pessoa.tipo);
                  return <article key={pessoa.id} data-print-card={pessoa.id} className="print-card relative overflow-hidden rounded-xl border-2 border-[#17382c] bg-white shadow-sm">
                    <header className="print-card-header flex items-center gap-2 px-3 py-2" style={{ background: cor, color: "#fff" }}>
                      <img src="/logo-guarani.png" alt="Sociedade Recreativa Guarani" className="print-card-logo h-8 w-8 rounded object-contain" />
                      <div className="min-w-0"><div className="print-card-subtitle text-[7px] font-bold tracking-wider">SOCIEDADE RECREATIVA GUARANI</div><div className="print-card-title text-xs font-black">CARTEIRA DE ASSOCIADO</div></div>
                    </header>
                    <div className="print-card-content flex items-start gap-3 p-3">
                      <div className="print-card-photo h-24 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                        {pessoa.fotoUrl ? <img src={pessoa.fotoUrl} alt={pessoa.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-2xl">👤</div>}
                      </div>
                      <div className="min-w-0 flex-1 pt-1">
                        <div className="print-card-name break-words text-sm font-black leading-tight text-[#17382c]">{pessoa.nome}</div>
                        <div className="print-card-info mt-2 text-[10px] text-gray-600">Matrícula: <b>{pessoa.matricula}</b></div>
                        {pessoa.cpf && <div className="print-card-info mt-1 text-[10px] text-gray-600">CPF: <b>{pessoa.cpf}</b></div>}
                        <div className="print-card-info mt-2 inline-block rounded px-2 py-1 text-[9px] font-bold text-white" style={{ background: cor }}>{pessoa.detalhe} · {pessoa.tipo}</div>
                      </div>
                      <div className="qr-export shrink-0"><QRCodeSVG className="print-card-qr h-20 w-20" value={pessoa.qrValue} size={100} includeMargin /></div>
                    </div>
                    <button type="button" onClick={() => exportarSvg(pessoa)} className="print-hide absolute bottom-1 right-2 text-[10px] font-bold text-[#005a3c] underline">Exportar digital</button>
                  </article>;
                })}
              </section>
            ))}

            {modo === "lista" && preparandoImpressao && <section className="print-list-page space-y-5 bg-white p-6">
              <header className="mb-4 border-b-2 border-[#005a3c] pb-3">
                <h2 className="text-xl font-black text-[#005a3c]">SOCIEDADE RECREATIVA GUARANI</h2>
                <div className="mt-1 text-sm font-bold">Lista alfabética de associados e dependentes ativos</div>
                <div className="mt-1 text-xs text-gray-600">{categoriaSelecionada === "__todos__" ? "Todos os tipos" : categoriaSelecionada} · {familiasFiltradas.length} família(s)</div>
              </header>
              {familiasPorSobrenome.map((grupo) => <div key={normalizar(grupo.sobrenome)} className="space-y-2">
                <h3 className="border-b border-gray-300 pb-1 text-base font-black">{grupo.letra} — {grupo.sobrenome.toLocaleUpperCase("pt-BR")}</h3>
                {grupo.familias.map((familia) => <div key={familia.id} className="list-family border-b border-gray-100 pb-2">
                  <div className="flex justify-between gap-4 text-sm"><span className="font-bold">{familia.titular.nome}</span><span className="shrink-0 font-mono font-bold">{familia.titular.matricula || "—"}</span></div>
                  {familia.membrosSocios.map((membro) => <div key={membro.id} className="ml-5 flex justify-between gap-4 text-sm text-gray-700"><span>↳ {membro.nome} · {membro.parentesco || categoriaSocio(membro)}</span><span className="shrink-0 font-mono">{membro.matricula || "—"}</span></div>)}
                  {familia.dependentes.map((dependente) => <div key={dependente.id} className="ml-5 flex justify-between gap-4 text-sm text-gray-700"><span>↳ {dependente.nome} · {dependente.parentesco || "Dependente"}</span><span className="shrink-0 font-mono">{dependente.matricula || "—"}</span></div>)}
                </div>)}
              </div>)}
            </section>}
          </div>

          {carregando && <div className="print-hide rounded-xl border bg-white p-5 text-sm text-gray-500">Carregando dados para impressão...</div>}
          {!carregando && !erro && !familias.length && <div className="print-hide rounded-xl border bg-white p-5 text-sm text-gray-500">Nenhum associado ativo encontrado para impressão.</div>}
        </div>
      </main>
    </div>
  );
}
