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

function rotuloCategoria(socio: Socio) {
  const tipo = normalizar(categoriaSocio(socio));
  if (tipo.includes("dependente") && tipo.includes("contribuinte")) return "Sócio Dependente Contribuinte";
  if (tipo.includes("dependente") && tipo.includes("patrimonial")) return "Sócio Dependente Patrimonial";
  if (tipo.includes("contribuinte")) return "Sócio Contribuinte";
  if (tipo.includes("patrimonial")) return "Sócio Patrimonial";
  if (tipo.includes("transitorio") || tipo.includes("temporario")) return "Sócio Transitório";
  if (tipo.includes("remido")) return "Sócio Remido";
  if (tipo.includes("temporada")) return "Temporada";
  return "Associado";
}

function rotuloDependente(titular: Socio) {
  const tipo = rotuloCategoria(titular);
  if (tipo.includes("Contribuinte")) return "Sócio Dependente Contribuinte";
  if (tipo.includes("Patrimonial")) return "Sócio Dependente Patrimonial";
  return "Sócio Dependente";
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
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"cartoes" | "lista">("cartoes");
  const [preparandoImpressao, setPreparandoImpressao] = useState(false);
  const [selecionadasIds, setSelecionadasIds] = useState<string[]>([]);
  const [feedback, setFeedback] = useState("");
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
      const dependentesFamilia = dependentes.filter((d) => d.ativo !== false && normalizar(d.situacao) !== "inativo" && idsFamilia.has(String(d.socio_id)));
      const sobrenome = ultimoSobrenome(titular.nome);
      resultado.push({
        id: raizId,
        titular,
        membrosSocios: membros.filter((m) => String(m.id) !== raizId).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        dependentes: dependentesFamilia.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
        categoria: rotuloCategoria(titular),
        sobrenome,
        letra: normalizar(sobrenome).charAt(0).toUpperCase() || "#",
      });
    }

    return resultado.sort((a, b) => a.sobrenome.localeCompare(b.sobrenome, "pt-BR") || a.titular.nome.localeCompare(b.titular.nome, "pt-BR"));
  }, [socios, dependentes]);

  const categorias = useMemo(() => {
    const tipos: string[] = socios.filter(ativo).map(rotuloCategoria);
    familias.forEach((familia) => {
      if (familia.dependentes.length) tipos.push(rotuloDependente(familia.titular));
    });
    return Array.from(new Set(tipos)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [socios, familias]);

  const familiasFiltradas = useMemo(() => {
    const termo = normalizar(busca);
    return familias.filter((familia) => {
      const passaCategoria = categoriaSelecionada === "__todos__"
        || [familia.titular, ...familia.membrosSocios].some((socio) => rotuloCategoria(socio) === categoriaSelecionada)
        || (familia.dependentes.length > 0 && rotuloDependente(familia.titular) === categoriaSelecionada);
      if (!passaCategoria) return false;
      if (!termo) return true;

      const pessoasFamilia = [
        familia.titular,
        ...familia.membrosSocios,
        ...familia.dependentes,
      ];
      return pessoasFamilia.some((pessoa) =>
        normalizar(pessoa.nome).includes(termo)
        || normalizar(pessoa.matricula).includes(termo)
      );
    });
  }, [familias, categoriaSelecionada, busca]);

  const pessoas = useMemo<PessoaCarteira[]>(() => {
    const baseUrl = origem;
    const itens: PessoaCarteira[] = [];
    for (const familia of familiasFiltradas) {
      const raiz = familia.titular;
      itens.push({
        id: String(raiz.id), nome: raiz.nome, matricula: String(raiz.matricula || "—"), cpf: formatarCpf(raiz.cpf),
        fotoUrl: raiz.foto_url || "", tipo: rotuloCategoria(raiz), detalhe: "Titular",
        qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(raiz.id)}`,
      });
      for (const membro of familia.membrosSocios) {
        itens.push({
          id: String(membro.id), nome: membro.nome, matricula: String(membro.matricula || "—"), cpf: formatarCpf(membro.cpf),
          fotoUrl: membro.foto_url || "", tipo: rotuloCategoria(membro), detalhe: membro.parentesco || "Familiar",
          qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(membro.id)}`,
        });
      }
      for (const dependente of familia.dependentes) {
        itens.push({
          id: String(dependente.id), nome: dependente.nome, matricula: String(dependente.matricula || "—"), cpf: formatarCpf(dependente.cpf),
          fotoUrl: dependente.foto_url || "", tipo: rotuloDependente(raiz), detalhe: dependente.parentesco || "Familiar",
          qrValue: `${baseUrl}/acessos/validar?id=${encodeURIComponent(dependente.id)}`,
        });
      }
    }
    return itens;
  }, [familiasFiltradas, origem]);

  const pessoasSelecionadas = useMemo(
    () => pessoas.filter((pessoa) => selecionadasIds.includes(pessoa.id)),
    [pessoas, selecionadasIds],
  );
  const todasSelecionadas = pessoas.length > 0 && pessoasSelecionadas.length === pessoas.length;

  const alternarSelecaoPessoa = useCallback((id: string) => {
    setSelecionadasIds((atuais) => atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]);
  }, []);

  const selecionarTodas = useCallback(() => {
    setSelecionadasIds((atuais) => pessoas.length > 0 && pessoas.every((pessoa) => atuais.includes(pessoa.id))
      ? []
      : pessoas.map((pessoa) => pessoa.id));
  }, [pessoas]);

  const paginasCartoes = useMemo(() => {
    const paginas: PessoaCarteira[][] = [];
    for (let i = 0; i < pessoasSelecionadas.length; i += 10) paginas.push(pessoasSelecionadas.slice(i, i + 10));
    return paginas;
  }, [pessoasSelecionadas]);

  const imprimir = useCallback((destino: "cartoes" | "lista") => {
    if (destino === "cartoes" && !pessoasSelecionadas.length) {
      setErro("Marque pelo menos uma carteirinha para imprimir.");
      return;
    }
    setErro("");
    setFeedback("");
    setModo(destino);
    setPreparandoImpressao(true);
  }, [pessoasSelecionadas.length]);

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
  }, [preparandoImpressao, modo, categoriaSelecionada, pessoasSelecionadas]);

  const montarArquivoSvg = useCallback(async (pessoa: PessoaCarteira) => {
    const elemento = Array.from(document.querySelectorAll<HTMLElement>("[data-print-card]"))
      .find((item) => item.getAttribute("data-print-card") === pessoa.id);
    const qr = elemento?.querySelector(".qr-export svg") as SVGSVGElement | null;
    if (!qr) throw new Error("Não foi possível preparar o QR Code desta carteirinha. Tente novamente.");

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
    const fonteNome = pessoa.nome.length > 32 ? 20 : pessoa.nome.length > 25 ? 23 : 28;
    const textoNome = pessoa.nome.length > 25
      ? `<text x="245" y="210" font-family="Arial,sans-serif" font-size="${fonteNome}" font-weight="900" fill="#17382c" textLength="420" lengthAdjust="spacingAndGlyphs">${xml(pessoa.nome)}</text>`
      : `<text x="245" y="210" font-family="Arial,sans-serif" font-size="${fonteNome}" font-weight="900" fill="#17382c">${xml(pessoa.nome)}</text>`;
    const documento = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="856" height="540" viewBox="0 0 856 540"><rect width="856" height="540" rx="30" fill="#ffffff" stroke="#17382c" stroke-width="10"/><path d="M25 35 Q25 25 40 25 H816 Q831 25 831 40 V145 H25 Z" fill="${cor}"/><image href="${xml(logoHref)}" x="52" y="48" width="72" height="72" preserveAspectRatio="xMidYMid meet"/><text x="145" y="76" font-family="Arial,sans-serif" font-size="17" font-weight="700" fill="#ffffff">SOCIEDADE RECREATIVA GUARANI</text><text x="145" y="116" font-family="Arial,sans-serif" font-size="26" font-weight="900" fill="#ffffff">CARTEIRA DE ASSOCIADO</text>${foto}${textoNome}<text x="245" y="265" font-family="Arial,sans-serif" font-size="20" fill="#555">Matrícula: ${xml(pessoa.matricula)}</text><text x="245" y="305" font-family="Arial,sans-serif" font-size="18" fill="#555">CPF: ${xml(pessoa.cpf || "—")}</text><rect x="245" y="335" width="400" height="44" rx="12" fill="${cor}"/><text x="445" y="364" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="700" fill="#ffffff">${xml(pessoa.tipo)}</text><text x="245" y="410" font-family="Arial,sans-serif" font-size="15" fill="#555">${xml(pessoa.detalhe)}</text>${qrSvg}</svg>`;
    const blob = new Blob([documento], { type: "image/svg+xml;charset=utf-8" });
    return { blob, nomeBase: `carteirinha-${pessoa.matricula.replace(/[^a-zA-Z0-9_-]/g, "") || pessoa.id}` };
  }, []);

  const converterSvgParaPng = useCallback(async (svgBlob: Blob) => {
    const url = URL.createObjectURL(svgBlob);
    try {
      const imagem = new Image();
      imagem.src = url;
      await new Promise<void>((resolve, reject) => {
        imagem.onload = () => resolve();
        imagem.onerror = () => reject(new Error("Não foi possível montar a imagem da carteirinha."));
      });
      const canvas = document.createElement("canvas");
      canvas.width = 1712;
      canvas.height = 1080;
      const contexto = canvas.getContext("2d");
      if (!contexto) throw new Error("Não foi possível preparar a imagem para exportação.");
      contexto.fillStyle = "#ffffff";
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((resultado) => resultado ? resolve(resultado) : reject(new Error("Falha ao gerar a imagem PNG.")), "image/png"));
      return png;
    } finally {
      URL.revokeObjectURL(url);
    }
  }, []);

  const baixarPng = useCallback(async (pessoa: PessoaCarteira) => {
    try {
      const { blob: svgBlob, nomeBase } = await montarArquivoSvg(pessoa);
      const pngBlob = await converterSvgParaPng(svgBlob);
      const url = URL.createObjectURL(pngBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${nomeBase}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setFeedback(`Carteirinha de ${pessoa.nome} exportada em PNG.`);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível exportar a carteirinha.");
    }
  }, [montarArquivoSvg, converterSvgParaPng]);

  const compartilharWhatsApp = useCallback(async (pessoa: PessoaCarteira) => {
    // Abre a guia no gesto do usuário para evitar bloqueio de pop-up após a geração do arquivo.
    let abaWhatsApp: Window | null = window.open("about:blank", "_blank");
    if (abaWhatsApp) abaWhatsApp.opener = null;
    try {
      const { blob: svgBlob, nomeBase } = await montarArquivoSvg(pessoa);
      const blob = await converterSvgParaPng(svgBlob);
      const nomeArquivo = `${nomeBase}.png`;
      const arquivo = new File([blob], nomeArquivo, { type: "image/png" });
      const mensagem = `Carteirinha digital de ${pessoa.nome} · Matrícula ${pessoa.matricula}.`;

      if (navigator.share && navigator.canShare?.({ files: [arquivo] })) {
        if (abaWhatsApp && !abaWhatsApp.closed) abaWhatsApp.close();
        await navigator.share({ title: "Carteirinha Sociedade Guarani", text: mensagem, files: [arquivo] });
        setFeedback("Compartilhamento aberto. Selecione o WhatsApp para enviar a carteirinha.");
        setErro("");
        return;
      }

      // No desktop sem compartilhamento de arquivos, baixa o PNG e abre o WhatsApp Web
      // com a mensagem pronta; o usuário anexa o arquivo baixado na conversa.
      const urlArquivo = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = urlArquivo;
      link.download = nomeArquivo;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(urlArquivo), 5000);
      const destinoWhatsApp = `https://wa.me/?text=${encodeURIComponent(`${mensagem} Estou anexando a carteirinha digital.`)}`;
      if (abaWhatsApp && !abaWhatsApp.closed) abaWhatsApp.location.href = destinoWhatsApp;
      else abaWhatsApp = window.open(destinoWhatsApp, "_blank", "noopener,noreferrer");
      setFeedback("Carteirinha PNG baixada. No WhatsApp que abriu, anexe o arquivo baixado para enviar.");
      setErro("");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        if (abaWhatsApp && !abaWhatsApp.closed) abaWhatsApp.close();
        return;
      }
      setErro(e instanceof Error ? e.message : "Não foi possível preparar o envio pelo WhatsApp.");
      if (abaWhatsApp && !abaWhatsApp.closed) abaWhatsApp.close();
    }
  }, [montarArquivoSvg, converterSvgParaPng]);

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
                <div className="mt-5 rounded-xl border border-[#d7e8df] bg-[#fbfdfc] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-[#005a3c]">Carteirinhas do tipo selecionado</div>
                      <div className="text-xs text-gray-500">Marque as pessoas que deseja imprimir ou use Exportar / WhatsApp ao lado de cada nome.</div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-bold text-[#005a3c]">
                      <input type="checkbox" checked={todasSelecionadas} onChange={selecionarTodas} disabled={!pessoas.length || preparandoImpressao} className="h-4 w-4 accent-[#005a3c]" />
                      Selecionar todas
                    </label>
                  </div>
                  <div className="mt-3">
                    <label htmlFor="buscar-carteirinha" className="mb-1.5 block text-xs font-bold text-[#005a3c]">Buscar associado</label>
                    <div className="flex items-center gap-2">
                      <input
                        id="buscar-carteirinha"
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Digite o nome ou a matrícula..."
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/15"
                      />
                      {busca && <button type="button" onClick={() => setBusca("")} className="shrink-0 rounded-lg border px-3 py-2 text-xs font-bold text-gray-600">Limpar busca</button>}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">{pessoasSelecionadas.length} de {pessoas.length} selecionada(s)</span>
                    <button type="button" onClick={() => imprimir("cartoes")} disabled={!pessoasSelecionadas.length || preparandoImpressao} className="inline-flex items-center gap-2 rounded-lg bg-[#005a3c] px-4 py-2 text-sm font-black text-white hover:bg-[#00442f] disabled:cursor-not-allowed disabled:opacity-50"><Printer className="h-4 w-4" /> Imprimir selecionadas</button>
                    <button type="button" onClick={() => setSelecionadasIds([])} disabled={!selecionadasIds.length || preparandoImpressao} className="rounded-lg border px-3 py-2 text-xs font-bold text-gray-600 disabled:opacity-40">Limpar seleção</button>
                    <button type="button" onClick={() => imprimir("lista")} disabled={!familiasFiltradas.length || preparandoImpressao} className="inline-flex items-center gap-2 rounded-lg border border-[#005a3c] px-4 py-2 text-sm font-black text-[#005a3c] hover:bg-[#f1f7f4] disabled:cursor-not-allowed disabled:opacity-50"><FileText className="h-4 w-4" /> Imprimir lista</button>
                  </div>
                  <div className="mt-3 max-h-[520px] divide-y overflow-y-auto rounded-lg border bg-white">
                    {!pessoas.length ? (
                      <div className="px-4 py-8 text-center text-sm text-gray-500">Nenhum associado encontrado para essa busca.</div>
                    ) : pessoas.map((pessoa) => (
                      <div key={pessoa.id} className="flex flex-wrap items-center gap-3 px-3 py-3 sm:flex-nowrap">
                        <input type="checkbox" aria-label={`Selecionar carteirinha de ${pessoa.nome}`} checked={selecionadasIds.includes(pessoa.id)} onChange={() => alternarSelecaoPessoa(pessoa.id)} disabled={preparandoImpressao} className="h-4 w-4 shrink-0 accent-[#005a3c]" />
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-gray-100">
                          {pessoa.fotoUrl ? <img src={pessoa.fotoUrl} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-lg">👤</div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-[#17382c]">{pessoa.nome}</div>
                          <div className="mt-0.5 text-xs text-gray-500">Matrícula: <b>{pessoa.matricula}</b> · {pessoa.detalhe}</div>
                          <div className="mt-0.5 text-xs font-semibold text-[#005a3c]">{pessoa.tipo}</div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button type="button" onClick={() => void baixarPng(pessoa)} disabled={preparandoImpressao} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><Download className="h-3.5 w-3.5" /> Exportar PNG</button>
                          <button type="button" onClick={() => void compartilharWhatsApp(pessoa)} disabled={preparandoImpressao} className="inline-flex items-center gap-1.5 rounded-lg bg-[#16834a] px-3 py-2 text-xs font-bold text-white hover:bg-[#116b3c] disabled:opacity-50">WhatsApp</button>
                        </div>
                        <div className="absolute -left-[99999px] top-0 h-0 w-0 overflow-hidden" aria-hidden="true" data-print-card={pessoa.id}>
                          <div className="qr-export"><QRCodeSVG value={pessoa.qrValue} size={100} includeMargin /></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {feedback && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{feedback}</p>}
                {preparandoImpressao && <p className="mt-3 text-xs font-semibold text-emerald-700">Preparando a impressão com fotos e QR Codes...</p>}
              </>
            )}
          </section>

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
                        <div className="print-card-info mt-2 inline-block max-w-full rounded px-2 py-1 text-[9px] font-bold text-white" style={{ background: cor }}>{pessoa.tipo}</div>
                      </div>
                      <div className="qr-export shrink-0"><QRCodeSVG className="print-card-qr h-20 w-20" value={pessoa.qrValue} size={100} includeMargin /></div>
                    </div>
                  </article>;
                })}
              </section>
            ))}

            {modo === "lista" && preparandoImpressao && <section className="print-list-page space-y-5 bg-white p-6">
              <header className="mb-4 border-b-2 border-[#005a3c] pb-3">
                <h2 className="text-xl font-black text-[#005a3c]">SOCIEDADE RECREATIVA GUARANI</h2>
                <div className="mt-1 text-sm font-bold">Lista alfabética de associados e dependentes ativos</div>
                <div className="mt-1 text-xs text-gray-600">{categoriaSelecionada === "__todos__" ? "Todos os tipos ativos" : categoriaSelecionada} · {familiasFiltradas.length} família(s)</div>
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
