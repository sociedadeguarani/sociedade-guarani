"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, CheckCircle2, Clock3, Search, ShieldCheck, UserRound, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

// Recurso estático do navegador: não precisa de estado mutável nem efeito.
const subscribeSemMudancas = () => () => {};
const obterSuporteLeituraQr = () =>
  typeof window !== "undefined" && "BarcodeDetector" in window;
const obterSuporteLeituraQrServidor = () => true;
type ResultadoBarcode = { rawValue?: string };
type DetectorCodigoBarras = { detect: (source: HTMLVideoElement) => Promise<ResultadoBarcode[]> };
type JanelaComDetector = Window & { BarcodeDetector?: new (options: { formats: string[] }) => DetectorCodigoBarras };

type Resultado = {
  socio?: { id: string; matricula: string | null; nome: string; situacao: string | null; categoria?: string | null; foto_url?: string | null };
  pessoa?: { id: string; matricula: string | null; nome: string; situacao: string | null; foto_url?: string | null; parentesco?: string | null };
  dependente?: { id: string; nome: string; matricula?: string | null; foto_url?: string | null; parentesco?: string | null } | null;
  perfil_operador?: string;
  alerta_diretoria_enviado?: boolean;
  temporada?: { id?: string; codigo?: string | null; inicio?: string | null; fim?: string | null } | null;
  liberado?: boolean;
  acesso?: { data_hora_entrada?: string; data_hora_saida?: string | null; autorizado?: boolean; motivo_negacao?: string | null };
  duplicado?: boolean;
  mensalidade?: { texto: string; cor: string } | null;
  exame?: { status?: { texto: string; cor: string }; validade?: string | null; verificado?: boolean } | null;
  uso_agua?: { permitido: boolean; texto: string; validade?: string | null; observacao?: string } | null;
  motivo_bloqueio?: string | null;
  status_temporada?: string;
  inadimplencia?: {
    atrasado: boolean;
    quantidade?: number;
    valorTotal?: number;
    bloqueiaEntrada?: boolean;
    precisaAlerta?: boolean;
    mesesAtencao?: number;
    mesesBloqueio?: number;
    status?: { texto: string; cor: string };
  } | null;
};

type OpcaoBuscaAcesso = {
  id: string;
  tipo: "socio" | "dependente" | "temporada";
  socio_id: string;
  dependente_id: string | null;
  temporada_id?: string | null;
  temporada_participante_id?: string | null;
  qr?: string;
  nome: string;
  matricula: string | null;
  situacao: string | null;
  categoria?: string | null;
  socio_nome?: string | null;
  parentesco?: string | null;
};

type GrupoBuscaAcesso = {
  titular: OpcaoBuscaAcesso;
  membros: OpcaoBuscaAcesso[];
};

type ResultadoAcessoLote = {
  id: string;
  nome: string;
  matricula: string | null;
  sucesso: boolean;
  liberado: boolean;
  duplicado?: boolean;
  mensagem: string;
  exame?: { status?: { texto?: string; cor?: string }; validade?: string | null } | null;
};

function chaveOpcaoAcesso(opcao: OpcaoBuscaAcesso) {
  return `${opcao.tipo}:${opcao.id}`;
}

export default function AcessosPage() {
  const router = useRouter();
  const [matricula, setMatricula] = useState("");
  const [gruposBusca, setGruposBusca] = useState<GrupoBuscaAcesso[]>([]);
  const [buscandoOpcoes, setBuscandoOpcoes] = useState(false);
  const [mensagemBusca, setMensagemBusca] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [selecionados, setSelecionados] = useState<OpcaoBuscaAcesso[]>([]);
  const [registrandoSelecionados, setRegistrandoSelecionados] = useState(false);
  const [resultadosLote, setResultadosLote] = useState<ResultadoAcessoLote[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const suportaLeituraQr = useSyncExternalStore(
    subscribeSemMudancas,
    obterSuporteLeituraQr,
    obterSuporteLeituraQrServidor
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const qrEmProcessamentoRef = useRef(false);
  const qrsLidosAteRef = useRef(new Map<string, number>());
  const audioContextRef = useRef<AudioContext | null>(null);

  async function validar(dados: { matricula?: string; qr?: string; socio_id?: string; dependente_id?: string }): Promise<Resultado | null> {
    setErro("");
    setGruposBusca([]);
    setMensagemBusca("");
    setBuscandoOpcoes(false);
    setResultado(null);
    setCarregando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirect=/acessos");
        return null;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        throw new Error("Sem conexão com a internet. O acesso não foi confirmado; verifique o Wi-Fi da portaria.");
      }
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      let r: Response;
      try {
        r = await fetch("/api/acessos", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify(dados),
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (erroFetch) {
        if (controller.signal.aborted) {
          throw new Error("A internet da portaria demorou mais de 20 segundos para responder. O sistema não confirmou o resultado. Confira a conexão antes de tentar novamente.");
        }
        throw erroFetch;
      } finally {
        window.clearTimeout(timeoutId);
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível registrar o acesso.");
      setResultado(d as Resultado);
      return d as Resultado;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao validar carteirinha.");
      return null;
    } finally {
      setCarregando(false);
    }
  }

  function opcaoEstaSelecionada(opcao: OpcaoBuscaAcesso) {
    const chave = chaveOpcaoAcesso(opcao);
    return selecionados.some((item) => chaveOpcaoAcesso(item) === chave);
  }

  function alternarSelecao(opcao: OpcaoBuscaAcesso) {
    const chave = chaveOpcaoAcesso(opcao);
    setSelecionados((atuais) => atuais.some((item) => chaveOpcaoAcesso(item) === chave)
      ? atuais.filter((item) => chaveOpcaoAcesso(item) !== chave)
      : [...atuais, opcao]);
    setResultadosLote([]);
    setErro("");
  }

  function alternarSelecaoFamilia(grupo: GrupoBuscaAcesso) {
    const pessoas = [grupo.titular, ...grupo.membros];
    const chaves = new Set(pessoas.map(chaveOpcaoAcesso));
    const familiaCompletaSelecionada = pessoas.every(opcaoEstaSelecionada);
    setSelecionados((atuais) => {
      const semFamilia = atuais.filter((item) => !chaves.has(chaveOpcaoAcesso(item)));
      return familiaCompletaSelecionada ? semFamilia : [...semFamilia, ...pessoas];
    });
    setResultadosLote([]);
    setErro("");
  }

  async function registrarAcessosSelecionados() {
    if (!selecionados.length || registrandoSelecionados) return;
    setRegistrandoSelecionados(true);
    setErro("");
    setResultado(null);
    setResultadosLote([]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirect=/acessos");
        return;
      }

      const concluidos: ResultadoAcessoLote[] = [];
      const falhas: OpcaoBuscaAcesso[] = [];
      // Envia um registro por pessoa, em sequência, para preservar as regras
      // individuais de inadimplência, exame e autorização da portaria.
      for (const pessoa of selecionados) {
        const payload = pessoa.tipo === "temporada" && pessoa.qr
          ? { qr: pessoa.qr }
          : pessoa.tipo === "dependente" && pessoa.dependente_id
            ? { socio_id: pessoa.socio_id, dependente_id: pessoa.dependente_id }
            : { socio_id: pessoa.socio_id };
        try {
          const resposta = await fetch("/api/acessos", {
            method: "POST",
            headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            cache: "no-store",
          });
          const dados = await resposta.json().catch(() => ({}));
          if (!resposta.ok) {
            falhas.push(pessoa);
            concluidos.push({
              id: chaveOpcaoAcesso(pessoa),
              nome: pessoa.nome,
              matricula: pessoa.matricula,
              sucesso: false,
              liberado: false,
              mensagem: dados.error || "Não foi possível registrar este acesso.",
            });
            continue;
          }

          const nome = dados.pessoa?.nome || dados.dependente?.nome || dados.socio?.nome || pessoa.nome;
          concluidos.push({
            id: chaveOpcaoAcesso(pessoa),
            nome,
            matricula: pessoa.matricula,
            sucesso: true,
            liberado: Boolean(dados.liberado),
            duplicado: Boolean(dados.duplicado),
            mensagem: dados.duplicado
              ? `Acesso já registrado${dados.acesso?.data_hora_entrada ? ` às ${new Date(dados.acesso.data_hora_entrada).toLocaleTimeString("pt-BR")}` : ""}. Sem duplicar.`
              : dados.liberado
                ? "Entrada registrada e liberada."
                : (dados.motivo_bloqueio || dados.acesso?.motivo_negacao || "Acesso registrado como bloqueado."),
            exame: dados.exame ?? null,
          });
        } catch (erroPessoa) {
          falhas.push(pessoa);
          concluidos.push({
            id: chaveOpcaoAcesso(pessoa),
            nome: pessoa.nome,
            matricula: pessoa.matricula,
            sucesso: false,
            liberado: false,
            mensagem: erroPessoa instanceof Error ? erroPessoa.message : "Falha de comunicação ao registrar o acesso.",
          });
        }
      }

      setResultadosLote(concluidos);
      // Mantém selecionadas apenas as pessoas cuja gravação falhou, permitindo
      // nova tentativa sem repetir registros que já foram processados.
      setSelecionados(falhas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar os acessos selecionados.");
    } finally {
      setRegistrandoSelecionados(false);
    }
  }

  async function consultarPorNomeOuMatricula() {
    const termo = matricula.trim();
    if (!termo) return;

    const pareceQr = /^(guarani:|https?:\/\/|socio:|dependente:|matricula:)/i.test(termo)
      || /\/acessos\/(validar|qr\/)/i.test(termo)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(termo);
    // QR em URL/UUID registra automaticamente. Nome/matrícula apenas pesquisam;
    // o porteiro seleciona as pessoas e confirma o lote abaixo.
    if (pareceQr) {
      await validar({ qr: termo });
      return;
    }
    if (termo.length < 3) return;

    setBuscandoOpcoes(true);
    setMensagemBusca("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login?redirect=/acessos");
        return;
      }
      const resposta = await fetch(`/api/acessos/buscar?q=${encodeURIComponent(termo)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.error || "Não foi possível pesquisar associados.");
      const grupos = Array.isArray(dados.grupos) ? dados.grupos as GrupoBuscaAcesso[] : [];
      setGruposBusca(grupos);
      setMensagemBusca(grupos.length ? "" : `Nenhum associado, dependente ou participante de temporada ativa encontrado para “${termo}”.`);
    } catch (e) {
      setGruposBusca([]);
      setMensagemBusca(e instanceof Error ? e.message : "Erro ao pesquisar associado.");
    } finally {
      setBuscandoOpcoes(false);
    }
  }

  useEffect(() => {
    const termo = matricula.trim();
    const pareceQr = /^(guarani:|https?:\/\/|socio:|dependente:|matricula:)/i.test(termo)
      || /\/acessos\/(validar|qr\/)/i.test(termo)
      || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(termo);

    if (!termo || pareceQr || termo.length < 3) return;

    let cancelado = false;
    const timeout = window.setTimeout(async () => {
      setBuscandoOpcoes(true);
      setMensagemBusca("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.push("/login?redirect=/acessos");
          return;
        }

        const resposta = await fetch(`/api/acessos/buscar?q=${encodeURIComponent(termo)}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.error || "Não foi possível pesquisar associados.");

        if (cancelado) return;
        const grupos = Array.isArray(dados.grupos) ? dados.grupos as GrupoBuscaAcesso[] : [];
        setGruposBusca(grupos);
        setMensagemBusca(grupos.length ? "" : `Nenhum associado, dependente ou participante de temporada ativa encontrado para “${termo}”.`);
      } catch (e) {
        if (!cancelado) {
          setGruposBusca([]);
          setMensagemBusca(e instanceof Error ? e.message : "Erro ao pesquisar associado.");
        }
      } finally {
        if (!cancelado) setBuscandoOpcoes(false);
      }
    }, 300);

    return () => {
      cancelado = true;
      window.clearTimeout(timeout);
    };
  }, [matricula, router]);

  const bloqueioPorInadimplencia = resultado
    ? Boolean(resultado.inadimplencia?.bloqueiaEntrada ?? resultado.status_temporada === "bloqueada")
    : false;
  const atencaoPorInadimplencia = Boolean(resultado?.inadimplencia?.precisaAlerta);
  const ehTemporada = Boolean(resultado?.temporada || resultado?.status_temporada || resultado?.socio?.categoria === "Temporada");
  const podeVerDetalhesFinanceiros = ["administrador", "administrador_master"].includes(String(resultado?.perfil_operador || ""));
  const precisaAvisarDiretoria = Boolean(resultado && (!resultado.liberado || atencaoPorInadimplencia));

  function pararCamera() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    qrEmProcessamentoRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraAberta(false);
  }

  function emitirSom(liberado: boolean) {
    try {
      const contexto = audioContextRef.current || new AudioContext();
      audioContextRef.current = contexto;
      if (contexto.state === "suspended") void contexto.resume();
      const oscilador = contexto.createOscillator();
      const volume = contexto.createGain();
      oscilador.type = "sine";
      oscilador.frequency.value = liberado ? 880 : 220;
      volume.gain.setValueAtTime(0.0001, contexto.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.12, contexto.currentTime + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + 0.22);
      oscilador.connect(volume);
      volume.connect(contexto.destination);
      oscilador.start();
      oscilador.stop(contexto.currentTime + 0.24);
    } catch {
      // O retorno visual continua disponível em navegadores sem áudio Web Audio.
    }
  }

  async function iniciarCamera() {
    setErro("");
    setResultado(null);
    if (!navigator.onLine) {
      setErro("A portaria está sem internet. Conecte-se ao Wi-Fi antes de iniciar a leitura; o QR não pode ser validado offline.");
      return;
    }
    try {
      audioContextRef.current = audioContextRef.current || new AudioContext();
      if (audioContextRef.current.state === "suspended") await audioContextRef.current.resume();
    } catch {
      // O som é complementar; a resposta visual permanece disponível.
    }
    if (!("BarcodeDetector" in window)) {
      setErro("A leitura automática de QR não está disponível neste navegador. Use um leitor USB de QR conectado ao computador e deixe o campo de busca selecionado, ou consulte pela matrícula.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraAberta(true);
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      });

      // BarcodeDetector é suportado nos navegadores modernos. O QR retorna a URL
      // /acessos/validar?id=... e a API também aceita diretamente essa URL.
      const Detector = (window as JanelaComDetector).BarcodeDetector;
      if (!Detector) throw new Error("Este navegador não oferece suporte à leitura de QR Code.");
      const detector = new Detector({ formats: ["qr_code"] });
      const ler = async () => {
        if (!videoRef.current || !streamRef.current) return;
        if (qrEmProcessamentoRef.current) {
          animationRef.current = requestAnimationFrame(ler);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          const valor = codes?.[0]?.rawValue?.trim();
          if (valor) {
            const agora = Date.now();
            for (const [codigoLido, expiracao] of qrsLidosAteRef.current) {
              if (expiracao <= agora) qrsLidosAteRef.current.delete(codigoLido);
            }
            const ignorarAte = qrsLidosAteRef.current.get(valor) || 0;
            if (ignorarAte > agora) {
              animationRef.current = requestAnimationFrame(ler);
              return;
            }

            qrEmProcessamentoRef.current = true;
            const resposta = await validar({ qr: valor });
            // Evita que o mesmo cartão parado na frente da câmera gere várias
            // tentativas. Em caso de erro, o porteiro pode liberar uma nova tentativa.
            qrsLidosAteRef.current.set(valor, Date.now() + 120000);
            emitirSom(Boolean(resposta?.liberado));
            window.setTimeout(() => {
              setResultado(null);
              if (resposta) setErro("");
              qrEmProcessamentoRef.current = false;
              if (streamRef.current) animationRef.current = requestAnimationFrame(ler);
            }, 2800);
            return;
          }
        } catch {
          // Pequenas falhas transitórias do detector não encerram a câmera.
        }
        animationRef.current = requestAnimationFrame(ler);
      };
      animationRef.current = requestAnimationFrame(ler);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível acessar a câmera.");
      pararCamera();
    }
  }

  useEffect(() => () => pararCamera(), []);

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      <CabecalhoPadrao />
      <MenuLateralPadrao />
      <main className="min-h-[calc(100vh-76px)] px-3 pb-28 pt-4 sm:px-4 sm:py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto w-full max-w-5xl space-y-4 sm:space-y-6">
          <div className="flex min-w-0 flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-gray-500">Portaria</p>
              <h1 className="text-2xl font-extrabold text-[#005a3c] sm:text-3xl">Acessos</h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">Consulte por nome ou matrícula, selecione uma ou várias pessoas ou leia o QR Code para validar a entrada.</p>
            </div>
            <a href="/acessos/relatorio" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-[#005a3c] px-4 py-3 text-sm font-black text-[#005a3c] hover:bg-[#e8f3ee] sm:w-auto">
              📊 Relatório de acessos
            </a>
          </div>

          <section className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <div className="min-w-0 rounded-2xl border border-[#dce8e1] bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Search /></div>
                <div className="min-w-0"><h2 className="text-lg font-black sm:text-xl">Buscar associado, dependente ou temporada</h2><p className="text-sm leading-5 text-gray-500">Pesquise por nome ou matrícula. Marque uma ou várias pessoas; a confirmação registra os acessos.</p></div>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void consultarPorNomeOuMatricula(); }} className="relative mt-4 sm:mt-5">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <input
                    value={matricula}
                    onChange={(e) => {
                      setMatricula(e.target.value);
                      setResultado(null);
                      setGruposBusca([]);
                      setMensagemBusca("");
                      setBuscandoOpcoes(false);
                      setErro("");
                    }}
                    placeholder="Nome, matrícula ou leitura do QR..."
                    autoComplete="off"
                    aria-label="Buscar por nome ou matrícula"
                    inputMode="search"
                    className="min-h-14 w-full min-w-0 flex-1 rounded-xl border border-[#bdcec4] px-4 py-3 text-base outline-none focus:border-[#005a3c] focus:ring-2 focus:ring-[#005a3c]/15 sm:w-auto"
                  />
                  {(/^[0-9]+$/.test(matricula.trim()) || /^(SP|SC|SD|ST|TE)\d/i.test(matricula.trim()) || /^(guarani:|https?:\/\/)/i.test(matricula.trim()) || /\/acessos\/validar/i.test(matricula.trim())) && (
                    <button type="submit" disabled={carregando || !matricula.trim()} className="min-h-12 w-full rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:opacity-50 sm:w-auto">{/^(guarani:|https?:\/\/)/i.test(matricula.trim()) || /\/acessos\/validar/i.test(matricula.trim()) ? "Registrar QR recebido" : "Buscar matrícula"}</button>
                  )}
                </div>
                {buscandoOpcoes && (
                  <p className="mt-2 px-1 text-xs font-semibold text-gray-500">Buscando associados, dependentes e temporadas ativas...</p>
                )}
                {gruposBusca.length > 0 && (
                  <div className="mt-2 max-h-[52vh] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white shadow-lg sm:max-h-[30rem]">
                    <div className="sticky top-0 z-10 border-b bg-[#f5faf7] px-3 py-3 text-xs font-bold leading-5 text-gray-600">
                      <p>{gruposBusca.length} grupo(s) encontrado(s). Marque as pessoas que entrarão.</p>
                      <p className="mt-1 font-medium text-[#547264]">A lista permanece aberta enquanto você seleciona. A entrada só é registrada no botão abaixo.</p>
                    </div>
                    {gruposBusca.map((grupo) => {
                      const familia = [grupo.titular, ...grupo.membros];
                      const quantidadeSelecionadaNaFamilia = familia.filter(opcaoEstaSelecionada).length;
                      const familiaCompletaSelecionada = quantidadeSelecionadaNaFamilia === familia.length;
                      const titularSelecionado = opcaoEstaSelecionada(grupo.titular);
                      const checkboxTitularId = `acesso-${chaveOpcaoAcesso(grupo.titular).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                      const grupoTemporada = grupo.titular.tipo === "temporada";
                      return (
                        <div key={chaveOpcaoAcesso(grupo.titular)} className="border-b border-gray-200 p-2.5 last:border-b-0 sm:p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                            <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">{grupoTemporada ? "Temporada ativa" : "Grupo familiar"}</span>
                            <label className="inline-flex min-h-11 cursor-pointer touch-manipulation items-center gap-2 rounded-lg border border-[#b9d9c7] bg-[#f5faf7] px-3 py-2 text-xs font-black text-[#005a3c]">
                              <input
                                type="checkbox"
                                checked={familiaCompletaSelecionada}
                                disabled={carregando || registrandoSelecionados}
                                onChange={() => alternarSelecaoFamilia(grupo)}
                                className="h-5 w-5 shrink-0 accent-[#005a3c]"
                                aria-label={grupoTemporada ? `Selecionar todos os participantes de ${grupo.titular.nome}` : `Selecionar todos da família ${grupo.titular.nome}`}
                              />
                              <span>{familiaCompletaSelecionada ? (grupoTemporada ? "Todos selecionados" : "Família selecionada") : (grupoTemporada ? "Selecionar todos" : "Selecionar família toda")}</span>
                              <span className="font-semibold text-[#547264]">{quantidadeSelecionadaNaFamilia}/{familia.length}</span>
                            </label>
                          </div>

                          <label
                            htmlFor={checkboxTitularId}
                            className={`flex min-h-[68px] w-full cursor-pointer touch-manipulation items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${titularSelecionado ? "border-[#005a3c] bg-[#e6f4eb]" : "border-[#d5e7dd] bg-[#f5faf7] hover:border-[#005a3c] hover:bg-[#edf7f1]"}`}
                          >
                            <input
                              id={checkboxTitularId}
                              type="checkbox"
                              checked={titularSelecionado}
                              disabled={carregando || registrandoSelecionados}
                              onChange={() => alternarSelecao(grupo.titular)}
                              className="h-6 w-6 shrink-0 accent-[#005a3c]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-[#005a3c]">{grupoTemporada ? "Titular da temporada" : "Responsável da família"}</span>
                              <span className="block break-words font-black text-[#17382c]">{grupo.titular.nome}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {grupo.titular.matricula || "Sem matrícula"} · {grupoTemporada ? "Carteirinha de temporada" : "Responsável familiar"}
                              </span>
                            </span>
                            {titularSelecionado && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#005a3c]" aria-hidden="true" />}
                          </label>

                          {grupo.membros.length > 0 && (
                            <div className="ml-2 mt-2 border-l-2 border-[#d5e7dd] pl-2 sm:ml-3 sm:pl-3">
                              <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wide text-gray-400">{grupoTemporada ? "Demais participantes" : "Dependentes e familiares"}</p>
                              <div className="space-y-1">
                                {grupo.membros.map((opcao) => {
                                  const selecionado = opcaoEstaSelecionada(opcao);
                                  const checkboxId = `acesso-${chaveOpcaoAcesso(opcao).replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                                  return (
                                    <label
                                      key={`${opcao.tipo}-${opcao.id}`}
                                      htmlFor={checkboxId}
                                      className={`flex min-h-[64px] w-full cursor-pointer touch-manipulation items-center gap-3 rounded-xl px-3 py-3 transition-colors ${selecionado ? "bg-[#e6f4eb]" : "hover:bg-[#f0f8f4]"}`}
                                    >
                                      <input
                                        id={checkboxId}
                                        type="checkbox"
                                        checked={selecionado}
                                        disabled={carregando || registrandoSelecionados}
                                        onChange={() => alternarSelecao(opcao)}
                                        className="h-6 w-6 shrink-0 accent-[#005a3c]"
                                      />
                                      <span className="min-w-0 flex-1">
                                        <span className="block break-words text-sm font-bold text-[#17382c]">{opcao.nome}</span>
                                        <span className="mt-0.5 block text-xs leading-4 text-gray-500">
                                          {opcao.matricula || "Sem matrícula própria"} · {opcao.tipo === "temporada" ? (opcao.parentesco || "Participante da temporada") : opcao.tipo === "dependente" ? `Dependente${opcao.parentesco ? ` · ${opcao.parentesco}` : ""}` : (opcao.parentesco || opcao.categoria || "Associado da família")}
                                        </span>
                                      </span>
                                      {selecionado && <CheckCircle2 className="h-5 w-5 shrink-0 text-[#005a3c]" aria-hidden="true" />}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!buscandoOpcoes && mensagemBusca && matricula.trim().length >= 3 && (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{mensagemBusca}</p>
                )}
                {matricula.trim().length > 0 && matricula.trim().length < 3 && !/^(SP|SC|SD|ST|TE)\d/i.test(matricula.trim()) && (
                  <p className="mt-2 px-1 text-xs text-gray-400">Digite pelo menos 3 letras para iniciar a busca.</p>
                )}
                {selecionados.length > 0 && (
                  <div className="sticky bottom-2 z-20 mt-4 rounded-xl border border-[#b9d9c7] bg-[#f4faf6] p-3 shadow-[0_-4px_18px_rgba(0,0,0,0.08)] sm:static sm:shadow-none">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-black text-[#005a3c]">{selecionados.length} pessoa(s) selecionada(s)</p>
                        <p className="text-xs text-gray-500">Os acessos serão validados individualmente, em sequência.</p>
                      </div>
                      <button
                        type="button"
                        disabled={registrandoSelecionados}
                        onClick={() => setSelecionados([])}
                        className="min-h-10 px-2 text-xs font-bold text-gray-500 underline disabled:opacity-50"
                      >Limpar seleção</button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selecionados.map((pessoa) => (
                        <button
                          key={chaveOpcaoAcesso(pessoa)}
                          type="button"
                          disabled={registrandoSelecionados}
                          onClick={() => alternarSelecao(pessoa)}
                          className="rounded-full border border-[#c9dfd2] bg-white px-2.5 py-1 text-xs font-semibold text-[#24513e] disabled:opacity-50"
                        >
                          {pessoa.nome} ×
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={registrandoSelecionados || carregando}
                      onClick={() => void registrarAcessosSelecionados()}
                      className="mt-3 min-h-14 w-full rounded-xl bg-[#005a3c] px-4 py-3 text-base font-black text-white shadow-sm hover:bg-[#00462f] disabled:opacity-50"
                    >
                      {registrandoSelecionados ? "Registrando acessos..." : `Registrar acesso de ${selecionados.length} pessoa(s)`}
                    </button>
                  </div>
                )}
              </form>
            </div>

            <div className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Camera /></div>
                <div className="min-w-0"><h2 className="text-lg font-black sm:text-xl">Ler QR Code</h2><p className="text-sm text-gray-500">Use a câmera compatível ou um leitor USB.</p></div>
              </div>
              {!suportaLeituraQr ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-5 text-amber-800 sm:mt-5">
                  A leitura pela câmera não está disponível neste navegador. Para usar o QR neste computador,
                  conecte um <b>leitor USB de QR Code</b>, clique no campo de busca à esquerda e leia a carteirinha.
                  O código será recebido como texto e validado pelas mesmas regras de acesso.
                </div>
              ) : !cameraAberta ? (
                <button onClick={iniciarCamera} className="mt-4 min-h-14 w-full touch-manipulation rounded-xl border-2 border-[#005a3c] px-4 py-3 text-base font-black text-[#005a3c] sm:mt-5">📷 Abrir câmera e ler QR Code</button>
              ) : (
                <div className="mt-5">
                  <div className="overflow-hidden rounded-2xl bg-black"><video ref={videoRef} autoPlay muted playsInline className="aspect-[4/3] max-h-[55svh] w-full object-cover sm:aspect-video" /></div>
                  <p className="mt-2 text-center text-xs font-semibold text-gray-500">Aponte para o QR Code. O acesso é registrado automaticamente; a câmera fica pronta para a próxima carteirinha.</p>
                  <button onClick={pararCamera} className="mt-3 min-h-14 w-full touch-manipulation rounded-xl border border-[#bdcec4] px-4 py-3 font-bold">Fechar câmera</button>
                </div>
              )}
            </div>
          </section>



          {registrandoSelecionados && <div className="rounded-2xl border bg-white p-4 text-center shadow-sm sm:p-5"><Clock3 className="mx-auto h-8 w-8 animate-pulse text-[#005a3c]" /><p className="mt-2 font-bold">Registrando os acessos selecionados em sequência...</p></div>}
          {resultadosLote.length > 0 && (
            <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black text-[#005a3c]">Resultado dos acessos</h2>
                <span className="text-xs font-semibold text-gray-500">{resultadosLote.filter((item) => item.sucesso && item.liberado && !item.duplicado).length} liberado(s) · {resultadosLote.filter((item) => item.duplicado).length} repetido(s) · {resultadosLote.filter((item) => item.sucesso && !item.liberado && !item.duplicado).length} bloqueado(s) · {resultadosLote.filter((item) => !item.sucesso).length} falha(s)</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">A validade do exame controla o uso da água e das piscinas; não bloqueia, por si só, a entrada na sociedade.</p>
              <div className="mt-3 divide-y">
                {resultadosLote.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#17382c]">{item.nome} <span className="text-xs font-normal text-gray-500">{item.matricula || ""}</span></p>
                      <p className="text-sm text-gray-600">{item.mensagem}</p>
                      {item.exame && (
                        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${item.exame.status?.cor === "verde" ? "border-green-200 bg-green-50 text-green-800" : item.exame.status?.cor === "amarelo" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800"}`}>
                          <span className="font-black">Exame médico: </span>{item.exame.status?.texto || "Não informado"}
                          {item.exame.validade && <span> · Validade: {new Date(`${item.exame.validade}T12:00:00`).toLocaleDateString("pt-BR")}</span>}
                        </div>
                      )}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.duplicado ? "bg-amber-100 text-amber-800" : item.sucesso && item.liberado ? "bg-green-100 text-green-800" : item.sucesso ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {item.duplicado ? "Já registrado" : item.sucesso ? item.liberado ? "Liberado" : "Bloqueado" : "Falha"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {carregando && <div className="rounded-2xl border bg-white p-5 text-center shadow-sm sm:p-8"><Clock3 className="mx-auto h-9 w-9 animate-pulse text-[#005a3c]" /><p className="mt-3 font-bold">Validando carteirinha...</p></div>}
          {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:p-5"><XCircle className="h-8 w-8" /><p className="mt-2 font-black">Não foi possível validar</p><p className="text-sm font-medium">{erro}</p>{cameraAberta && <button type="button" onClick={() => { qrsLidosAteRef.current.clear(); setErro(""); }} className="mt-3 min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-black text-red-800">Tentar novamente com a mesma carteirinha</button>}</div>}

          {resultado?.socio && (
            <section className={`rounded-2xl border p-4 shadow-sm sm:p-6 ${resultado.liberado ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-16 overflow-hidden rounded-xl bg-white">
                    {(resultado.pessoa?.foto_url || resultado.socio.foto_url) ? <Image src={(resultado.pessoa?.foto_url || resultado.socio.foto_url)!} alt={resultado.pessoa?.nome || resultado.socio.nome} width={64} height={80} unoptimized className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><UserRound className="text-gray-400" /></div>}
                  </div>
                  <div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-gray-500">Carteirinha</p><h2 className="break-words text-xl font-black sm:text-2xl">{resultado.pessoa?.nome || resultado.socio.nome}</h2><p className="text-sm text-gray-600">Matrícula: <b>{resultado.pessoa?.matricula || resultado.socio.matricula || "—"}</b> · Situação: <b>{resultado.pessoa?.situacao || resultado.socio.situacao || "Não informada"}</b></p>{resultado.dependente && <p className="mt-1 text-xs font-semibold text-gray-500">Dependente de {resultado.socio.nome}{resultado.pessoa?.parentesco ? ` · ${resultado.pessoa.parentesco}` : ""}</p>}</div>
                </div>
                <div className="flex items-center gap-3">
                  {resultado.liberado ? <CheckCircle2 className="h-12 w-12 text-green-700" /> : <XCircle className="h-12 w-12 text-red-700" />}
                  <div className="min-w-0"><div className={`text-xl font-black sm:text-2xl ${resultado.duplicado ? "text-amber-800" : resultado.liberado ? "text-green-800" : "text-red-800"}`}>{resultado.duplicado ? "ACESSO JÁ REGISTRADO" : resultado.liberado ? "ENTRADA LIBERADA" : "ACESSO BLOQUEADO"}</div><p className="text-sm font-semibold">{resultado.acesso?.data_hora_entrada ? `Registrado em ${new Date(resultado.acesso.data_hora_entrada).toLocaleString("pt-BR")}` : ""}</p></div>
                </div>
              </div>
              <div className={`mt-5 rounded-xl p-4 text-sm font-semibold ${resultado.duplicado ? "bg-amber-100 text-amber-900" : "bg-white/70"}`}><ShieldCheck className="mr-2 inline h-4 w-4" />{resultado.duplicado ? "Esta carteirinha já tinha sido lida nos últimos 2 minutos. O sistema preservou o primeiro registro e evitou uma duplicidade." : "Acesso processado automaticamente pela portaria."}</div>
              {!resultado.liberado && (resultado.motivo_bloqueio || resultado.acesso?.motivo_negacao) && (
                <div className="mt-3 rounded-xl border border-red-300 bg-red-100 p-4 text-sm font-bold text-red-900">
                  Motivo do bloqueio da entrada: {resultado.motivo_bloqueio || resultado.acesso?.motivo_negacao}
                </div>
              )}
              {resultado.uso_agua && (
                <div className={`mt-3 rounded-xl border p-4 ${resultado.uso_agua.permitido ? "border-green-300 bg-green-100 text-green-900" : "border-amber-300 bg-amber-100 text-amber-950"}`}>
                  <p className="font-black">Acesso à água / piscinas</p>
                  <p className="mt-1 text-sm font-bold">{resultado.uso_agua.texto}</p>
                  {resultado.uso_agua.validade && <p className="mt-1 text-sm">Validade do exame: {new Date(`${resultado.uso_agua.validade}T12:00:00`).toLocaleDateString("pt-BR")}</p>}
                  <p className="mt-1 text-xs font-semibold">Atenção: exame vencido ou sem validade restringe somente o uso da água. A entrada no parque continua permitida se a temporada estiver ativa, dentro da validade e sem parcelas vencidas.</p>
                </div>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">{ehTemporada ? "Parcelas da temporada" : "Situação financeira para acesso"}</p>
                  {podeVerDetalhesFinanceiros ? (
                    <>
                      <p className="mt-1 font-black">{resultado.mensalidade?.texto || "Não informado"}</p>
                      {resultado.inadimplencia?.atrasado && (
                        <p className={`mt-1 text-xs font-semibold ${bloqueioPorInadimplencia ? "text-red-700" : atencaoPorInadimplencia ? "text-amber-700" : "text-green-700"}`}>
                          {resultado.inadimplencia.quantidade ?? 0} {ehTemporada ? "parcela(s) vencida(s)" : "competência(s) vencida(s)"} · {bloqueioPorInadimplencia
                            ? "entrada bloqueada"
                            : atencaoPorInadimplencia
                              ? "faixa de atenção — entrada liberada"
                              : "dentro da tolerância — entrada liberada"} ·{" "}
                          {Number(resultado.inadimplencia.valorTotal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className={`mt-1 font-black ${!resultado.liberado || bloqueioPorInadimplencia ? "text-red-700" : atencaoPorInadimplencia ? "text-amber-700" : "text-green-700"}`}>
                        {ehTemporada
                          ? resultado.liberado
                            ? "VERDE — entrada liberada"
                            : "VERMELHO — entrada bloqueada"
                          : bloqueioPorInadimplencia || !resultado.liberado
                            ? "VERMELHO — entrada bloqueada"
                            : atencaoPorInadimplencia
                              ? "AMARELO — entrada liberada; avisar diretoria"
                              : "VERDE — entrada liberada"}
                      </p>
                      {precisaAvisarDiretoria && (
                        <div className={`mt-3 rounded-lg p-3 text-xs font-bold ${!resultado.liberado || bloqueioPorInadimplencia ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                          {resultado.alerta_diretoria_enviado === true
                            ? "A diretoria foi notificada automaticamente pelo sistema."
                            : resultado.alerta_diretoria_enviado === false
                              ? "Não foi possível enviar o aviso automático. Comunique a diretoria."
                              : "Esta situação exige avaliação da diretoria. Comunique-a antes de autorizar qualquer exceção."}
                        </div>
                      )}
                      {ehTemporada && resultado.liberado && !resultado.inadimplencia?.atrasado && (
                        <p className="mt-1 text-xs font-semibold text-green-700">Parcelas da Temporada em dia.</p>
                      )}
                    </>
                  )}
                </div>
                <div className="rounded-xl bg-white p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-gray-500">Exame médico</p>
                  <p className="mt-1 font-black">{resultado.exame?.status?.texto || "Não informado"}</p>
                  {resultado.exame?.validade && <p className="mt-1 text-sm text-gray-600">Validade: {new Date(`${resultado.exame.validade}T12:00:00`).toLocaleDateString("pt-BR")}</p>}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
