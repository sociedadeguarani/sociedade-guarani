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
  tipo: "socio" | "dependente";
  socio_id: string;
  dependente_id: string | null;
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
  mensagem: string;
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

  async function validar(dados: { matricula?: string; qr?: string; socio_id?: string; dependente_id?: string }) {
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
        return;
      }
      const r = await fetch("/api/acessos", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(dados),
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível registrar o acesso.");
      setResultado(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao validar carteirinha.");
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
        const payload = pessoa.tipo === "dependente" && pessoa.dependente_id
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
            mensagem: dados.liberado
              ? "Entrada registrada e liberada."
              : (dados.motivo_bloqueio || dados.acesso?.motivo_negacao || "Acesso registrado como bloqueado."),
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

    const codigo = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pareceMatricula = /^\d+$/.test(codigo) || /^(SP|SC|SD|ST|TE)\d/.test(codigo);
    // A busca por nome é automática e mostra sugestões enquanto o operador digita.
    // O botão/Enter fica reservado à consulta direta por matrícula.
    if (pareceMatricula) await validar({ matricula: termo });
  }

  useEffect(() => {
    const termo = matricula.trim();
    const codigo = termo.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pareceMatricula = /^\d+$/.test(codigo) || /^(SP|SC|SD|ST|TE)\d/.test(codigo);

    if (!termo || pareceMatricula || termo.length < 3) return;

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
        setMensagemBusca(grupos.length ? "" : `Nenhum associado ou dependente ativo encontrado para “${termo}”.`);
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
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraAberta(false);
  }

  async function iniciarCamera() {
    setErro("");
    setResultado(null);
    if (!("BarcodeDetector" in window)) {
      setErro("Seu navegador não oferece leitura automática de QR Code. Use a matrícula ou abra a câmera do celular e leia o QR Code da carteirinha.");
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
        try {
          const codes = await detector.detect(videoRef.current);
          const valor = codes?.[0]?.rawValue;
          if (valor) {
            pararCamera();
            await validar({ qr: valor });
            return;
          }
        } catch {}
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
      <main className="min-h-[calc(100vh-76px)] px-4 py-6 lg:ml-[220px] lg:px-7 lg:py-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm text-gray-500">Portaria</p>
              <h1 className="text-3xl font-extrabold text-[#005a3c]">Acessos</h1>
              <p className="mt-1 text-sm text-gray-500">Consulte a carteirinha por matrícula ou leia o QR Code para validar e registrar a entrada.</p>
            </div>
            <a href="/acessos/relatorio" className="inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-[#005a3c] px-4 py-3 font-black text-[#005a3c] hover:bg-[#e8f3ee]">
              📊 Relatório de acessos
            </a>
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Search /></div>
                <div><h2 className="text-xl font-black">Consultar por matrícula ou nome</h2><p className="text-sm text-gray-500">Digite a matrícula ou parte do nome do associado/dependente.</p></div>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void consultarPorNomeOuMatricula(); }} className="relative mt-5">
                <div className="flex gap-2">
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
                    placeholder="Digite o nome ou matrícula..."
                    autoComplete="off"
                    className="min-w-0 flex-1 rounded-xl border px-4 py-3 outline-none focus:border-[#005a3c]"
                  />
                  {(/^[0-9]+$/.test(matricula.trim()) || /^(SP|SC|SD|ST|TE)\d/i.test(matricula.trim())) && (
                    <button type="submit" disabled={carregando || !matricula.trim()} className="rounded-xl bg-[#005a3c] px-5 py-3 font-black text-white disabled:opacity-50">Consultar</button>
                  )}
                </div>
                {buscandoOpcoes && (
                  <p className="mt-2 px-1 text-xs font-semibold text-gray-500">Buscando associados e dependentes...</p>
                )}
                {gruposBusca.length > 0 && (
                  <div className="mt-2 max-h-[30rem] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
                    <p className="sticky top-0 z-10 border-b bg-[#f5faf7] px-3 py-2 text-xs font-bold text-gray-500">
                      {gruposBusca.length} família(s) encontrada(s). Escolha o titular ou uma pessoa da família.
                    </p>
                    {gruposBusca.map((grupo) => {
                      const familia = [grupo.titular, ...grupo.membros];
                      const familiaCompletaSelecionada = familia.every(opcaoEstaSelecionada);
                      const titularSelecionado = opcaoEstaSelecionada(grupo.titular);
                      return (
                        <div key={grupo.titular.id} className="border-b border-gray-200 p-2 last:border-b-0">
                          <div className="mb-2 flex items-center justify-between gap-2 px-1">
                            <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Grupo familiar</span>
                            <button
                              type="button"
                              disabled={carregando || registrandoSelecionados}
                              onClick={() => alternarSelecaoFamilia(grupo)}
                              className="rounded-lg border border-[#005a3c] px-2.5 py-1.5 text-[11px] font-black text-[#005a3c] hover:bg-[#edf7f1] disabled:opacity-50"
                            >
                              {familiaCompletaSelecionada ? "Desmarcar família" : "Selecionar família toda"}
                            </button>
                          </div>
                          <button
                            type="button"
                            disabled={carregando || registrandoSelecionados}
                            onClick={() => alternarSelecao(grupo.titular)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left disabled:opacity-50 ${titularSelecionado ? "border-[#005a3c] bg-[#e6f4eb]" : "border-[#d5e7dd] bg-[#f5faf7] hover:border-[#005a3c] hover:bg-[#edf7f1]"}`}
                          >
                            <span className="min-w-0">
                              <span className="mb-0.5 block text-[10px] font-black uppercase tracking-wide text-[#005a3c]">Responsável da família</span>
                              <span className="block truncate font-black text-[#17382c]">{grupo.titular.nome}</span>
                              <span className="mt-0.5 block truncate text-xs text-gray-500">
                                {grupo.titular.matricula || "Sem matrícula"} · Responsável familiar
                              </span>
                            </span>
                            <span className={`shrink-0 rounded-lg px-3 py-2 text-xs font-black ${titularSelecionado ? "bg-[#005a3c] text-white" : "border border-[#005a3c] text-[#005a3c]"}`}>
                              {titularSelecionado ? "Selecionado" : "Selecionar"}
                            </span>
                          </button>

                          {grupo.membros.length > 0 && (
                            <div className="ml-3 mt-2 border-l-2 border-[#d5e7dd] pl-3">
                              <p className="mb-1 px-1 text-[10px] font-black uppercase tracking-wide text-gray-400">Dependentes e familiares</p>
                              <div className="space-y-1">
                                {grupo.membros.map((opcao) => {
                                  const selecionado = opcaoEstaSelecionada(opcao);
                                  return (
                                    <button
                                      key={`${opcao.tipo}-${opcao.id}`}
                                      type="button"
                                      disabled={carregando || registrandoSelecionados}
                                      onClick={() => alternarSelecao(opcao)}
                                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left disabled:opacity-50 ${selecionado ? "bg-[#e6f4eb]" : "hover:bg-[#f0f8f4]"}`}
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-bold text-[#17382c]">{opcao.nome}</span>
                                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                                          {opcao.matricula || "Sem matrícula própria"} · {opcao.tipo === "dependente" ? `Dependente${opcao.parentesco ? ` · ${opcao.parentesco}` : ""}` : (opcao.parentesco || opcao.categoria || "Associado da família")}
                                        </span>
                                      </span>
                                      <span className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-black ${selecionado ? "bg-[#005a3c] text-white" : "border border-[#005a3c] text-[#005a3c]"}`}>
                                        {selecionado ? "Selecionado" : "Selecionar"}
                                      </span>
                                    </button>
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
                  <div className="mt-4 rounded-xl border border-[#b9d9c7] bg-[#f4faf6] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-black text-[#005a3c]">{selecionados.length} pessoa(s) selecionada(s)</p>
                        <p className="text-xs text-gray-500">Os acessos serão validados individualmente, em sequência.</p>
                      </div>
                      <button
                        type="button"
                        disabled={registrandoSelecionados}
                        onClick={() => setSelecionados([])}
                        className="text-xs font-bold text-gray-500 underline disabled:opacity-50"
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
                      className="mt-3 w-full rounded-xl bg-[#005a3c] px-4 py-3 font-black text-white hover:bg-[#00462f] disabled:opacity-50"
                    >
                      {registrandoSelecionados ? "Registrando acessos..." : `Registrar acesso de ${selecionados.length} pessoa(s)`}
                    </button>
                  </div>
                )}
              </form>
            </div>

            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#e8f3ee] text-[#005a3c]"><Camera /></div>
                <div><h2 className="text-xl font-black">Ler QR Code</h2><p className="text-sm text-gray-500">Use a câmera traseira do celular.</p></div>
              </div>
              {!suportaLeituraQr ? (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                  Este navegador (comum em iPhone) não permite ler QR Code direto no site.
                  Abra o <b>app de Câmera do celular</b> e aponte para o QR Code da carteirinha —
                  ele vai abrir esta página automaticamente e já registrar o acesso.
                </div>
              ) : !cameraAberta ? (
                <button onClick={iniciarCamera} className="mt-5 w-full rounded-xl border-2 border-[#005a3c] px-4 py-3 font-black text-[#005a3c]">📷 Abrir câmera e ler QR Code</button>
              ) : (
                <div className="mt-5">
                  <div className="overflow-hidden rounded-2xl bg-black"><video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" /></div>
                  <p className="mt-2 text-center text-xs font-semibold text-gray-500">Aponte para o QR Code da carteirinha.</p>
                  <button onClick={pararCamera} className="mt-3 w-full rounded-xl border px-4 py-3 font-bold">Fechar câmera</button>
                </div>
              )}
            </div>
          </section>



          {registrandoSelecionados && <div className="rounded-2xl border bg-white p-5 text-center shadow-sm"><Clock3 className="mx-auto h-8 w-8 animate-pulse text-[#005a3c]" /><p className="mt-2 font-bold">Registrando os acessos selecionados em sequência...</p></div>}
          {resultadosLote.length > 0 && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black text-[#005a3c]">Resultado dos acessos</h2>
                <span className="text-xs font-semibold text-gray-500">{resultadosLote.filter((item) => item.sucesso && item.liberado).length} liberado(s) · {resultadosLote.filter((item) => item.sucesso && !item.liberado).length} bloqueado(s) · {resultadosLote.filter((item) => !item.sucesso).length} falha(s)</span>
              </div>
              <div className="mt-3 divide-y">
                {resultadosLote.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <div>
                      <p className="font-bold text-[#17382c]">{item.nome} <span className="text-xs font-normal text-gray-500">{item.matricula || ""}</span></p>
                      <p className="text-sm text-gray-600">{item.mensagem}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.sucesso && item.liberado ? "bg-green-100 text-green-800" : item.sucesso ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                      {item.sucesso ? item.liberado ? "Liberado" : "Bloqueado" : "Falha"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {carregando && <div className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Clock3 className="mx-auto h-9 w-9 animate-pulse text-[#005a3c]" /><p className="mt-3 font-bold">Validando carteirinha...</p></div>}
          {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800"><XCircle className="h-8 w-8" /><p className="mt-2 font-black">Não foi possível validar</p><p className="text-sm font-medium">{erro}</p></div>}

          {resultado?.socio && (
            <section className={`rounded-2xl border p-6 shadow-sm ${resultado.liberado ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-20 w-16 overflow-hidden rounded-xl bg-white">
                    {(resultado.pessoa?.foto_url || resultado.socio.foto_url) ? <Image src={(resultado.pessoa?.foto_url || resultado.socio.foto_url)!} alt={resultado.pessoa?.nome || resultado.socio.nome} width={64} height={80} unoptimized className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><UserRound className="text-gray-400" /></div>}
                  </div>
                  <div><p className="text-xs font-black uppercase tracking-wide text-gray-500">Carteirinha</p><h2 className="text-2xl font-black">{resultado.pessoa?.nome || resultado.socio.nome}</h2><p className="text-sm text-gray-600">Matrícula: <b>{resultado.pessoa?.matricula || resultado.socio.matricula || "—"}</b> · Situação: <b>{resultado.pessoa?.situacao || resultado.socio.situacao || "Não informada"}</b></p>{resultado.dependente && <p className="mt-1 text-xs font-semibold text-gray-500">Dependente de {resultado.socio.nome}{resultado.pessoa?.parentesco ? ` · ${resultado.pessoa.parentesco}` : ""}</p>}</div>
                </div>
                <div className="flex items-center gap-3">
                  {resultado.liberado ? <CheckCircle2 className="h-12 w-12 text-green-700" /> : <XCircle className="h-12 w-12 text-red-700" />}
                  <div><div className={`text-2xl font-black ${resultado.liberado ? "text-green-800" : "text-red-800"}`}>{resultado.liberado ? "ENTRADA LIBERADA" : "ACESSO BLOQUEADO"}</div><p className="text-sm font-semibold">{resultado.acesso?.data_hora_entrada ? `Registrado em ${new Date(resultado.acesso.data_hora_entrada).toLocaleString("pt-BR")}` : ""}</p></div>
                </div>
              </div>
              <div className="mt-5 rounded-xl bg-white/70 p-4 text-sm font-semibold"><ShieldCheck className="mr-2 inline h-4 w-4" />A consulta registra automaticamente o acesso na portaria.</div>
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
