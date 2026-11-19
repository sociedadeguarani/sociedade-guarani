"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

type DeviceKind = "android" | "ios" | "other";

function subscribeDevice() {
  return () => undefined;
}

function getDeviceSnapshot(): DeviceKind {
  if (typeof navigator === "undefined") return "other";
  const agente = navigator.userAgent || "";
  const ehIos = /iPad|iPhone|iPod/i.test(agente) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (ehIos) return "ios";
  if (/Android/i.test(agente)) return "android";
  return "other";
}

function getStandaloneSnapshot() {
  if (typeof window === "undefined") return false;
  const navegador = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(navegador.standalone);
}

function subscribeStandalone(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const media = window.matchMedia("(display-mode: standalone)");
  media.addEventListener("change", onChange);
  window.addEventListener("appinstalled", onChange);
  return () => {
    media.removeEventListener("change", onChange);
    window.removeEventListener("appinstalled", onChange);
  };
}

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const dispositivo = useSyncExternalStore(subscribeDevice, getDeviceSnapshot, () => "other");
  const instaladaNoSistema = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    () => false,
  );
  const ios = dispositivo === "ios";
  const [instaladaPeloEvento, setInstaladaPeloEvento] = useState(false);
  const [dispensada, setDispensada] = useState(false);
  const [instrucoesAbertas, setInstrucoesAbertas] = useState(false);
  const [promptInstalacao, setPromptInstalacao] = useState<BeforeInstallPromptEvent | null>(null);
  const [instalando, setInstalando] = useState(false);

  const instalada = instaladaNoSistema || instaladaPeloEvento;
  const estaNaTelaLogin = pathname === "/login";

  useEffect(() => {
    const navegador = window.navigator;

    // O service worker só oferece um aviso estático quando falta conexão.
    // Nenhuma rota autenticada, API, credencial ou dado pessoal é armazenado.
    if ("serviceWorker" in navegador) {
      void navegador.serviceWorker.register("/sw.js", { scope: "/" }).catch((erro: unknown) => {
        console.warn("Não foi possível registrar o suporte de instalação do Guarani:", erro);
      });
    }

    const receberPrompt = (evento: Event) => {
      evento.preventDefault();
      setPromptInstalacao(evento as BeforeInstallPromptEvent);
    };
    const appInstalado = () => {
      setInstaladaPeloEvento(true);
      setPromptInstalacao(null);
      setInstrucoesAbertas(false);
    };

    window.addEventListener("beforeinstallprompt", receberPrompt);
    window.addEventListener("appinstalled", appInstalado);

    return () => {
      window.removeEventListener("beforeinstallprompt", receberPrompt);
      window.removeEventListener("appinstalled", appInstalado);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!promptInstalacao) {
      setInstrucoesAbertas(true);
      return;
    }

    setInstalando(true);
    try {
      await promptInstalacao.prompt();
      const escolha = await promptInstalacao.userChoice;
      if (escolha.outcome === "accepted") {
        setInstaladaPeloEvento(true);
        setDispensada(true);
      }
      setPromptInstalacao(null);
    } catch (erro) {
      console.warn("A instalação do Guarani não foi concluída:", erro);
      setInstrucoesAbertas(true);
    } finally {
      setInstalando(false);
    }
  }, [promptInstalacao]);

  useEffect(() => {
    const abrirInstalacao = () => {
      void instalar();
    };

    window.addEventListener("guarani:open-install", abrirInstalacao);
    return () => window.removeEventListener("guarani:open-install", abrirInstalacao);
  }, [instalar]);

  const mostrarAviso = !instalada && !dispensada &&
    (dispositivo !== "other" || estaNaTelaLogin);

  return (
    <>
      {mostrarAviso && (
        <aside className={`fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-[#cfe0d7] bg-white p-3 shadow-2xl ${estaNaTelaLogin ? "" : "md:hidden"}`}>
          <Image
            src="/apple-icon-guarani.png"
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[#003d2b]">
              {estaNaTelaLogin ? "Instalar aplicativo Guarani" : "Instale o Guarani"}
            </p>
            <p className="text-xs text-slate-500">
              {estaNaTelaLogin
                ? "Tenha o Guarani com um ícone na tela inicial do celular."
                : "Acesse pelo ícone na tela do celular."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void instalar()}
            disabled={instalando}
            className="shrink-0 rounded-xl bg-[#005a3c] px-3 py-2.5 text-xs font-extrabold text-white disabled:opacity-60"
          >
            {instalando ? "Abrindo…" : promptInstalacao ? "Instalar" : "Como instalar"}
          </button>
          <button
            type="button"
            onClick={() => setDispensada(true)}
            aria-label="Fechar aviso de instalação"
            className="ml-[-4px] self-start rounded-lg px-1.5 py-1 text-lg leading-none text-slate-400"
          >
            ×
          </button>
        </aside>
      )}

      {instrucoesAbertas && (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 p-3 sm:items-center"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="guarani-install-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center gap-3">
              <Image src="/apple-icon-guarani.png" alt="" width={48} height={48} className="h-12 w-12 rounded-xl" />
              <div>
                <h2 id="guarani-install-title" className="text-lg font-black text-[#003d2b]">Adicionar o Guarani</h2>
                <p className="text-xs text-slate-500">O aplicativo ficará com um ícone na tela inicial.</p>
              </div>
            </div>
            {ios ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                <li>Abra este endereço no <strong>Safari</strong>.</li>
                <li>Toque em <strong>Compartilhar</strong> (ícone do quadrado com seta).</li>
                <li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme.</li>
              </ol>
            ) : dispositivo === "android" ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
                <li>No Chrome, toque no menu de três pontos (⋮).</li>
                <li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                <li>Confirme. O ícone Guarani aparecerá junto dos outros aplicativos.</li>
              </ol>
            ) : (
              <p className="text-sm leading-6 text-slate-700">
                Para instalar, abra este mesmo endereço no celular: use o <strong>Chrome no Android</strong> ou o <strong>Safari no iPhone</strong>. A opção de instalação aparecerá no próprio celular.
              </p>
            )}
            <p className="mt-4 rounded-xl bg-[#f1f7f4] p-3 text-xs leading-5 text-slate-600">
              O sistema continua exigindo internet e seu login normal. Dados de associados e informações financeiras não ficam disponíveis offline.
            </p>
            <button
              type="button"
              onClick={() => setInstrucoesAbertas(false)}
              className="mt-4 w-full rounded-xl bg-[#005a3c] px-4 py-3 text-sm font-extrabold text-white"
            >
              Entendi
            </button>
          </section>
        </div>
      )}
    </>
  );
}
