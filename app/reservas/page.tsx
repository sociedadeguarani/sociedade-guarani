"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  Settings,
  ShieldCheck,
  Trash2,
  UserRound,
  UserRoundCheck,
  Users,
} from "lucide-react";
import MenuLateralPadrao from "../components/MenuLateralPadrao";
import CabecalhoPadrao from "../components/CabecalhoPadrao";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type TipoPessoa = "socio" | "nao_socio";
type Categoria = "esporte" | "lazer" | "eventos";

type Espaco = {
  id: string;
  nome: string;
  categoria: Categoria;
  cobranca: "hora" | "diaria";
  precoSocio: number;
  precoNaoSocio: number;
  permiteNaoSocio: boolean;
  capacidade?: string;
};

type Recibo={id:string;numero:string;tipo:string;nome:string;matricula:number|string|null;detalhe:string;periodo:string;valor:number;pagamento:string;operador:string;dataHora:string;status:string};

type SocioReserva = {
  id: string;
  matricula: number | string | null;
  nome: string;
  cpf: string | null;
  responsavel_id?: string | null;
  parentesco?: string | null;
  situacao?: string | null;
};

type DependenteReserva = {
  id: string;
  socio_id: string;
  matricula: string | null;
  nome: string;
  parentesco: string | null;
  ativo: boolean;
};

type ContaBancaria = { id:string; nome:string; banco:string|null; ativo:boolean };

type Reserva = {
  id: string;
  espacoId: string;
  data: string;
  horario: string;
  nome: string;
  socioId?: string;
  dependenteId?: string;
  matricula?: number | string | null;
  tipoPessoa: TipoPessoa;
  valor: number;
  status: "confirmada" | "pendente" | "cancelada";
  pagamento: "pix" | "dinheiro" | "transferencia" | "pendente";
  comprovante_url?: string | null;
  comprovante_nome?: string | null;
};

const INICIAIS: Espaco[] = [
  { id: "fut", nome: "Quadra de Futebol", categoria: "esporte", cobranca: "hora", precoSocio: 100, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "volei", nome: "Quadra de Vôlei", categoria: "esporte", cobranca: "hora", precoSocio: 50, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "areia", nome: "Quadra de Areia", categoria: "esporte", cobranca: "hora", precoSocio: 30, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q48", nome: "Quadra 48", categoria: "esporte", cobranca: "hora", precoSocio: 20, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q1", nome: "Quiosque 1", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q2", nome: "Quiosque 2", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "q3", nome: "Quiosque 3", categoria: "lazer", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false },
  { id: "salao_p", nome: "Salão Pequeno de Vidro", categoria: "eventos", cobranca: "diaria", precoSocio: 300, precoNaoSocio: 600, permiteNaoSocio: true, capacidade: "50 pessoas" },
  { id: "salao_g", nome: "Salão Social Grande", categoria: "eventos", cobranca: "diaria", precoSocio: 900, precoNaoSocio: 1800, permiteNaoSocio: true, capacidade: "300 pessoas" },
  { id: "ctg", nome: "Salão CTG", categoria: "eventos", cobranca: "diaria", precoSocio: 80, precoNaoSocio: 0, permiteNaoSocio: false, capacidade: "150 pessoas" },
];

const HORARIOS = [
  "08:00 - 09:00",
  "09:00 - 10:00",
  "10:00 - 11:00",
  "18:00 - 19:00",
  "19:00 - 20:00",
  "20:00 - 21:00",
  "21:00 - 22:00",
];

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBR = (v: string) => (v ? v.split("-").reverse().join("/") : "—");

function normalizarEspacos(lista: Espaco[]): Espaco[] {
  return lista.map((e) => ({
    ...e,
    permiteNaoSocio: e.permiteNaoSocio ?? e.precoNaoSocio > 0,
  }));
}

function normalizarTexto(valor: unknown) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function ReservasPage() {
  const [publico, setPublico] = useState(false);
  const [aba, setAba] = useState<"reservar" | "reservas" | "admin">("reservar");
  const [espacos, setEspacos] = useState<Espaco[]>(INICIAIS);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [espacoId, setEspacoId] = useState(INICIAIS[0].id);
  const [data, setData] = useState("");
  const [horario, setHorario] = useState(HORARIOS[0]);
  const [nome, setNome] = useState("");
  const [socioId, setSocioId] = useState("");
  const [matriculaResponsavel, setMatriculaResponsavel] = useState<number | string | null>(null);
  const [dependenteId, setDependenteId] = useState("");
  const [socios, setSocios] = useState<SocioReserva[]>([]);
  const [dependentes, setDependentes] = useState<DependenteReserva[]>([]);
  const [contasBancarias, setContasBancarias] = useState<ContaBancaria[]>([]);
  const [buscaSocio, setBuscaSocio] = useState("");
  const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa>("socio");
  const [etapa, setEtapa] = useState<"selecao" | "confirmacao">("selecao");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | Reserva["status"]>("todos");
  const [filtroData, setFiltroData] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [pix, setPix] = useState<{ chave_pix?: string; nome_recebedor?: string; cidade?: string; copia_e_cola?: string } | null>(null);
  const [arquivoComprovante, setArquivoComprovante] = useState<File | null>(null);
  const [enviandoComprovante, setEnviandoComprovante] = useState(false);
  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [formaPagamentoReserva, setFormaPagamentoReserva] = useState<"pix" | "dinheiro">("pix");
  const [editandoReservaId, setEditandoReservaId] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const modoPublico = p.get("publico") === "1";
    setPublico(modoPublico);
    if (modoPublico) setTipoPessoa("nao_socio");

    try {
      const e = localStorage.getItem("guarani_espacos_reservas");
      const r = localStorage.getItem("guarani_reservas");
      if (e) setEspacos(normalizarEspacos(JSON.parse(e)));
      if (r) setReservas(JSON.parse(r));
    } catch {
      // Mantém os valores iniciais.
    }

    if (!modoPublico) {
      void (async () => {
        try {
          const { data: sessaoReservas } = await supabase.auth.getSession();
          const resposta = await fetch("/api/reservas?status=", {
            headers: { Authorization: `Bearer ${sessaoReservas.session?.access_token || ""}` },
            cache: "no-store",
          });
          const resultado = await resposta.json().catch(() => ({}));
          if (!resposta.ok) throw new Error(resultado?.error || "Não foi possível carregar as reservas.");

          const reservasDb = Array.isArray(resultado.reservas) ? resultado.reservas : [];
          const contasDb = Array.isArray(resultado.contas_bancarias) ? resultado.contas_bancarias : [];
          const espacosDb = Array.isArray(resultado.espacos) ? resultado.espacos : [];
          const sociosDb = Array.isArray(resultado.socios) ? resultado.socios : [];
          const dependentesDb = Array.isArray(resultado.dependentes) ? resultado.dependentes : [];

          setContasBancarias(contasDb);

          // Substitui SOMENTE o id local pelo UUID que realmente existe no banco.
          // Nome, preço e regras continuam vindo da configuração da tela.
          if (espacosDb.length) {
            const porNome = new Map<string, any>();
            for (const item of espacosDb) porNome.set(normalizarTexto(item.nome), item);
            setEspacos((atuais) =>
              atuais.map((e) => {
                const real = porNome.get(normalizarTexto(e.nome));
                return real?.id ? { ...e, id: String(real.id) } : e;
              }),
            );
          }

          setSocios(
            sociosDb.map((s: any) => ({
              id: String(s.id),
              matricula: s.matricula ?? null,
              nome: String(s.nome || ""),
              cpf: s.cpf ?? null,
              responsavel_id: s.responsavel_id ?? null,
              parentesco: s.parentesco ?? null,
              situacao: s.situacao ?? null,
            })),
          );
          // A API já unifica a tabela legada `dependentes` com os registros
          // de `socios` que possuem responsavel_id. Mantemos aqui somente a
          // normalização para que Funcionário, Administrador e Master recebam
          // exatamente a mesma lista.
          setDependentes(
            dependentesDb.map((d: any) => ({
              id: String(d.id),
              socio_id: String(d.socio_id),
              matricula: d.matricula == null ? null : String(d.matricula),
              nome: String(d.nome || ""),
              parentesco: d.parentesco ?? null,
              ativo: d.ativo !== false,
            })),
          );

          // Sempre sincroniza com o banco, inclusive quando ele estiver vazio.
          // Isso evita mostrar reservas antigas do localStorage como se fossem atuais.
          setReservas(
            reservasDb.map((r: any) => ({
              id: String(r.id),
              espacoId: String(r.espaco_id),
              data: String(r.data),
              horario: String(r.horario),
              nome: String(r.nome || ""),
              socioId: r.socio_id || undefined,
              dependenteId: r.dependente_id || undefined,
              matricula: r.matricula ?? null,
              tipoPessoa: r.tipo_pessoa === "nao_socio" ? "nao_socio" : "socio",
              valor: Number(r.valor || 0),
              status: r.status,
              pagamento: r.pagamento,
              comprovante_url: r.comprovante_url || null,
              comprovante_nome: r.comprovante_nome || null,
            })),
          );
        } catch (error) {
          console.warn("Não foi possível carregar reservas do banco:", error);
          setReservas([]);
          setSocios([]);
          setDependentes([]);
        }
      })();
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("guarani_espacos_reservas", JSON.stringify(espacos));
  }, [espacos]);

  useEffect(() => {
    localStorage.setItem("guarani_reservas", JSON.stringify(reservas));
  }, [reservas]);

  const espacosDisponiveis = useMemo(
    () =>
      tipoPessoa === "nao_socio"
        ? espacos.filter((e) => e.permiteNaoSocio && e.precoNaoSocio > 0)
        : espacos,
    [espacos, tipoPessoa],
  );

  useEffect(() => {
    if (!espacosDisponiveis.some((e) => e.id === espacoId) && espacosDisponiveis[0]) {
      setEspacoId(espacosDisponiveis[0].id);
    }
  }, [espacosDisponiveis, espacoId]);

  const espaco = espacos.find((x) => x.id === espacoId);
  const bloqueadoNaoSocio = !!espaco && (espaco.precoNaoSocio <= 0 || !espaco.permiteNaoSocio);
  const valor = espaco ? (tipoPessoa === "socio" ? espaco.precoSocio : espaco.precoNaoSocio) : 0;

  useEffect(() => {
    let ativo = true;
    if (valor <= 0) {
      setPix(null);
      return () => { ativo = false; };
    }

    void (async () => {
      try {
        const resposta = await fetch(`/api/configuracao-pix?valor=${encodeURIComponent(valor.toFixed(2))}`, { cache: "no-store" });
        const resultado = await resposta.json().catch(() => ({}));
        if (ativo && resposta.ok && resultado?.config) setPix(resultado.config);
        else if (ativo) setPix(null);
      } catch {
        if (ativo) setPix(null);
      }
    })();

    return () => { ativo = false; };
  }, [valor]);

  const ocupados = useMemo(
    () =>
      reservas
        .filter(
          (r) =>
            r.status !== "cancelada" &&
            r.espacoId === espacoId &&
            r.data === data,
        )
        .map((r) => r.horario),
    [reservas, espacoId, data],
  );

  const espacosPorId = useMemo(() => {
    const mapa = new Map<string, Espaco>();
    for (const item of espacos) mapa.set(item.id, item);
    return mapa;
  }, [espacos]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return reservas.filter((r) => {
      const texto = `${r.nome} ${espacosPorId.get(r.espacoId)?.nome || ""}`.toLowerCase();
      const correspondeBusca = !termo || texto.includes(termo);
      const correspondeStatus = filtroStatus === "todos" || r.status === filtroStatus;
      const correspondeData = !filtroData || r.data === filtroData;
      return correspondeBusca && correspondeStatus && correspondeData;
    });
  }, [reservas, espacosPorId, busca, filtroStatus, filtroData]);

  const estatisticasReservas = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    let reservasHoje = 0;
    let confirmadas = 0;
    let pendentes = 0;
    let canceladas = 0;

    for (const r of reservas) {
      if (r.status === "confirmada") confirmadas++;
      else if (r.status === "pendente") pendentes++;
      else if (r.status === "cancelada") canceladas++;
      if (r.data === hoje && r.status !== "cancelada") reservasHoje++;
    }

    return { reservasHoje, confirmadas, pendentes, canceladas };
  }, [reservas]);

  const { reservasHoje, confirmadas, pendentes, canceladas } = estatisticasReservas;

  function mudarTipo(tipo: TipoPessoa) {
    setTipoPessoa(tipo);
    setEtapa("selecao");
    if (tipo === "nao_socio") {
      setSocioId("");
      setDependenteId("");
      setMatriculaResponsavel(null);
      setBuscaSocio("");
    }
  }

  function continuar() {
    if (!espaco) return alert("Selecione um espaço disponível.");
    if (tipoPessoa === "nao_socio" && bloqueadoNaoSocio) {
      return alert("Este espaço não pode ser alugado por não sócios.");
    }
    if (!data) return alert("Selecione a data da reserva.");
    if (!nome.trim()) return alert("Informe o nome do responsável pela reserva.");
    if (ocupados.includes(horario)) return alert("Este horário já está reservado para este espaço.");
    setEtapa("confirmacao");
  }

  async function operadorAtual(){try{const {data}=await supabase.auth.getSession();return data.session?.user?.user_metadata?.nome_exibicao||data.session?.user?.email||"Funcionário da portaria"}catch{return "Funcionário da portaria"}}
  function textoRecibo(r:Recibo){return `SOCIEDADE RECREATIVA GUARANI — S.R.G.\nRECIBO Nº ${r.numero}\n\nTipo: ${r.tipo}\nResponsável: ${r.nome}${r.matricula?` — Matrícula ${r.matricula}`:""}\n${r.detalhe}\nData/Horário: ${r.periodo}\nValor: ${moeda(r.valor)}\nPagamento: ${r.pagamento}\nStatus: ${r.status}\nAtendido por: ${r.operador}\nData/hora: ${r.dataHora}\n\nDocumento gerado pelo Sistema Guarani.`}
  function imprimirRecibo(r:Recibo){const w=window.open("","_blank","width=720,height=900");if(!w)return;w.document.write(`<!doctype html><html><head><title>${r.numero} - Recibo</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#173d2e}h1{color:#005a3c;margin-bottom:4px}h2{font-size:18px;color:#005a3c}.box{border:1px solid #cfe3d8;border-radius:14px;padding:20px;margin-top:20px}p{margin:8px 0}.total{font-size:22px;font-weight:800;color:#005a3c}.rodape{margin-top:32px;font-size:12px;color:#667}@media print{body{padding:20px}}</style></head><body><h1>SOCIEDADE RECREATIVA GUARANI</h1><div>S.R.G.</div><h2>RECIBO Nº ${r.numero}</h2><div class="box"><p><b>Tipo:</b> ${r.tipo}</p><p><b>Responsável:</b> ${r.nome}${r.matricula?` — Matrícula ${r.matricula}`:""}</p><p><b>${r.detalhe.split(":")[0]}:</b> ${r.detalhe.split(":").slice(1).join(":").trim()}</p><p><b>Data/Horário:</b> ${r.periodo}</p><p class="total">Valor: ${moeda(r.valor)}</p><p><b>Pagamento:</b> ${r.pagamento}</p><p><b>Status:</b> ${r.status}</p><p><b>Atendido por:</b> ${r.operador}</p><p><b>Data/hora:</b> ${r.dataHora}</p></div><div class="rodape">Documento gerado pelo Sistema Guarani.</div><script>window.onload=()=>window.print()</script></body></html>`);w.document.close()}
  async function enviarRecibo(r:Recibo){const t=textoRecibo(r);try{if(navigator.share){await navigator.share({title:`Recibo ${r.numero} - Sociedade Guarani`,text:t})}else{await navigator.clipboard.writeText(t);alert("Recibo copiado. Cole no WhatsApp, e-mail ou outro aplicativo para enviar.")}}catch{}}

  async function registrarAvisoAdministrativo(titulo: string, mensagem: string) {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) return;

      const resposta = await fetch("/api/avisos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ titulo, mensagem, interno: true }),
      });

      if (!resposta.ok) {
        const detalhe = await resposta.json().catch(() => ({}));
        console.warn("Aviso administrativo não registrado:", detalhe?.error || resposta.statusText);
      }
    } catch (e) {
      console.warn("Não foi possível registrar aviso administrativo:", e);
    }
  }

  function editarReserva(r: Reserva) {
    setEditandoReservaId(r.id);
    setEspacoId(r.espacoId);
    setData(r.data);
    setHorario(r.horario);
    setNome(r.nome);
    setSocioId(r.socioId || "");
    setDependenteId(r.dependenteId || "");
    setMatriculaResponsavel(r.matricula ?? null);
    setTipoPessoa(r.tipoPessoa);
    setFormaPagamentoReserva(r.pagamento === "dinheiro" ? "dinheiro" : "pix");
    setEtapa("selecao");
    setAba("reservar");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmar() {
    if (!espaco) return;
    if (tipoPessoa === "nao_socio" && (espaco.precoNaoSocio <= 0 || !espaco.permiteNaoSocio)) {
      return alert("Este espaço não está liberado para não sócios.");
    }

    setEnviandoComprovante(true);
    try {
      let comprovanteUrl: string | null = null;

      if (arquivoComprovante) {
        const permitido = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!permitido.includes(arquivoComprovante.type)) {
          alert("Envie o comprovante em JPG, PNG, WEBP ou PDF.");
          return;
        }
        if (arquivoComprovante.size > 8 * 1024 * 1024) {
          alert("O comprovante deve ter no máximo 8 MB.");
          return;
        }
      }

      if (valor > 0 && formaPagamentoReserva === "pix" && !pix?.copia_e_cola) {
        alert("O PIX da Sociedade ainda não está configurado. Para atendimento na portaria, selecione pagamento em dinheiro ou configure o PIX.");
        return;
      }
      const pagamento = valor > 0 ? formaPagamentoReserva : "pendente";
      const novaReserva: Reserva = {
        id: crypto.randomUUID(),
        espacoId,
        data,
        horario,
        nome: nome.trim(),
        socioId: socioId || undefined,
        dependenteId: dependenteId || undefined,
        matricula: matriculaResponsavel,
        tipoPessoa,
        valor,
        status: pagamento === "pix" ? "pendente" : "confirmada",
        pagamento,
        comprovante_url: comprovanteUrl,
        comprovante_nome: arquivoComprovante?.name || null,
      };
      if (!publico) {
        const contaPadrao = contasBancarias.find((c) => `${c.nome} ${c.banco || ""}`.toLowerCase().includes("sicredi")) || contasBancarias[0];
        const { data: sessaoReserva } = await supabase.auth.getSession();
        const tokenReserva = sessaoReserva.session?.access_token || "";
        const resposta = await fetch("/api/reservas", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenReserva}`,
          },
          body: JSON.stringify({
            espaco_id: novaReserva.espacoId,
            espaco_nome: espaco.nome,
            data: novaReserva.data,
            horario: novaReserva.horario,
            nome: novaReserva.nome,
            socio_id: novaReserva.socioId || null,
            dependente_id: novaReserva.dependenteId || null,
            matricula: novaReserva.matricula ?? null,
            tipo_pessoa: novaReserva.tipoPessoa,
            valor: novaReserva.valor,
            status: novaReserva.status,
            pagamento: novaReserva.pagamento,
            comprovante_url: novaReserva.comprovante_url || null,
            comprovante_nome: novaReserva.comprovante_nome || null,
            conta_bancaria_id: novaReserva.pagamento === "pix" ? null : contaPadrao?.id || null,
          }),
        });
        const resultado = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(resultado.error || "Não foi possível gravar a reserva no banco.");
        if (resultado.reserva?.id) novaReserva.id = String(resultado.reserva.id);

        if (arquivoComprovante && novaReserva.id) {
          const { data: sessaoComprovante } = await supabase.auth.getSession();
          const tokenComprovante = sessaoComprovante.session?.access_token || "";
          const formComprovante = new FormData();
          formComprovante.append("origem_tipo", "reserva");
          formComprovante.append("origem_id", novaReserva.id);
          formComprovante.append("arquivo", arquivoComprovante);

          const envio = await fetch("/api/reservas/comprovante", {
            method: "POST",
            headers: { Authorization: `Bearer ${tokenComprovante}` },
            body: formComprovante,
          });
          const resultadoComprovante = await envio.json().catch(() => ({}));
          if (!envio.ok) throw new Error(resultadoComprovante.error || "Não foi possível enviar o comprovante.");
          comprovanteUrl = resultadoComprovante.url || null;
          novaReserva.comprovante_url = comprovanteUrl;
        }
      } else if (arquivoComprovante) {
        // No modo público a reserva não passa pelo endpoint autenticado.
        // O comprovante fica sem upload automático para não abrir o Storage publicamente.
        comprovanteUrl = null;
      }

      if (editandoReservaId && arquivoComprovante && publico) {
        throw new Error("O envio de comprovante está disponível somente com sessão autenticada.");
      }

      if (editandoReservaId) {
        setReservas((v) => v.map((r) => r.id === editandoReservaId ? { ...r, ...novaReserva, id: editandoReservaId, comprovante_url: novaReserva.comprovante_url ?? r.comprovante_url ?? null, comprovante_nome: novaReserva.comprovante_nome ?? r.comprovante_nome ?? null } : r));
        await registrarAvisoAdministrativo(
          "✏️ Reserva alterada na portaria",
          `A reserva de ${novaReserva.nome} foi alterada por ${await operadorAtual()}. Espaço: ${espaco.nome}. Data: ${dataBR(data)} ${horario}. Valor: ${moeda(valor)}. Pagamento: ${pagamento === "pix" ? "PIX" : "Dinheiro"}.`
        );
      } else {
        setReservas((v) => [novaReserva, ...v]);
        await registrarAvisoAdministrativo(
          "📅 Reserva realizada na portaria",
          `${novaReserva.nome}${matriculaResponsavel ? ` (matrícula ${matriculaResponsavel})` : ""} realizou uma reserva na portaria. Espaço: ${espaco.nome}. Data: ${dataBR(data)} ${horario}. Valor: ${moeda(valor)}. Pagamento: ${pagamento === "pix" ? "PIX" : "Dinheiro"}.`
        );
      }
      const operador = await operadorAtual();
      setRecibo({id:novaReserva.id,numero:`RS-${Date.now().toString().slice(-6)}`,tipo:"Reserva de espaço",nome:novaReserva.nome,matricula:matriculaResponsavel,detalhe:`Espaço: ${espaco.nome}`,periodo:`${dataBR(data)} — ${horario}`,valor, pagamento:pagamento==="pix"?"PIX":pagamento==="pendente"?"Pendente":"Dinheiro",operador,status:pagamento==="pix"?"Aguardando conferência":"Pago",dataHora:new Date().toLocaleString("pt-BR")});

      setEtapa("selecao");
      setAba("reservas");
      setNome("");
      setSocioId("");
      setDependenteId("");
      setMatriculaResponsavel(null);
      setBuscaSocio("");
      setData("");
      setArquivoComprovante(null);
      setFormaPagamentoReserva("pix");
      setEditandoReservaId(null);
      alert(pagamento === "pix"
        ? "Reserva registrada e enviada para conferência do pagamento PIX."
        : "Reserva registrada com sucesso.");
    } catch (error) {
      console.error(error);
      const detalhe = error instanceof Error ? error.message : "Erro desconhecido.";
      alert(`Não foi possível concluir a reserva/comprovante: ${detalhe}`);
    } finally {
      setEnviandoComprovante(false);
    }
  }

  function copiar() {
    navigator.clipboard.writeText(
      `Sociedade Guarani\nEspaço: ${espaco?.nome}\nData: ${dataBR(data)}\nHorário: ${horario}\nResponsável: ${nome}\nTipo: ${tipoPessoa === "socio" ? "Sócio" : "Não sócio"}\nValor: ${moeda(valor)}`,
    );
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  }

  async function abrirComprovante(path: string | null | undefined) {
    if (!path) return;
    if (/^https?:\/\//i.test(path)) {
      window.open(path, "_blank");
      return;
    }
    const { data, error } = await supabase.storage
      .from("comprovantes-financeiro")
      .createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      alert("Não foi possível abrir o comprovante.");
      return;
    }
    window.open(data.signedUrl, "_blank");
  }

  function cancelar(id: string) {
    if (confirm("Deseja realmente cancelar esta reserva?")) {
      setReservas((v) => v.map((r) => (r.id === id ? { ...r, status: "cancelada" } : r)));
    }
  }

  const sociosFiltrados = useMemo(() => {
    const termo = buscaSocio.trim().toLowerCase();

    // Mostra titulares e também localiza a família quando a busca
    // for feita pelo nome/matrícula de um dependente.
    const titularesRelacionados = new Map<string, typeof socios[number]>();

    for (const socio of socios) {
      const textoTitular = `${socio.nome} ${socio.matricula ?? ""} ${socio.cpf ?? ""}`.toLowerCase();

      if (!termo || textoTitular.includes(termo)) {
        titularesRelacionados.set(String(socio.id), socio);
        continue;
      }

      const matriculaTitular = String(socio.matricula ?? "").trim().toUpperCase();
      const baseFamiliar = matriculaTitular.endsWith("A")
        ? matriculaTitular.slice(0, -1)
        : matriculaTitular;

      const temDependenteEncontrado = dependentes.some((d) => {
        const textoDependente = `${d.nome} ${d.matricula ?? ""} ${d.parentesco ?? ""}`.toLowerCase();
        const matriculaDependente = String(d.matricula ?? "").trim().toUpperCase();
        const pertenceFamilia =
          String(d.socio_id) === String(socio.id) ||
          (!!baseFamiliar &&
            matriculaDependente.startsWith(baseFamiliar) &&
            matriculaDependente !== matriculaTitular);

        return pertenceFamilia && textoDependente.includes(termo);
      });

      if (temDependenteEncontrado) {
        titularesRelacionados.set(String(socio.id), socio);
      }
    }

    return Array.from(titularesRelacionados.values()).slice(0, 20);
  }, [socios, dependentes, buscaSocio]);

  const dependentesDoSocio = useMemo(() => {
    if (!socioId) return [];

    const responsavel = socios.find((s) => String(s.id) === String(socioId));
    const matricula = String(responsavel?.matricula ?? "").trim().toUpperCase();
    const baseFamiliar = matricula.endsWith("A") ? matricula.slice(0, -1) : matricula;
    const ehResponsavelPagante = (m: string) => /^SD\d+A$/.test(m);

    // SD....A possui mensalidade própria e é responsável pela própria família.
    // Mesmo que o cadastro histórico tenha responsavel_id apontando para o pai/mãe,
    // ele não pode aparecer como dependente da família anterior nas Reservas.
    const diretos = dependentes.filter((d) => {
      if (String(d.socio_id) !== String(socioId)) return false;
      return !ehResponsavelPagante(String(d.matricula ?? "").trim().toUpperCase());
    });

    // Mantém o fallback para vínculos históricos por matrícula, mas nunca absorve
    // outro SD....A como dependente.
    const porMatricula = baseFamiliar
      ? dependentes.filter((d) => {
          const m = String(d.matricula ?? "").trim().toUpperCase();
          return (
            m.startsWith(baseFamiliar) &&
            m !== matricula &&
            /[A-Z]$/.test(m) &&
            !ehResponsavelPagante(m)
          );
        })
      : [];

    const unicos = new Map<string, DependenteReserva>();
    [...diretos, ...porMatricula].forEach((d) => unicos.set(String(d.id), d));

    return Array.from(unicos.values()).sort((a, b) =>
      String(a.matricula ?? a.nome).localeCompare(String(b.matricula ?? b.nome), "pt-BR", { numeric: true })
    );
  }, [dependentes, socios, socioId]);

  function selecionarDependente(id: string) {
    setDependenteId(id);
    const dependente = dependentesDoSocio.find((d) => String(d.id) === String(id));
    const titular = socios.find((s) => String(s.id) === String(socioId));
    if (dependente) {
      setNome(dependente.nome);
      setMatriculaResponsavel(dependente.matricula || null);
    } else if (titular) {
      setNome(titular.nome);
      setMatriculaResponsavel(titular.matricula ?? null);
    }
  }

  function alterarPreco(id: string, campo: "precoSocio" | "precoNaoSocio", v: number) {
    const novoValor = Math.max(0, v);
    setEspacos((a) =>
      a.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          [campo]: novoValor,
          ...(campo === "precoNaoSocio" && novoValor === 0
            ? { permiteNaoSocio: false }
            : {}),
        };
      }),
    );
  }

  function alternarNaoSocio(id: string) {
    setEspacos((a) =>
      a.map((e) => {
        if (e.id !== id) return e;
        if (e.precoNaoSocio <= 0) {
          return { ...e, permiteNaoSocio: false };
        }
        return { ...e, permiteNaoSocio: !e.permiteNaoSocio };
      }),
    );
  }

  return (
    <div className="min-h-screen bg-[#f8faf9] text-[#17382c]">
      {!publico && <><CabecalhoPadrao /><MenuLateralPadrao /></>}

      <main className={`min-h-screen px-4 py-6 lg:px-7 lg:py-8 ${publico ? "" : "lg:ml-[220px]"}`}>
        <div className="mx-auto max-w-[1400px] space-y-6">
          {publico && (
            <div className="flex items-center justify-between rounded-2xl border bg-white px-5 py-4 shadow-sm">
              <div className="flex items-center gap-3">
                <img src="/logo-guarani.png" className="h-12 w-12 object-contain" alt="Sociedade Guarani" />
                <div><b className="text-[#005a3c]">SOCIEDADE GUARANI</b><div className="text-xs text-gray-500">Reserva de espaços</div></div>
              </div>
              <button onClick={() => (window.location.href = "/login")} className="rounded-xl border px-4 py-2 text-sm font-bold">Voltar ao login</button>
            </div>
          )}

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm text-gray-500">{publico ? "Reserva online" : "Administração"}</p>
              <h1 className="text-3xl font-extrabold text-[#005a3c]">Reservas</h1>
              <p className="mt-1 text-sm text-gray-500">Agendamento de quadras, quiosques e salões.</p>
            </div>
            {!publico && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setAba("reservar")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "reservar" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}>Nova reserva</button>
                <button onClick={() => setAba("reservas")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "reservas" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}>Reservas</button>
                <button onClick={() => setAba("admin")} className={`rounded-xl px-4 py-2.5 font-bold ${aba === "admin" ? "bg-[#005a3c] text-white" : "bg-white shadow-sm"}`}><Settings className="mr-2 inline h-4 w-4" />Configurar espaços</button>
              </div>
            )}
          </div>

          {(publico || aba === "reservar") && (
            <section className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <div className="space-y-4">
                <section className="rounded-2xl border bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#005a3c]">1. Quem está fazendo a reserva?</h2>
                  <p className="mt-1 text-sm text-gray-500">O sistema aplica automaticamente a tarifa e as regras de acesso.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <button onClick={() => mudarTipo("socio")} className={`rounded-2xl border-2 p-5 text-left ${tipoPessoa === "socio" ? "border-[#005a3c] bg-[#e8f3ee]" : "border-[#dfe7e2]"}`}>
                      <UserRoundCheck className="h-8 w-8 text-[#005a3c]" />
                      <b className="mt-3 block text-lg">Sou sócio</b>
                      <span className="text-sm text-gray-500">Acesso aos espaços liberados para associados.</span>
                    </button>
                    <button onClick={() => mudarTipo("nao_socio")} className={`rounded-2xl border-2 p-5 text-left ${tipoPessoa === "nao_socio" ? "border-[#f4b400] bg-[#fff8df]" : "border-[#dfe7e2]"}`}>
                      <UserRound className="h-8 w-8 text-[#8a6700]" />
                      <b className="mt-3 block text-lg">Não sou sócio</b>
                      <span className="text-sm text-gray-500">Somente espaços liberados pela administração.</span>
                    </button>
                  </div>
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div><h2 className="text-xl font-extrabold text-[#005a3c]">2. Escolha o espaço</h2><p className="mt-1 text-sm text-gray-500">Espaços com não sócio bloqueado não aparecem nesta lista.</p></div>
                    <span className="rounded-full bg-[#e8f3ee] px-3 py-1 text-xs font-bold text-[#005a3c]">{espacosDisponiveis.length} disponíveis</span>
                  </div>
                  {espacosDisponiveis.length === 0 ? (
                    <div className="mt-5 rounded-xl border border-yellow-200 bg-yellow-50 p-5 text-center text-sm font-semibold text-yellow-800">Nenhum espaço está liberado para não sócios no momento.</div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {espacosDisponiveis.map((e) => (
                        <button key={e.id} onClick={() => setEspacoId(e.id)} className={`rounded-2xl border p-4 text-left ${e.id === espacoId ? "border-[#005a3c] bg-[#e8f3ee]" : "border-[#dfe7e2]"}`}>
                          <span className="text-[10px] font-extrabold uppercase text-[#005a3c]">{e.categoria}</span>
                          <h3 className="mt-2 font-extrabold">{e.nome}</h3>
                          <div className="mt-3 flex justify-between border-t pt-3 text-sm"><span>{e.cobranca === "hora" ? "Por hora" : "Por diária"}</span><b className="text-[#005a3c]">{moeda(tipoPessoa === "socio" ? e.precoSocio : e.precoNaoSocio)}</b></div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-extrabold text-[#005a3c]">3. Responsável</h2>
                  {tipoPessoa === "socio" && !publico ? (
                    <div className="relative mt-4">
                      <div className="flex items-center gap-2 rounded-xl border px-3 py-3 focus-within:border-[#005a3c]">
                        <Users className="h-5 w-5 text-gray-400" />
                        <input
                          value={buscaSocio}
                          onChange={(e) => { setBuscaSocio(e.target.value); setSocioId(""); setDependenteId(""); setMatriculaResponsavel(null); setNome(""); }}
                          placeholder="Buscar sócio por nome ou matrícula..."
                          className="w-full outline-none"
                        />
                      </div>
                      {buscaSocio && !socioId && (
                        <div className="absolute z-20 mt-2 max-h-[430px] w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
                          {sociosFiltrados.length ? sociosFiltrados.map((s) => {
                            const titularMatricula = String(s.matricula ?? "").trim().toUpperCase();
                            const baseFamiliar = titularMatricula.endsWith("A") ? titularMatricula.slice(0, -1) : titularMatricula;
                            const familia = dependentes.filter((d) => {
                              const m = String(d.matricula ?? "").trim().toUpperCase();
                              const direto = String(d.socio_id) === String(s.id);
                              const porMatricula = !!baseFamiliar && m.startsWith(baseFamiliar) && m !== titularMatricula && /[A-Z]$/.test(m);
                              // SD....A é pagante e responsável pela própria família.
                              return (direto || porMatricula) && !/^SD\d+A$/.test(m);
                            }).reduce<DependenteReserva[]>((lista, d) => {
                              if (!lista.some((x) => String(x.id) === String(d.id))) lista.push(d);
                              return lista;
                            }, []).sort((a, b) => String(a.matricula ?? a.nome).localeCompare(String(b.matricula ?? b.nome), "pt-BR", { numeric: true }));

                            return (
                              <div key={s.id} className="border-b last:border-b-0">
                                <button
                                  type="button"
                                  onClick={() => { setSocioId(s.id); setDependenteId(""); setNome(s.nome); setMatriculaResponsavel(s.matricula); setBuscaSocio(`${s.nome}${s.matricula ? ` — Matrícula ${s.matricula}` : ""}`); }}
                                  className="block w-full px-4 py-3 text-left hover:bg-[#e8f3ee]"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div><b>{s.nome}</b><span className="ml-2 text-xs text-gray-500">Matrícula: {s.matricula ?? "—"}</span></div>
                                    <span className="text-xs font-extrabold text-[#005a3c]">Titular</span>
                                  </div>
                                </button>

                                {familia.length > 0 && (
                                  <div className="bg-[#f8faf9] px-3 pb-3">
                                    <div className="px-2 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-wide text-[#78968a]">Dependentes da família</div>
                                    <div className="space-y-1.5">
                                      {familia.map((d) => (
                                        <button
                                          key={d.id}
                                          type="button"
                                          onClick={() => {
                                            setSocioId(s.id);
                                            setDependenteId(String(d.id));
                                            setNome(d.nome);
                                            setMatriculaResponsavel(d.matricula || null);
                                            setBuscaSocio(`${d.nome}${d.matricula ? ` — Matrícula ${d.matricula}` : ""}`);
                                          }}
                                          className="flex w-full items-center justify-between rounded-lg border border-[#d9e9e2] bg-white px-3 py-2 text-left hover:border-[#005a3c] hover:bg-[#e8f3ee]"
                                        >
                                          <span><b className="text-sm">{d.nome}</b><span className="ml-2 text-xs text-gray-500">{d.matricula || "Sem matrícula"}{d.parentesco ? ` · ${d.parentesco}` : ""}</span></span>
                                          <span className="text-[10px] font-extrabold text-[#005a3c]">Dependente</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          }) : <div className="p-4 text-sm text-gray-500">Nenhum sócio encontrado.</div>}
                        </div>
                      )}
                      {socioId && (
                        <>
                          <div className="mt-3 flex items-center justify-between rounded-xl bg-[#e8f3ee] p-3 text-sm">
                            <span><b>{nome}</b> · Matrícula {matriculaResponsavel ?? "—"}{dependenteId ? " · Dependente" : " · Titular"}</span>
                            <button type="button" onClick={() => { setSocioId(""); setDependenteId(""); setNome(""); setMatriculaResponsavel(null); setBuscaSocio(""); }} className="font-bold text-[#005a3c]">Trocar</button>
                          </div>
                          <div className="mt-3 rounded-xl border border-[#cfe3d8] bg-[#f8faf9] p-3">
                            <div className="text-xs font-extrabold uppercase tracking-wide text-[#005a3c]">
                              Pessoa da reserva
                            </div>
                            <div className="mt-2 rounded-xl bg-white px-3 py-3 text-sm">
                              <b>{nome}</b>
                              <span className="ml-2 text-xs text-gray-500">
                                Matrícula {matriculaResponsavel ?? "—"}
                              </span>
                              <span className="ml-2 rounded-full bg-[#e8f3ee] px-2 py-1 text-[10px] font-extrabold text-[#005a3c]">
                                {dependenteId ? "Dependente" : "Titular"}
                              </span>
                            </div>

                            {dependentesDoSocio.length > 0 && (
                              <p className="mt-2 text-xs text-gray-500">
                                Para escolher outro membro da família, clique em <b>Trocar</b> e pesquise novamente.
                                Os dependentes aparecem logo abaixo do titular, como nas Carteirinhas.
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo do responsável" className="mt-4 w-full rounded-xl border px-3 py-3 outline-none focus:border-[#005a3c]" />
                  )}
                  {tipoPessoa === "socio" && !publico && <p className="mt-2 text-xs text-gray-500">Digite o nome ou a matrícula e selecione o sócio. Isso evita duplicidade no histórico.</p>}
                </section>
              </div>

              <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-6">
                <h2 className="text-xl font-extrabold text-[#005a3c]">4. Data e horário</h2>
                {tipoPessoa === "nao_socio" && bloqueadoNaoSocio && <div className="mt-4 rounded-xl bg-red-50 p-4 text-sm font-bold text-red-700">🔒 Este espaço está bloqueado para não sócios.</div>}
                <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Data</span><input type="date" value={data} onChange={(e) => setData(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-3" /></label>
                {espaco?.cobranca === "hora" && <label className="mt-4 block"><span className="text-xs font-bold uppercase text-gray-500">Horário</span><select value={horario} onChange={(e) => setHorario(e.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-3">{HORARIOS.map((h) => <option key={h} value={h} disabled={ocupados.includes(h)}>{h}{ocupados.includes(h) ? " — ocupado" : ""}</option>)}</select></label>}
                <div className={`mt-4 rounded-xl p-4 ${tipoPessoa === "socio" ? "bg-[#e8f3ee]" : "bg-[#fff8df]"}`}>
                  <div className="text-xs text-gray-500">Tipo</div><b>{tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</b>{tipoPessoa === "socio" && matriculaResponsavel && <div className="mt-2 text-sm"><span className="text-gray-500">Matrícula:</span> <b>{matriculaResponsavel}</b></div>}
                  <div className="mt-3 flex justify-between text-sm"><span>Espaço</span><b>{espaco?.nome || "—"}</b></div>
                  <div className="flex justify-between text-sm"><span>Data</span><b>{dataBR(data)}</b></div>
                  <div className="flex justify-between text-sm"><span>Horário</span><b>{horario}</b></div>
                  <div className="mt-3 flex justify-between border-t pt-3 text-lg"><span>Total</span><b className="text-[#005a3c]">{moeda(valor)}</b></div>
                </div>
                <button disabled={!espaco || (tipoPessoa === "nao_socio" && bloqueadoNaoSocio)} onClick={continuar} className="mt-4 w-full rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40">Continuar</button>
              </aside>
            </section>
          )}

          {!publico && aba === "reservas" && (
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Hoje", reservasHoje, "bg-[#e8f3ee]"],
                  ["Confirmadas", confirmadas, "bg-blue-50"],
                  ["Pendentes", pendentes, "bg-yellow-50"],
                  ["Canceladas", canceladas, "bg-red-50"],
                ].map(([label, valorCard, fundo]) => (
                  <div key={String(label)} className={`rounded-2xl border bg-white p-4 shadow-sm`}>
                    <div className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${fundo}`}>{label}</div>
                    <div className="mt-2 text-2xl font-extrabold text-[#005a3c]">{valorCard}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div><h2 className="text-xl font-extrabold text-[#005a3c]">Reservas cadastradas</h2><p className="text-sm text-gray-500">Consulte, filtre e acompanhe as reservas.</p></div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="flex items-center gap-2 rounded-xl border px-3"><Users className="h-4 w-4" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar responsável ou espaço..." className="w-full min-w-0 py-2 outline-none" /></div>
                    <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)} className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold">
                      <option value="todos">Todos os status</option><option value="confirmada">Confirmadas</option><option value="pendente">Pendentes</option><option value="cancelada">Canceladas</option>
                    </select>
                    <input type="date" value={filtroData} onChange={(e) => setFiltroData(e.target.value)} className="rounded-xl border px-3 py-2 text-sm" />
                  </div>
                </div>
                {(busca || filtroStatus !== "todos" || filtroData) && <div className="mt-3 flex items-center justify-between text-xs text-gray-500"><span>{filtradas.length} reserva(s) encontrada(s)</span><button onClick={() => { setBusca(""); setFiltroStatus("todos"); setFiltroData(""); }} className="font-bold text-[#005a3c]">Limpar filtros</button></div>}
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#e8f3ee]"><tr><th className="p-3">Data</th><th className="p-3">Espaço</th><th className="p-3">Responsável</th><th className="p-3">Tipo</th><th className="p-3">Valor</th><th className="p-3">Pagamento</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead><tbody>{filtradas.map((r) => <tr key={r.id} className="border-b"><td className="p-3">{dataBR(r.data)}</td><td className="p-3">{espacos.find((e) => e.id === r.espacoId)?.nome}</td><td className="p-3">{r.nome}</td><td className="p-3">{r.tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</td><td className="p-3 font-bold">{moeda(r.valor)}</td><td className="p-3">{r.pagamento === "pix" ? <span className="font-semibold text-[#005a3c]">PIX {r.comprovante_url ? "· Comprovante" : "· Aguardando"}</span> : r.pagamento}</td><td className="p-3">{r.status}</td><td className="p-3">{r.comprovante_url && <button onClick={() => abrirComprovante(r.comprovante_url)} className="mr-2 rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]">Comprovante</button>}<button onClick={() => editarReserva(r)} className="mr-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">Editar</button><button onClick={async()=>{const operador=await operadorAtual();setRecibo({id:r.id,numero:`RS-${r.id.slice(0,6).toUpperCase()}`,tipo:"Reserva de espaço",nome:r.nome,matricula:r.matricula||null,detalhe:`Espaço: ${espacos.find(e=>e.id===r.espacoId)?.nome||"—"}`,periodo:`${dataBR(r.data)} — ${r.horario}`,valor:Number(r.valor||0),pagamento:r.pagamento==="pix"?"PIX":r.pagamento==="dinheiro"?"Dinheiro":r.pagamento,status:r.status==="confirmada"?"Pago":r.status==="pendente"?"Pendente":"Cancelado",operador,dataHora:new Date().toLocaleString("pt-BR")})}} className="mr-2 rounded-lg bg-[#e8f3ee] px-3 py-2 text-xs font-bold text-[#005a3c]">Recibo</button>{r.status !== "cancelada" && <button onClick={() => cancelar(r.id)} className="rounded-lg bg-red-50 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>}</td></tr>)}</tbody></table>{!filtradas.length && <div className="py-10 text-center text-sm text-gray-500">Nenhuma reserva encontrada.</div>}</div>
               </div>
            </section>
          )}

          {!publico && aba === "admin" && (
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div><h2 className="text-xl font-extrabold text-[#005a3c]">Configuração dos espaços</h2><p className="text-sm text-gray-500">Regra: <b>Não sócio = R$ 0,00</b> significa automaticamente bloqueado.</p></div>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-[#e8f3ee]"><tr><th className="p-3">Espaço</th><th className="p-3">Sócio</th><th className="p-3">Não sócio</th><th className="p-3">Permissão</th></tr></thead><tbody>
                {espacos.map((e) => { const liberado = e.permiteNaoSocio && e.precoNaoSocio > 0; return <tr key={e.id} className="border-b">
                  <td className="p-3 font-bold">{e.nome}</td>
                  <td className="p-3"><input type="number" min="0" value={e.precoSocio} onChange={(x) => alterarPreco(e.id, "precoSocio", Number(x.target.value))} className="w-28 rounded-lg border p-2" /></td>
                  <td className="p-3"><input type="number" min="0" value={e.precoNaoSocio} onChange={(x) => alterarPreco(e.id, "precoNaoSocio", Number(x.target.value))} className="w-28 rounded-lg border p-2" /></td>
                  <td className="p-3"><button onClick={() => alternarNaoSocio(e.id)} disabled={e.precoNaoSocio <= 0} className={`rounded-full px-4 py-2 text-xs font-extrabold ${liberado ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{liberado ? "🟢 Liberado" : "🔒 Bloqueado"}</button>{e.precoNaoSocio <= 0 && <div className="mt-1 text-xs font-semibold text-red-600">R$ 0 = não pode alugar</div>}</td>
                </tr>; })}
              </tbody></table></div>
              <div className="mt-4 rounded-xl bg-[#fff8df] p-4 text-sm font-semibold text-[#6b5600]">Para liberar um espaço para não sócio, coloque um valor maior que R$ 0,00. Depois clique em <b>Liberado</b>. Se voltar para R$ 0, o sistema bloqueia novamente.</div>
            </section>
          )}

          {(publico || aba === "reservar") && etapa === "confirmacao" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="overflow-y-auto p-6"><button onClick={() => setEtapa("selecao")} className="mb-4 font-bold text-gray-500"><ArrowLeft className="mr-1 inline h-4 w-4" />Voltar</button><div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f3ee] text-[#005a3c]"><ShieldCheck /></div><h2 className="text-2xl font-extrabold text-[#005a3c]">Confirmar reserva</h2><div className="mt-5 space-y-3 rounded-xl bg-[#f8faf9] p-4 text-sm"><div className="flex justify-between"><span>Tipo</span><b>{tipoPessoa === "socio" ? "Sócio" : "Não sócio"}</b></div><div className="flex justify-between"><span>Espaço</span><b>{espaco?.nome}</b></div><div className="flex justify-between"><span>Data</span><b>{dataBR(data)}</b></div><div className="flex justify-between"><span>Horário</span><b>{horario}</b></div><div className="flex justify-between"><span>Responsável</span><b>{nome}</b></div><div className="flex justify-between"><span>Valor</span><b className="text-[#005a3c]">{moeda(valor)}</b></div></div>
            {valor > 0 && !publico && (
              <div className="mt-5 rounded-2xl border border-[#cfe3d8] bg-white p-4">
                <b className="text-[#005a3c]">Forma de pagamento</b>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={()=>setFormaPagamentoReserva("pix")} className={`rounded-xl border px-4 py-3 text-sm font-extrabold ${formaPagamentoReserva==="pix"?"border-[#005a3c] bg-[#e8f3ee] text-[#005a3c]":"bg-white text-gray-600"}`}>PIX</button>
                  <button type="button" onClick={()=>setFormaPagamentoReserva("dinheiro")} className={`rounded-xl border px-4 py-3 text-sm font-extrabold ${formaPagamentoReserva==="dinheiro"?"border-[#005a3c] bg-[#e8f3ee] text-[#005a3c]":"bg-white text-gray-600"}`}>Dinheiro</button>
                </div>
              </div>
            )}
            {valor > 0 && formaPagamentoReserva === "pix" && pix?.copia_e_cola && (
              <div className="mt-5 rounded-2xl border border-[#b9dcca] bg-[#e8f3ee] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div><b className="text-[#005a3c]">Pagamento via PIX</b><p className="mt-1 text-xs text-gray-600">Faça o pagamento e, se quiser, anexe o comprovante abaixo.</p></div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#005a3c]">{moeda(valor)}</span>
                </div>
                <div className="mt-3 rounded-xl bg-white p-3 text-sm"><div className="text-xs text-gray-500">Chave PIX</div><div className="font-bold break-all">{pix.chave_pix || "—"}</div></div>
                <div className="mt-3 rounded-xl bg-white p-3">
                  <div className="text-xs font-bold uppercase text-gray-500">PIX copia e cola</div>
                  <textarea readOnly value={pix.copia_e_cola || ""} rows={4} className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-5 text-gray-700 outline-none" aria-label="PIX copia e cola" />
                  <button type="button" onClick={() => { navigator.clipboard.writeText(pix.copia_e_cola || ""); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }} className="mt-2 w-full rounded-xl bg-[#005a3c] px-4 py-2.5 font-bold text-white">{copiado ? "✓ PIX copia e cola copiado" : "📋 Copiar PIX copia e cola"}</button>
                </div>
                <label className="mt-3 block cursor-pointer rounded-xl border-2 border-dashed border-[#9cc8b1] bg-white p-4 text-center"><span className="block text-sm font-bold text-[#005a3c]">📎 Anexar comprovante</span><span className="mt-1 block text-xs text-gray-500">JPG, PNG, WEBP ou PDF — até 8 MB</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="mt-3 w-full text-sm" onChange={(e) => setArquivoComprovante(e.target.files?.[0] || null)} /></label>
                {arquivoComprovante && <div className="mt-2 text-xs font-semibold text-[#005a3c]">Arquivo: {arquivoComprovante.name}</div>}
              </div>
            )}
            <div className="sticky bottom-0 mt-5 flex gap-2 border-t bg-white pt-4"><button onClick={copiar} className="flex-1 rounded-xl border px-4 py-3 font-bold">{copiado ? <><Check className="mr-1 inline h-4 w-4" />Copiado</> : <><Copy className="mr-1 inline h-4 w-4" />Copiar resumo</>}</button><button onClick={confirmar} disabled={enviandoComprovante} className="flex-1 rounded-xl bg-[#005a3c] px-4 py-3 font-extrabold text-white disabled:opacity-50">{enviandoComprovante ? "Enviando..." : valor > 0 && pix?.copia_e_cola ? "OK — Confirmar reserva" : "OK — Confirmar"}</button></div></div></div></div>
          )}

          {recibo&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001f16]/60 p-4"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-gray-500">Sociedade Recreativa Guarani</p><h2 className="mt-1 text-2xl font-extrabold text-[#005a3c]">Recibo {recibo.numero}</h2></div><button onClick={()=>setRecibo(null)} className="rounded-full bg-gray-100 px-3 py-2">✕</button></div><div className="mt-5 rounded-2xl border border-[#cfe3d8] bg-[#f8faf9] p-5 text-sm"><p><b>Tipo:</b> {recibo.tipo}</p><p className="mt-2"><b>Responsável:</b> {recibo.nome}{recibo.matricula?` — Matrícula ${recibo.matricula}`:""}</p><p className="mt-2"><b>{recibo.detalhe.split(":")[0]}:</b> {recibo.detalhe.split(":").slice(1).join(":").trim()}</p><p className="mt-2"><b>Data/Horário:</b> {recibo.periodo}</p><p className="mt-3 text-2xl font-extrabold text-[#005a3c]">{moeda(recibo.valor)}</p><p className="mt-2"><b>Pagamento:</b> {recibo.pagamento}</p><p className="mt-2"><b>Status:</b> {recibo.status}</p><p className="mt-2"><b>Atendido por:</b> {recibo.operador}</p><p className="mt-2 text-xs text-gray-500">{recibo.dataHora}</p></div><div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3"><button onClick={()=>imprimirRecibo(recibo)} className="rounded-xl bg-[#005a3c] px-4 py-3 font-bold text-white">🖨 Imprimir / PDF</button><button onClick={()=>void enviarRecibo(recibo)} className="rounded-xl border border-[#005a3c] px-4 py-3 font-bold text-[#005a3c]">📤 Enviar</button><button onClick={()=>void navigator.clipboard?.writeText(textoRecibo(recibo))} className="rounded-xl border px-4 py-3 font-bold">📋 Copiar</button></div><p className="mt-3 text-center text-xs text-gray-500">Em Imprimir, escolha “Salvar como PDF” para guardar o recibo.</p></div></div>}

          {!publico && <div className="rounded-2xl bg-[#003d2b] p-5 text-white"><b><Clock3 className="mr-2 inline h-4 w-4" />Controle de disponibilidade</b><div className="mt-1 text-sm text-white/75">R$ 0,00 para não sócio sempre significa bloqueado. A administração controla a liberação.</div></div>}
        </div>
      </main>
    </div>
  );
}
